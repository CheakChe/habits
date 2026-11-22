import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireBodyScrollLock } from '../src/ui/scroll-lock';

test('acquireBodyScrollLock reference-counts locks, preserves scrollY, and restores styles', () => {
  let currentScrollY = 420;
  let restoredScroll: [number, number] | null = null;

  const htmlStyle: Record<string, string> = {
    overflow: '',
    overscrollBehavior: '',
  };
  const bodyStyle: Record<string, string> = {
    overflow: 'auto',
    position: '',
    top: '',
    left: '',
    right: '',
    width: '',
    paddingRight: '4px',
    overscrollBehavior: '',
  };

  const prevWindow = (globalThis as { window?: unknown }).window;
  const prevDocument = (globalThis as { document?: unknown }).document;

  (globalThis as { document: unknown }).document = {
    documentElement: {
      clientWidth: 1000,
      scrollTop: currentScrollY,
      style: htmlStyle,
    },
    body: {
      style: bodyStyle,
    },
  };

  (globalThis as { window: unknown }).window = {
    scrollY: currentScrollY,
    pageYOffset: currentScrollY,
    innerWidth: 1015,
    getComputedStyle: () => ({ paddingRight: '4px' }),
    scrollTo: (x: number, y: number) => {
      restoredScroll = [x, y];
      currentScrollY = y;
    },
  };

  try {
    const releaseFirst = acquireBodyScrollLock();
    assert.equal(htmlStyle.overflow, 'hidden');
    assert.equal(bodyStyle.overflow, 'hidden');
    assert.equal(bodyStyle.position, 'fixed');
    assert.equal(bodyStyle.top, '-420px');
    assert.equal(bodyStyle.paddingRight, '19px');

    // Second nested lock should keep lock active without overwriting saved state
    const releaseSecond = acquireBodyScrollLock();
    assert.equal(bodyStyle.position, 'fixed');
    assert.equal(bodyStyle.top, '-420px');

    // Releasing first lock (or calling it twice) must not unlock while second is active
    releaseFirst();
    releaseFirst();
    assert.equal(bodyStyle.position, 'fixed');
    assert.equal(restoredScroll, null);

    // Releasing second lock restores original styles and scroll position
    releaseSecond();
    assert.equal(htmlStyle.overflow, '');
    assert.equal(bodyStyle.overflow, 'auto');
    assert.equal(bodyStyle.position, '');
    assert.equal(bodyStyle.top, '');
    assert.equal(bodyStyle.paddingRight, '4px');
    assert.deepEqual(restoredScroll, [0, 420]);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window: unknown }).window = prevWindow;
    }
    if (prevDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document: unknown }).document = prevDocument;
    }
  }
});

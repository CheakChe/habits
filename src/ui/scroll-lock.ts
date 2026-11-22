import { createEffect, onCleanup } from 'solid-js';

interface SavedScrollStyles {
  htmlOverflow: string;
  htmlOverscrollBehavior: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyPaddingRight: string;
  bodyOverscrollBehavior: string;
}

let activeLocks = 0;
let savedScrollY = 0;
let savedStyles: SavedScrollStyles | null = null;

export function acquireBodyScrollLock(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  activeLocks += 1;

  if (activeLocks === 1) {
    const html = document.documentElement;
    const body = document.body;

    savedScrollY =
      window.scrollY ||
      window.pageYOffset ||
      html.scrollTop ||
      0;

    savedStyles = {
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyPaddingRight: body.style.paddingRight,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
    };

    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${savedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overscrollBehavior = 'none';

    if (scrollbarWidth > 0) {
      const existingPadding = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${existingPadding + scrollbarWidth}px`;
    }
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;

    activeLocks = Math.max(0, activeLocks - 1);
    if (activeLocks === 0 && savedStyles) {
      const html = document.documentElement;
      const body = document.body;
      const prev = savedStyles;
      const restoreY = savedScrollY;
      savedStyles = null;

      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscrollBehavior;

      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;
      body.style.paddingRight = prev.bodyPaddingRight;
      body.style.overscrollBehavior = prev.bodyOverscrollBehavior;

      window.scrollTo(0, restoreY);
    }
  };
}

export function useBodyScrollLock(isOpen: () => boolean): void {
  createEffect(() => {
    if (!isOpen()) return;
    const release = acquireBodyScrollLock();
    onCleanup(release);
  });
}

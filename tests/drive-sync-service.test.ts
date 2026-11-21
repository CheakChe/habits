import assert from 'node:assert/strict';
import test from 'node:test';
import { ConcurrentSyncError, DriveSyncService } from '../src/sync/drive-sync-service';
import { SnapshotCodec } from '../src/sync/snapshot-codec';
import { DomainSnapshot } from '../src/types/domain';
import { NonRetryableError } from '../src/utils/helpers';

function makeSnapshot(overrides?: Partial<DomainSnapshot>): DomainSnapshot {
  return {
    habits: overrides?.habits ?? [
      {
        id: 1,
        name: 'Run',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20770,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    checkins: overrides?.checkins ?? [],
    notes: overrides?.notes ?? [],
    tasks: overrides?.tasks ?? [],
  };
}

function extractMultipartPayload(body: Uint8Array, contentType: string): {
  metadata: Record<string, unknown>;
  snapshotBytes: Uint8Array;
} {
  const match = /boundary=([^\s;]+)/.exec(contentType);
  assert.ok(match, 'Expected multipart boundary header');
  const boundary = match[1];
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const headerEndMarker = encoder.encode('Content-Type: application/octet-stream\r\n\r\n');
  let octetHeaderIdx = -1;
  for (let i = 0; i <= body.byteLength - headerEndMarker.byteLength; i++) {
    let allMatch = true;
    for (let j = 0; j < headerEndMarker.byteLength; j++) {
      if (body[i + j] !== headerEndMarker[j]) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      octetHeaderIdx = i;
      break;
    }
  }
  assert.ok(octetHeaderIdx >= 0, 'Expected octet-stream part header');

  const preambleText = decoder.decode(body.subarray(0, octetHeaderIdx));
  const jsonStart = preambleText.indexOf('{');
  const jsonEnd = preambleText.lastIndexOf('}');
  const metadata = JSON.parse(preambleText.slice(jsonStart, jsonEnd + 1)) as Record<
    string,
    unknown
  >;

  const trailer = encoder.encode(`\r\n--${boundary}--`);
  const payloadStart = octetHeaderIdx + headerEndMarker.byteLength;
  const payloadEnd = body.byteLength - trailer.byteLength;
  const snapshotBytes = body.slice(payloadStart, payloadEnd);
  return { metadata, snapshotBytes };
}

test('DriveSyncService enforces google mode and non-empty access token', async () => {
  const service = new DriveSyncService();
  const snap = makeSnapshot();

  await assert.rejects(
    () => service.prepareSync('guest', 'token', snap),
    (err: unknown) => err instanceof NonRetryableError && /Google Drive mode/.test(err.message)
  );

  await assert.rejects(
    () => service.prepareSync(null, 'token', snap),
    (err: unknown) => err instanceof NonRetryableError
  );

  await assert.rejects(
    () => service.prepareSync('google', null, snap),
    (err: unknown) => err instanceof NonRetryableError && /expired/i.test(err.message)
  );
});

test('DriveSyncService creates remote snapshot via POST on first sync and skips duplicate uploads', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const requests: { url: string; method: string; headers: Record<string, string>; body?: Uint8Array }[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body instanceof Uint8Array ? init.body : undefined;
    requests.push({ url, method, headers, body });

    if (method === 'GET' && url.includes('spaces=appDataFolder')) {
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'POST' && url.includes('uploadType=multipart')) {
      return new Response(JSON.stringify({ id: 'file-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  const service = new DriveSyncService();
  const local = makeSnapshot();

  const prep = await service.prepareSync('google', 'tok-abc', local);
  assert.equal(prep.status, 'needs-upload-confirm');
  assert.equal(prep.remoteFileId, null);
  assert.equal(prep.localChanged, false);
  assert.equal(prep.summary.habitsCount, 1);

  await service.confirmAndUpload('google', 'tok-abc', prep);

  const postReq = requests.find((r) => r.method === 'POST');
  assert.ok(postReq);
  assert.equal(postReq.headers.Authorization, 'Bearer tok-abc');
  assert.ok(postReq.body);
  const { metadata, snapshotBytes } = extractMultipartPayload(
    postReq.body,
    postReq.headers['Content-Type']
  );
  assert.deepEqual(metadata.parents, ['appDataFolder']);
  assert.equal(metadata.name, 'habits-snapshot.bin');
  assert.deepEqual(SnapshotCodec.unpack(snapshotBytes), local);

  // If confirmAndUpload is called again with an existing remoteFileId and identical cached bytes, it is a no-op
  const prepWithId = { ...prep, remoteFileId: 'file-123' };
  const beforeCount = requests.length;
  await service.confirmAndUpload('google', 'tok-abc', prepWithId);
  assert.equal(requests.length, beforeCount);
});

test('DriveSyncService merges remote changes cleanly without uploading when remote already matches merged state', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const remoteSnapshot = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Updated on phone',
        color: '#22C55E',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20770,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 5000,
      },
    ],
  });
  const remoteBytes = SnapshotCodec.pack(remoteSnapshot);

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('spaces=appDataFolder')) {
      return new Response(
        JSON.stringify({
          files: [
            {
              id: 'file-1',
              name: 'habits-snapshot.bin',
              version: '7',
              modifiedTime: '2026-11-20T12:00:00Z',
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('/file-1?alt=media')) {
      return new Response(new Uint8Array(remoteBytes), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const service = new DriveSyncService();
  const olderLocal = makeSnapshot();
  const prep = await service.prepareSync('google', 'tok-1', olderLocal);

  assert.equal(prep.status, 'up-to-date');
  assert.equal(prep.localChanged, true);
  assert.equal(prep.mergedSnapshot.habits[0].name, 'Updated on phone');
});

test('DriveSyncService detects optimistic concurrency conflicts before POST/PATCH and on HTTP 412', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  // Case 1: Remote file created while user was confirming initial upload
  let lookupCall = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('spaces=appDataFolder')) {
      lookupCall += 1;
      const files =
        lookupCall === 1
          ? []
          : [{ id: 'race-file', name: 'habits-snapshot.bin', version: '1' }];
      return new Response(JSON.stringify({ files }), { status: 200 });
    }
    throw new Error(`Should not attempt upload on concurrent create: ${url}`);
  }) as typeof fetch;

  const service = new DriveSyncService();
  const prepNew = await service.prepareSync('google', 'tok', makeSnapshot());
  await assert.rejects(
    () => service.confirmAndUpload('google', 'tok', prepNew),
    (err: unknown) => err instanceof ConcurrentSyncError
  );

  // Case 2: Remote version changed before PATCH
  const remoteBytes = SnapshotCodec.pack(makeSnapshot());
  let lookupVersionCall = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('spaces=appDataFolder')) {
      lookupVersionCall += 1;
      return new Response(
        JSON.stringify({
          files: [
            {
              id: 'file-1',
              name: 'habits-snapshot.bin',
              version: lookupVersionCall === 1 ? '10' : '11',
              modifiedTime: '2026-11-20T12:00:00Z',
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('alt=media')) {
      return new Response(new Uint8Array(remoteBytes), { status: 200 });
    }
    throw new Error(`Should not PATCH when version changed: ${url}`);
  }) as typeof fetch;

  const localNewer = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Edited locally',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20770,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 9000,
      },
    ],
  });
  const service2 = new DriveSyncService();
  const prepPatch = await service2.prepareSync('google', 'tok', localNewer);
  assert.equal(prepPatch.status, 'needs-upload-confirm');
  await assert.rejects(
    () => service2.confirmAndUpload('google', 'tok', prepPatch),
    (err: unknown) => err instanceof ConcurrentSyncError
  );

  // Case 3: HTTP 412 during PATCH
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (url.includes('spaces=appDataFolder')) {
      return new Response(
        JSON.stringify({
          files: [{ id: 'file-1', name: 'habits-snapshot.bin', version: '10' }],
        }),
        { status: 200 }
      );
    }
    if (url.includes('alt=media')) {
      return new Response(new Uint8Array(remoteBytes), { status: 200 });
    }
    if (method === 'PATCH') {
      return new Response('Precondition failed', { status: 412 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof fetch;

  const service3 = new DriveSyncService();
  const prep412 = await service3.prepareSync('google', 'tok', localNewer);
  await assert.rejects(
    () => service3.confirmAndUpload('google', 'tok', prep412),
    (err: unknown) => err instanceof ConcurrentSyncError
  );
});

test('DriveSyncService protects local data on corrupt/empty remote snapshots and maps HTTP status errors', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  // Corrupt remote bytes
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('spaces=appDataFolder')) {
      return new Response(
        JSON.stringify({ files: [{ id: 'bad-file', name: 'habits-snapshot.bin' }] }),
        { status: 200 }
      );
    }
    if (url.includes('alt=media')) {
      return new Response(new Uint8Array([1, 2, 3, 4, 5]), { status: 200 });
    }
    throw new Error(`Unexpected: ${url}`);
  }) as typeof fetch;

  const service = new DriveSyncService();
  await assert.rejects(
    () => service.prepareSync('google', 'tok', makeSnapshot()),
    (err: unknown) =>
      err instanceof NonRetryableError && /could not be read/i.test(err.message)
  );

  // Empty remote file
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('spaces=appDataFolder')) {
      return new Response(
        JSON.stringify({ files: [{ id: 'empty-file', name: 'habits-snapshot.bin' }] }),
        { status: 200 }
      );
    }
    if (url.includes('alt=media')) {
      return new Response(new Uint8Array([]), { status: 200 });
    }
    throw new Error(`Unexpected: ${url}`);
  }) as typeof fetch;

  await assert.rejects(
    () => service.prepareSync('google', 'tok', makeSnapshot()),
    (err: unknown) => err instanceof NonRetryableError && /empty/i.test(err.message)
  );

  // 401 unauthorized is non-retryable and triggers authorization error message
  let authAttempts = 0;
  globalThis.fetch = (async () => {
    authAttempts += 1;
    return new Response('Unauthorized', { status: 401 });
  }) as typeof fetch;

  await assert.rejects(
    () => service.prepareSync('google', 'tok', makeSnapshot()),
    (err: unknown) => err instanceof NonRetryableError && /authorization/i.test(err.message)
  );
  assert.equal(authAttempts, 1);
});

test('DriveSyncService consolidates duplicate habits-snapshot.bin files and cleans them up after upload', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const snapNewerRemote = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Primary Habit',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20770,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
    checkins: [{ habitId: 1, dayIndex: 20770, done: true, updatedAt: 2000 }],
  });

  const snapDuplicateRemote = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Primary Habit',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20770,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1500,
      },
      {
        id: 2,
        name: 'Lost Duplicate Habit',
        color: '#22C55E',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20770,
        archivedAt: null,
        createdAt: 3000,
        updatedAt: 3000,
      },
    ],
  });

  const primaryBytes = SnapshotCodec.pack(snapNewerRemote);
  const dupBytes = SnapshotCodec.pack(snapDuplicateRemote);
  const deletedFileIds: string[] = [];
  let patchPayload: Uint8Array | undefined;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.includes('spaces=appDataFolder')) {
      return new Response(
        JSON.stringify({
          files: [
            {
              id: 'dup-old',
              name: 'habits-snapshot.bin',
              version: '1',
              modifiedTime: '2026-11-20T10:00:00Z',
            },
            {
              id: 'primary-new',
              name: 'habits-snapshot.bin',
              version: '4',
              modifiedTime: '2026-11-20T12:00:00Z',
            },
            {
              id: 'dup-empty',
              name: 'habits-snapshot.bin',
              version: '1',
              modifiedTime: '2026-11-20T09:00:00Z',
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (method === 'GET' && url.includes('/primary-new?alt=media')) {
      return new Response(new Uint8Array(primaryBytes), { status: 200 });
    }
    if (method === 'GET' && url.includes('/dup-old?alt=media')) {
      return new Response(new Uint8Array(dupBytes), { status: 200 });
    }
    if (method === 'GET' && url.includes('/dup-empty?alt=media')) {
      return new Response(new Uint8Array([]), { status: 200 });
    }
    if (method === 'PATCH' && url.includes('/primary-new?uploadType=multipart')) {
      const { snapshotBytes } = extractMultipartPayload(
        init!.body as Uint8Array,
        (init!.headers as Record<string, string>)['Content-Type']
      );
      patchPayload = snapshotBytes;
      return new Response(JSON.stringify({ id: 'primary-new', version: '5' }), { status: 200 });
    }
    if (method === 'DELETE' && url.includes('/files/dup-')) {
      deletedFileIds.push(url.split('/files/')[1]);
      return new Response(null, { status: 204 });
    }
    if (method === 'GET' && url.includes('/primary-new/revisions')) {
      return new Response(JSON.stringify({ revisions: [{ id: '1' }] }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  const service = new DriveSyncService();
  const prep = await service.prepareSync('google', 'tok', makeSnapshot());
  assert.equal(prep.status, 'needs-upload-confirm');
  assert.equal(prep.remoteFileId, 'primary-new');
  assert.deepEqual(prep.duplicateFileIds, ['dup-old', 'dup-empty']);
  assert.equal(prep.mergedSnapshot.habits.length, 2);
  assert.ok(prep.mergedSnapshot.habits.some((h) => h.name === 'Lost Duplicate Habit'));
  assert.equal(prep.mergedSnapshot.checkins.length, 1);

  await service.confirmAndUpload('google', 'tok', prep);
  assert.ok(patchPayload);
  assert.equal(SnapshotCodec.unpack(patchPayload).habits.length, 2);
  assert.deepEqual(deletedFileIds.sort(), ['dup-empty', 'dup-old']);
});

test('DriveSyncService prunes old revisions beyond keep limit after PATCH and leaves pinned revisions intact', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const remoteBytes = SnapshotCodec.pack(makeSnapshot());
  const localNewer = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Updated Habit',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20770,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 5000,
      },
    ],
  });

  // 13 revisions returned oldest-first: rev 1..13, with rev-2 pinned keepForever
  const revisions = Array.from({ length: 13 }, (_, idx) => ({
    id: String(idx + 1),
    modifiedTime: new Date(1_700_000_000_000 + idx * 60_000).toISOString(),
    size: '128',
    keepForever: idx + 1 === 2,
  }));

  const deletedRevisionIds: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.includes('spaces=appDataFolder')) {
      return new Response(
        JSON.stringify({
          files: [{ id: 'file-1', name: 'habits-snapshot.bin', version: '13' }],
        }),
        { status: 200 }
      );
    }
    if (method === 'GET' && url.includes('/file-1?alt=media')) {
      return new Response(new Uint8Array(remoteBytes), { status: 200 });
    }
    if (method === 'PATCH') {
      return new Response(JSON.stringify({ id: 'file-1', version: '14' }), { status: 200 });
    }
    if (method === 'GET' && url.includes('/file-1/revisions?')) {
      return new Response(JSON.stringify({ revisions }), { status: 200 });
    }
    if (method === 'DELETE' && url.includes('/file-1/revisions/')) {
      deletedRevisionIds.push(url.split('/revisions/')[1]);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  const service = new DriveSyncService();
  const prep = await service.prepareSync('google', 'tok', localNewer);
  await service.confirmAndUpload('google', 'tok', prep);

  // Kept newest 10 (ids 13..4) and pinned id 2 -> only ids 3 and 1 should be deleted
  assert.deepEqual(deletedRevisionIds.sort(), ['1', '3']);
});

test('DriveSyncService lists, inspects, and restores historical revisions cleanly', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const rev1Snap = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Clean Old State',
        color: '#22C55E',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20770,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
  });
  const rev2HeadSnap = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Broken Newer State',
        color: '#EF4444',
        weekdays: 127,
        weeklyTarget: null,
        startDay: 20770,
        archivedAt: 9000,
        createdAt: 1000,
        updatedAt: 9000,
      },
    ],
  });
  const rev1Bytes = SnapshotCodec.pack(rev1Snap);
  const rev2Bytes = SnapshotCodec.pack(rev2HeadSnap);
  let restoredPatchBytes: Uint8Array | undefined;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.includes('spaces=appDataFolder')) {
      return new Response(
        JSON.stringify({
          files: [{ id: 'file-1', name: 'habits-snapshot.bin', version: '2' }],
        }),
        { status: 200 }
      );
    }
    if (method === 'GET' && url.includes('/file-1/revisions?')) {
      return new Response(
        JSON.stringify({
          revisions: [
            { id: 'rev-1', modifiedTime: '2026-11-19T10:00:00Z', size: String(rev1Bytes.byteLength) },
            { id: 'rev-2', modifiedTime: '2026-11-20T10:00:00Z', size: String(rev2Bytes.byteLength) },
          ],
        }),
        { status: 200 }
      );
    }
    if (method === 'GET' && url.includes('/revisions/rev-1?alt=media')) {
      return new Response(new Uint8Array(rev1Bytes), { status: 200 });
    }
    if (method === 'GET' && url.includes('/file-1?alt=media')) {
      return new Response(new Uint8Array(rev2Bytes), { status: 200 });
    }
    if (method === 'PATCH' && url.includes('/file-1?uploadType=multipart')) {
      const { snapshotBytes } = extractMultipartPayload(
        init!.body as Uint8Array,
        (init!.headers as Record<string, string>)['Content-Type']
      );
      restoredPatchBytes = snapshotBytes;
      return new Response(JSON.stringify({ id: 'file-1', version: '3' }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  const service = new DriveSyncService();
  const list = await service.listRevisions('google', 'tok');
  assert.equal(list.fileId, 'file-1');
  assert.deepEqual(
    list.revisions.map((r) => r.id),
    ['rev-2', 'rev-1']
  );

  const inspected = await service.inspectRevision('google', 'tok', 'file-1', 'rev-1');
  assert.equal(inspected.summary.habitsCount, 1);
  assert.equal(inspected.snapshot.habits[0].name, 'Clean Old State');

  const restored = await service.restoreRevision(
    'google',
    'tok',
    'file-1',
    'rev-1',
    rev2HeadSnap
  );
  assert.equal(restored.restoredSnapshot.habits[0].name, 'Clean Old State');
  assert.ok(restored.restoredSnapshot.habits[0].updatedAt > 9000);
  assert.ok(restoredPatchBytes);
  assert.equal(
    SnapshotCodec.unpack(restoredPatchBytes).habits[0].name,
    'Clean Old State'
  );
});

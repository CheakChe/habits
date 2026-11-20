import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionManager } from '../src/auth/session-manager';
import { HabitDatabase } from '../src/db/habit-database';
import { ConcurrentSyncError, SyncPreparationResult } from '../src/sync/drive-sync-service';
import { SnapshotCodec } from '../src/sync/snapshot-codec';
import { DomainSnapshot } from '../src/types/domain';
import { TrackerStore } from '../src/ui/tracker-store';
import { FakeIndexedDBFactory } from './helpers/fake-indexeddb';

function installTestGlobals() {
  const prevIndexedDB = globalThis.indexedDB;
  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  const prevWindow = (globalThis as Record<string, unknown>).window;

  const fakeDb = new FakeIndexedDBFactory();
  const storageMap = new Map<string, string>();
  const fakeStorage = {
    getItem: (k: string) => storageMap.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storageMap.set(k, v);
    },
    removeItem: (k: string) => {
      storageMap.delete(k);
    },
    clear: () => {
      storageMap.clear();
    },
  };

  Object.defineProperty(globalThis, 'indexedDB', {
    value: fakeDb,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: fakeStorage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: {
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
    },
    configurable: true,
    writable: true,
  });

  const restore = () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: prevIndexedDB,
      configurable: true,
      writable: true,
    });
    if (prevLocalStorage === undefined) {
      delete (globalThis as Record<string, unknown>).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        value: prevLocalStorage,
        configurable: true,
        writable: true,
      });
    }
    if (prevWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: prevWindow,
        configurable: true,
        writable: true,
      });
    }
  };

  return { fakeDb, storageMap, restore };
}

test('HabitDatabase manages habits, checkins, notes, tasks, monotonic timestamps, and replaceSnapshot', async (t) => {
  const env = installTestGlobals();
  t.after(env.restore);

  const db = new HabitDatabase();

  // Habits CRUD + trimming + weekday masking + archive/unarchive
  const h1 = await db.createHabit({
    name: '  Morning Run  ',
    color: '#3B82F6',
    weekdays: 0xff, // should mask to 0x7f
    startDay: 20770,
  });
  assert.equal(h1.id, 1);
  assert.equal(h1.name, 'Morning Run');
  assert.equal(h1.weekdays, 0x7f);
  assert.equal(h1.archivedAt, null);

  const h1Updated = await db.updateHabit(h1.id, { name: '  Evening Run  ', weekdays: 0b0000101 });
  assert.equal(h1Updated.name, 'Evening Run');
  assert.equal(h1Updated.weekdays, 0b0000101);
  assert.ok(h1Updated.updatedAt > h1.updatedAt);

  const h1Archived = await db.setHabitArchived(h1.id, true);
  assert.notEqual(h1Archived.archivedAt, null);
  assert.ok(h1Archived.updatedAt > h1Updated.updatedAt);

  const h1Unarchived = await db.setHabitArchived(h1.id, false);
  assert.equal(h1Unarchived.archivedAt, null);

  await assert.rejects(() => db.updateHabit(999, { name: 'Nope' }), /not found/);
  await assert.rejects(() => db.setHabitArchived(999, true), /not found/);

  // Composite-key checkins & notes
  const c1 = await db.upsertCheckin(1, 20770, true);
  const c2 = await db.upsertCheckin(1, 20770, false);
  assert.equal(c2.done, false);
  assert.ok(c2.updatedAt > c1.updatedAt);

  const n1 = await db.upsertNote(1, 20770, '  5km pace  ');
  assert.equal(n1.text, '5km pace');
  const n2 = await db.upsertNote(1, 20770, '6km pace');
  assert.ok(n2.updatedAt > n1.updatedAt);

  // Tasks CRUD + completedDay preservation on edit + soft-delete tombstone
  const t1 = await db.createTask({ title: '  Buy milk ', note: ' 2% ', dueDay: 20770 });
  assert.equal(t1.title, 'Buy milk');
  assert.equal(t1.note, '2%');
  assert.equal(t1.done, false);
  assert.equal(t1.completedDay, null);
  assert.equal(t1.deletedAt, null);

  const t1Done = await db.updateTask(t1.id, { done: true, completedDay: 20765 });
  assert.equal(t1Done.done, true);
  assert.equal(t1Done.completedDay, 20765);
  assert.ok(t1Done.updatedAt > t1.updatedAt);

  // Editing title/note on an already-completed task MUST preserve original completedDay
  const t1Edited = await db.updateTask(t1.id, { title: 'Buy oat milk', note: 'Updated note' });
  assert.equal(t1Edited.completedDay, 20765);
  assert.ok(t1Edited.updatedAt > t1Done.updatedAt);

  // Re-opening clears completedDay, completing again sets today
  const t1Reopened = await db.updateTask(t1.id, { done: false });
  assert.equal(t1Reopened.completedDay, null);
  const t1DoneAgain = await db.updateTask(t1.id, { done: true });
  assert.notEqual(t1DoneAgain.completedDay, null);

  await db.deleteTask(t1.id);
  await db.deleteTask(999); // missing id is a safe no-op
  await assert.rejects(() => db.updateTask(999, { done: true }), /not found/);

  const snapshot = await db.getAllSnapshot();
  assert.equal(snapshot.habits.length, 1);
  assert.equal(snapshot.checkins.length, 1);
  assert.equal(snapshot.notes.length, 1);
  assert.equal(snapshot.tasks.length, 1);
  assert.notEqual(snapshot.tasks[0].deletedAt, null);

  // replaceSnapshot clears existing stores and writes new snapshot cleanly
  const replacement: DomainSnapshot = {
    habits: [
      {
        id: 10,
        name: 'Replaced Habit',
        color: '#22C55E',
        weekdays: 127,
        startDay: 20700,
        archivedAt: null,
        createdAt: 100,
        updatedAt: 200,
      },
    ],
    checkins: [],
    notes: [],
    tasks: [],
  };
  await db.replaceSnapshot(replacement);
  assert.deepEqual(await db.getAllSnapshot(), replacement);
});

test('SessionManager remembers mode in localStorage and fails cleanly when Firebase is unconfigured', async (t) => {
  const env = installTestGlobals();
  t.after(env.restore);

  const session = new SessionManager();
  assert.equal(session.getRememberedMode(), null);

  session.chooseGuest();
  assert.equal(session.getRememberedMode(), 'guest');
  assert.equal(session.hasAccessToken(), false);
  assert.equal(session.getAccessToken(), null);

  session.setRememberedMode('google');
  assert.equal(new SessionManager().getRememberedMode(), 'google');

  await session.clearSessionAndReturnToEntry();
  assert.equal(session.getRememberedMode(), null);

  await assert.rejects(() => session.signInWithGoogle(), /not configured/i);
});

test('TrackerStore executes Guest CRUD lifecycle, backup export/import, and Drive sync conflict recovery', async () => {
  const env = installTestGlobals();
  const store = new TrackerStore();

  try {
    store.init();
    store.selectGuest();
  assert.equal(store.mode(), 'guest');

  // Wait a microtask for reloadFromDb
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(store.dbReady(), true);

  // Create habit & toggle check-in & note
  store.openCreateHabit();
  assert.equal(store.habitModalOpen(), true);
  await store.saveHabit({ name: 'Read', color: '#3B82F6', weekdays: 127, startDay: store.todayDay() });
  store.closeHabitModal();
  assert.equal(store.habitModalOpen(), false);
  assert.equal(store.snapshot().habits.length, 1);

  const habit = store.snapshot().habits[0];
  store.openEditHabit(habit);
  await store.saveHabit({ name: 'Read Books', color: '#22C55E', weekdays: 127, startDay: habit.startDay });
  assert.equal(store.snapshot().habits[0].name, 'Read Books');

  await store.toggleCheckin(habit.id, store.todayDay(), true);
  await store.saveNote(habit.id, store.todayDay(), 'Good session');
  await store.toggleArchiveHabit(store.snapshot().habits[0]);
  assert.notEqual(store.snapshot().habits[0].archivedAt, null);

  // Task operations via TrackerStore
  await store.quickAddTask('Quick task', store.todayDay());
  assert.equal(store.snapshot().tasks.length, 1);
  await store.toggleTaskDone(store.snapshot().tasks[0]);
  assert.equal(store.snapshot().tasks[0].done, true);
  assert.equal(store.snapshot().tasks[0].completedDay, store.todayDay());
  await store.deleteTask(store.snapshot().tasks[0].id);
  assert.notEqual(store.snapshot().tasks[0].deletedAt, null);

  // Export backup & import another snapshot into guest workspace
  const exported = await store.exportBackup();
  assert.match(exported.filename, /^habits-backup-\d{4}-\d{2}-\d{2}\.bin$/);
  const unpackedExport = SnapshotCodec.unpack(exported.bytes);
  assert.equal(unpackedExport.habits.length, 1);

  const extraBackupBytes = SnapshotCodec.pack({
    habits: [],
    checkins: [],
    notes: [],
    tasks: [
      {
        id: 50,
        title: 'Imported Task',
        note: 'From backup',
        dueDay: store.todayDay(),
        done: false,
        completedDay: null,
        deletedAt: null,
        createdAt: 900,
        updatedAt: 900,
      },
    ],
  });
  await store.importBackup(extraBackupBytes);
  assert.equal(store.snapshot().tasks.length, 2);
  assert.ok(store.snapshot().tasks.some((task) => task.title === 'Imported Task'));

  // Simulate Google mode sync + ConcurrentSyncError re-merge flow through store internals
  const remoteOnlyHabit: DomainSnapshot = {
    habits: [
      {
        id: 2,
        name: 'Remote Stretch',
        color: '#A855F7',
        weekdays: 127,
        startDay: store.todayDay(),
        archivedAt: null,
        createdAt: 500,
        updatedAt: 500,
      },
    ],
    checkins: [],
    notes: [],
    tasks: [],
  };

  const mergedSnap: DomainSnapshot = {
    habits: [...store.snapshot().habits, ...remoteOnlyHabit.habits],
    checkins: store.snapshot().checkins,
    notes: store.snapshot().notes,
    tasks: store.snapshot().tasks,
  };

  const mergedPrep: SyncPreparationResult = {
    status: 'needs-upload-confirm',
    mergedSnapshot: mergedSnap,
    mergedBytes: SnapshotCodec.pack(mergedSnap),
    remoteFileId: 'remote-1',
    remoteVersion: '2',
    remoteModifiedTime: '2026-11-20T12:10:00Z',
    localChanged: true,
    summary: {
      habitsCount: mergedSnap.habits.length,
      checkinsCount: mergedSnap.checkins.length,
      notesCount: mergedSnap.notes.length,
      tasksCount: 1,
      byteSize: 100,
    },
  };

  let prepareCalls = 0;
  const internals = store as unknown as {
    setMode: (m: 'google' | 'guest' | null) => void;
    session: { hasAccessToken: () => boolean; getAccessToken: () => string | null };
    driveSync: {
      prepareSync: () => Promise<SyncPreparationResult>;
      confirmAndUpload: () => Promise<void>;
      listRevisions: () => Promise<{
        fileId: string | null;
        revisions: Array<{ id: string; modifiedTime?: string; size?: number }>;
      }>;
      inspectRevision: (
        mode: unknown,
        token: unknown,
        fileId: string,
        revisionId: string
      ) => Promise<{
        fileId: string;
        revisionId: string;
        snapshot: DomainSnapshot;
        bytes: Uint8Array;
        summary: {
          habitsCount: number;
          checkinsCount: number;
          notesCount: number;
          tasksCount: number;
          byteSize: number;
        };
      }>;
      restoreRevision: (
        mode: unknown,
        token: unknown,
        fileId: string,
        revisionId: string,
        localSnapshot: DomainSnapshot
      ) => Promise<{
        fileId: string;
        revisionId: string;
        restoredSnapshot: DomainSnapshot;
        restoredBytes: Uint8Array;
        summary: {
          habitsCount: number;
          checkinsCount: number;
          notesCount: number;
          tasksCount: number;
          byteSize: number;
        };
      }>;
    };
  };

  internals.setMode('google');
  internals.session = {
    hasAccessToken: () => true,
    getAccessToken: () => 'fake-token',
  };
  internals.driveSync = {
    prepareSync: async () => {
      prepareCalls += 1;
      return prepareCalls === 1
        ? mergedPrep
        : { ...mergedPrep, status: 'up-to-date', localChanged: false };
    },
    confirmAndUpload: async () => {
      throw new ConcurrentSyncError('Updated concurrently');
    },
    listRevisions: async () => ({
      fileId: 'remote-1',
      revisions: [
        { id: 'rev-2', modifiedTime: '2026-11-20T12:10:00Z', size: 120 },
        { id: 'rev-1', modifiedTime: '2026-11-19T12:10:00Z', size: 90 },
      ],
    }),
    inspectRevision: async (_m, _t, fileId, revisionId) => ({
      fileId,
      revisionId,
      snapshot: remoteOnlyHabit,
      bytes: SnapshotCodec.pack(remoteOnlyHabit),
      summary: {
        habitsCount: 1,
        checkinsCount: 0,
        notesCount: 0,
        tasksCount: 0,
        byteSize: 90,
      },
    }),
    restoreRevision: async (_m, _t, fileId, revisionId) => ({
      fileId,
      revisionId,
      restoredSnapshot: remoteOnlyHabit,
      restoredBytes: SnapshotCodec.pack(remoteOnlyHabit),
      summary: {
        habitsCount: 1,
        checkinsCount: 0,
        notesCount: 0,
        tasksCount: 0,
        byteSize: 90,
      },
    }),
  };

  await store.startDriveSync();
  assert.notEqual(store.pendingSync(), null);
  assert.equal(store.snapshot().habits.length, 2);

  await store.confirmUploadSync();
  assert.equal(store.pendingSync(), null);
  assert.equal(store.syncBanner()?.kind, 'success');
  assert.match(store.syncBanner()?.text ?? '', /Merged remote changes/i);

  await store.openDriveRevisions();
  assert.equal(store.revisionsModalOpen(), true);
  assert.equal(store.revisions().length, 2);

  await store.inspectDriveRevision('rev-1');
  assert.equal(store.inspectedRevision()?.revisionId, 'rev-1');

  await store.restoreDriveRevision('rev-1');
  assert.equal(store.revisionsModalOpen(), false);
  assert.equal(store.snapshot().habits.length, 1);
  assert.equal(store.snapshot().habits[0].name, 'Remote Stretch');
  assert.match(store.syncBanner()?.text ?? '', /Restored Drive version/i);
  } finally {
    store.dispose();
    env.restore();
  }
});

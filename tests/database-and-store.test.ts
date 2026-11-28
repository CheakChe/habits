import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionManager } from '../src/auth/session-manager';
import { HabitDatabase } from '../src/db/habit-database';
import { CalendarReminderService, CalendarSyncPlan } from '../src/sync/calendar-reminder-service';
import {
  ConcurrentSyncError,
  DriveSyncService,
  SyncPreparationResult,
} from '../src/sync/drive-sync-service';
import { SnapshotCodec } from '../src/sync/snapshot-codec';
import { DomainSnapshot } from '../src/types/domain';
import { TrackerStore } from '../src/ui/tracker-store';
import { ReminderPlanner, ReminderPreferences } from '../src/utils/reminder-planner';
import { OPEN_TASK_BUCKETS, TodayBoard } from '../src/utils/today-board';
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
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
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
  assert.equal(h1.weeklyTarget, null);
  assert.equal(h1.archivedAt, null);

  const h1Updated = await db.updateHabit(h1.id, {
    name: '  Evening Run  ',
    weekdays: 0b0000101,
    weeklyTarget: 3,
  });
  assert.equal(h1Updated.name, 'Evening Run');
  assert.equal(h1Updated.weekdays, 0b0000101);
  assert.equal(h1Updated.weeklyTarget, 3);
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
  assert.equal(t1Reopened.status, 'open');
  assert.equal(t1Reopened.completedDay, null);
  const t1DoneAgain = await db.updateTask(t1.id, { done: true });
  assert.equal(t1DoneAgain.status, 'done');
  assert.notEqual(t1DoneAgain.completedDay, null);

  // Transitioning to not_done and archived keeps done=false & completedDay=null
  const t1NotDone = await db.updateTask(t1.id, { status: 'not_done' });
  assert.equal(t1NotDone.status, 'not_done');
  assert.equal(t1NotDone.done, false);
  assert.equal(t1NotDone.completedDay, null);

  const t1Archived = await db.updateTask(t1.id, { status: 'archived' });
  assert.equal(t1Archived.status, 'archived');
  assert.equal(t1Archived.done, false);
  assert.equal(t1Archived.completedDay, null);

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
        weeklyTarget: null,
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

test('SessionManager remembers mode in localStorage and fails cleanly when Google OAuth is unconfigured', async (t) => {
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
    store.auth.selectGuest();
    assert.equal(store.auth.mode(), 'guest');

    // Wait a microtask for reloadFromDb
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(store.domain.dbReady(), true);

    // Default timezone is UTC and setTimeZone persists to localStorage
    assert.equal(store.filters.timeZone(), 'UTC');
    store.filters.setTimeZone('America/New_York');
    assert.equal(store.filters.timeZone(), 'America/New_York');
    assert.equal(env.storageMap.get('habits.timezone'), 'America/New_York');
    store.filters.setTimeZone('Invalid/Zone');
    assert.equal(store.filters.timeZone(), 'UTC');
    assert.equal(env.storageMap.get('habits.timezone'), 'UTC');

    // Create habit & toggle check-in & note
    store.domain.openCreateHabit();
    assert.equal(store.domain.habitModalOpen(), true);
    await store.domain.saveHabit({
      name: 'Read',
      color: '#3B82F6',
      weekdays: 127,
      startDay: store.filters.todayDay(),
    });
    store.domain.closeHabitModal();
    assert.equal(store.domain.habitModalOpen(), false);
    assert.equal(store.domain.snapshot().habits.length, 1);

    const habit = store.domain.snapshot().habits[0];
    store.domain.openEditHabit(habit);
    await store.domain.saveHabit({
      name: 'Read Books',
      color: '#22C55E',
      weekdays: 127,
      startDay: habit.startDay,
    });
    assert.equal(store.domain.snapshot().habits[0].name, 'Read Books');

    await store.domain.toggleCheckin(habit.id, store.filters.todayDay(), true);
    await store.domain.saveNote(habit.id, store.filters.todayDay(), 'Good session');
    await store.domain.toggleArchiveHabit(store.domain.snapshot().habits[0]);
    assert.notEqual(store.domain.snapshot().habits[0].archivedAt, null);

    // Task operations via TrackerStore
    await store.domain.quickAddTask('Quick task', store.filters.todayDay());
    assert.equal(store.domain.snapshot().tasks.length, 1);
    await store.domain.toggleTaskDone(store.domain.snapshot().tasks[0]);
    assert.equal(store.domain.snapshot().tasks[0].done, true);
    assert.equal(store.domain.snapshot().tasks[0].completedDay, store.filters.todayDay());
    await store.domain.deleteTask(store.domain.snapshot().tasks[0].id);
    assert.notEqual(store.domain.snapshot().tasks[0].deletedAt, null);

    // Export backup & import another snapshot into guest workspace
    const exported = await store.domain.exportBackup();
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
          dueDay: store.filters.todayDay(),
          done: false,
          status: 'open',
          completedDay: null,
          repeatable: false,
          deletedAt: null,
          createdAt: 900,
          updatedAt: 900,
        },
      ],
    });
    await store.domain.importBackup(extraBackupBytes);
    assert.equal(store.domain.snapshot().tasks.length, 2);
    assert.ok(store.domain.snapshot().tasks.some((task) => task.title === 'Imported Task'));

    // Simulate Google mode sync + ConcurrentSyncError re-merge flow via DI
    const remoteOnlyHabit: DomainSnapshot = {
      habits: [
        {
          id: 2,
          name: 'Remote Stretch',
          color: '#A855F7',
          weekdays: 127,
          weeklyTarget: null,
          startDay: store.filters.todayDay(),
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
      habits: [...store.domain.snapshot().habits, ...remoteOnlyHabit.habits],
      checkins: store.domain.snapshot().checkins,
      notes: store.domain.snapshot().notes,
      tasks: store.domain.snapshot().tasks,
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
    const fakeSession = {
      getRememberedMode: () => null,
      hasAccessToken: () => true,
      getAccessToken: () => 'fake-token',
      getTokenExpiresAt: () => 0,
      getAccountEmail: () => 'tester@example.com',
      subscribeAuthChanges: () => () => {},
      signInWithGoogle: () => Promise.resolve('fake-token'),
    } as unknown as SessionManager;
    const fakeDriveSync = {
      resetUploadCache: () => {},
      prepareSync: () => {
        prepareCalls += 1;
        return Promise.resolve(
          prepareCalls === 1
            ? mergedPrep
            : { ...mergedPrep, status: 'up-to-date', localChanged: false }
        );
      },
      confirmAndUpload: () => Promise.reject(new ConcurrentSyncError('Updated concurrently')),
      listRevisions: () =>
        Promise.resolve({
          fileId: 'remote-1',
          revisions: [
            { id: 'rev-2', modifiedTime: '2026-11-20T12:10:00Z', size: 120 },
            { id: 'rev-1', modifiedTime: '2026-11-19T12:10:00Z', size: 90 },
          ],
        }),
      inspectRevision: (_m: unknown, _t: unknown, fileId: string, revisionId: string) =>
        Promise.resolve({
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
      restoreRevision: (_m: unknown, _t: unknown, fileId: string, revisionId: string) =>
        Promise.resolve({
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
    } as unknown as DriveSyncService;

    store.dispose();
    const googleStore = new TrackerStore({
      session: fakeSession,
      driveSync: fakeDriveSync,
    });
    try {
      googleStore.init();
      await new Promise((r) => setTimeout(r, 15));
      await googleStore.auth.selectGoogle();
      assert.equal(googleStore.auth.mode(), 'google');

      await googleStore.drive.startDriveSync();
      assert.notEqual(googleStore.drive.pendingSync(), null);
      assert.equal(googleStore.domain.snapshot().habits.length, 2);

      await googleStore.drive.confirmUploadSync();
      assert.equal(googleStore.drive.pendingSync(), null);
      assert.equal(googleStore.drive.syncBanner()?.kind, 'success');
      assert.match(googleStore.drive.syncBanner()?.text ?? '', /Merged remote changes/i);

      await googleStore.drive.openDriveRevisions();
      assert.equal(googleStore.drive.revisionsModalOpen(), true);
      assert.equal(googleStore.drive.revisions().length, 2);

      await googleStore.drive.inspectDriveRevision('rev-1');
      assert.equal(googleStore.drive.inspectedRevision()?.revisionId, 'rev-1');

      await googleStore.drive.restoreDriveRevision('rev-1');
      assert.equal(googleStore.drive.revisionsModalOpen(), false);
      assert.equal(googleStore.domain.snapshot().habits.length, 1);
      assert.equal(googleStore.domain.snapshot().habits[0].name, 'Remote Stretch');
      assert.match(googleStore.drive.syncBanner()?.text ?? '', /Restored Drive version/i);
    } finally {
      googleStore.dispose();
    }
  } finally {
    store.dispose();
    env.restore();
  }
});

test('TrackerStore handles repeatable tasks, dateless goal scheduling, and UI state persistence', async (t) => {
  const env = installTestGlobals();
  t.after(env.restore);

  const store = new TrackerStore();
  try {
    store.init();
    store.auth.selectGuest();
    await new Promise((r) => setTimeout(r, 15));

    // 1. Persisted Today Goals collapse state
    assert.equal(store.filters.todayGoalsExpanded(), true);
    store.filters.toggleTodayGoalsExpanded();
    assert.equal(store.filters.todayGoalsExpanded(), false);
    assert.equal(env.storageMap.get('habits.todayGoalsExpanded'), 'false');

    // 2. Persisted History Date Range (preset & custom)
    assert.equal(store.filters.historyRangePreset(), 'last_30');
    store.filters.setHistoryRangePreset('prev_month');
    assert.equal(store.filters.historyRangePreset(), 'prev_month');
    const customStart = store.filters.todayDay() - 10;
    const customEnd = store.filters.todayDay() - 2;
    store.filters.setHistoryCustomRange(customStart, customEnd);
    assert.equal(store.filters.historyRangePreset(), 'custom');
    assert.equal(store.filters.historyCustomStartDay(), customStart);
    assert.equal(store.filters.historyCustomEndDay(), customEnd);

    // Re-instantiating TrackerStore reads persisted states back from localStorage
    const store2 = new TrackerStore();
    try {
      assert.equal(store2.filters.todayGoalsExpanded(), false);
      assert.equal(store2.filters.historyRangePreset(), 'custom');
      assert.equal(store2.filters.historyCustomStartDay(), customStart);
      assert.equal(store2.filters.historyCustomEndDay(), customEnd);
    } finally {
      store2.dispose();
    }

    // 3. Dateless goal + 1-click Schedule for Today
    store.domain.openCreateTask({ dueDay: null });
    assert.equal(store.domain.taskModalMode(), 'create');
    assert.equal(store.domain.taskDraftPrefill()?.dueDay, null);
    await store.domain.saveTask({
      title: 'Clean garage',
      note: 'Sort tools',
      dueDay: null,
      repeatable: true,
    });
    store.domain.closeTaskModal();

    const goal = store.domain.snapshot().tasks[0];
    assert.equal(goal.dueDay, null);
    assert.equal(goal.repeatable, true);

    await store.domain.scheduleTaskForDay(goal, store.filters.todayDay());
    const scheduledGoal = store.domain.snapshot().tasks[0];
    assert.equal(scheduledGoal.dueDay, store.filters.todayDay());

    // 4. Completing repeatable task opens pre-filled Schedule Next Occurrence modal
    await store.domain.toggleTaskDone(scheduledGoal);
    assert.equal(store.domain.snapshot().tasks[0].done, true);
    assert.equal(store.domain.taskModalOpen(), true);
    assert.equal(store.domain.taskModalMode(), 'next');
    assert.deepEqual(store.domain.taskDraftPrefill(), {
      title: 'Clean garage',
      note: 'Sort tools',
      dueDay: store.filters.todayDay() + 1,
      repeatable: true,
    });

    // Saving next occurrence creates a second open repeatable task
    await store.domain.saveTask({
      title: 'Clean garage',
      note: 'Sort tools',
      dueDay: null,
      repeatable: true,
    });
    store.domain.closeTaskModal();
    assert.equal(store.domain.snapshot().tasks.length, 2);
    assert.equal(store.domain.snapshot().tasks[1].done, false);
    assert.equal(store.domain.snapshot().tasks[1].dueDay, null);
    assert.equal(store.domain.snapshot().tasks[1].repeatable, true);

    // Completing a dateless repeatable task suggests dueDay: null
    await store.domain.toggleTaskDone(store.domain.snapshot().tasks[1]);
    assert.equal(store.domain.taskModalMode(), 'next');
    assert.equal(store.domain.taskDraftPrefill()?.dueDay, null);
    store.domain.closeTaskModal();

    // 5. Updating task status to not_done and archived through edit flow
    const secondTask = store.domain.snapshot().tasks[1];
    store.domain.openEditTask(secondTask);
    await store.domain.saveTask({
      title: secondTask.title,
      note: 'Did not make it',
      dueDay: secondTask.dueDay,
      repeatable: secondTask.repeatable,
      status: 'not_done',
    });
    store.domain.closeTaskModal();
    assert.equal(store.domain.snapshot().tasks[1].status, 'not_done');
    assert.equal(store.domain.snapshot().tasks[1].done, false);
    assert.equal(store.domain.snapshot().tasks[1].completedDay, null);

    store.domain.openEditTask(store.domain.snapshot().tasks[1]);
    await store.domain.saveTask({
      title: secondTask.title,
      note: 'No longer needed',
      dueDay: null,
      repeatable: false,
      status: 'archived',
    });
    store.domain.closeTaskModal();
    assert.equal(store.domain.snapshot().tasks[1].status, 'archived');
    assert.equal(store.domain.snapshot().tasks[1].done, false);
    assert.equal(store.domain.snapshot().tasks[1].completedDay, null);
  } finally {
    store.dispose();
  }
});

test('TodayBoard filters tasks by arbitrary status combinations and normalizes status selections', () => {
  const today = 20770;
  const tasks = [
    {
      id: 1,
      title: 'Overdue task',
      note: '',
      dueDay: today - 2,
      done: false,
      repeatable: false,
      status: 'open' as const,
      completedDay: null,
      deletedAt: null,
      createdAt: 100,
      updatedAt: 100,
    },
    {
      id: 2,
      title: 'Today task',
      note: 'important',
      dueDay: today,
      done: false,
      repeatable: false,
      status: 'open' as const,
      completedDay: null,
      deletedAt: null,
      createdAt: 200,
      updatedAt: 200,
    },
    {
      id: 3,
      title: 'Upcoming task',
      note: '',
      dueDay: today + 3,
      done: false,
      repeatable: false,
      status: 'open' as const,
      completedDay: null,
      deletedAt: null,
      createdAt: 300,
      updatedAt: 300,
    },
    {
      id: 4,
      title: 'No date goal',
      note: '',
      dueDay: null,
      done: false,
      repeatable: false,
      status: 'open' as const,
      completedDay: null,
      deletedAt: null,
      createdAt: 400,
      updatedAt: 400,
    },
    {
      id: 5,
      title: 'Finished task',
      note: 'important',
      dueDay: today - 1,
      done: true,
      repeatable: false,
      status: 'done' as const,
      completedDay: today,
      deletedAt: null,
      createdAt: 500,
      updatedAt: 500,
    },
    {
      id: 6,
      title: 'Missed task',
      note: '',
      dueDay: today - 1,
      done: false,
      repeatable: false,
      status: 'not_done' as const,
      completedDay: null,
      deletedAt: null,
      createdAt: 600,
      updatedAt: 600,
    },
    {
      id: 7,
      title: 'Old archived',
      note: '',
      dueDay: null,
      done: false,
      repeatable: false,
      status: 'archived' as const,
      completedDay: null,
      deletedAt: null,
      createdAt: 700,
      updatedAt: 700,
    },
    {
      id: 8,
      title: 'Deleted task',
      note: '',
      dueDay: today,
      done: false,
      repeatable: false,
      status: 'open' as const,
      completedDay: null,
      deletedAt: 999,
      createdAt: 800,
      updatedAt: 800,
    },
  ];

  // 'all' includes all non-deleted tasks across open + closed buckets
  assert.deepEqual(
    TodayBoard.filterTasksByStatuses(tasks, today, 'all').map((t) => t.id),
    [1, 2, 3, 4, 5, 6, 7]
  );

  // Default open buckets include overdue, today, upcoming, nodate
  assert.deepEqual(
    TodayBoard.filterTasksByStatuses(tasks, today, OPEN_TASK_BUCKETS).map((t) => t.id),
    [1, 2, 3, 4]
  );

  // Arbitrary combination: today + completed + not_done, filtered by search query
  assert.deepEqual(
    TodayBoard.filterTasksByStatuses(tasks, today, ['today', 'completed', 'not_done']).map(
      (t) => t.id
    ),
    [2, 5, 6]
  );
  assert.deepEqual(
    TodayBoard.filterTasksByStatuses(
      tasks,
      today,
      ['today', 'completed', 'not_done'],
      'important'
    ).map((t) => t.id),
    [2, 5]
  );

  // Empty selection returns []
  assert.deepEqual(TodayBoard.filterTasksByStatuses(tasks, today, []), []);

  // Selecting all 7 buckets normalizes to 'all'
  assert.equal(
    TodayBoard.normalizeStatusFilterSelection([
      'overdue',
      'today',
      'upcoming',
      'nodate',
      'completed',
      'not_done',
      'archived',
    ]),
    'all'
  );
  assert.deepEqual(TodayBoard.normalizeStatusFilterSelection(['today', 'invalid_key', 'today']), [
    'today',
  ]);
});

test('TrackerStore persists History multi-habit filter, Tasks multi-status filter, and Tasks sort mode', async (t) => {
  const env = installTestGlobals();
  t.after(env.restore);

  const store = new TrackerStore();
  try {
    store.init();
    store.auth.selectGuest();
    await new Promise((r) => setTimeout(r, 15));

    await store.domain.saveHabit({
      name: 'Run',
      color: '#3B82F6',
      weekdays: 127,
      startDay: store.filters.todayDay(),
    });
    await store.domain.saveHabit({
      name: 'Read',
      color: '#22C55E',
      weekdays: 127,
      startDay: store.filters.todayDay(),
    });
    await store.domain.saveHabit({
      name: 'Meditate',
      color: '#A855F7',
      weekdays: 127,
      startDay: store.filters.todayDay(),
    });

    const ids = store.domain.snapshot().habits.map((h) => h.id);
    assert.equal(store.filters.historyHabitFilter(), 'all');

    // Picking a subset persists across reloads
    store.filters.setHistoryHabitFilter([ids[0], ids[2]]);
    assert.deepEqual(store.filters.historyHabitFilter(), [ids[0], ids[2]]);

    // Selecting all habit IDs normalizes cleanly to 'all'
    store.filters.setHistoryHabitFilter([...ids]);
    assert.equal(store.filters.historyHabitFilter(), 'all');

    // Persist multi-habit subset + multi-status tasks filter + tasks sort mode
    store.filters.setHistoryHabitFilter([ids[0], ids[1]]);
    store.filters.setTasksStatusFilter(['today', 'completed', 'archived']);
    store.filters.setTasksSortMode('due_desc');

    const restored = new TrackerStore();
    try {
      restored.init();
      await new Promise((r) => setTimeout(r, 15));
      assert.deepEqual(restored.filters.historyHabitFilter(), [ids[0], ids[1]]);
      assert.deepEqual(restored.filters.tasksStatusFilter(), ['today', 'completed', 'archived']);
      assert.equal(restored.filters.tasksSortMode(), 'due_desc');

      // Storing 'all' for tasks status filter persists cleanly
      restored.filters.setTasksStatusFilter('all');
      assert.equal(restored.filters.tasksStatusFilter(), 'all');
      const restoredAll = new TrackerStore();
      try {
        assert.equal(restoredAll.filters.tasksStatusFilter(), 'all');
      } finally {
        restoredAll.dispose();
      }
    } finally {
      restored.dispose();
    }
  } finally {
    store.dispose();
  }
});

test('HabitDatabase and TrackerStore persist scheduleHistory scopes, preserve on rename, deduplicate, and reset on entire history', async (t) => {
  const env = installTestGlobals();
  t.after(env.restore);

  const db = new HabitDatabase();
  const day0 = 20750;
  const h = await db.createHabit({
    name: 'Exercise',
    color: '#3B82F6',
    weekdays: 0b0011111, // Mon-Fri fixed
    weeklyTarget: null,
    startDay: day0,
  });
  assert.equal('scheduleHistory' in h, false);

  // Edit schedule 'from_day' on day0 + 10 -> creates 2-entry scheduleHistory
  const hFlex = await db.updateHabit(h.id, {
    weekdays: 0b1111111,
    weeklyTarget: 3,
    scheduleApplyScope: 'from_day',
    scheduleEffectiveFromDay: day0 + 10,
  });
  assert.equal(hFlex.weeklyTarget, 3);
  assert.equal(hFlex.weekdays, 0b1111111);
  assert.deepEqual(hFlex.scheduleHistory, [
    { fromDay: day0, weekdays: 0b0011111, weeklyTarget: null },
    { fromDay: day0 + 10, weekdays: 0b1111111, weeklyTarget: 3 },
  ]);

  // Same-day overwrite at day0 + 10 replaces that day's version
  const hSameDay = await db.updateHabit(h.id, {
    weekdays: 0b0011111,
    weeklyTarget: 4,
    scheduleApplyScope: 'from_day',
    scheduleEffectiveFromDay: day0 + 10,
  });
  assert.deepEqual(hSameDay.scheduleHistory, [
    { fromDay: day0, weekdays: 0b0011111, weeklyTarget: null },
    { fromDay: day0 + 10, weekdays: 0b0011111, weeklyTarget: 4 },
  ]);

  // Rename / change color without changing schedule -> preserves scheduleHistory!
  const hRenamed = await db.updateHabit(h.id, {
    name: 'Daily Training',
    color: '#22C55E',
    weekdays: 0b0011111,
    weeklyTarget: 4,
  });
  assert.equal(hRenamed.name, 'Daily Training');
  assert.deepEqual(hRenamed.scheduleHistory, hSameDay.scheduleHistory);

  // Reverting on same day (day0 + 10) back to baseline (Mon-Fri fixed) deduplicates and omits scheduleHistory!
  const hCollapsed = await db.updateHabit(h.id, {
    weekdays: 0b0011111,
    weeklyTarget: null,
    scheduleApplyScope: 'from_day',
    scheduleEffectiveFromDay: day0 + 10,
  });
  assert.equal('scheduleHistory' in hCollapsed, false);

  // Create new history, advance startDay past transition -> clamps & omits scheduleHistory
  await db.updateHabit(h.id, {
    weekdays: 0b1111111,
    weeklyTarget: 5,
    scheduleApplyScope: 'from_day',
    scheduleEffectiveFromDay: day0 + 10,
  });
  const hClamped = await db.updateHabit(h.id, {
    startDay: day0 + 12,
    weekdays: 0b1111111,
    weeklyTarget: 5,
  });
  assert.equal('scheduleHistory' in hClamped, false);
  assert.equal(hClamped.weeklyTarget, 5);

  // TrackerStore forwards scheduleApplyScope & scheduleEffectiveFromDay and resets cleanly on 'all'
  const store = new TrackerStore();
  try {
    store.init();
    store.auth.selectGuest();
    await new Promise((r) => setTimeout(r, 15));

    const start = store.filters.todayDay() - 14;
    await store.domain.saveHabit({
      name: 'Read',
      color: '#A855F7',
      weekdays: 0b1111111,
      weeklyTarget: null,
      startDay: start,
    });
    const created = store.domain.snapshot().habits.find((x) => x.name === 'Read')!;
    store.domain.openEditHabit(created);
    await store.domain.saveHabit({
      name: 'Read',
      color: '#A855F7',
      weekdays: 0b1111111,
      weeklyTarget: 4,
      startDay: start,
      scheduleApplyScope: 'from_day',
      scheduleEffectiveFromDay: store.filters.todayDay(),
    });
    const versioned = store.domain.snapshot().habits.find((x) => x.id === created.id)!;
    assert.equal(versioned.scheduleHistory?.length, 2);

    store.domain.openEditHabit(versioned);
    await store.domain.saveHabit({
      name: 'Read',
      color: '#A855F7',
      weekdays: 0b0010101,
      weeklyTarget: null,
      startDay: start,
      scheduleApplyScope: 'all',
    });
    const resetHabit = store.domain.snapshot().habits.find((x) => x.id === created.id)!;
    assert.equal('scheduleHistory' in resetHabit, false);
    assert.equal(resetHabit.weekdays, 0b0010101);
    assert.equal(resetHabit.weeklyTarget, null);
  } finally {
    store.dispose();
  }
});

test('HabitDatabase and TrackerStore support measured habits, stepped dailyTarget scopes, and +1/+5/manual logging', async (t) => {
  const env = installTestGlobals();
  t.after(env.restore);

  const db = new HabitDatabase();
  const day0 = 20740;

  // Create measured habit: 15 min/day
  const h = await db.createHabit({
    name: 'Focus',
    color: '#3B82F6',
    weekdays: 0b1111111,
    weeklyTarget: null,
    dailyTarget: 15,
    unit: ' min ',
    startDay: day0,
  });
  assert.equal(h.dailyTarget, 15);
  assert.equal(h.unit, 'min');
  assert.equal('scheduleHistory' in h, false);

  // Step up dailyTarget 15 -> 30 from day0 + 10 using 'from_day'
  const stepped = await db.updateHabit(h.id, {
    weekdays: 0b1111111,
    weeklyTarget: null,
    dailyTarget: 30,
    unit: 'min',
    scheduleApplyScope: 'from_day',
    scheduleEffectiveFromDay: day0 + 10,
  });
  assert.equal(stepped.dailyTarget, 30);
  assert.equal(stepped.unit, 'min');
  assert.deepEqual(stepped.scheduleHistory, [
    { fromDay: day0, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 15 },
    { fromDay: day0 + 10, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 30 },
  ]);

  // Switch back to check-off from day0 + 20 using 'from_day' -> keeps unit for earlier measured segments!
  const revertedPartial = await db.updateHabit(h.id, {
    weekdays: 0b1111111,
    weeklyTarget: null,
    dailyTarget: null,
    unit: null,
    scheduleApplyScope: 'from_day',
    scheduleEffectiveFromDay: day0 + 20,
  });
  assert.equal('dailyTarget' in revertedPartial, false);
  assert.equal(revertedPartial.unit, 'min');
  assert.equal(revertedPartial.scheduleHistory?.length, 3);

  // Switch to check-off for 'all' -> strips dailyTarget, unit, and scheduleHistory
  const revertedAll = await db.updateHabit(h.id, {
    weekdays: 0b1111111,
    weeklyTarget: null,
    dailyTarget: null,
    unit: null,
    scheduleApplyScope: 'all',
  });
  assert.equal('dailyTarget' in revertedAll, false);
  assert.equal('unit' in revertedAll, false);
  assert.equal('scheduleHistory' in revertedAll, false);

  // Direct db.upsertCheckin stores and strips numeric value cleanly
  await db.upsertCheckin(h.id, day0, false, 12.5);
  let snap = await db.getAllSnapshot();
  assert.equal(snap.checkins[0].value, 12.5);
  assert.equal(snap.checkins[0].done, false);

  await db.upsertCheckin(h.id, day0, false, 0);
  snap = await db.getAllSnapshot();
  assert.equal('value' in snap.checkins[0], false);

  // TrackerStore quick-logging and toggle behavior
  const store = new TrackerStore();
  try {
    store.init();
    store.auth.selectGuest();
    await new Promise((r) => setTimeout(r, 15));

    const today = store.filters.todayDay();
    await store.domain.saveHabit({
      name: 'Meditation',
      color: '#22C55E',
      weekdays: 0b1111111,
      weeklyTarget: null,
      dailyTarget: 15,
      unit: 'min',
      startDay: today - 10,
    });
    const med = store.domain.snapshot().habits.find((x) => x.name === 'Meditation')!;

    // +5, +5, +1 => 11/15 (partial, done === false)
    await store.domain.incrementCheckinValue(med.id, today, 5);
    await store.domain.incrementCheckinValue(med.id, today, 5);
    await store.domain.incrementCheckinValue(med.id, today, 1);
    let c = store.domain
      .snapshot()
      .checkins.find((x) => x.habitId === med.id && x.dayIndex === today)!;
    assert.equal(c.value, 11);
    assert.equal(c.done, false);

    // +5 => 16 >= 15 => done === true
    await store.domain.incrementCheckinValue(med.id, today, 5);
    c = store.domain.snapshot().checkins.find((x) => x.habitId === med.id && x.dayIndex === today)!;
    assert.equal(c.value, 16);
    assert.equal(c.done, true);

    // toggleCheckin(false) resets to 0 & done === false
    await store.domain.toggleCheckin(med.id, today, false);
    c = store.domain.snapshot().checkins.find((x) => x.habitId === med.id && x.dayIndex === today)!;
    assert.equal(c.done, false);
    assert.equal('value' in c, false);

    // toggleCheckin(true) from 0 completes full active dailyTarget (15)
    await store.domain.toggleCheckin(med.id, today, true);
    c = store.domain.snapshot().checkins.find((x) => x.habitId === med.id && x.dayIndex === today)!;
    assert.equal(c.done, true);
    assert.equal(c.value, 15);

    // Bump today's target to 30 from today
    store.domain.openEditHabit(med);
    await store.domain.saveHabit({
      name: 'Meditation',
      color: '#22C55E',
      weekdays: 0b1111111,
      weeklyTarget: null,
      dailyTarget: 30,
      unit: 'min',
      startDay: today - 10,
      scheduleApplyScope: 'from_day',
      scheduleEffectiveFromDay: today,
    });

    // toggleCheckin(true) when value (15) < new active target (30) fills up to 30!
    await store.domain.toggleCheckin(med.id, today, true);
    c = store.domain.snapshot().checkins.find((x) => x.habitId === med.id && x.dayIndex === today)!;
    assert.equal(c.done, true);
    assert.equal(c.value, 30);

    // Manual entry below/above target
    await store.domain.setCheckinValue(med.id, today, 22.5);
    c = store.domain.snapshot().checkins.find((x) => x.habitId === med.id && x.dayIndex === today)!;
    assert.equal(c.value, 22.5);
    assert.equal(c.done, false);

    await store.domain.setCheckinValue(med.id, today, 30);
    c = store.domain.snapshot().checkins.find((x) => x.habitId === med.id && x.dayIndex === today)!;
    assert.equal(c.value, 30);
    assert.equal(c.done, true);

    // Rapid unawaited calls serialize cleanly without losing updates
    await Promise.all([
      store.domain.setCheckinValue(med.id, today, 10),
      store.domain.incrementCheckinValue(med.id, today, 5),
      store.domain.incrementCheckinValue(med.id, today, 1),
    ]);
    c = store.domain.snapshot().checkins.find((x) => x.habitId === med.id && x.dayIndex === today)!;
    assert.equal(c.value, 16);
    assert.equal(c.done, false);
  } finally {
    store.dispose();
  }
});

test('HabitDatabase and TrackerStore manage reminderSlots CRUD, habit reminderSlotIds, and deletion cleanup', async (t) => {
  const env = installTestGlobals();
  t.after(env.restore);

  const db = new HabitDatabase();

  // Default habit has no reminderSlotIds
  const hDefault = await db.createHabit({
    name: 'No Reminder By Default',
    color: '#3B82F6',
    weekdays: 127,
    startDay: 20770,
  });
  assert.equal('reminderSlotIds' in hDefault, false);

  // Create slots & assign them explicitly to a habit
  const morning = await db.createReminderSlot({ label: '  Morning ', time: '8:05' });
  assert.equal(morning.label, 'Morning');
  assert.equal(morning.time, '08:05');
  assert.equal(morning.deletedAt, null);

  const evening = await db.createReminderSlot({ label: 'Evening', time: '21:00' });

  const hWithSlots = await db.createHabit({
    name: 'Vitamins',
    color: '#22C55E',
    weekdays: 127,
    startDay: 20770,
    reminderSlotIds: [morning.id, evening.id, morning.id],
  });
  assert.deepEqual(hWithSlots.reminderSlotIds, [morning.id, evening.id].sort());

  const updatedMorning = await db.updateReminderSlot(morning.id, {
    label: 'Early Morning',
    time: '7:30',
  });
  assert.equal(updatedMorning.label, 'Early Morning');
  assert.equal(updatedMorning.time, '07:30');
  assert.ok(updatedMorning.updatedAt >= morning.updatedAt);

  // Deleting a slot tombstones it and strips its id from affected habits atomically
  await db.deleteReminderSlot(morning.id);
  const dbSnap = await db.getAllSnapshot();
  const tombstone = dbSnap.reminderSlots?.find((s) => s.id === morning.id);
  assert.notEqual(tombstone?.deletedAt, null);

  const reloadedVitamins = dbSnap.habits.find((h) => h.id === hWithSlots.id)!;
  assert.deepEqual(reloadedVitamins.reminderSlotIds, [evening.id]);

  // Removing remaining slot omits reminderSlotIds from persisted Habit record
  const clearedVitamins = await db.updateHabit(hWithSlots.id, { reminderSlotIds: [] });
  assert.equal('reminderSlotIds' in clearedVitamins, false);

  // Tasks also support explicit reminderSlotIds CRUD + deletion cascade
  const tSlot = await db.createReminderSlot({ label: 'Task Slot', time: '15:00' });
  const tWithSlots = await db.createTask({
    title: 'Pay invoice',
    note: '',
    dueDay: 20770,
    reminderSlotIds: [evening.id, tSlot.id, evening.id],
  });
  assert.deepEqual(tWithSlots.reminderSlotIds, [evening.id, tSlot.id].sort());

  await db.deleteReminderSlot(tSlot.id);
  const afterTaskSlotDelete = await db.getAllSnapshot();
  const reloadedTask = afterTaskSlotDelete.tasks.find((task) => task.id === tWithSlots.id)!;
  assert.deepEqual(reloadedTask.reminderSlotIds, [evening.id]);

  const clearedTask = await db.updateTask(tWithSlots.id, { reminderSlotIds: [] });
  assert.equal('reminderSlotIds' in clearedTask, false);

  await db.replaceSnapshot({ habits: [], checkins: [], notes: [], tasks: [] });

  // TrackerStore integration: create/update/delete slots, task slots, repeatable prefill, & clear matching taskReminderSlotId
  const store = new TrackerStore();
  try {
    store.init();
    store.auth.selectGuest();
    await new Promise((r) => setTimeout(r, 15));

    const slotA = await store.reminders.createReminderSlot({ label: 'Work', time: '10:00' });
    const slotB = await store.reminders.createReminderSlot({ label: 'Night', time: '22:15' });
    assert.deepEqual(
      store.reminders.activeReminderSlots().map((s) => s.id),
      [slotA.id, slotB.id]
    );

    await store.domain.saveHabit({
      name: 'Stretch',
      color: '#A855F7',
      weekdays: 127,
      startDay: store.filters.todayDay(),
      reminderSlotIds: [slotA.id, slotB.id],
    });
    const stretch = store.domain.snapshot().habits.find((h) => h.name === 'Stretch')!;
    assert.deepEqual(stretch.reminderSlotIds, [slotA.id, slotB.id].sort());

    store.domain.openCreateTask();
    await store.domain.saveTask({
      title: 'Weekly Review',
      note: '',
      dueDay: store.filters.todayDay(),
      repeatable: true,
      reminderSlotIds: [slotA.id, slotB.id],
    });
    store.domain.closeTaskModal();
    const reviewTask = store.domain
      .snapshot()
      .tasks.find((task) => task.title === 'Weekly Review')!;
    assert.deepEqual(reviewTask.reminderSlotIds, [slotA.id, slotB.id].sort());

    // Completing repeatable task with slots pre-fills reminderSlotIds for the next occurrence
    await store.domain.toggleTaskDone(reviewTask);
    assert.deepEqual(store.domain.taskDraftPrefill()?.reminderSlotIds, [slotA.id, slotB.id].sort());
    store.domain.closeTaskModal();

    store.reminders.setTaskReminderSlotId(slotA.id);
    assert.equal(store.reminders.reminderPrefs().taskReminderSlotId, slotA.id);

    await store.reminders.updateReminderSlot(slotA.id, { label: 'Focus', time: '09:00' });
    assert.equal(
      store.reminders.activeReminderSlots().find((s) => s.id === slotA.id)?.label,
      'Focus'
    );

    // Deleting slotA removes it from activeReminderSlots, strips from Stretch and Weekly Review, and resets taskReminderSlotId -> null
    await store.reminders.deleteReminderSlot(slotA.id);
    assert.deepEqual(
      store.reminders.activeReminderSlots().map((s) => s.id),
      [slotB.id]
    );
    assert.deepEqual(
      store.domain.snapshot().habits.find((h) => h.id === stretch.id)?.reminderSlotIds,
      [slotB.id]
    );
    assert.deepEqual(
      store.domain.snapshot().tasks.find((t) => t.id === reviewTask.id)?.reminderSlotIds,
      [slotB.id]
    );
    assert.equal(store.reminders.reminderPrefs().taskReminderSlotId, null);
  } finally {
    store.dispose();
  }
});

test('TrackerStore persists UI preferences, handles corrupt localStorage, caches AdvancedAnalytics, and exports/imports backups', async (t) => {
  const env = installTestGlobals();
  t.after(env.restore);

  // Seed corrupt / edge localStorage values before constructing TrackerStore
  env.storageMap.set('habits.timezone', 'Invalid/Zone');
  env.storageMap.set('habits.todayGoalsExpanded', 'false');
  env.storageMap.set('habits.historyRange', '{broken json');
  env.storageMap.set('habits.historySubTab', 'advanced');
  env.storageMap.set('habits.historyHabitFilter', '[1, "bad", 1, -3, 2]');
  env.storageMap.set('habits.advancedHeatmapMode', 'tasks');
  env.storageMap.set('habits.advancedNotesFilter', 'missed');
  env.storageMap.set('habits.tasksStatusFilter', 'invalid-json');
  env.storageMap.set('habits.tasksSortMode', 'due_desc');
  env.storageMap.set('habits.reminders', '{broken');

  const store = new TrackerStore();
  try {
    assert.equal(store.filters.timeZone(), 'UTC');
    assert.equal(store.filters.todayGoalsExpanded(), false);
    assert.equal(store.filters.historyRangePreset(), 'last_30');
    assert.equal(store.filters.historySubTab(), 'advanced');
    assert.deepEqual(store.filters.historyHabitFilter(), [1, 2]);
    assert.equal(store.filters.advancedHeatmapMode(), 'tasks');
    assert.equal(store.filters.advancedNotesFilter(), 'missed');
    assert.deepEqual(store.filters.tasksStatusFilter(), [...OPEN_TASK_BUCKETS]);
    assert.equal(store.filters.tasksSortMode(), 'due_desc');

    store.init();
    store.auth.selectGuest();
    await new Promise((r) => setTimeout(r, 15));

    store.filters.setTimeZone('America/New_York');
    assert.equal(store.filters.timeZone(), 'America/New_York');
    store.filters.setTimeZone('Not/A_Zone');
    assert.equal(store.filters.timeZone(), 'UTC');

    store.filters.toggleTodayGoalsExpanded();
    assert.equal(store.filters.todayGoalsExpanded(), true);
    store.filters.setHistoryRangePreset('last_7');
    assert.equal(store.filters.historyRangePreset(), 'last_7');
    const today = store.filters.todayDay();
    store.filters.setHistoryCustomRange(today + 10, today - 5);
    assert.equal(store.filters.historyRangePreset(), 'custom');
    assert.equal(store.filters.historyCustomStartDay(), today - 5);
    assert.equal(store.filters.historyCustomEndDay(), today);

    store.filters.setHistorySubTab('charts');
    assert.equal(store.filters.historySubTab(), 'charts');
    store.filters.setAdvancedHeatmapMode('habits');
    assert.equal(store.filters.advancedHeatmapMode(), 'habits');
    store.filters.setAdvancedNotesFilter('done');
    assert.equal(store.filters.advancedNotesFilter(), 'done');
    store.filters.setTasksStatusFilter(['completed']);
    assert.deepEqual(store.filters.tasksStatusFilter(), ['completed']);
    store.filters.setTasksSortMode('title');
    assert.equal(store.filters.tasksSortMode(), 'title');

    // Create two habits & verify historyHabitFilter normalization + reloadFromDb pruning
    await store.domain.saveHabit({
      name: 'Habit One',
      color: '#3B82F6',
      weekdays: 127,
      startDay: today - 3,
    });
    await store.domain.saveHabit({
      name: 'Habit Two',
      color: '#22C55E',
      weekdays: 127,
      startDay: today - 3,
    });
    const habits = store.domain.snapshot().habits;
    store.filters.setHistoryHabitFilter([habits[0].id, habits[1].id]);
    assert.equal(store.filters.historyHabitFilter(), 'all'); // all habits selected collapses to 'all'
    store.filters.setHistoryHabitFilter([habits[0].id, habits[0].id]);
    assert.deepEqual(store.filters.historyHabitFilter(), [habits[0].id]);

    // Backup export & import
    await store.domain.quickAddTask('Backup Task', today);
    const exported = await store.domain.exportBackup();
    assert.match(exported.filename, /\.bin$/);
    assert.match(store.drive.syncBanner()?.text ?? '', /Backup exported/);

    const extraSnap: DomainSnapshot = {
      habits: [
        {
          id: 99,
          name: 'Imported Habit',
          color: '#A855F7',
          weekdays: 127,
          weeklyTarget: null,
          startDay: today,
          archivedAt: null,
          createdAt: 9999999999999,
          updatedAt: 9999999999999,
        },
      ],
      checkins: [],
      notes: [],
      tasks: [],
    };
    await store.domain.importBackup(SnapshotCodec.pack(extraSnap));
    assert.ok(store.domain.snapshot().habits.some((h) => h.name === 'Imported Habit'));
    assert.match(store.drive.syncBanner()?.text ?? '', /Backup merged/);
  } finally {
    store.dispose();
  }
});

test('TrackerStore Google mode: auth, Drive sync, ConcurrentSyncError recovery, Revisions, and Calendar reminders', async (t) => {
  const env = installTestGlobals();
  t.after(env.restore);

  const prevDoc = (globalThis as Record<string, unknown>).document;
  const prevNav = (globalThis as Record<string, unknown>).navigator;
  const docListeners = new Map<string, Array<() => void>>();
  let visibilityState = 'hidden';

  Object.defineProperty(globalThis, 'document', {
    value: {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener(type: string, fn: () => void) {
        const list = docListeners.get(type) ?? [];
        list.push(fn);
        docListeners.set(type, list);
      },
      removeEventListener(type: string, fn: () => void) {
        docListeners.set(
          type,
          (docListeners.get(type) ?? []).filter((f) => f !== fn)
        );
      },
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      setAppBadge: async () => {},
      clearAppBadge: async () => {},
    },
    configurable: true,
    writable: true,
  });
  t.after(() => {
    if (prevDoc === undefined) delete (globalThis as Record<string, unknown>).document;
    else Object.defineProperty(globalThis, 'document', { value: prevDoc, configurable: true });
    if (prevNav === undefined) delete (globalThis as Record<string, unknown>).navigator;
    else Object.defineProperty(globalThis, 'navigator', { value: prevNav, configurable: true });
  });

  // Mock SessionManager
  let token: string | null = null;
  let email: string | null = null;
  let expiresAt = 0;
  let signInError: Error | null = null;
  const listeners = new Set<(s: { hasToken: boolean; email: string | null }) => void>();

  const mockSession = {
    getRememberedMode: () => null,
    hasAccessToken: () => Boolean(token),
    getAccessToken: () => token,
    getTokenExpiresAt: () => expiresAt,
    getAccountEmail: () => email,
    subscribeAuthChanges(fn: (s: { hasToken: boolean; email: string | null }) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    chooseGuest() {
      token = null;
      email = null;
      for (const fn of listeners) fn({ hasToken: false, email: null });
    },
    signInWithGoogle() {
      if (signInError) return Promise.reject(signInError);
      token = 'tok-google';
      email = 'user@example.com';
      expiresAt = Date.now() + 60_000;
      for (const fn of listeners) fn({ hasToken: true, email });
      return Promise.resolve(token);
    },
    clearAccessTokenOnly() {
      token = null;
      expiresAt = 0;
      for (const fn of listeners) fn({ hasToken: false, email });
    },
    clearSessionAndReturnToEntry() {
      token = null;
      email = null;
      expiresAt = 0;
      for (const fn of listeners) fn({ hasToken: false, email: null });
      return Promise.resolve();
    },
  } as unknown as SessionManager;

  let prepareMode: 'up-to-date' | 'needs-upload' | 'local-changed-up-to-date' | 'auth-error' =
    'up-to-date';
  let confirmMode: 'ok' | 'concurrent-merged' | 'concurrent-reprepare' | 'concurrent-fail' | 'err' =
    'ok';

  const mockDriveSync = {
    resetUploadCache() {},
    prepareSync(_mode: unknown, _tok: unknown, local: DomainSnapshot) {
      if (prepareMode === 'auth-error') {
        return Promise.reject(new Error('401 Authorization expired'));
      }
      if (prepareMode === 'local-changed-up-to-date') {
        return Promise.resolve({
          status: 'up-to-date',
          remoteFileId: 'file-1',
          remoteVersion: '1',
          remoteModifiedTime: null,
          localChanged: true,
          mergedSnapshot: local,
          mergedBytes: new Uint8Array([1, 2, 3]),
          summary: { habitsCount: 0, checkinsCount: 0, notesCount: 0, tasksCount: 0, byteSize: 32 },
        } satisfies SyncPreparationResult);
      }
      if (prepareMode === 'up-to-date') {
        return Promise.resolve({
          status: 'up-to-date',
          remoteFileId: 'file-1',
          remoteVersion: '1',
          remoteModifiedTime: null,
          localChanged: false,
          mergedSnapshot: local,
          mergedBytes: new Uint8Array([1, 2, 3]),
          summary: { habitsCount: 0, checkinsCount: 0, notesCount: 0, tasksCount: 0, byteSize: 32 },
        } satisfies SyncPreparationResult);
      }
      return Promise.resolve({
        status: 'needs-upload-confirm',
        remoteFileId: 'file-1',
        remoteVersion: '1',
        remoteModifiedTime: null,
        localChanged: false,
        mergedSnapshot: local,
        mergedBytes: new Uint8Array([1, 2, 3]),
        summary: { habitsCount: 1, checkinsCount: 0, notesCount: 0, tasksCount: 0, byteSize: 40 },
      } satisfies SyncPreparationResult);
    },
    confirmAndUpload() {
      if (confirmMode === 'concurrent-merged') {
        prepareMode = 'up-to-date';
        return Promise.reject(new ConcurrentSyncError('conflict'));
      }
      if (confirmMode === 'concurrent-reprepare') {
        prepareMode = 'needs-upload';
        return Promise.reject(new ConcurrentSyncError('conflict'));
      }
      if (confirmMode === 'concurrent-fail') {
        prepareMode = 'auth-error';
        return Promise.reject(new ConcurrentSyncError('conflict'));
      }
      if (confirmMode === 'err') {
        return Promise.reject(new Error('403 Forbidden permission'));
      }
      return Promise.resolve();
    },
    listRevisions() {
      return Promise.resolve({
        fileId: 'file-1',
        revisions: [{ id: 'rev-2', modifiedTime: '2026-11-25T00:00:00Z', size: 120 }],
      });
    },
    inspectRevision() {
      return Promise.resolve({
        revisionId: 'rev-2',
        snapshot: { habits: [], checkins: [], notes: [], tasks: [] },
        summary: { habitsCount: 0, checkinsCount: 0, notesCount: 0, tasksCount: 0, byteSize: 32 },
      });
    },
    restoreRevision() {
      return Promise.resolve({
        restoredSnapshot: { habits: [], checkins: [], notes: [], tasks: [] },
        summary: { habitsCount: 0, checkinsCount: 0, notesCount: 0, tasksCount: 0, byteSize: 32 },
      });
    },
  } as unknown as DriveSyncService;

  let calPlanHasMutations = false;
  let calSyncError: Error | null = null;
  const mockCalendarSync = {
    syncRemoteCalendarId() {
      return Promise.resolve({
        calendarId: 'cal-remote-1',
        timeZone: 'Europe/Paris',
        timeZoneUpdatedAt: Date.now() + 1000,
        taskReminderSlotId: null,
        horizonDays: 7,
        calendarEnabled: true,
        updatedAt: Date.now() + 1000,
      });
    },
    prepareSyncPlan(
      _mode: unknown,
      _tok: unknown,
      snap: DomainSnapshot,
      today: number,
      prefs: ReminderPreferences,
      tz: string
    ) {
      if (calSyncError) return Promise.reject(calSyncError);
      return Promise.resolve({
        calendarId: 'cal-remote-1',
        willCreateCalendar: false,
        willUpdateCalendarTz: false,
        duplicateCalendarIds: [],
        timeZone: tz,
        todayDay: today,
        todayCleared: false,
        targetSignature: ReminderPlanner.computeStateSignature(snap, today, prefs, tz),
        toCreate: calPlanHasMutations
          ? [
              {
                dayIndex: 20770,
                slotId: 's1',
                slotLabel: 'Morning',
                slotTime: '09:00',
                dateStr: '2026-11-25',
                summary: 'Habits',
                description: 'Desc',
                startDateTime: '2026-11-25T09:00:00',
                endDateTime: '2026-11-25T09:15:00',
                timeZone: tz,
                signature: 'sig-ev',
              },
            ]
          : [],
        toUpdate: [],
        toDelete: [],
        unchangedCount: 0,
        desiredEvents: [],
      } satisfies CalendarSyncPlan);
    },
    applySyncPlan() {
      return Promise.resolve({
        calendarId: 'cal-remote-1',
        timeZone: 'Europe/Paris',
        targetSignature: 'sig-1',
        created: 1,
        updated: 0,
        deleted: 0,
        duplicatesRemoved: 1,
      });
    },
    deleteReminderCalendar() {
      return Promise.resolve();
    },
  } as unknown as CalendarReminderService;

  const store = new TrackerStore({
    session: mockSession,
    driveSync: mockDriveSync,
    calendarSync: mockCalendarSync,
  });

  try {
    store.init();
    await new Promise((r) => setTimeout(r, 15));

    // Visibility change triggers badge refresh
    visibilityState = 'visible';
    for (const fn of docListeners.get('visibilitychange') ?? []) fn();

    // Sign in failure -> authError
    signInError = new Error('Popup closed');
    await store.auth.selectGoogle();
    assert.equal(store.auth.authError(), 'Popup closed');
    assert.equal(store.auth.mode(), null);

    // Sign in success
    signInError = null;
    await store.auth.selectGoogle();
    assert.equal(store.auth.mode(), 'google');
    assert.equal(store.auth.hasGoogleToken(), true);
    assert.equal(store.auth.googleEmail(), 'user@example.com');

    // Reconnect error & success
    signInError = new Error('Reconnect failed');
    await store.auth.reconnectGoogle();
    assert.equal(store.drive.syncBanner()?.kind, 'error');
    signInError = null;
    await store.auth.reconnectGoogle();

    // Drive Sync: up-to-date + pulls remote calendar meta & timezone
    prepareMode = 'up-to-date';
    await store.drive.startDriveSync();
    assert.equal(store.drive.syncBanner()?.kind, 'success');
    assert.equal(store.filters.timeZone(), 'Europe/Paris');
    assert.equal(store.reminders.reminderPrefs().calendarId, 'cal-remote-1');

    // Drive Sync: localChanged
    prepareMode = 'local-changed-up-to-date';
    await store.drive.startDriveSync();
    assert.match(store.drive.syncBanner()?.text ?? '', /Downloaded and merged/);

    // Drive Sync: auth error clears token
    prepareMode = 'auth-error';
    await store.drive.startDriveSync();
    assert.equal(store.auth.hasGoogleToken(), false);
    assert.equal(store.drive.syncBanner()?.kind, 'error');

    // Re-auth & prepare upload + cancelPendingSync
    prepareMode = 'needs-upload';
    await store.drive.startDriveSync();
    assert.ok(store.drive.pendingSync());
    store.drive.cancelPendingSync();
    assert.equal(store.drive.pendingSync(), null);

    // confirmUploadSync: success
    await store.drive.startDriveSync();
    confirmMode = 'ok';
    await store.drive.confirmUploadSync();
    assert.match(store.drive.syncBanner()?.text ?? '', /Snapshot uploaded/);

    // confirmUploadSync: ConcurrentSyncError -> merged cleanly
    await store.drive.startDriveSync();
    confirmMode = 'concurrent-merged';
    await store.drive.confirmUploadSync();
    assert.match(store.drive.syncBanner()?.text ?? '', /Merged remote changes cleanly/);

    // confirmUploadSync: ConcurrentSyncError -> re-prepared pendingSync
    prepareMode = 'needs-upload';
    await store.drive.startDriveSync();
    confirmMode = 'concurrent-reprepare';
    await store.drive.confirmUploadSync();
    assert.ok(store.drive.pendingSync());
    assert.equal(store.drive.syncBanner()?.kind, 'error');

    // confirmUploadSync: ConcurrentSyncError -> retry failure
    confirmMode = 'concurrent-fail';
    await store.drive.confirmUploadSync();
    assert.equal(store.drive.pendingSync(), null);
    assert.equal(store.drive.syncBanner()?.kind, 'error');

    // confirmUploadSync: generic auth error
    prepareMode = 'needs-upload';
    await store.drive.startDriveSync();
    confirmMode = 'err';
    await store.drive.confirmUploadSync();
    assert.equal(store.auth.hasGoogleToken(), false);

    // Drive Revisions: open, inspect, restore, close
    await store.drive.openDriveRevisions();
    assert.equal(store.drive.revisionsModalOpen(), true);
    assert.equal(store.drive.revisions().length, 1);
    await store.drive.inspectDriveRevision('rev-2');
    assert.equal(store.drive.inspectedRevision()?.revisionId, 'rev-2');
    await store.drive.restoreDriveRevision('rev-2');
    assert.equal(store.drive.revisionsModalOpen(), false);
    assert.match(store.drive.syncBanner()?.text ?? '', /Restored Drive version/);
    store.drive.closeDriveRevisions();

    // Reminders & Calendar sync
    store.calendar.openRemindersModal();
    assert.equal(store.calendar.remindersModalOpen(), true);
    store.reminders.setBadgeEnabled(true);
    await store.reminders.requestBadgePermissionAndRefresh();
    store.reminders.setCalendarEnabled(true);
    store.reminders.setReminderHorizonDays(3);
    assert.equal(store.calendar.isCalendarSyncNeeded(), true);

    calPlanHasMutations = false;
    await store.calendar.prepareCalendarSync();
    assert.equal(store.calendar.pendingCalendarPlan(), null);
    assert.equal(store.calendar.isCalendarSyncNeeded(), false);

    calPlanHasMutations = true;
    await store.calendar.prepareCalendarSync();
    assert.ok(store.calendar.pendingCalendarPlan());
    await store.calendar.confirmCalendarSync();
    assert.match(store.drive.syncBanner()?.text ?? '', /1 duplicate calendar removed/);

    calSyncError = new Error('401 unauthorized');
    await store.calendar.prepareCalendarSync();
    assert.equal(store.auth.hasGoogleToken(), false);
    assert.match(store.calendar.calendarError() ?? '', /401/);
    calSyncError = null;
    store.calendar.cancelCalendarSync();

    store.calendar.requestDeleteCalendar();
    assert.equal(store.calendar.confirmDeleteCalendarOpen(), true);
    store.calendar.cancelDeleteCalendar();
    assert.equal(store.calendar.confirmDeleteCalendarOpen(), false);

    store.calendar.requestDeleteCalendar();
    await store.calendar.confirmDeleteCalendar();
    assert.equal(store.reminders.reminderPrefs().calendarId, null);
    assert.equal(store.reminders.reminderPrefs().calendarEnabled, false);
    store.calendar.closeRemindersModal();

    await store.auth.switchToEntry();
    assert.equal(store.auth.mode(), null);
  } finally {
    store.dispose();
  }
});

test('TrackerStore handles Drive revision errors, calendar confirmation errors, and task deletion', async (t) => {
  const env = installTestGlobals();
  t.after(env.restore);

  let failRevisions = false;
  let failInspect = false;
  let failRestore = false;
  let failApplyCal = false;
  let failDeleteCal = false;

  const mockSession = {
    getRememberedMode: () => 'google' as const,
    hasAccessToken: () => true,
    getAccessToken: () => 'tok-1',
    getTokenExpiresAt: () => Date.now() + 60_000,
    getAccountEmail: () => 'alex@example.com',
    subscribeAuthChanges: () => () => {},
    chooseGuest() {},
    signInWithGoogle() {
      return Promise.resolve('tok-1');
    },
    clearAccessTokenOnly() {},
    clearSessionAndReturnToEntry() {
      return Promise.resolve();
    },
  } as unknown as SessionManager;

  const mockDriveSync = {
    resetUploadCache() {},
    prepareSync(_m: unknown, _t: unknown, local: DomainSnapshot) {
      return Promise.resolve({
        status: 'up-to-date',
        remoteFileId: 'f1',
        remoteVersion: '1',
        remoteModifiedTime: null,
        localChanged: false,
        mergedSnapshot: local,
        mergedBytes: new Uint8Array([1]),
        summary: { habitsCount: 0, checkinsCount: 0, notesCount: 0, tasksCount: 0, byteSize: 16 },
      } satisfies SyncPreparationResult);
    },
    confirmAndUpload() {
      return Promise.resolve();
    },
    listRevisions() {
      if (failRevisions) return Promise.reject(new Error('401 Authorization expired'));
      return Promise.resolve({
        fileId: 'f1',
        revisions: [{ id: 'rev-1', modifiedTime: '2026-11-25T00:00:00Z' }],
      });
    },
    inspectRevision() {
      if (failInspect) return Promise.reject(new Error('401 expired'));
      return Promise.resolve({
        fileId: 'f1',
        revisionId: 'rev-1',
        snapshot: { habits: [], checkins: [], notes: [], tasks: [] },
        bytes: new Uint8Array([1]),
        summary: { habitsCount: 0, checkinsCount: 0, notesCount: 0, tasksCount: 0, byteSize: 16 },
      });
    },
    restoreRevision() {
      if (failRestore) return Promise.reject(new Error('403 Forbidden permission'));
      return Promise.resolve({
        fileId: 'f1',
        restoredSnapshot: { habits: [], checkins: [], notes: [], tasks: [] },
        summary: { habitsCount: 0, checkinsCount: 0, notesCount: 0, tasksCount: 0, byteSize: 16 },
      });
    },
  } as unknown as DriveSyncService;

  const mockCalendarSync = {
    syncRemoteCalendarId() {
      return Promise.resolve(null);
    },
    prepareSyncPlan() {
      return Promise.resolve({
        calendarId: 'cal-1',
        willCreateCalendar: false,
        willUpdateCalendarTz: false,
        duplicateCalendarIds: [],
        timeZone: 'UTC',
        todayDay: 20770,
        todayCleared: false,
        targetSignature: 'sig',
        toCreate: [
          {
            dayIndex: 20770,
            slotId: 's1',
            slotLabel: 'Morning',
            slotTime: '09:00',
            dateStr: '2026-11-25',
            summary: 'Habits',
            description: 'Desc',
            startDateTime: '2026-11-25T09:00:00',
            endDateTime: '2026-11-25T09:15:00',
            timeZone: 'UTC',
            signature: 's',
          },
        ],
        toUpdate: [],
        toDelete: [],
        unchangedCount: 0,
        desiredEvents: [],
      } satisfies CalendarSyncPlan);
    },
    applySyncPlan() {
      if (failApplyCal) return Promise.reject(new Error('401 expired'));
      return Promise.resolve({
        calendarId: 'cal-1',
        timeZone: 'UTC',
        targetSignature: 'sig',
        created: 0,
        updated: 0,
        deleted: 0,
        duplicatesRemoved: 0,
      });
    },
    deleteReminderCalendar() {
      if (failDeleteCal) return Promise.reject(new Error('403 permission error'));
      return Promise.resolve();
    },
  } as unknown as CalendarReminderService;

  const store = new TrackerStore({
    session: mockSession,
    driveSync: mockDriveSync,
    calendarSync: mockCalendarSync,
  });

  try {
    store.init();
    await new Promise((r) => setTimeout(r, 15));

    // Task creation & soft delete
    await store.domain.quickAddTask('Temporary', store.filters.todayDay());
    const added = store.domain.snapshot().tasks.find((task) => task.title === 'Temporary')!;
    await store.domain.deleteTask(added.id);
    assert.notEqual(
      store.domain.snapshot().tasks.find((task) => task.id === added.id)?.deletedAt,
      null
    );

    // Revisions error paths
    failRevisions = true;
    await store.drive.openDriveRevisions();
    assert.match(store.drive.revisionsError() ?? '', /401/);

    failRevisions = false;
    failInspect = true;
    await store.drive.openDriveRevisions();
    await store.drive.inspectDriveRevision('rev-1');
    assert.match(store.drive.revisionsError() ?? '', /401/);

    failInspect = false;
    failRestore = true;
    await store.drive.restoreDriveRevision('rev-1');
    assert.match(store.drive.revisionsError() ?? '', /403/);
    store.drive.closeDriveRevisions();

    // Calendar confirm/delete paths
    await store.calendar.prepareCalendarSync();
    await store.calendar.confirmCalendarSync();
    assert.equal(store.reminders.reminderPrefs().calendarId, 'cal-1');

    failApplyCal = true;
    await store.calendar.prepareCalendarSync();
    await store.calendar.confirmCalendarSync();
    assert.match(store.calendar.calendarError() ?? '', /401/);
    store.calendar.cancelCalendarSync();

    failDeleteCal = true;
    store.calendar.requestDeleteCalendar();
    await store.calendar.confirmDeleteCalendar();
    assert.match(store.calendar.calendarError() ?? '', /403/);
    store.calendar.cancelDeleteCalendar();
  } finally {
    store.dispose();
  }
});

test('HabitDatabase upgrades a seeded v1 database to v2, creates reminderSlots, and normalizes legacy records', async (t) => {
  const env = installTestGlobals();
  t.after(env.restore);

  const legacyDoneUpdatedAt = Date.UTC(2026, 10, 15, 14, 30, 0);
  env.fakeDb.seedDatabase('habits_tracker_db', 1, {
    habits: {
      keyPath: 'id',
      autoIncrement: true,
      records: [
        {
          id: 1,
          name: 'Legacy Daily',
          color: '#3B82F6',
          weekdays: 0xff,
          weeklyTarget: null,
          startDay: 20700,
          archivedAt: null,
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
    },
    checkins: {
      keyPath: ['habitId', 'dayIndex'],
      indexes: ['by_habit', 'by_day'],
      records: [
        {
          habitId: 1,
          dayIndex: 20770,
          done: true,
          value: 0,
          updatedAt: 3000,
        },
      ],
    },
    notes: {
      keyPath: ['habitId', 'dayIndex'],
      indexes: ['by_habit', 'by_day'],
      records: [
        {
          habitId: 1,
          dayIndex: 20770,
          text: 'Legacy note',
          updatedAt: 3500,
        },
      ],
    },
    tasks: {
      keyPath: 'id',
      autoIncrement: true,
      records: [
        {
          id: 10,
          title: 'Legacy Open Task',
          note: '',
          dueDay: 20770,
          done: false,
          deletedAt: null,
          createdAt: 1000,
          updatedAt: 1500,
        },
        {
          id: 11,
          title: 'Legacy Done Task',
          note: 'old',
          dueDay: 20760,
          done: true,
          deletedAt: null,
          createdAt: 1000,
          updatedAt: legacyDoneUpdatedAt,
        },
      ],
    },
  });

  const db = new HabitDatabase();
  const idb = await db.open();
  assert.equal(idb.objectStoreNames.contains('reminderSlots'), true);

  const snapshot = await db.getAllSnapshot();
  assert.equal(snapshot.habits.length, 1);
  assert.equal(snapshot.habits[0].weekdays, 0x7f);
  assert.equal('scheduleHistory' in snapshot.habits[0], false);
  assert.equal('reminderSlotIds' in snapshot.habits[0], false);

  assert.equal(snapshot.checkins.length, 1);
  assert.equal(snapshot.checkins[0].done, true);
  assert.equal('value' in snapshot.checkins[0], false);

  assert.equal(snapshot.tasks.length, 2);
  assert.equal(snapshot.tasks[0].status, 'open');
  assert.equal(snapshot.tasks[0].done, false);
  assert.equal(snapshot.tasks[0].completedDay, null);
  assert.equal(snapshot.tasks[0].repeatable, false);

  assert.equal(snapshot.tasks[1].status, 'done');
  assert.equal(snapshot.tasks[1].done, true);
  assert.equal(typeof snapshot.tasks[1].completedDay, 'number');
  assert.notEqual(snapshot.tasks[1].completedDay, null);
  assert.equal(snapshot.tasks[1].repeatable, false);

  // Verify newly created v2 reminderSlots store works cleanly
  const slot = await db.createReminderSlot({ label: 'Morning', time: '08:30' });
  assert.equal(slot.label, 'Morning');
  assert.equal(slot.time, '08:30');
});

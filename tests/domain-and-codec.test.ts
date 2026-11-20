import assert from 'node:assert/strict';
import test from 'node:test';
import { SnapshotCodec } from '../src/sync/snapshot-codec';
import { SnapshotMerger } from '../src/sync/snapshot-merger';
import { DomainSnapshot, Habit, HabitCheckin, Task } from '../src/types/domain';
import { CivilCalendar } from '../src/utils/civil-calendar';
import { StreakCalculator } from '../src/utils/streak-calculator';
import { TaskAnalytics } from '../src/utils/task-analytics';
import { TodayBoard } from '../src/utils/today-board';

test('CivilCalendar handles month boundaries, leap days, and weekday bits', () => {
  const feb28 = CivilCalendar.fromLocalDate(2024, 2, 28);
  const feb29 = CivilCalendar.fromLocalDate(2024, 2, 29);
  const mar1 = CivilCalendar.fromLocalDate(2024, 3, 1);

  assert.equal(feb29 - feb28, 1);
  assert.equal(mar1 - feb29, 1);
  assert.deepEqual(CivilCalendar.toLocalDate(feb29), { year: 2024, month: 2, day: 29 });

  const nov20 = CivilCalendar.fromLocalDate(2026, 11, 20);
  assert.equal(CivilCalendar.weekdayBit(nov20), 4);
  assert.equal(CivilCalendar.shiftDays(nov20, 3), CivilCalendar.fromLocalDate(2026, 11, 23));
});

test('StreakCalculator skips unscheduled days and handles zero scheduled days', () => {
  const startMon = CivilCalendar.fromLocalDate(2026, 11, 2);
  const wed = startMon + 2;
  const nextMon = startMon + 7;

  const habit: Habit = {
    id: 1,
    name: 'Strength',
    color: '#3B82F6',
    weekdays: 0b0000101,
    startDay: startMon,
    archivedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const checkins: HabitCheckin[] = [
    { habitId: 1, dayIndex: startMon, done: true, updatedAt: 1001 },
    { habitId: 1, dayIndex: wed, done: true, updatedAt: 1002 },
    { habitId: 1, dayIndex: nextMon, done: true, updatedAt: 1003 },
  ];

  const metrics = StreakCalculator.calculate(habit, checkins, startMon, nextMon, false);
  assert.equal(metrics.currentStreak, 3);
  assert.equal(metrics.longestStreak, 3);
  assert.equal(metrics.scheduledDays, 3);
  assert.equal(metrics.completedScheduledDays, 3);
  assert.equal(metrics.completionRate, 1);

  const thu = startMon + 3;
  const sun = startMon + 6;
  const zeroScheduled = StreakCalculator.calculate(habit, checkins, thu, sun, false);
  assert.equal(zeroScheduled.scheduledDays, 0);
  assert.equal(zeroScheduled.completionRate, 0);

  const emptyPeriod = StreakCalculator.calculate(habit, checkins, nextMon + 5, nextMon + 1, false);
  assert.equal(emptyPeriod.scheduledDays, 0);
  assert.equal(emptyPeriod.completionRate, 0);
});

test('SnapshotCodec round-trip preserves all domain fields including tombstones and throws on corrupt bytes', () => {
  const startDay = CivilCalendar.fromLocalDate(2026, 10, 1);
  const checkins: HabitCheckin[] = [];
  for (let i = 0; i < 30; i++) {
    checkins.push({
      habitId: 1,
      dayIndex: startDay + i,
      done: i % 3 !== 0,
      updatedAt: 1_760_000_000_000 + i * 1000,
    });
  }

  const domain: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Read 20 pages',
        color: '#22C55E',
        weekdays: 127,
        startDay,
        archivedAt: null,
        createdAt: 1_760_000_000_000,
        updatedAt: 1_760_000_050_000,
      },
      {
        id: 2,
        name: 'Evening stretch',
        color: '#3B82F6',
        weekdays: 0b0101010,
        startDay: startDay + 5,
        archivedAt: 1_760_100_000_000,
        createdAt: 1_760_000_000_500,
        updatedAt: 1_760_100_000_000,
      },
    ],
    checkins,
    notes: [
      {
        habitId: 1,
        dayIndex: startDay + 2,
        text: 'Finished chapter 4',
        updatedAt: 1_760_000_090_000,
      },
    ],
    tasks: [
      {
        id: 1,
        title: 'Submit tax form',
        note: 'Include PDF receipt',
        dueDay: startDay + 10,
        done: true,
        completedDay: startDay + 10,
        deletedAt: null,
        createdAt: 1_760_000_010_000,
        updatedAt: 1_760_000_200_000,
      },
      {
        id: 2,
        title: 'Deleted errand',
        note: '',
        dueDay: null,
        done: false,
        completedDay: null,
        deletedAt: 1_760_000_300_000,
        createdAt: 1_760_000_020_000,
        updatedAt: 1_760_000_300_000,
      },
    ],
  };

  const packed = SnapshotCodec.pack(domain);
  const unpacked = SnapshotCodec.unpack(packed);
  assert.deepEqual(unpacked, domain);

  const empty: DomainSnapshot = { habits: [], checkins: [], notes: [], tasks: [] };
  assert.deepEqual(SnapshotCodec.unpack(SnapshotCodec.pack(empty)), empty);

  const tampered = packed.slice();
  tampered[tampered.length - 6] ^= 0xff;
  assert.throws(() => SnapshotCodec.unpack(tampered));
  assert.throws(() => SnapshotCodec.unpack(new Uint8Array([1, 2, 3])));
});

test('SnapshotMerger keeps newest updatedAt, propagates task tombstones, and resolves offline ID collisions', () => {
  const day1 = 20770;
  const day2 = 20771;

  // Same habit (createdAt 100) + colliding offline habit (id=2 on both devices, different createdAt!)
  const local: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Run',
        color: '#3B82F6',
        weekdays: 127,
        startDay: day1,
        archivedAt: null,
        createdAt: 100,
        updatedAt: 200,
      },
      {
        id: 2,
        name: 'Local Meditate',
        color: '#A855F7',
        weekdays: 127,
        startDay: day1,
        archivedAt: null,
        createdAt: 1500, // newer than remote habit id=2
        updatedAt: 1600,
      },
    ],
    checkins: [
      { habitId: 1, dayIndex: day1, done: true, updatedAt: 500 },
      { habitId: 1, dayIndex: day2, done: false, updatedAt: 300 },
      { habitId: 2, dayIndex: day1, done: true, updatedAt: 1600 },
    ],
    notes: [
      { habitId: 2, dayIndex: day1, text: '10 mins breathing', updatedAt: 1600 },
    ],
    tasks: [
      {
        id: 1,
        title: 'Old local',
        note: '',
        dueDay: null,
        done: false,
        completedDay: null,
        deletedAt: null,
        createdAt: 10,
        updatedAt: 50,
      },
      {
        id: 2,
        title: 'Local offline task',
        note: '',
        dueDay: day1,
        done: false,
        completedDay: null,
        deletedAt: null,
        createdAt: 2000,
        updatedAt: 2000,
      },
    ],
  };

  const remote: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Morning Run',
        color: '#22C55E',
        weekdays: 127,
        startDay: day1,
        archivedAt: null,
        createdAt: 100,
        updatedAt: 400,
      },
      {
        id: 2,
        name: 'Remote Hydrate',
        color: '#14B8A6',
        weekdays: 127,
        startDay: day1,
        archivedAt: null,
        createdAt: 1200, // earlier -> keeps id=2
        updatedAt: 1300,
      },
    ],
    checkins: [
      { habitId: 1, dayIndex: day1, done: false, updatedAt: 100 },
      { habitId: 1, dayIndex: day2 + 1, done: true, updatedAt: 600 },
      { habitId: 2, dayIndex: day2, done: true, updatedAt: 1300 },
    ],
    notes: [{ habitId: 1, dayIndex: day2 + 1, text: 'Felt great', updatedAt: 600 }],
    tasks: [
      {
        id: 1,
        title: 'Deleted on remote',
        note: 'Removed',
        dueDay: day2,
        done: false,
        completedDay: null,
        deletedAt: 900,
        createdAt: 10,
        updatedAt: 900,
      },
      {
        id: 2,
        title: 'Remote offline task',
        note: '',
        dueDay: day2,
        done: true,
        completedDay: day2,
        deletedAt: null,
        createdAt: 1800,
        updatedAt: 1850,
      },
    ],
  };

  const merged = SnapshotMerger.merge(local, remote);

  // Habits: 1 merged, 2 kept for Remote Hydrate, 3 assigned to Local Meditate!
  assert.equal(merged.habits.length, 3);
  assert.equal(merged.habits.find((h) => h.id === 1)?.name, 'Morning Run');
  assert.equal(merged.habits.find((h) => h.id === 2)?.name, 'Remote Hydrate');
  assert.equal(merged.habits.find((h) => h.id === 3)?.name, 'Local Meditate');

  // Check-ins & notes for reassigned habit 2 -> 3 moved cleanly!
  assert.equal(
    merged.checkins.find((c) => c.habitId === 3 && c.dayIndex === day1)?.done,
    true
  );
  assert.equal(
    merged.checkins.find((c) => c.habitId === 2 && c.dayIndex === day2)?.done,
    true
  );
  assert.equal(
    merged.notes.find((n) => n.habitId === 3 && n.dayIndex === day1)?.text,
    '10 mins breathing'
  );

  // Task 1 tombstone propagated; task 2 collision preserved both tasks (id=2 and id=3)
  assert.equal(merged.tasks.length, 3);
  assert.equal(merged.tasks.find((t) => t.id === 1)?.deletedAt, 900);
  assert.equal(merged.tasks.find((t) => t.id === 2)?.title, 'Remote offline task');
  assert.equal(merged.tasks.find((t) => t.id === 3)?.title, 'Local offline task');
});

test('TaskAnalytics and TodayBoard ignore deleted tombstone tasks', () => {
  const today = CivilCalendar.fromLocalDate(2026, 11, 20);
  const tsToday = new Date(2026, 10, 20, 12, 0, 0).getTime();
  const tasks: Task[] = [
    {
      id: 1,
      title: 'A',
      note: '',
      dueDay: today,
      done: true,
      completedDay: today,
      deletedAt: null,
      createdAt: tsToday,
      updatedAt: tsToday,
    },
    {
      id: 2,
      title: 'Deleted completed',
      note: '',
      dueDay: today,
      done: true,
      completedDay: today,
      deletedAt: tsToday,
      createdAt: tsToday,
      updatedAt: tsToday,
    },
    {
      id: 3,
      title: 'Deleted overdue',
      note: '',
      dueDay: today - 2,
      done: false,
      completedDay: null,
      deletedAt: tsToday,
      createdAt: tsToday,
      updatedAt: tsToday,
    },
  ];
  const buckets = TaskAnalytics.weeklyCompletedCounts(tasks, today, 4);
  assert.equal(buckets[3].count, 1);

  const board = TodayBoard.getTodayAndOverdueTasks(tasks, today);
  assert.equal(board.overdue.length, 0);
  assert.equal(board.dueToday.length, 0);
});

test('SnapshotMerger.rebaseForRestore ensures restored historical records beat newer unwanted edits on future LWW merges', () => {
  const day1 = 20770;
  const oldGoodRevision: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Good Name',
        color: '#3B82F6',
        weekdays: 127,
        startDay: day1,
        archivedAt: null,
        createdAt: 100,
        updatedAt: 500,
      },
    ],
    checkins: [{ habitId: 1, dayIndex: day1, done: true, updatedAt: 500 }],
    notes: [{ habitId: 1, dayIndex: day1, text: 'Keep me', updatedAt: 500 }],
    tasks: [
      {
        id: 1,
        title: 'Alive Task',
        note: '',
        dueDay: day1,
        done: true,
        completedDay: day1,
        deletedAt: null,
        createdAt: 200,
        updatedAt: 500,
      },
    ],
  };

  const badNewerOtherDevice: DomainSnapshot = {
    habits: [
      {
        id: 1,
        name: 'Corrupted Name',
        color: '#EF4444',
        weekdays: 127,
        startDay: day1,
        archivedAt: 99999,
        createdAt: 100,
        updatedAt: 99999,
      },
    ],
    checkins: [{ habitId: 1, dayIndex: day1, done: false, updatedAt: 99999 }],
    notes: [{ habitId: 1, dayIndex: day1, text: 'Wiped', updatedAt: 99999 }],
    tasks: [
      {
        id: 1,
        title: 'Alive Task',
        note: '',
        dueDay: day1,
        done: true,
        completedDay: day1,
        deletedAt: 99999,
        createdAt: 200,
        updatedAt: 99999,
      },
    ],
  };

  const rebased = SnapshotMerger.rebaseForRestore(
    oldGoodRevision,
    [badNewerOtherDevice],
    1000
  );
  assert.equal(rebased.habits[0].updatedAt, 100000);
  assert.equal(rebased.habits[0].createdAt, 100);
  assert.equal(rebased.tasks[0].completedDay, day1);

  // When another device with bad newer edits syncs later, restored revision wins!
  const mergedLater = SnapshotMerger.merge(badNewerOtherDevice, rebased);
  assert.equal(mergedLater.habits[0].name, 'Good Name');
  assert.equal(mergedLater.habits[0].archivedAt, null);
  assert.equal(mergedLater.checkins[0].done, true);
  assert.equal(mergedLater.notes[0].text, 'Keep me');
  assert.equal(mergedLater.tasks[0].deletedAt, null);
});

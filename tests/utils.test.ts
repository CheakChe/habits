import assert from 'node:assert/strict';
import test from 'node:test';
import { Habit, HabitCheckin, Task } from '../src/types/domain';
import { CivilCalendar } from '../src/utils/civil-calendar';
import { Helpers, NonRetryableError } from '../src/utils/helpers';
import { StreakCalculator } from '../src/utils/streak-calculator';
import { TaskAnalytics } from '../src/utils/task-analytics';
import { TodayBoard } from '../src/utils/today-board';

test('CivilCalendar converts dates, leap years, negative dayIndex, and weekday bits', () => {
  // 1970-01-01 was Thursday -> dayIndex 0, bit 3 (0=Mon..6=Sun)
  const epoch = CivilCalendar.fromLocalDate(1970, 1, 1);
  assert.equal(epoch, 0);
  assert.equal(CivilCalendar.weekdayBit(epoch), 3);
  assert.equal(CivilCalendar.weekdayShortLabel(3), 'Thu');
  assert.equal(CivilCalendar.weekdayFullLabel(3), 'Thursday');

  // Pre-epoch date 1969-12-31 -> dayIndex -1, Wednesday -> bit 2
  const preEpoch = CivilCalendar.fromLocalDate(1969, 12, 31);
  assert.equal(preEpoch, -1);
  assert.equal(CivilCalendar.weekdayBit(preEpoch), 2);
  assert.deepEqual(CivilCalendar.toLocalDate(preEpoch), { year: 1969, month: 12, day: 31 });

  // Non-leap century 1900 vs leap year 2024
  assert.equal(
    CivilCalendar.fromLocalDate(1900, 3, 1) - CivilCalendar.fromLocalDate(1900, 2, 28),
    1
  );
  assert.equal(
    CivilCalendar.fromLocalDate(2024, 3, 1) - CivilCalendar.fromLocalDate(2024, 2, 28),
    2
  );

  // Full week check starting Monday 2026-11-16
  const monday = CivilCalendar.fromLocalDate(2026, 11, 16);
  for (let bit = 0; bit < 7; bit++) {
    assert.equal(CivilCalendar.weekdayBit(monday + bit), bit);
    assert.equal(CivilCalendar.isScheduled(1 << bit, monday + bit), true);
    assert.equal(CivilCalendar.isScheduled(1 << bit, monday + ((bit + 1) % 7)), false);
  }

  assert.equal(CivilCalendar.weekdayShortLabel(99), '');
  assert.equal(CivilCalendar.weekdayFullLabel(-1), '');
});

test('CivilCalendar formats strings, parses input dates, and builds month grids', () => {
  const nov20 = CivilCalendar.fromLocalDate(2026, 11, 20); // Friday
  assert.equal(CivilCalendar.formatShortDate(nov20), 'Nov 20');
  assert.equal(CivilCalendar.formatFullDate(nov20), 'Friday, Nov 20, 2026');
  assert.equal(CivilCalendar.formatMonthYear(2026, 11), 'November 2026');
  assert.equal(CivilCalendar.toInputDateValue(nov20), '2026-11-20');
  assert.equal(CivilCalendar.fromInputDateValue(' 2026-11-20 '), nov20);

  // Invalid date input parsing
  assert.equal(CivilCalendar.fromInputDateValue(''), null);
  assert.equal(CivilCalendar.fromInputDateValue('2026-13-01'), null);
  assert.equal(CivilCalendar.fromInputDateValue('2026-00-15'), null);
  assert.equal(CivilCalendar.fromInputDateValue('2026-01-32'), null);
  assert.equal(CivilCalendar.fromInputDateValue('20-11-2026'), null);

  // Month grid: Feb 2024 had 29 days and Feb 1, 2024 was Thursday (leadingEmpty = 3)
  const feb2024 = CivilCalendar.getMonthDays(2024, 2);
  assert.equal(feb2024.leadingEmpty, 3);
  assert.equal(feb2024.days.length, 29);

  // Month grid: Dec 2026 has 31 days and handles year boundary calculation cleanly
  const dec2026 = CivilCalendar.getMonthDays(2026, 12);
  assert.equal(dec2026.days.length, 31);
  assert.equal(dec2026.leadingEmpty, 1); // Dec 1, 2026 is Tuesday

  // startOfWeek aligns Monday through Sunday to the same Monday
  const mon = CivilCalendar.fromLocalDate(2026, 11, 16);
  for (let d = 0; d < 7; d++) {
    assert.equal(CivilCalendar.startOfWeek(mon + d), mon);
  }
  assert.equal(CivilCalendar.todayDayIndex(new Date(2026, 10, 20, 23, 59, 0)), nov20);
  assert.equal(CivilCalendar.fromTimestamp(new Date(2026, 10, 20, 0, 5, 0).getTime()), nov20);
});

test('StreakCalculator handles allowPendingEndDay, broken streaks, longest vs current, and habit isolation', () => {
  const mon = CivilCalendar.fromLocalDate(2026, 11, 2);
  const habit: Habit = {
    id: 1,
    name: 'Daily',
    color: '#3B82F6',
    weekdays: 0b1111111, // every day
    startDay: mon,
    archivedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
  };

  // Streak of 3 (days 0,1,2), gap on day 3, streak of 2 (days 4,5), day 6 pending
  const checkins: HabitCheckin[] = [
    { habitId: 1, dayIndex: mon + 0, done: true, updatedAt: 10 },
    { habitId: 1, dayIndex: mon + 1, done: true, updatedAt: 10 },
    { habitId: 1, dayIndex: mon + 2, done: true, updatedAt: 10 },
    { habitId: 1, dayIndex: mon + 3, done: false, updatedAt: 10 },
    { habitId: 1, dayIndex: mon + 4, done: true, updatedAt: 10 },
    { habitId: 1, dayIndex: mon + 5, done: true, updatedAt: 10 },
    // Other habit should be completely ignored
    { habitId: 99, dayIndex: mon + 3, done: true, updatedAt: 10 },
    { habitId: 99, dayIndex: mon + 6, done: true, updatedAt: 10 },
  ];

  // With allowPendingEndDay = true, pending day 6 preserves streak of 2
  const pendingAllowed = StreakCalculator.calculate(habit, checkins, mon + 4, mon + 6, true);
  assert.equal(pendingAllowed.currentStreak, 2);
  assert.equal(pendingAllowed.longestStreak, 3);
  assert.equal(pendingAllowed.scheduledDays, 3);
  assert.equal(pendingAllowed.completedScheduledDays, 2);
  assert.ok(Math.abs(pendingAllowed.completionRate - 2 / 3) < 1e-9);

  // With allowPendingEndDay = false, incomplete end day breaks currentStreak to 0
  const strictEnd = StreakCalculator.calculate(habit, checkins, mon, mon + 6, false);
  assert.equal(strictEnd.currentStreak, 0);
  assert.equal(strictEnd.longestStreak, 3);
  assert.equal(strictEnd.scheduledDays, 7);
  assert.equal(strictEnd.completedScheduledDays, 5);
});

test('StreakCalculator ignores off-schedule check-ins in scheduled metrics', () => {
  const mon = CivilCalendar.fromLocalDate(2026, 11, 2);
  const habit: Habit = {
    id: 1,
    name: 'Weekdays only',
    color: '#22C55E',
    weekdays: 0b0011111, // Mon-Fri
    startDay: mon,
    archivedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
  };
  const checkins: HabitCheckin[] = [
    { habitId: 1, dayIndex: mon + 4, done: true, updatedAt: 1 }, // Fri
    { habitId: 1, dayIndex: mon + 5, done: true, updatedAt: 1 }, // Sat (off-schedule)
  ];

  const metrics = StreakCalculator.calculate(habit, checkins, mon + 4, mon + 6, true);
  assert.equal(metrics.scheduledDays, 1);
  assert.equal(metrics.completedScheduledDays, 1);
  assert.equal(metrics.currentStreak, 1);
  assert.equal(metrics.completionRate, 1);
});

test('TaskAnalytics aggregates weekly completed tasks accurately and handles empty/out-of-range inputs', () => {
  const today = CivilCalendar.fromLocalDate(2026, 11, 20); // Friday
  assert.deepEqual(TaskAnalytics.weeklyCompletedCounts([], today, 0), []);
  assert.deepEqual(TaskAnalytics.weeklyCompletedCounts([], today, -2), []);

  const lastWeekDay = CivilCalendar.fromLocalDate(2026, 11, 11);
  const tsThisWeek = new Date(2026, 10, 17, 10, 0, 0).getTime(); // Tue Nov 17
  const tsLastWeek = new Date(2026, 10, 11, 14, 0, 0).getTime(); // Wed Nov 11
  const tsTooOld = new Date(2026, 0, 5, 12, 0, 0).getTime();

  const tasks: Task[] = [
    {
      id: 1,
      title: 'Done this week',
      note: '',
      dueDay: today,
      done: true,
      completedDay: CivilCalendar.fromLocalDate(2026, 11, 17),
      deletedAt: null,
      createdAt: tsThisWeek,
      updatedAt: tsThisWeek,
    },
    {
      id: 2,
      title: 'Done last week (edited this week)',
      note: 'Updated note later',
      dueDay: null,
      done: true,
      completedDay: lastWeekDay,
      deletedAt: null,
      createdAt: tsLastWeek,
      updatedAt: tsThisWeek, // edited this week, MUST still count in last week!
    },
    {
      id: 3,
      title: 'Pending task',
      note: '',
      dueDay: today,
      done: false,
      completedDay: null,
      deletedAt: null,
      createdAt: tsThisWeek,
      updatedAt: tsThisWeek,
    },
    {
      id: 4,
      title: 'Deleted done task',
      note: '',
      dueDay: today,
      done: true,
      completedDay: today,
      deletedAt: tsThisWeek,
      createdAt: tsThisWeek,
      updatedAt: tsThisWeek,
    },
    {
      id: 5,
      title: 'Too old done task',
      note: '',
      dueDay: null,
      done: true,
      completedDay: CivilCalendar.fromLocalDate(2026, 1, 5),
      deletedAt: null,
      createdAt: tsTooOld,
      updatedAt: tsTooOld,
    },
  ];

  const buckets = TaskAnalytics.weeklyCompletedCounts(tasks, today, 3);
  assert.equal(buckets.length, 3);
  assert.equal(buckets[0].count, 0); // 2 weeks ago
  assert.equal(buckets[1].count, 1); // last week
  assert.equal(buckets[2].count, 1); // current week
  assert.ok(buckets[0].weekStartDay < buckets[1].weekStartDay);
  assert.ok(buckets[1].weekStartDay < buckets[2].weekStartDay);
});

test('TodayBoard filters scheduled habits and sorts overdue/today tasks cleanly', () => {
  const today = CivilCalendar.fromLocalDate(2026, 11, 20); // Friday (bit 4)
  const fridayBit = 1 << 4;
  const mondayBit = 1 << 0;

  const habits: Habit[] = [
    {
      id: 3,
      name: 'Active Friday B',
      color: '#3B82F6',
      weekdays: fridayBit,
      startDay: today - 10,
      archivedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 1,
      name: 'Active Friday A',
      color: '#22C55E',
      weekdays: fridayBit | mondayBit,
      startDay: today,
      archivedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 2,
      name: 'Archived Friday',
      color: '#F59E0B',
      weekdays: fridayBit,
      startDay: today - 10,
      archivedAt: 500,
      createdAt: 1,
      updatedAt: 500,
    },
    {
      id: 4,
      name: 'Future start',
      color: '#F43F5E',
      weekdays: fridayBit,
      startDay: today + 1,
      archivedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 5,
      name: 'Monday only',
      color: '#A855F7',
      weekdays: mondayBit,
      startDay: today - 10,
      archivedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ];

  const scheduled = TodayBoard.getScheduledHabits(habits, today);
  assert.deepEqual(
    scheduled.map((h) => h.id),
    [1, 3]
  );

  const tasks: Task[] = [
    { id: 5, title: 'Future', note: 'Call dentist', dueDay: today + 2, done: false, completedDay: null, deletedAt: null, createdAt: 1, updatedAt: 1 },
    { id: 4, title: 'No date', note: 'Read spec', dueDay: null, done: false, completedDay: null, deletedAt: null, createdAt: 1, updatedAt: 1 },
    { id: 3, title: 'Today B', note: '', dueDay: today, done: false, completedDay: null, deletedAt: null, createdAt: 1, updatedAt: 1 },
    { id: 1, title: 'Today A', note: 'Dentist receipt', dueDay: today, done: false, completedDay: null, deletedAt: null, createdAt: 1, updatedAt: 1 },
    { id: 6, title: 'Overdue newer', note: '', dueDay: today - 1, done: false, completedDay: null, deletedAt: null, createdAt: 1, updatedAt: 1 },
    { id: 2, title: 'Overdue older', note: '', dueDay: today - 5, done: false, completedDay: null, deletedAt: null, createdAt: 1, updatedAt: 1 },
    { id: 7, title: 'Done overdue', note: '', dueDay: today - 3, done: true, completedDay: today - 1, deletedAt: null, createdAt: 1, updatedAt: 10 },
    { id: 8, title: 'Deleted today', note: 'Dentist', dueDay: today, done: false, completedDay: null, deletedAt: 100, createdAt: 1, updatedAt: 100 },
  ];

  const partition = TodayBoard.getTodayAndOverdueTasks(tasks, today);
  assert.deepEqual(
    partition.overdue.map((t) => t.id),
    [2, 6]
  );
  assert.deepEqual(
    partition.dueToday.map((t) => t.id),
    [1, 3]
  );

  // Filter modes + search query across title & notes + deleted exclusion
  assert.deepEqual(TodayBoard.filterTasks(tasks, today, 'all').map((t) => t.id), [2, 6, 1, 3, 5, 4]);
  assert.deepEqual(TodayBoard.filterTasks(tasks, today, 'today').map((t) => t.id), [1, 3]);
  assert.deepEqual(TodayBoard.filterTasks(tasks, today, 'overdue').map((t) => t.id), [2, 6]);
  assert.deepEqual(TodayBoard.filterTasks(tasks, today, 'nodate').map((t) => t.id), [4]);
  assert.deepEqual(TodayBoard.filterTasks(tasks, today, 'completed').map((t) => t.id), [7]);
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'all', '  DENTIST  ').map((t) => t.id),
    [1, 5]
  );
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'today', 'receipt').map((t) => t.id),
    [1]
  );
});

test('Helpers bytesEqual and withRetry handle retries, NonRetryableError, and byte comparisons', async () => {
  assert.equal(Helpers.bytesEqual(new Uint8Array([]), new Uint8Array([])), true);
  assert.equal(Helpers.bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
  assert.equal(Helpers.bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 9, 3])), false);
  assert.equal(Helpers.bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])), false);

  let attempts = 0;
  const result = await Helpers.withRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('transient');
      return 'ok';
    },
    3,
    1
  );
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);

  let nonRetryAttempts = 0;
  await assert.rejects(
    () =>
      Helpers.withRetry(
        async () => {
          nonRetryAttempts += 1;
          throw new NonRetryableError('fatal');
        },
        5,
        1
      ),
    (err: unknown) => err instanceof NonRetryableError && err.message === 'fatal'
  );
  assert.equal(nonRetryAttempts, 1);

  let exhaustedAttempts = 0;
  await assert.rejects(
    () =>
      Helpers.withRetry(
        async () => {
          exhaustedAttempts += 1;
          throw new Error('still failing');
        },
        2,
        1
      ),
    /still failing/
  );
  assert.equal(exhaustedAttempts, 2);
});

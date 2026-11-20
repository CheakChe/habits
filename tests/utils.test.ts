import assert from 'node:assert/strict';
import test from 'node:test';
import { Habit, HabitCheckin, Task } from '../src/types/domain';
import { CivilCalendar } from '../src/utils/civil-calendar';
import {
  DATE_RANGE_PRESETS,
  DateRangeResolver,
  DayCellClassifier,
} from '../src/utils/date-range';
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

test('StreakCalculator.calculateWeeklyProgress respects habit weekdays and startDay', () => {
  const mon = CivilCalendar.fromLocalDate(2026, 11, 16); // Monday
  const wed = mon + 2;
  const fri = mon + 4;
  const mwfMask = 0b0010101; // Mon, Wed, Fri (3 days/week)

  const mwfHabit: Habit = {
    id: 1,
    name: 'Strength',
    color: '#3B82F6',
    weekdays: mwfMask,
    startDay: mon - 14,
    archivedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
  };

  // On Wednesday with Mon & Wed done, Fri upcoming -> 2/3 this week, not complete
  const checkinsPartial: HabitCheckin[] = [
    { habitId: 1, dayIndex: mon, done: true, updatedAt: 1 },
    { habitId: 1, dayIndex: mon + 1, done: true, updatedAt: 1 }, // Tue off-schedule ignored
    { habitId: 1, dayIndex: wed, done: true, updatedAt: 1 },
  ];
  const midWeek = StreakCalculator.calculateWeeklyProgress(mwfHabit, checkinsPartial, wed);
  assert.equal(midWeek.weekStart, mon);
  assert.equal(midWeek.weekEnd, mon + 6);
  assert.equal(midWeek.completedDays, 2);
  assert.equal(midWeek.scheduledDays, 3);
  assert.equal(midWeek.isComplete, false);

  // On Friday with Mon, Wed, Fri done -> 3/3 Week complete
  const checkinsDone: HabitCheckin[] = [
    ...checkinsPartial,
    { habitId: 1, dayIndex: fri, done: true, updatedAt: 2 },
  ];
  const fullWeek = StreakCalculator.calculateWeeklyProgress(mwfHabit, checkinsDone, fri);
  assert.equal(fullWeek.completedDays, 3);
  assert.equal(fullWeek.scheduledDays, 3);
  assert.equal(fullWeek.isComplete, true);

  // Habit started on Wednesday (only Wed & Fri scheduled this week -> 2 scheduled)
  const midWeekStartHabit: Habit = { ...mwfHabit, id: 2, startDay: wed };
  const startedWed = StreakCalculator.calculateWeeklyProgress(
    midWeekStartHabit,
    [{ habitId: 2, dayIndex: wed, done: true, updatedAt: 1 }],
    wed
  );
  assert.equal(startedWed.completedDays, 1);
  assert.equal(startedWed.scheduledDays, 2);
  assert.equal(startedWed.isComplete, false);

  // Habit scheduled to start next week -> 0/0, not complete
  const futureHabit: Habit = { ...mwfHabit, id: 3, startDay: mon + 7 };
  const futureWeek = StreakCalculator.calculateWeeklyProgress(futureHabit, [], wed);
  assert.equal(futureWeek.completedDays, 0);
  assert.equal(futureWeek.scheduledDays, 0);
  assert.equal(futureWeek.isComplete, false);
});

test('StreakCalculator milestone helpers classify 7, 30, and 100 day streaks cleanly', () => {
  assert.equal(StreakCalculator.getMilestone(0), null);
  assert.equal(StreakCalculator.getMilestone(6), null);
  assert.equal(StreakCalculator.getMilestone(7), 7);
  assert.equal(StreakCalculator.getMilestone(29), 7);
  assert.equal(StreakCalculator.getMilestone(30), 30);
  assert.equal(StreakCalculator.getMilestone(99), 30);
  assert.equal(StreakCalculator.getMilestone(100), 100);
  assert.equal(StreakCalculator.getMilestone(145), 100);

  assert.equal(StreakCalculator.isExactMilestone(6), false);
  assert.equal(StreakCalculator.isExactMilestone(7), true);
  assert.equal(StreakCalculator.isExactMilestone(8), false);
  assert.equal(StreakCalculator.isExactMilestone(30), true);
  assert.equal(StreakCalculator.isExactMilestone(100), true);
});

test('StreakCalculator.summarizeHabitsForPeriod computes done/missed counts and sorts active habits by completion rate', () => {
  const today = CivilCalendar.fromLocalDate(2026, 11, 20);
  const start = today - 3; // 4 days total

  const h1: Habit = {
    id: 1,
    name: 'Half done',
    color: '#3B82F6',
    weekdays: 127,
    startDay: start,
    archivedAt: null,
    createdAt: 100,
    updatedAt: 100,
  };
  const h2: Habit = {
    id: 2,
    name: 'Perfect',
    color: '#22C55E',
    weekdays: 127,
    startDay: start,
    archivedAt: null,
    createdAt: 100,
    updatedAt: 100,
  };
  const h3: Habit = {
    id: 3,
    name: 'Archived perfect',
    color: '#A855F7',
    weekdays: 127,
    startDay: start,
    archivedAt: 500,
    createdAt: 100,
    updatedAt: 500,
  };

  const checkins: HabitCheckin[] = [
    { habitId: 1, dayIndex: start, done: true, updatedAt: 1 },
    { habitId: 1, dayIndex: start + 1, done: true, updatedAt: 1 },
    { habitId: 2, dayIndex: start, done: true, updatedAt: 1 },
    { habitId: 2, dayIndex: start + 1, done: true, updatedAt: 1 },
    { habitId: 2, dayIndex: start + 2, done: true, updatedAt: 1 },
    { habitId: 2, dayIndex: start + 3, done: true, updatedAt: 1 },
    { habitId: 3, dayIndex: start, done: true, updatedAt: 1 },
    { habitId: 3, dayIndex: start + 1, done: true, updatedAt: 1 },
    { habitId: 3, dayIndex: start + 2, done: true, updatedAt: 1 },
    { habitId: 3, dayIndex: start + 3, done: true, updatedAt: 1 },
  ];

  const rows = StreakCalculator.summarizeHabitsForPeriod([h1, h2, h3], checkins, 30, today);
  assert.deepEqual(
    rows.map((r) => r.habit.id),
    [2, 1, 3]
  );
  assert.equal(rows[0].completedDays, 4);
  assert.equal(rows[0].missedDays, 0);
  assert.equal(rows[1].completedDays, 2);
  assert.equal(rows[1].missedDays, 2);
  assert.equal(rows[2].habit.archivedAt, 500);
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

  // TaskSortMode options (due_asc, due_desc, newest, title)
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'all', '', 'due_asc').map((t) => t.id),
    [2, 6, 1, 3, 5, 4]
  );
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'all', '', 'due_desc').map((t) => t.id),
    [5, 1, 3, 6, 2, 4]
  );
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'all', '', 'newest').map((t) => t.id),
    [6, 5, 4, 3, 2, 1]
  );
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'all', '', 'title').map((t) => t.title),
    ['Future', 'No date', 'Overdue newer', 'Overdue older', 'Today A', 'Today B']
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

test('CivilCalendar supports IANA timezones, addMonths clamping, and validation', () => {
  // 2026-11-20T02:30:00Z -> Nov 20 in UTC, Nov 19 in America/New_York (UTC-5), Nov 20 in Asia/Tokyo (UTC+9)
  const utcInstant = Date.UTC(2026, 10, 20, 2, 30, 0);
  const nov19 = CivilCalendar.fromLocalDate(2026, 11, 19);
  const nov20 = CivilCalendar.fromLocalDate(2026, 11, 20);
  assert.equal(CivilCalendar.fromTimestamp(utcInstant, 'UTC'), nov20);
  assert.equal(CivilCalendar.todayDayIndex(new Date(utcInstant), 'UTC'), nov20);
  assert.equal(CivilCalendar.fromTimestamp(utcInstant, 'America/New_York'), nov19);
  assert.equal(CivilCalendar.fromTimestamp(utcInstant, 'Asia/Tokyo'), nov20);

  // Month arithmetic clamps end-of-month properly (leap vs non-leap Feb)
  assert.equal(
    CivilCalendar.addMonths(CivilCalendar.fromLocalDate(2024, 5, 31), -3),
    CivilCalendar.fromLocalDate(2024, 2, 29)
  );
  assert.equal(
    CivilCalendar.addMonths(CivilCalendar.fromLocalDate(2026, 5, 31), -3),
    CivilCalendar.fromLocalDate(2026, 2, 28)
  );
  assert.equal(CivilCalendar.formatShortDateWithYear(nov20), 'Nov 20, 2026');

  assert.equal(CivilCalendar.isValidTimeZone('UTC'), true);
  assert.equal(CivilCalendar.isValidTimeZone('local'), true);
  assert.equal(CivilCalendar.isValidTimeZone('Europe/Kyiv'), true);
  assert.equal(CivilCalendar.isValidTimeZone('Invalid/Nowhere_Zone'), false);
});

test('DateRangeResolver resolves all 17 presets and DayCellClassifier assigns severity tones', () => {
  assert.equal(DATE_RANGE_PRESETS.length, 17);

  // Reference: Wednesday 2024-03-20 (leap year)
  const mar20 = CivilCalendar.fromLocalDate(2024, 3, 20);
  const monWeek = CivilCalendar.fromLocalDate(2024, 3, 18);

  assert.deepEqual(
    [
      DateRangeResolver.resolve('today', mar20).startDay,
      DateRangeResolver.resolve('today', mar20).endDay,
    ],
    [mar20, mar20]
  );
  assert.deepEqual(
    [
      DateRangeResolver.resolve('yesterday', mar20).startDay,
      DateRangeResolver.resolve('yesterday', mar20).endDay,
    ],
    [mar20 - 1, mar20 - 1]
  );
  assert.deepEqual(
    [
      DateRangeResolver.resolve('this_week', mar20).startDay,
      DateRangeResolver.resolve('this_week', mar20).endDay,
    ],
    [monWeek, mar20]
  );
  assert.deepEqual(
    [
      DateRangeResolver.resolve('prev_week', mar20).startDay,
      DateRangeResolver.resolve('prev_week', mar20).endDay,
    ],
    [monWeek - 7, monWeek - 1]
  );
  assert.equal(DateRangeResolver.resolve('last_7', mar20).startDay, mar20 - 6);
  assert.equal(
    DateRangeResolver.resolve('this_month', mar20).startDay,
    CivilCalendar.fromLocalDate(2024, 3, 1)
  );

  // Previous month in leap year Feb 2024 (1..29) and Jan -> Dec previous year
  const prevFeb = DateRangeResolver.resolve('prev_month', mar20);
  assert.equal(prevFeb.startDay, CivilCalendar.fromLocalDate(2024, 2, 1));
  assert.equal(prevFeb.endDay, CivilCalendar.fromLocalDate(2024, 2, 29));

  const jan10 = CivilCalendar.fromLocalDate(2026, 1, 10);
  const prevDec = DateRangeResolver.resolve('prev_month', jan10);
  assert.equal(prevDec.startDay, CivilCalendar.fromLocalDate(2025, 12, 1));
  assert.equal(prevDec.endDay, CivilCalendar.fromLocalDate(2025, 12, 31));

  assert.equal(DateRangeResolver.resolve('last_30', mar20).startDay, mar20 - 29);
  assert.equal(
    DateRangeResolver.resolve('3_months', mar20).startDay,
    CivilCalendar.fromLocalDate(2023, 12, 20)
  );
  assert.equal(DateRangeResolver.resolve('last_90', mar20).startDay, mar20 - 89);
  assert.equal(
    DateRangeResolver.resolve('6_months', mar20).startDay,
    CivilCalendar.fromLocalDate(2023, 9, 20)
  );
  assert.equal(DateRangeResolver.resolve('last_180', mar20).startDay, mar20 - 179);
  assert.equal(
    DateRangeResolver.resolve('this_year', mar20).startDay,
    CivilCalendar.fromLocalDate(2024, 1, 1)
  );

  const prevYr = DateRangeResolver.resolve('prev_year', mar20);
  assert.equal(prevYr.startDay, CivilCalendar.fromLocalDate(2023, 1, 1));
  assert.equal(prevYr.endDay, CivilCalendar.fromLocalDate(2023, 12, 31));
  assert.equal(DateRangeResolver.resolve('last_365', mar20).startDay, mar20 - 364);

  const customSwapped = DateRangeResolver.resolve('custom', mar20, {
    customStartDay: mar20,
    customEndDay: mar20 - 10,
  });
  assert.equal(customSwapped.startDay, mar20 - 10);
  assert.equal(customSwapped.endDay, mar20);

  const allTime = DateRangeResolver.resolve('all_time', mar20, {
    snapshot: {
      habits: [
        {
          id: 1,
          name: 'H',
          color: '#3B82F6',
          weekdays: 127,
          startDay: CivilCalendar.fromLocalDate(2024, 1, 15),
          archivedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      checkins: [],
      notes: [],
      tasks: [],
    },
  });
  assert.equal(allTime.startDay, CivilCalendar.fromLocalDate(2024, 1, 15));
  assert.equal(allTime.endDay, mar20);

  // DayCellClassifier severity tones
  assert.equal(DayCellClassifier.classify(mar20 + 1, mar20, 2, 0), 'future');
  assert.equal(DayCellClassifier.classify(mar20 - 1, mar20, 0, 0), 'unscheduled');
  assert.equal(DayCellClassifier.classify(mar20, mar20, 3, 3), 'complete');
  assert.equal(DayCellClassifier.classify(mar20, mar20, 3, 0), 'today-open');
  assert.equal(DayCellClassifier.classify(mar20 - 1, mar20, 3, 0), 'missed-all');
  assert.equal(DayCellClassifier.classify(mar20 - 1, mar20, 4, 1), 'missed-heavy'); // 25%
  assert.equal(DayCellClassifier.classify(mar20 - 1, mar20, 4, 2), 'missed-moderate'); // 50%
  assert.equal(DayCellClassifier.classify(mar20 - 1, mar20, 4, 3), 'missed-slight'); // 75%
});

test('TaskAnalytics range helpers count and bucket tasks across weekly, monthly, and multi-year spans', () => {
  const start = CivilCalendar.fromLocalDate(2026, 1, 1);
  const end = CivilCalendar.fromLocalDate(2026, 6, 30);
  const tasks: Task[] = [
    {
      id: 1,
      title: 'Jan task',
      note: '',
      dueDay: null,
      done: true,
      completedDay: CivilCalendar.fromLocalDate(2026, 1, 15),
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 2,
      title: 'Jun task',
      note: '',
      dueDay: null,
      done: true,
      completedDay: CivilCalendar.fromLocalDate(2026, 6, 10),
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 3,
      title: 'Deleted task',
      note: '',
      dueDay: null,
      done: true,
      completedDay: CivilCalendar.fromLocalDate(2026, 3, 1),
      deletedAt: 99,
      createdAt: 1,
      updatedAt: 1,
    },
  ];

  assert.equal(TaskAnalytics.countCompletedInRange(tasks, start, end, 'UTC'), 2);
  const monthly = TaskAnalytics.rangeCompletedBuckets(tasks, start, end, 12, 'UTC');
  assert.equal(monthly.length, 6);
  assert.equal(monthly[0].count, 1);
  assert.equal(monthly[5].count, 1);

  const wide = TaskAnalytics.rangeCompletedBuckets(
    tasks,
    CivilCalendar.fromLocalDate(2024, 1, 1),
    CivilCalendar.fromLocalDate(2026, 12, 31),
    10,
    'UTC'
  );
  assert.ok(wide.length <= 10);
  assert.equal(
    wide.reduce((s, b) => s + b.count, 0),
    2
  );
});

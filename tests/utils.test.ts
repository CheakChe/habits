import assert from 'node:assert/strict';
import test from 'node:test';
import { SnapshotCodec } from '../src/sync/snapshot-codec';
import {
  DomainSnapshot,
  Habit,
  HabitCheckin,
  HabitNote,
  Task,
  normalizeCheckinValue,
  normalizeDailyTarget,
  normalizeHabitUnit,
} from '../src/types/domain';
import { AdvancedAnalytics } from '../src/utils/advanced-analytics';
import { ChartsAnalytics } from '../src/utils/charts-analytics';
import { CivilCalendar } from '../src/utils/civil-calendar';
import { DATE_RANGE_PRESETS, DateRangeResolver, DayCellClassifier } from '../src/utils/date-range';
import { HabitAppearance } from '../src/utils/habit-appearance';
import { HabitSchedule } from '../src/utils/habit-schedule';
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
    weeklyTarget: null,
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
    weeklyTarget: null,
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
    weeklyTarget: null,
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
    weeklyTarget: null,
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
    weeklyTarget: null,
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
    weeklyTarget: null,
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
      status: 'done',
      completedDay: CivilCalendar.fromLocalDate(2026, 11, 17),
      repeatable: false,
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
      status: 'done',
      completedDay: lastWeekDay,
      repeatable: false,
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
      status: 'open',
      completedDay: null,
      repeatable: false,
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
      status: 'done',
      completedDay: today,
      repeatable: false,
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
      status: 'done',
      completedDay: CivilCalendar.fromLocalDate(2026, 1, 5),
      repeatable: false,
      deletedAt: null,
      createdAt: tsTooOld,
      updatedAt: tsTooOld,
    },
    {
      id: 6,
      title: 'Not done task',
      note: '',
      dueDay: today,
      done: false,
      status: 'not_done',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: tsThisWeek,
      updatedAt: tsThisWeek,
    },
    {
      id: 7,
      title: 'Archived goal',
      note: '',
      dueDay: null,
      done: false,
      status: 'archived',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: tsThisWeek,
      updatedAt: tsThisWeek,
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
      weeklyTarget: null,
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
      weeklyTarget: null,
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
      weeklyTarget: null,
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
      weeklyTarget: null,
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
      weeklyTarget: null,
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
    {
      id: 5,
      title: 'Future',
      note: 'Call dentist',
      dueDay: today + 2,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 4,
      title: 'No date',
      note: 'Read spec',
      dueDay: null,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: true,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 3,
      title: 'Today B',
      note: '',
      dueDay: today,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 1,
      title: 'Today A',
      note: 'Dentist receipt',
      dueDay: today,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 6,
      title: 'Overdue newer',
      note: '',
      dueDay: today - 1,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 2,
      title: 'Overdue older',
      note: '',
      dueDay: today - 5,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 7,
      title: 'Done overdue',
      note: '',
      dueDay: today - 3,
      done: true,
      status: 'done',
      completedDay: today - 1,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 10,
    },
    {
      id: 8,
      title: 'Deleted today',
      note: 'Dentist',
      dueDay: today,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: false,
      deletedAt: 100,
      createdAt: 1,
      updatedAt: 100,
    },
    {
      id: 9,
      title: 'Missed deadline',
      note: 'Too late',
      dueDay: today - 2,
      done: false,
      status: 'not_done',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 20,
    },
    {
      id: 10,
      title: 'Archived goal',
      note: 'Not relevant',
      dueDay: null,
      done: false,
      status: 'archived',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 30,
    },
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
  assert.deepEqual(
    TodayBoard.getNoDateTasks(tasks).map((t) => t.id),
    [4]
  );
  assert.equal(TodayBoard.suggestNextOccurrenceDueDay(tasks[1], today), null);
  assert.equal(TodayBoard.suggestNextOccurrenceDueDay(tasks[3], today), today + 1);
  assert.equal(TodayBoard.suggestNextOccurrenceDueDay(tasks[5], today), today + 1);
  assert.equal(TodayBoard.suggestNextOccurrenceDueDay(tasks[0], today), today + 3);

  // Filter modes + search query across title & notes + deleted exclusion
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'all').map((t) => t.id),
    [2, 6, 1, 3, 5, 4]
  );
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'today').map((t) => t.id),
    [1, 3]
  );
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'overdue').map((t) => t.id),
    [2, 6]
  );
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'nodate').map((t) => t.id),
    [4]
  );
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'completed').map((t) => t.id),
    [7]
  );
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'not_done').map((t) => t.id),
    [9]
  );
  assert.deepEqual(
    TodayBoard.filterTasks(tasks, today, 'archived').map((t) => t.id),
    [10]
  );
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
          weeklyTarget: null,
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
      status: 'done',
      completedDay: CivilCalendar.fromLocalDate(2026, 1, 15),
      repeatable: false,
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
      status: 'done',
      completedDay: CivilCalendar.fromLocalDate(2026, 6, 10),
      repeatable: false,
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
      status: 'done',
      completedDay: CivilCalendar.fromLocalDate(2026, 3, 1),
      repeatable: false,
      deletedAt: 99,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 4,
      title: 'Not done task',
      note: '',
      dueDay: CivilCalendar.fromLocalDate(2026, 3, 10),
      done: false,
      status: 'not_done',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 5,
      title: 'Archived goal',
      note: '',
      dueDay: null,
      done: false,
      status: 'archived',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
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

test('HabitAppearance normalizes hex, encodes icons/emojis, computes contrast, and round-trips through SnapshotCodec', () => {
  assert.equal(HabitAppearance.normalizeHex(' 3af '), '#33AAFF');
  assert.equal(HabitAppearance.normalizeHex('#ff5733'), '#FF5733');
  assert.equal(HabitAppearance.normalizeHex('not-hex'), null);

  assert.equal(HabitAppearance.format('#ff5733', { kind: 'none' }), '#FF5733');
  assert.equal(
    HabitAppearance.format('#14b8a6', { kind: 'icon', id: 'dumbbell' }),
    '#14B8A6|icon:dumbbell'
  );
  assert.equal(
    HabitAppearance.format('#22c55e', { kind: 'emoji', value: '💪' }),
    '#22C55E|emoji:💪'
  );

  assert.deepEqual(HabitAppearance.parse('#FF5733'), {
    color: '#FF5733',
    badge: { kind: 'none' },
  });
  assert.deepEqual(HabitAppearance.parse('#14B8A6|icon:dumbbell'), {
    color: '#14B8A6',
    badge: { kind: 'icon', id: 'dumbbell' },
  });
  assert.deepEqual(HabitAppearance.parse('#22C55E|emoji:💪'), {
    color: '#22C55E',
    badge: { kind: 'emoji', value: '💪' },
  });
  assert.deepEqual(HabitAppearance.parse('#3B82F6|icon:unknown_id'), {
    color: '#3B82F6',
    badge: { kind: 'none' },
  });

  assert.equal(HabitAppearance.getContrastTextColor('#FFFFFF'), '#0A0B0E');
  assert.equal(HabitAppearance.getContrastTextColor('#FACC15'), '#0A0B0E');
  assert.equal(HabitAppearance.getContrastTextColor('#3B82F6'), '#FFFFFF');

  const day = CivilCalendar.fromLocalDate(2026, 11, 20);
  const packed = SnapshotCodec.pack({
    habits: [
      {
        id: 1,
        name: 'Gym',
        color: '#FF5733|icon:dumbbell',
        weekdays: 127,
        weeklyTarget: null,
        startDay: day,
        archivedAt: null,
        createdAt: 100,
        updatedAt: 100,
      },
      {
        id: 2,
        name: 'Hydrate',
        color: '#06B6D4|emoji:💧',
        weekdays: 127,
        weeklyTarget: null,
        startDay: day,
        archivedAt: null,
        createdAt: 100,
        updatedAt: 100,
      },
    ],
    checkins: [],
    notes: [],
    tasks: [],
  });
  const unpacked = SnapshotCodec.unpack(packed);
  assert.equal(unpacked.habits[0].color, '#FF5733|icon:dumbbell');
  assert.equal(unpacked.habits[1].color, '#06B6D4|emoji:💧');
});

test('TaskAnalytics summarizes outcomes (excluding Archived from rate), on-time pace, goals, repeatable tasks, and per-day tasks', () => {
  const day1 = CivilCalendar.fromLocalDate(2026, 11, 10);
  const day2 = CivilCalendar.fromLocalDate(2026, 11, 12);
  const day3 = CivilCalendar.fromLocalDate(2026, 11, 15);
  const tsDay2 = Date.UTC(2026, 10, 12, 12, 0, 0);
  const tsDay3 = Date.UTC(2026, 10, 15, 12, 0, 0);

  const tasks: Task[] = [
    // Done on time (completedDay <= dueDay), repeatable
    {
      id: 1,
      title: 'Pay rent',
      note: '',
      dueDay: day2,
      done: true,
      status: 'done',
      completedDay: day1,
      repeatable: true,
      deletedAt: null,
      createdAt: tsDay2,
      updatedAt: tsDay2,
    },
    // Done late (completedDay > dueDay)
    {
      id: 2,
      title: 'Submit report',
      note: 'Late',
      dueDay: day1,
      done: true,
      status: 'done',
      completedDay: day2,
      repeatable: false,
      deletedAt: null,
      createdAt: tsDay2,
      updatedAt: tsDay2,
    },
    // Done dateless goal, repeatable
    {
      id: 3,
      title: 'Read book',
      note: '',
      dueDay: null,
      done: true,
      status: 'done',
      completedDay: day2,
      repeatable: true,
      deletedAt: null,
      createdAt: tsDay2,
      updatedAt: tsDay2,
    },
    // Not Done (dated day2) -> reduces completionRate
    {
      id: 4,
      title: 'Attend live call',
      note: 'Missed',
      dueDay: day2,
      done: false,
      status: 'not_done',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: tsDay2,
      updatedAt: tsDay3,
    },
    // Archived dateless goal (day3) -> MUST NOT penalize completionRate
    {
      id: 5,
      title: 'Old side goal',
      note: 'Irrelevant',
      dueDay: null,
      done: false,
      status: 'archived',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: tsDay2,
      updatedAt: tsDay3,
    },
    // Open dateless goal
    {
      id: 6,
      title: 'Learn piano',
      note: '',
      dueDay: null,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: tsDay2,
      updatedAt: tsDay2,
    },
    // Open dated task on day2
    {
      id: 7,
      title: 'Open due day2',
      note: '',
      dueDay: day2,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: tsDay2,
      updatedAt: tsDay2,
    },
    // Deleted task -> ignored everywhere
    {
      id: 8,
      title: 'Deleted',
      note: '',
      dueDay: day2,
      done: false,
      status: 'not_done',
      completedDay: null,
      repeatable: false,
      deletedAt: tsDay3,
      createdAt: tsDay2,
      updatedAt: tsDay3,
    },
  ];

  const summary = TaskAnalytics.summarizeRange(tasks, day1, day3, 'UTC');
  assert.equal(summary.doneCount, 3);
  assert.equal(summary.notDoneCount, 1);
  assert.equal(summary.archivedCount, 1);
  assert.equal(summary.completionRate, 3 / 4); // Archived excluded from denominator
  assert.equal(summary.datedDoneCount, 2);
  assert.equal(summary.onTimeCount, 1);
  assert.equal(summary.lateCount, 1);
  assert.equal(summary.onTimeRate, 0.5);
  assert.equal(summary.goalsDoneCount, 1);
  assert.equal(summary.goalsNotDoneCount, 0);
  assert.equal(summary.goalsArchivedCount, 1);
  assert.equal(summary.goalsOpenCount, 1);
  assert.equal(summary.repeatableDoneCount, 2);

  const buckets = TaskAnalytics.rangeOutcomeBuckets(tasks, day1, day3, 12, 'UTC');
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].doneCount, 3);
  assert.equal(buckets[0].notDoneCount, 1);
  assert.equal(buckets[0].archivedCount, 1);

  const day2Breakdown = TaskAnalytics.tasksForDay(tasks, day2, 'UTC');
  assert.deepEqual(
    day2Breakdown.done.map((t) => t.id),
    [2, 3]
  );
  assert.deepEqual(
    day2Breakdown.notDone.map((t) => t.id),
    [4]
  );
  assert.deepEqual(
    day2Breakdown.archived.map((t) => t.id),
    []
  );
  assert.deepEqual(
    day2Breakdown.dueOpen.map((t) => t.id),
    [7]
  );

  const day3Breakdown = TaskAnalytics.tasksForDay(tasks, day3, 'UTC');
  assert.deepEqual(
    day3Breakdown.archived.map((t) => t.id),
    [5]
  );
});

test('ChartsAnalytics computes adaptive habit trend buckets and weekday stats for habits and tasks', () => {
  // 2026-11-02 is Monday (bit 0)
  const mon1 = CivilCalendar.fromLocalDate(2026, 11, 2);
  const tue1 = mon1 + 1;
  const sun2 = mon1 + 13; // 14-day window (2 full weeks)

  // Habit scheduled on Mon (bit 0), Wed (bit 2), Fri (bit 4) starting tue1
  const weekdays = (1 << 0) | (1 << 2) | (1 << 4);
  const habits: Habit[] = [
    {
      id: 1,
      name: 'Run',
      color: '#3B82F6',
      weekdays,
      weeklyTarget: null,
      startDay: tue1,
      archivedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ];

  // Week 1 scheduled days after tue1: Wed (mon1+2, done), Fri (mon1+4, missed) -> 1/2 = 0.5
  // Week 2 scheduled days: Mon (mon1+7, done), Wed (mon1+9, done), Fri (mon1+11, done) -> 3/3 = 1.0
  const checkins: HabitCheckin[] = [
    { habitId: 1, dayIndex: mon1 + 2, done: true, updatedAt: 10 },
    { habitId: 1, dayIndex: mon1 + 7, done: true, updatedAt: 10 },
    { habitId: 1, dayIndex: mon1 + 9, done: true, updatedAt: 10 },
    { habitId: 1, dayIndex: mon1 + 11, done: true, updatedAt: 10 },
  ];

  // Daily buckets when range <= maxBuckets
  const daily = ChartsAnalytics.habitTrendBuckets(habits, checkins, mon1, sun2, 14);
  assert.equal(daily.length, 14);
  assert.equal(daily[0].rate, null); // mon1 is before habit.startDay
  assert.equal(daily[1].rate, null); // tue1 is off-schedule
  assert.equal(daily[2].rate, 1); // Wed1 done
  assert.equal(daily[4].rate, 0); // Fri1 missed

  // Weekly buckets when maxBuckets = 5 (< 14 days, >= 2 weeks)
  const weekly = ChartsAnalytics.habitTrendBuckets(habits, checkins, mon1, sun2, 5);
  assert.equal(weekly.length, 2);
  assert.equal(weekly[0].doneCount, 1);
  assert.equal(weekly[0].scheduledCount, 2);
  assert.equal(weekly[0].rate, 0.5);
  assert.equal(weekly[1].doneCount, 3);
  assert.equal(weekly[1].scheduledCount, 3);
  assert.equal(weekly[1].rate, 1);

  // Monthly buckets for 4-month span with maxBuckets = 6
  const jan1 = CivilCalendar.fromLocalDate(2026, 1, 1);
  const apr30 = CivilCalendar.fromLocalDate(2026, 4, 30);
  const monthly = ChartsAnalytics.habitTrendBuckets(habits, checkins, jan1, apr30, 6);
  assert.equal(monthly.length, 4);

  // Weekday habit stats across mon1..sun2
  const wHabits = ChartsAnalytics.weekdayHabitStats(habits, checkins, mon1, sun2);
  assert.equal(wHabits.length, 7);
  assert.equal(wHabits[0].scheduledCount, 1); // Mon week2 only
  assert.equal(wHabits[0].rate, 1);
  assert.equal(wHabits[1].rate, null); // Tue never scheduled
  assert.equal(wHabits[2].doneCount, 2); // Both Wed done
  assert.equal(wHabits[2].rate, 1);
  assert.equal(wHabits[4].doneCount, 1); // 1 of 2 Fri done
  assert.equal(wHabits[4].rate, 0.5);

  // Weekday task stats (ignores open, archived, and deleted tasks)
  const tasks: Task[] = [
    {
      id: 1,
      title: 'Done Mon',
      note: '',
      dueDay: mon1,
      done: true,
      status: 'done',
      completedDay: mon1,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 2,
      title: 'Not done Mon',
      note: '',
      dueDay: mon1 + 7,
      done: false,
      status: 'not_done',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 3,
      title: 'Archived Tue',
      note: '',
      dueDay: tue1,
      done: false,
      status: 'archived',
      completedDay: null,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: Date.UTC(2026, 10, 3, 12, 0, 0),
    },
    {
      id: 4,
      title: 'Deleted Mon',
      note: '',
      dueDay: mon1,
      done: true,
      status: 'done',
      completedDay: mon1,
      repeatable: false,
      deletedAt: 50,
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const wTasks = ChartsAnalytics.weekdayTaskStats(tasks, mon1, sun2, 'UTC');
  assert.equal(wTasks[0].doneCount, 1);
  assert.equal(wTasks[0].notDoneCount, 1);
  assert.equal(wTasks[0].rate, 0.5);
  assert.equal(wTasks[1].totalCount, 0);
  assert.equal(wTasks[1].rate, null);
});

test('Flexible weekly target habits work across TodayBoard, StreakCalculator, DayStats, and ChartsAnalytics', () => {
  // Week 1 starts Monday 2026-11-02; Habit starts Saturday of Week 0 (2026-10-31)
  const w1Mon = CivilCalendar.fromLocalDate(2026, 11, 2);
  const w0Sat = w1Mon - 2; // 2 remaining days in Week 0 (Sat, Sun)
  const w2Mon = w1Mon + 7;
  const w3Mon = w1Mon + 14;

  const flexHabit: Habit = {
    id: 10,
    name: 'Gym 3x/wk',
    color: '#22C55E',
    weekdays: 127,
    weeklyTarget: 3,
    startDay: w0Sat,
    archivedAt: null,
    createdAt: 100,
    updatedAt: 100,
  };

  // Week 0 (Sat, Sun -> effective target clamped to 2): 2/2 complete!
  // Week 1 (target 3): over-achieved 4 check-ins (Mon, Tue, Wed, Fri) -> 4/3 complete!
  // Week 2 (target 3): missed week (only Mon) -> 1/3 failed!
  // Week 3 (target 3): Mon & Wed done, evaluating on Fri (3 days left incl Fri..Sun -> 2 done + 2 future >= 3, still achievable!)
  const checkins: HabitCheckin[] = [
    { habitId: 10, dayIndex: w0Sat, done: true, updatedAt: 1 },
    { habitId: 10, dayIndex: w0Sat + 1, done: true, updatedAt: 1 },
    { habitId: 10, dayIndex: w1Mon, done: true, updatedAt: 1 },
    { habitId: 10, dayIndex: w1Mon + 1, done: true, updatedAt: 1 },
    { habitId: 10, dayIndex: w1Mon + 2, done: true, updatedAt: 1 },
    { habitId: 10, dayIndex: w1Mon + 4, done: true, updatedAt: 1 },
    { habitId: 10, dayIndex: w2Mon, done: true, updatedAt: 1 },
    { habitId: 10, dayIndex: w3Mon, done: true, updatedAt: 1 },
    { habitId: 10, dayIndex: w3Mon + 2, done: true, updatedAt: 1 },
  ];

  // 1. StreakCalculator: Week 0 + Week 1 -> longest streak 2w; Week 2 failed; Week 3 pending on Fri -> currentStreak 0w
  const w3Fri = w3Mon + 4;
  const mPending = StreakCalculator.calculate(flexHabit, checkins, w0Sat, w3Fri, true);
  assert.equal(mPending.streakUnit, 'weeks');
  assert.equal(mPending.longestStreak, 2);
  assert.equal(mPending.currentStreak, 0);

  // If Week 2 had been completed (add Wed + Fri), Week 3 still achievable on Fri -> currentStreak preserves 3w!
  const w3ThuBeforeComplete: HabitCheckin[] = [
    ...checkins,
    { habitId: 10, dayIndex: w2Mon + 2, done: true, updatedAt: 2 },
    { habitId: 10, dayIndex: w2Mon + 4, done: true, updatedAt: 2 },
  ];
  const preservedStreak = StreakCalculator.calculate(
    flexHabit,
    w3ThuBeforeComplete,
    w0Sat,
    w3Fri,
    true
  );
  assert.equal(preservedStreak.currentStreak, 3); // W0, W1, W2 (W3 still pending)
  assert.equal(preservedStreak.longestStreak, 3);

  // If evaluating on Sunday with only 2/3 done and Sun not done yet + allowPending=true -> no remaining future days after Sun -> broken!
  const w3Sun = w3Mon + 6;
  const brokenOnSun = StreakCalculator.calculate(
    flexHabit,
    w3ThuBeforeComplete,
    w0Sat,
    w3Sun,
    true
  );
  assert.equal(brokenOnSun.currentStreak, 0);

  // Complete W3 on Fri -> currentStreak becomes 4w immediately!
  const withW3Done: HabitCheckin[] = [
    ...w3ThuBeforeComplete,
    { habitId: 10, dayIndex: w3Fri, done: true, updatedAt: 3 },
  ];
  const active4w = StreakCalculator.calculate(flexHabit, withW3Done, w0Sat, w3Fri, true);
  assert.equal(active4w.currentStreak, 4);
  assert.equal(active4w.longestStreak, 4);

  // 2. Over-achievement capping in completionRate:
  // Full Week 1 (4 done vs target 3 -> capped at 3/3) + Full Week 2 (1 done vs target 3 -> 1/3) = 4/6
  const w2Sun = w2Mon + 6;
  const rateMetrics = StreakCalculator.calculate(flexHabit, checkins, w1Mon, w2Sun, false);
  assert.equal(rateMetrics.scheduledDays, 6);
  assert.equal(rateMetrics.completedScheduledDays, 4);
  assert.ok(Math.abs(rateMetrics.completionRate - 4 / 6) < 1e-9);

  // 3. calculateWeeklyProgress on Week 0 Sat-Sun (target clamped to 2)
  const wk0Prog = StreakCalculator.calculateWeeklyProgress(flexHabit, checkins, w0Sat + 1);
  assert.equal(wk0Prog.scheduledDays, 2);
  assert.equal(wk0Prog.completedDays, 2);
  assert.equal(wk0Prog.isComplete, true);

  // 4. TodayBoard scheduling & deadline hints
  // Week 1 Wed (w1Mon + 2): 3rd check-in happened on Wed -> MUST still stay visible on Wed (checked today!)
  assert.equal(TodayBoard.getScheduledHabits([flexHabit], w1Mon + 2, checkins).length, 1);
  // Week 1 Thu (w1Mon + 3): target 3/3 was already closed Mon-Wed & Thu is unchecked -> hidden from Today!
  assert.equal(TodayBoard.getScheduledHabits([flexHabit], w1Mon + 3, checkins).length, 0);
  // Week 2 Sat (w2Mon + 5): only 1/3 done in Mon, 2 days left (Sat & Sun) for 2 remaining -> visible & mustDoToday = true!
  assert.equal(TodayBoard.getScheduledHabits([flexHabit], w2Mon + 5, checkins).length, 1);
  const satStatus = TodayBoard.getFlexibleWeekStatus(flexHabit, checkins, w2Mon + 5);
  assert.ok(satStatus);
  assert.equal(satStatus.remainingDays, 2);
  assert.equal(satStatus.remainingNeeded, 2);
  assert.equal(satStatus.mustDoToday, true);

  // 5. getPeriodDayStats & ChartsAnalytics:
  // In Week 2 (Mon done, Tue-Fri rest, Sat-Sun shortfall 2), Tue-Fri have scheduled=0, Mon=1/1, Sat & Sun=0/1!
  const w2Stats = StreakCalculator.getPeriodDayStats([flexHabit], checkins, w2Mon, w2Sun, w2Sun);
  assert.deepEqual(w2Stats.get(w2Mon), { scheduled: 1, done: 1 });
  assert.equal(w2Stats.get(w2Mon + 1), undefined); // Tue rest
  assert.equal(w2Stats.get(w2Mon + 4), undefined); // Fri rest
  assert.deepEqual(w2Stats.get(w2Mon + 5), { scheduled: 1, done: 0 }); // Sat deficit
  assert.deepEqual(w2Stats.get(w2Mon + 6), { scheduled: 1, done: 0 }); // Sun deficit

  const trend = ChartsAnalytics.habitTrendBuckets([flexHabit], checkins, w1Mon, w2Sun, 5);
  assert.equal(trend.length, 2);
  assert.equal(trend[0].doneCount, 3);
  assert.equal(trend[0].scheduledCount, 3);
  assert.equal(trend[0].rate, 1);
  assert.equal(trend[1].doneCount, 1);
  assert.equal(trend[1].scheduledCount, 3);
  assert.ok(Math.abs(trend[1].rate! - 1 / 3) < 1e-9);
});

test('Flexible weekly habits with selected weekdays restrict TodayBoard & deficits to eligible days while counting off-schedule completions', () => {
  assert.equal(CivilCalendar.countScheduledDays(0b0011111), 5);
  assert.equal(CivilCalendar.countScheduledDays(0b1111111), 7);
  assert.equal(CivilCalendar.countScheduledDays(0), 0);

  // Week 1 starts Monday 2026-11-02; Habit starts Thursday of Week 0 (2026-10-29)
  const w1Mon = CivilCalendar.fromLocalDate(2026, 11, 2);
  const w0Thu = w1Mon - 4; // Thu, Fri eligible in Week 0 (2 eligible days)
  const w0Fri = w1Mon - 3;
  const w1Tue = w1Mon + 1;
  const w1Thu = w1Mon + 3;
  const w1Fri = w1Mon + 4;
  const w1Sat = w1Mon + 5;
  const w1Sun = w1Mon + 6;
  const w2Mon = w1Mon + 7;
  const w2Sun = w2Mon + 6;

  // 3x/week planned on Mon–Fri (0b0011111)
  const weekdayFlexHabit: Habit = {
    id: 21,
    name: 'Workday Focus 3x/wk',
    color: '#3B82F6',
    weekdays: 0b0011111,
    weeklyTarget: 3,
    startDay: w0Thu,
    archivedAt: null,
    createdAt: 100,
    updatedAt: 100,
  };

  assert.equal(CivilCalendar.countScheduledInRange(0b0011111, w0Thu, w0Fri + 2), 2); // Thu, Fri only

  // Week 0: Thu + Fri done -> 2/2 (clamped from 3 because only Thu, Fri eligible)
  // Week 1: Mon + Sat (off-schedule!) done -> 2/3 toward quota (1 remaining miss goes to Fri)
  // Week 2: Mon + Wed done -> 2/3, evaluating on Thu (Fri still ahead) -> pending streak preserved!
  const checkins: HabitCheckin[] = [
    { habitId: 21, dayIndex: w0Thu, done: true, updatedAt: 1 },
    { habitId: 21, dayIndex: w0Fri, done: true, updatedAt: 1 },
    { habitId: 21, dayIndex: w1Mon, done: true, updatedAt: 1 },
    { habitId: 21, dayIndex: w1Sat, done: true, updatedAt: 1 }, // off-schedule Saturday counts toward quota
    { habitId: 21, dayIndex: w2Mon, done: true, updatedAt: 1 },
    { habitId: 21, dayIndex: w2Mon + 2, done: true, updatedAt: 1 },
  ];

  // 1. Week 0 weekly progress clamped to 2 eligible days
  const wk0 = StreakCalculator.calculateWeeklyProgress(weekdayFlexHabit, checkins, w0Fri);
  assert.equal(wk0.scheduledDays, 2);
  assert.equal(wk0.completedDays, 2);
  assert.equal(wk0.isComplete, true);

  // 2. TodayBoard on Week 1:
  // On Thu (Mon + Sat = 2/3 done in week, Thu & Fri = 2 eligible days remaining for 1 needed) -> mustDoToday = false
  const thuStatus = TodayBoard.getFlexibleWeekStatus(weekdayFlexHabit, checkins, w1Thu);
  assert.ok(thuStatus);
  assert.equal(thuStatus.isEligibleDay, true);
  assert.equal(thuStatus.doneInWeek, 2);
  assert.equal(thuStatus.remainingDays, 2);
  assert.equal(thuStatus.remainingNeeded, 1);
  assert.equal(thuStatus.mustDoToday, false);
  assert.equal(TodayBoard.getScheduledHabits([weekdayFlexHabit], w1Thu, checkins).length, 1);

  // On Fri (still 2/3 done, only Fri left -> mustDoToday = true!)
  const friStatus = TodayBoard.getFlexibleWeekStatus(weekdayFlexHabit, checkins, w1Fri);
  assert.ok(friStatus);
  assert.equal(friStatus.remainingDays, 1);
  assert.equal(friStatus.remainingNeeded, 1);
  assert.equal(friStatus.mustDoToday, true);

  // On Sun (off-schedule and unchecked): hidden from Today & isEligibleDay = false
  const sunStatus = TodayBoard.getFlexibleWeekStatus(weekdayFlexHabit, checkins, w1Sun);
  assert.ok(sunStatus);
  assert.equal(sunStatus.isEligibleDay, false);
  assert.equal(sunStatus.doneInWeek, 2);
  assert.equal(sunStatus.mustDoToday, false);
  assert.equal(TodayBoard.getScheduledHabits([weekdayFlexHabit], w1Sun, checkins).length, 0);

  // On Sat (off-schedule, checked via History): visible as done-today
  assert.equal(TodayBoard.getScheduledHabits([weekdayFlexHabit], w1Sat, checkins).length, 1);

  // 3. Period day stats for Week 1: Mon & Sat counted done, 1 remaining miss assigned to Fri; unchecked Sun gets none
  const w1Stats = StreakCalculator.getPeriodDayStats(
    [weekdayFlexHabit],
    checkins,
    w1Mon,
    w1Sun,
    w1Sun
  );
  assert.deepEqual(w1Stats.get(w1Mon), { scheduled: 1, done: 1 });
  assert.equal(w1Stats.get(w1Tue), undefined);
  assert.equal(w1Stats.get(w1Thu), undefined);
  assert.deepEqual(w1Stats.get(w1Fri), { scheduled: 1, done: 0 });
  assert.deepEqual(w1Stats.get(w1Sat), { scheduled: 1, done: 1 });
  assert.equal(w1Stats.get(w1Sun), undefined); // Off-schedule unchecked Sunday not scheduled/counted

  // 4. Weekday Rhythm chart: Sat reflects completion (1/1 = 100%), Sun has rate === null
  const weekdayStats = ChartsAnalytics.weekdayHabitStats(
    [weekdayFlexHabit],
    checkins,
    w1Mon,
    w1Sun
  );
  assert.equal(weekdayStats[5].scheduledCount, 1);
  assert.equal(weekdayStats[5].doneCount, 1);
  assert.equal(weekdayStats[5].rate, 1);
  assert.equal(weekdayStats[6].scheduledCount, 0);
  assert.equal(weekdayStats[6].rate, null);

  // 5. StreakCalculator: Week 0 passed (1w), Week 1 has 2/3 (Mon + Sat)
  const w1Metrics = StreakCalculator.calculate(weekdayFlexHabit, checkins, w0Thu, w1Sun, false);
  assert.equal(w1Metrics.longestStreak, 1);
  assert.equal(w1Metrics.currentStreak, 0);
  assert.equal(w1Metrics.scheduledDays, 5); // 2 in W0 + 3 in W1
  assert.equal(w1Metrics.completedScheduledDays, 4); // 2 in W0 + 2 in W1 (Mon + Sat)

  // Completing Week 1 with Sunday off-schedule too passes Week 1 (3/3 -> 2w streak)
  const rescuedW1Checkins: HabitCheckin[] = [
    ...checkins,
    { habitId: 21, dayIndex: w1Sun, done: true, updatedAt: 2 },
  ];
  const w1Rescued = StreakCalculator.calculate(
    weekdayFlexHabit,
    rescuedW1Checkins,
    w0Thu,
    w1Sun,
    false
  );
  assert.equal(w1Rescued.currentStreak, 2);
  assert.equal(w1Rescued.completedScheduledDays, 5);
  assert.equal(w1Rescued.completionRate, 1);

  // Over-completion (Mon + Tue + Fri + Sat = 4 in W1) caps completionRate at 1.0 (3/3)
  const overDoneCheckins: HabitCheckin[] = [
    ...checkins,
    { habitId: 21, dayIndex: w1Tue, done: true, updatedAt: 2 },
    { habitId: 21, dayIndex: w1Fri, done: true, updatedAt: 2 },
  ];
  const overMetrics = StreakCalculator.calculate(
    weekdayFlexHabit,
    overDoneCheckins,
    w0Thu,
    w1Sun,
    false
  );
  assert.equal(overMetrics.scheduledDays, 5);
  assert.equal(overMetrics.completedScheduledDays, 5);
  assert.equal(overMetrics.completionRate, 1);

  // If Week 1 had 3 check-ins, evaluating on Week 2 Thu (Fri still ahead) preserves 2w streak!
  const w2Thu = w2Mon + 3;
  const w2ThuPending = StreakCalculator.calculate(
    weekdayFlexHabit,
    overDoneCheckins,
    w0Thu,
    w2Thu,
    true
  );
  assert.equal(w2ThuPending.currentStreak, 2);

  // Evaluating on Week 2 Sat (Mon-Fri ended, only 2/3 done, no Sat checkin) -> breaks to 0w; adding Sat checkin rescues to 3w!
  const w2Sat = w2Mon + 5;
  const w2SatBroken = StreakCalculator.calculate(
    weekdayFlexHabit,
    overDoneCheckins,
    w0Thu,
    w2Sat,
    true
  );
  assert.equal(w2SatBroken.currentStreak, 0);

  const w2SatRescued = StreakCalculator.calculate(
    weekdayFlexHabit,
    [...overDoneCheckins, { habitId: 21, dayIndex: w2Sat, done: true, updatedAt: 3 }],
    w0Thu,
    w2Sat,
    true
  );
  assert.equal(w2SatRescued.currentStreak, 3);

  // Ensure w2Sun referenced cleanly
  assert.ok(w2Sun > w2Sat);
});

test('HabitSchedule and versioned schedules work across Fixed<->Flex cross-week and mid-week transitions', () => {
  const w1Mon = CivilCalendar.fromLocalDate(2026, 11, 2); // Monday
  const w1Wed = w1Mon + 2;
  const w1Thu = w1Mon + 3;
  const w1Fri = w1Mon + 4;
  const w1Sun = w1Mon + 6;
  const w2Mon = w1Mon + 7;
  const w2Tue = w2Mon + 1;
  const w2Wed = w2Mon + 2;
  const w2Sun = w2Mon + 6;

  // 1. Cross-week Fixed (Mon/Wed/Fri) -> Flex (2x/week Mon-Sun starting w2Mon)
  const fixedToFlexHabit: Habit = {
    id: 30,
    name: 'Switch to Flex',
    color: '#3B82F6',
    weekdays: 0b1111111,
    weeklyTarget: 2,
    startDay: w1Mon,
    archivedAt: null,
    createdAt: 100,
    updatedAt: 200,
    scheduleHistory: [
      { fromDay: w1Mon, weekdays: (1 << 0) | (1 << 2) | (1 << 4), weeklyTarget: null }, // Mon/Wed/Fri
      { fromDay: w2Mon, weekdays: 0b1111111, weeklyTarget: 2 },
    ],
  };

  assert.equal(HabitSchedule.getAtDay(fixedToFlexHabit, w1Wed).weeklyTarget, null);
  assert.equal(HabitSchedule.getAtDay(fixedToFlexHabit, w2Mon).weeklyTarget, 2);

  // Week 1: Mon, Wed, Fri all completed (3/3 fixed)
  // Week 2: Tue completed (1/2 flex), Thu missed/pending -> evaluated on Wed (Tue done, Thu..Sun remaining)
  const c1: HabitCheckin[] = [
    { habitId: 30, dayIndex: w1Mon, done: true, updatedAt: 1 },
    { habitId: 30, dayIndex: w1Wed, done: true, updatedAt: 1 },
    { habitId: 30, dayIndex: w1Fri, done: true, updatedAt: 1 },
    { habitId: 30, dayIndex: w2Tue, done: true, updatedAt: 1 },
  ];

  // StreakCalculator preserves 1w from completed fixed Week 1 while Week 2 is pending!
  const metricsPendingW2 = StreakCalculator.calculate(fixedToFlexHabit, c1, w1Mon, w2Wed, true);
  assert.equal(metricsPendingW2.streakUnit, 'weeks');
  assert.equal(metricsPendingW2.currentStreak, 1);

  // Complete 2nd flex day in Week 2 (Thu) -> streak becomes 2w, completionRate = (3+2)/(3+2) = 1.0
  const c1Done: HabitCheckin[] = [
    ...c1,
    { habitId: 30, dayIndex: w2Mon + 3, done: true, updatedAt: 2 },
  ];
  const metricsDoneW2 = StreakCalculator.calculate(fixedToFlexHabit, c1Done, w1Mon, w2Sun, false);
  assert.equal(metricsDoneW2.currentStreak, 2);
  assert.equal(metricsDoneW2.scheduledDays, 5);
  assert.equal(metricsDoneW2.completedScheduledDays, 5);
  assert.equal(metricsDoneW2.completionRate, 1);

  // PeriodDayStats & ChartsAnalytics respect Week 1 fixed days vs Week 2 flex days
  const stats = StreakCalculator.getPeriodDayStats([fixedToFlexHabit], c1Done, w1Mon, w2Sun, w2Sun);
  assert.deepEqual(stats.get(w1Mon), { scheduled: 1, done: 1 });
  assert.equal(stats.get(w1Mon + 1), undefined); // Week 1 Tue was off-schedule fixed
  assert.deepEqual(stats.get(w2Tue), { scheduled: 1, done: 1 });
  assert.deepEqual(stats.get(w2Mon + 3), { scheduled: 1, done: 1 });
  assert.equal(stats.get(w2Mon + 5), undefined); // Week 2 quota met -> rest day

  const weeklyTrend = ChartsAnalytics.habitTrendBuckets(
    [fixedToFlexHabit],
    c1Done,
    w1Mon,
    w2Sun,
    4
  );
  assert.equal(weeklyTrend.length, 2);
  assert.equal(weeklyTrend[0].scheduledCount, 3);
  assert.equal(weeklyTrend[0].doneCount, 3);
  assert.equal(weeklyTrend[1].scheduledCount, 2);
  assert.equal(weeklyTrend[1].doneCount, 2);

  // 2. Mid-week split: Mon-Wed Fixed (Mon & Wed), switching on Thu to Flex 3x/week!
  // Mon & Wed were completed (donePriorInWeek = 2), so Thu..Sun only needs 1 more!
  const midWeekSplit: Habit = {
    id: 31,
    name: 'Midweek Switch',
    color: '#22C55E',
    weekdays: 0b1111111,
    weeklyTarget: 3,
    startDay: w1Mon,
    archivedAt: null,
    createdAt: 100,
    updatedAt: 200,
    scheduleHistory: [
      { fromDay: w1Mon, weekdays: (1 << 0) | (1 << 2) | (1 << 4), weeklyTarget: null },
      { fromDay: w1Thu, weekdays: 0b1111111, weeklyTarget: 3 },
    ],
  };

  const cMid: HabitCheckin[] = [
    { habitId: 31, dayIndex: w1Mon, done: true, updatedAt: 1 },
    { habitId: 31, dayIndex: w1Wed, done: true, updatedAt: 1 },
  ];

  // On Sunday (last day of Week 1), 2 done Mon-Wed -> 1 remaining needed -> mustDoToday = true!
  const sunFlexStatus = TodayBoard.getFlexibleWeekStatus(midWeekSplit, cMid, w1Sun);
  assert.ok(sunFlexStatus);
  assert.equal(sunFlexStatus.doneInWeek, 2);
  assert.equal(sunFlexStatus.effectiveTarget, 3);
  assert.equal(sunFlexStatus.remainingNeeded, 1);
  assert.equal(sunFlexStatus.remainingDays, 1);
  assert.equal(sunFlexStatus.mustDoToday, true);

  // If completed on Thu, Fri is already satisfied (3/3) and hidden from TodayBoard
  const cMidDone = [...cMid, { habitId: 31, dayIndex: w1Thu, done: true, updatedAt: 2 }];
  assert.equal(TodayBoard.getScheduledHabits([midWeekSplit], w1Fri, cMidDone).length, 0);
  const wkProg = StreakCalculator.calculateWeeklyProgress(midWeekSplit, cMidDone, w1Fri);
  assert.equal(wkProg.completedDays, 3);
  assert.equal(wkProg.scheduledDays, 3);
  assert.equal(wkProg.isComplete, true);

  // 3. Flex -> Fixed: Week 1 Flex 2x/wk passed (Mon, Thu), Week 2 Fixed Mon/Wed/Fri
  const flexToFixed: Habit = {
    id: 32,
    name: 'Flex to Fixed',
    color: '#A855F7',
    weekdays: (1 << 0) | (1 << 2) | (1 << 4),
    weeklyTarget: null,
    startDay: w1Mon,
    archivedAt: null,
    createdAt: 100,
    updatedAt: 200,
    scheduleHistory: [
      { fromDay: w1Mon, weekdays: 0b1111111, weeklyTarget: 2 },
      { fromDay: w2Mon, weekdays: (1 << 0) | (1 << 2) | (1 << 4), weeklyTarget: null },
    ],
  };
  const cFlexToFixed: HabitCheckin[] = [
    { habitId: 32, dayIndex: w1Mon, done: true, updatedAt: 1 },
    { habitId: 32, dayIndex: w1Thu, done: true, updatedAt: 1 },
    { habitId: 32, dayIndex: w2Mon, done: true, updatedAt: 1 },
  ];
  // Current streak is measured in 'days' (latest schedule is Fixed), carrying 2 done from passed Flex Week 1 + Mon Week 2 = 3d!
  const mFlexToFixed = StreakCalculator.calculate(flexToFixed, cFlexToFixed, w1Mon, w2Wed, true);
  assert.equal(mFlexToFixed.streakUnit, 'days');
  assert.equal(mFlexToFixed.currentStreak, 3);
  assert.equal(mFlexToFixed.scheduledDays, 4); // 2 in W1 + Mon & Wed in W2
  assert.equal(mFlexToFixed.completedScheduledDays, 3);
});

test('Measured habits domain helpers, stepped dailyTarget discipline metrics, and ChartsAnalytics volume progression', () => {
  // 1. Unit & value normalizers + minute-unit detection
  assert.equal(normalizeDailyTarget(15), 15);
  assert.equal(normalizeDailyTarget(1.236), 1.24);
  assert.equal(normalizeDailyTarget(0), null);
  assert.equal(normalizeDailyTarget(-5), null);
  assert.equal(normalizeDailyTarget(Number.NaN), null);

  assert.equal(normalizeHabitUnit('  min  '), 'min');
  assert.equal(normalizeHabitUnit('   '), null);
  assert.equal(normalizeHabitUnit(null), null);

  assert.equal(normalizeCheckinValue(10.555), 10.56);
  assert.equal(normalizeCheckinValue(0), undefined);
  assert.equal(normalizeCheckinValue(-1), undefined);

  // 2. Stepped habit: Week 1 (Mon-Sun) target = 15 min; Week 2 (Mon-Sun) target = 30 min
  const w1Mon = CivilCalendar.fromLocalDate(2026, 11, 2); // Monday
  const w2Mon = w1Mon + 7;
  const w2Tue = w2Mon + 1;
  const w2Wed = w2Mon + 2;

  const steppedHabit: Habit = {
    id: 40,
    name: 'Deep Work',
    color: '#3B82F6',
    weekdays: 0b1111111,
    weeklyTarget: null,
    dailyTarget: 30,
    unit: 'min',
    startDay: w1Mon,
    archivedAt: null,
    createdAt: 100,
    updatedAt: 200,
    scheduleHistory: [
      { fromDay: w1Mon, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 15 },
      { fromDay: w2Mon, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 30 },
    ],
  };

  // Check-ins:
  // W1: all 7 days done at 15 min (exact target)
  // W2 Mon: 30 min (done), W2 Tue: 15 min even with stale done=true (15 < 30 -> NOT done!), W2 Wed: legacy done=true without value -> counts as activeTarget (30)
  const checkins: HabitCheckin[] = [
    ...Array.from({ length: 7 }, (_, i) => ({
      habitId: 40,
      dayIndex: w1Mon + i,
      done: true,
      value: 15,
      updatedAt: 100 + i,
    })),
    { habitId: 40, dayIndex: w2Mon, done: true, value: 30, updatedAt: 200 },
    { habitId: 40, dayIndex: w2Tue, done: true, value: 15, updatedAt: 201 },
    { habitId: 40, dayIndex: w2Wed, done: true, updatedAt: 202 },
  ];

  assert.equal(HabitSchedule.isCheckinDoneForDay(steppedHabit, checkins[0], w1Mon), true);
  assert.equal(HabitSchedule.isCheckinDoneForDay(steppedHabit, checkins[8], w2Tue), false);
  assert.equal(HabitSchedule.isCheckinDoneForDay(steppedHabit, checkins[9], w2Wed), true);
  assert.equal(HabitSchedule.getCheckinValueForDay(steppedHabit, checkins[9], w2Wed), 30);

  // Streak across W1..W2 Wed: W2 Tue (15 < 30) broke the streak before W2 Wed!
  const metrics = StreakCalculator.calculate(steppedHabit, checkins, w1Mon, w2Wed, true);
  assert.equal(metrics.currentStreak, 1);
  assert.equal(metrics.longestStreak, 8); // 7 in W1 + W2 Mon = 8
  assert.equal(metrics.scheduledDays, 10);
  assert.equal(metrics.completedScheduledDays, 9);

  // Summary carries totalValue & unit for measured habit
  const summaries = StreakCalculator.summarizeHabitsForRange(
    [steppedHabit],
    checkins,
    w1Mon,
    w2Wed,
    w2Wed
  );
  assert.equal(summaries.length, 1);
  // 7*15 + 30 + 15 + 30 = 105 + 75 = 180
  assert.equal(summaries[0].totalValue, 180);
  assert.equal(summaries[0].unit, 'min');

  // Volume analytics buckets: Daily view for 10 days (w1Mon..w2Wed) -> each bucket shows target 15 in W1 and 30 in W2
  const dailyVol = ChartsAnalytics.habitVolumeBuckets(steppedHabit, checkins, w1Mon, w2Wed, 14);
  assert.equal(dailyVol.length, 10);
  assert.equal(dailyVol[0].targetTotal, 15);
  assert.equal(dailyVol[0].targetPerDay, 15);
  assert.equal(dailyVol[0].actualTotal, 15);
  assert.equal(dailyVol[7].targetTotal, 30); // w2Mon
  assert.equal(dailyVol[7].actualTotal, 30);
  assert.equal(dailyVol[8].targetTotal, 30); // w2Tue
  assert.equal(dailyVol[8].actualTotal, 15);

  const volSummary = ChartsAnalytics.summarizeHabitVolume(steppedHabit, checkins, w1Mon, w2Wed);
  assert.equal(volSummary.totalVolume, 180);
  assert.equal(volSummary.activeDaysLogged, 10);
  assert.equal(volSummary.averagePerActiveDay, 18);
  assert.equal(volSummary.averagePerScheduledDay, 18);
  assert.equal(volSummary.targetStart, 15);
  assert.equal(volSummary.targetEnd, 30);
  assert.equal(volSummary.unit, 'min');

  // 3. Flexible weekly measured habit: 3x/wk, 20 pages/day
  const flexMeasured: Habit = {
    id: 41,
    name: 'Read',
    color: '#22C55E',
    weekdays: 0b1111111,
    weeklyTarget: 3,
    dailyTarget: 20,
    unit: 'pages',
    startDay: w2Mon,
    archivedAt: null,
    createdAt: 100,
    updatedAt: 200,
  };
  const flexCheckins: HabitCheckin[] = [
    { habitId: 41, dayIndex: w2Mon, done: true, value: 20, updatedAt: 1 },
    { habitId: 41, dayIndex: w2Tue, done: false, value: 12, updatedAt: 2 }, // partial doesn't satisfy quota!
  ];
  const flexStatus = TodayBoard.getFlexibleWeekStatus(flexMeasured, flexCheckins, w2Wed);
  assert.ok(flexStatus);
  assert.equal(flexStatus.doneInWeek, 1);
  assert.equal(flexStatus.remainingNeeded, 2);

  // Flexible weekly volume bucket target over W2 (full week 7 days -> 3 * 20 = 60)
  const flexVol = ChartsAnalytics.habitVolumeBuckets(
    flexMeasured,
    flexCheckins,
    w2Mon,
    w2Mon + 6,
    4
  );
  assert.equal(flexVol.length, 1);
  assert.equal(flexVol[0].actualTotal, 32); // 20 + 12 actual pages logged
  assert.equal(flexVol[0].targetTotal, 60); // 3 * 20
});

test('Primary analytics enhancements: previousPeriod, movingAvgRate, perfectDaysSummary, habitTrendDeltas, and volume target ratio', () => {
  // 1. DateRangeResolver.previousPeriod
  const prev7 = DateRangeResolver.previousPeriod('last_7', 100, 106);
  assert.ok(prev7);
  assert.equal(prev7.startDay, 93);
  assert.equal(prev7.endDay, 99);

  const novStart = CivilCalendar.fromLocalDate(2026, 11, 1);
  const novEnd = CivilCalendar.fromLocalDate(2026, 11, 30);
  const prevMonth = DateRangeResolver.previousPeriod('prev_month', novStart, novEnd);
  assert.ok(prevMonth);
  assert.equal(prevMonth.startDay, CivilCalendar.fromLocalDate(2026, 10, 1));
  assert.equal(prevMonth.endDay, CivilCalendar.fromLocalDate(2026, 10, 31));

  assert.equal(DateRangeResolver.previousPeriod('all_time', 0, 100), null);

  // 2. ChartsAnalytics moving average, perfect days, trend deltas + bonus count, volume achievement
  const mon = CivilCalendar.fromLocalDate(2026, 11, 2); // Monday
  const dailyMeasured: Habit = {
    id: 50,
    name: 'Focus',
    color: '#3B82F6',
    weekdays: 0b1111111,
    weeklyTarget: null,
    dailyTarget: 20,
    unit: 'min',
    startDay: mon,
    archivedAt: null,
    createdAt: 100,
    updatedAt: 200,
  };
  const flexHabit: Habit = {
    id: 51,
    name: 'Workout',
    color: '#22C55E',
    weekdays: 0b1111111,
    weeklyTarget: 2,
    startDay: mon,
    archivedAt: null,
    createdAt: 100,
    updatedAt: 200,
  };

  // Evaluate over 10 days (mon .. mon + 9):
  // First 5 days: dailyMeasured missed days 0..2, done days 3..4 (and flex done days 0,1,2 -> +1 bonus in week 1)
  // Second 5 days: dailyMeasured done days 5..9 (perfect streak ends at 5)
  const checkins: HabitCheckin[] = [
    { habitId: 50, dayIndex: mon + 3, done: true, value: 20, updatedAt: 1 },
    { habitId: 50, dayIndex: mon + 4, done: true, value: 20, updatedAt: 2 },
    { habitId: 50, dayIndex: mon + 5, done: true, value: 25, updatedAt: 3 },
    { habitId: 50, dayIndex: mon + 6, done: true, value: 20, updatedAt: 4 },
    { habitId: 50, dayIndex: mon + 7, done: true, value: 20, updatedAt: 5 },
    { habitId: 50, dayIndex: mon + 8, done: true, value: 20, updatedAt: 6 },
    { habitId: 50, dayIndex: mon + 9, done: true, value: 20, updatedAt: 7 },
    { habitId: 51, dayIndex: mon + 0, done: true, updatedAt: 8 },
    { habitId: 51, dayIndex: mon + 1, done: true, updatedAt: 9 },
    { habitId: 51, dayIndex: mon + 2, done: true, updatedAt: 10 }, // +1 bonus over weeklyTarget 2
  ];

  const trend = ChartsAnalytics.habitTrendBuckets([dailyMeasured], checkins, mon, mon + 9, 14);
  assert.equal(trend.length, 10);
  assert.equal(trend[0].movingAvgRate, 0);
  assert.equal(trend[4].movingAvgRate, 0.4); // 0,0,0,1,1 avg = 2/5 = 0.4
  assert.equal(trend[9].movingAvgRate, 1);

  const perfect = ChartsAnalytics.perfectDaysSummary(
    [dailyMeasured],
    checkins,
    mon,
    mon + 9,
    mon + 9
  );
  assert.equal(perfect.perfectDays, 7);
  assert.equal(perfect.scheduledDaysWithHabits, 10);
  assert.equal(perfect.currentPerfectStreak, 7);
  assert.equal(perfect.longestPerfectStreak, 7);

  const deltas = ChartsAnalytics.habitTrendDeltas(
    [dailyMeasured, flexHabit],
    checkins,
    mon,
    mon + 9,
    mon + 9
  );
  assert.equal(deltas.get(50)?.deltaPct, 60); // first 5d = 40%, second 5d = 100% -> +60%
  assert.equal(deltas.get(51)?.bonusCount, 1);

  const vol = ChartsAnalytics.summarizeHabitVolume(dailyMeasured, checkins, mon, mon + 9);
  assert.equal(vol.totalVolume, 145);
  assert.equal(vol.totalTargetVolume, 200);
  assert.equal(vol.volumeAchievementRate, 0.725);
});

test('AdvancedAnalytics computes bounce-back, at-risk, matrix, flex/measured, schedule impact, logging discipline, backlog flow, velocity/aging, repeatable, forecast, cross-domain, heatmap, and notes', () => {
  const w0Mon = CivilCalendar.fromLocalDate(2026, 11, 2); // Monday
  const w1Mon = w0Mon + 7;
  const w1Tue = w1Mon + 1;
  const w1Wed = w1Mon + 2;
  const w1Thu = w1Mon + 3;
  const w1Fri = w1Mon + 4;
  const w1Sat = w1Mon + 5;
  const todayDay = w1Sat;

  const fixedHabit: Habit = {
    id: 101,
    name: 'Morning Run',
    color: '#3B82F6',
    weekdays: 0b1111111,
    weeklyTarget: null,
    dailyTarget: 5,
    unit: 'km',
    startDay: w0Mon,
    archivedAt: null,
    createdAt: 1000,
    updatedAt: 2000,
    scheduleHistory: [
      { fromDay: w0Mon, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 3 },
      { fromDay: w1Mon, weekdays: 0b1111111, weeklyTarget: null, dailyTarget: 5 },
    ],
  };

  const flexHabit: Habit = {
    id: 102,
    name: 'Gym',
    color: '#22C55E',
    weekdays: 0b1111111,
    weeklyTarget: 2,
    startDay: w0Mon,
    archivedAt: null,
    createdAt: 1000,
    updatedAt: 2000,
  };

  const dayMidUtcMs = (d: number, hourUtc: number) =>
    Date.UTC(2026, 10, 2 + (d - w0Mon), hourUtc, 30, 0);

  // w0Mon..w0Sun (7 days): fixedHabit (target 3km) all 7 done -> 100%
  // w1Mon..todayDay (w1Sat, 6 days):
  //   w1Mon: done (6km, same-day morning 08:30 UTC)
  //   w1Tue: partial (2km, not done) -> miss #1
  //   w1Wed: missed -> miss #2 (chained miss!)
  //   w1Thu: missed -> miss #3 (chained miss!)
  //   w1Fri: missed -> miss #4
  //   todayDay (w1Sat): pending (not done yet)
  const checkins: HabitCheckin[] = [
    ...Array.from({ length: 7 }, (_, i) => ({
      habitId: 101,
      dayIndex: w0Mon + i,
      done: true,
      value: 3,
      updatedAt: dayMidUtcMs(w0Mon + i, 9), // morning same-day
    })),
    { habitId: 101, dayIndex: w1Mon, done: true, value: 6, updatedAt: dayMidUtcMs(w1Mon, 8) },
    { habitId: 101, dayIndex: w1Tue, done: false, value: 2, updatedAt: dayMidUtcMs(w1Tue, 18) },
    // Flex habit: w0 done 3 times (bonus 1), w1 done 1 time (so pending in forecast)
    { habitId: 102, dayIndex: w0Mon + 0, done: true, updatedAt: dayMidUtcMs(w0Mon, 19) }, // same-day evening
    { habitId: 102, dayIndex: w0Mon + 2, done: true, updatedAt: dayMidUtcMs(w0Mon + 3, 14) }, // retroactive!
    { habitId: 102, dayIndex: w0Mon + 4, done: true, updatedAt: dayMidUtcMs(w0Mon + 4, 20) },
    { habitId: 102, dayIndex: w1Tue, done: true, updatedAt: dayMidUtcMs(w1Tue, 19) },
  ];

  const notes: HabitNote[] = [
    { habitId: 101, dayIndex: w1Mon, text: 'Great #energy after sleep', updatedAt: 1 },
    { habitId: 101, dayIndex: w1Wed, text: 'Too tired after work', updatedAt: 2 },
    { habitId: 101, dayIndex: w1Thu, text: 'Still tired knees sore', updatedAt: 3 },
  ];

  const tasks: Task[] = [
    // Heavy task day on w1Thu (4 tasks due/done)
    {
      id: 1,
      title: 'T1',
      note: '',
      dueDay: w1Thu,
      done: true,
      status: 'done',
      completedDay: w1Thu,
      repeatable: false,
      createdAt: dayMidUtcMs(w1Mon, 10),
      updatedAt: dayMidUtcMs(w1Thu, 15),
      deletedAt: null,
    },
    {
      id: 2,
      title: 'T2',
      note: '',
      dueDay: w1Thu,
      done: true,
      status: 'done',
      completedDay: w1Fri,
      repeatable: false,
      createdAt: dayMidUtcMs(w1Tue, 10),
      updatedAt: dayMidUtcMs(w1Fri, 12),
      deletedAt: null,
    }, // 1d late
    {
      id: 3,
      title: 'T3',
      note: '',
      dueDay: w1Thu,
      done: false,
      status: 'not_done',
      completedDay: null,
      repeatable: false,
      createdAt: dayMidUtcMs(w1Wed, 10),
      updatedAt: dayMidUtcMs(w1Thu, 21),
      deletedAt: null,
    },
    {
      id: 4,
      title: 'T4',
      note: '',
      dueDay: w1Thu,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: false,
      createdAt: dayMidUtcMs(w1Wed, 10),
      updatedAt: dayMidUtcMs(w1Wed, 10),
      deletedAt: null,
    }, // overdue by 2d on w1Sat
    // Early finish & goal
    {
      id: 5,
      title: 'Early Task',
      note: '',
      dueDay: todayDay + 2,
      done: true,
      status: 'done',
      completedDay: w1Fri,
      repeatable: false,
      createdAt: dayMidUtcMs(w1Thu, 10),
      updatedAt: dayMidUtcMs(w1Fri, 10),
      deletedAt: null,
    }, // 3d early
    {
      id: 6,
      title: 'Open Goal',
      note: '',
      dueDay: null,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: false,
      createdAt: dayMidUtcMs(w0Mon, 10),
      updatedAt: dayMidUtcMs(w0Mon, 10),
      deletedAt: null,
    },
    // Repeatable tasks
    {
      id: 7,
      title: 'Pay bills',
      note: '',
      dueDay: w0Mon,
      done: true,
      status: 'done',
      completedDay: w0Mon,
      repeatable: true,
      createdAt: dayMidUtcMs(w0Mon, 9),
      updatedAt: dayMidUtcMs(w0Mon, 11),
      deletedAt: null,
    },
    {
      id: 8,
      title: 'Pay bills',
      note: '',
      dueDay: w1Mon,
      done: true,
      status: 'done',
      completedDay: w1Mon,
      repeatable: true,
      createdAt: dayMidUtcMs(w1Mon, 9),
      updatedAt: dayMidUtcMs(w1Mon, 11),
      deletedAt: null,
    },
  ];

  const snapshot: DomainSnapshot = {
    habits: [fixedHabit, flexHabit],
    checkins,
    notes,
    tasks,
  };

  const report = AdvancedAnalytics.compute({
    snapshot,
    targetHabits: [fixedHabit, flexHabit],
    startDay: w0Mon,
    endDay: todayDay,
    todayDay,
    timeZone: 'UTC',
  });

  // 1. Bounce-back: fixedHabit missed Tue->Wed->Thu->Fri = 3 chained misses, 0 recovered
  assert.equal(report.bounceBack.chainedMisses, 3);
  assert.equal(report.bounceBack.recoveredMisses, 0);
  assert.equal(report.bounceBack.bounceBackRate, 0);

  // 2. At-risk: fixedHabit has 4 trailing misses & drop from 100% -> <25%
  assert.equal(report.atRiskHabits.length, 1);
  assert.equal(report.atRiskHabits[0].habit.id, 101);
  assert.equal(report.atRiskHabits[0].consecutiveMisses, 4);
  assert.equal(report.atRiskHabits[0].reason, 'both');

  // 3. Habit x Weekday Matrix
  assert.equal(report.habitWeekdayMatrix.length, 2);
  assert.equal(report.habitWeekdayMatrix[0].cells.length, 7);

  // 4. Flexible insight
  assert.ok(report.flexibleInsight);
  assert.equal(report.flexibleInsight.bonusCheckins, 1);
  assert.equal(report.flexibleInsight.perfectWeeks, 1);

  // 5. Measured intensity: 7 exact (w0) + 1 overachieved (6>5 on w1Mon) + 1 partial (2/5 = 40% on w1Tue)
  assert.equal(report.measuredIntensity.length, 1);
  assert.equal(report.measuredIntensity[0].exactDays, 7);
  assert.equal(report.measuredIntensity[0].overachievedDays, 1);
  assert.equal(report.measuredIntensity[0].partialDays, 1);
  assert.equal(report.measuredIntensity[0].avgPartialPct, 40);
  assert.equal(report.measuredIntensity[0].bestDayValue, 6);
  assert.equal(report.measuredIntensity[0].bestDayIndex, w1Mon);

  // 6. Schedule change impact: w0 (100%) -> w1 (low %)
  assert.equal(report.scheduleImpacts.length, 1);
  assert.equal(report.scheduleImpacts[0].beforeRate, 1);
  assert.ok((report.scheduleImpacts[0].deltaPct ?? 0) < 0);

  // 7. Logging discipline (only done check-ins counted: 8 fixed + 4 flex = 12, 1 retroactive on flex w0+2)
  assert.equal(report.loggingDiscipline.totalDoneCheckins, 12);
  assert.equal(report.loggingDiscipline.retroactiveCount, 1);
  assert.equal(report.loggingDiscipline.sameDayCount, 11);

  // 8. Task velocity & aging + backlog flow
  assert.ok(report.backlogFlowBuckets.length >= 2);
  assert.equal(report.taskVelocity.lateTasksCount, 1);
  assert.equal(report.taskVelocity.maxLateDays, 1);
  assert.equal(report.taskVelocity.earlyTasksCount, 1);
  assert.equal(report.taskVelocity.avgDaysEarly, 3);
  assert.equal(report.taskVelocity.openOverdueCount, 1);
  assert.equal(report.taskVelocity.maxOverdueAgeDays, 2);
  assert.equal(report.taskVelocity.oldestOverdueTitle, 'T4');
  assert.equal(report.taskVelocity.openGoalsCount, 1);
  assert.equal(report.taskVelocity.oldestGoalTitle, 'Open Goal');

  // 9. Repeatable tasks
  assert.equal(report.repeatableTasks.length, 1);
  assert.equal(report.repeatableTasks[0].doneCount, 2);
  assert.equal(report.repeatableTasks[0].avgGapDays, 7);

  // 10. Forecast: next 7 days + 1 overdue carry-in
  assert.equal(report.workloadForecast.length, 7);
  assert.equal(report.overdueBacklogCount, 1);
  // Day 1 ahead is Sunday of w1 (todayDay + 1): fixedHabit (1) + flexHabit pending (1) = 2
  assert.equal(report.workloadForecast[0].fixedHabitsCount, 1);
  assert.equal(report.workloadForecast[0].flexHabitsPendingCount, 1);

  // 11. Cross-domain load: w1Thu had 4 tasks (heavy bucket)
  const heavy = report.crossDomainLoad.find((b) => b.id === 'heavy');
  assert.ok(heavy);
  assert.equal(heavy.daysCount, 1);

  // 12. Multi-mode heatmap
  assert.equal(report.multiHeatmap.totalTaskDone, 5);
  assert.equal(report.multiHeatmap.totalHabitDone, 12);

  // 13. Notes insights: 1 on done (w1Mon), 2 on missed (w1Wed, w1Thu), keyword 'tired' appears twice on missed days
  assert.equal(report.notesInsights.totalNotes, 3);
  assert.equal(report.notesInsights.notesOnDoneDays, 1);
  assert.equal(report.notesInsights.notesOnMissedDays, 2);
  const tiredKw = report.notesInsights.topKeywords.find((k) => k.word === 'tired');
  assert.ok(tiredKw);
  assert.equal(tiredKw.count, 2);
  assert.equal(tiredKw.missedCount, 2);
});

test('AdvancedAnalytics habitWeekdayMatrix distinguishes allowed vs off-schedule days for flexible habits', () => {
  const mon = CivilCalendar.fromLocalDate(2026, 11, 2); // Monday
  const sat = mon + 5; // Saturday (off-schedule)
  const monSatOnly: Habit = {
    id: 201,
    name: 'Weekday Flex',
    color: '#3B82F6',
    weekdays: 0b0011111, // Mon-Fri allowed, Sat-Sun off-schedule
    weeklyTarget: 3,
    startDay: mon,
    archivedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
  };
  const checkins: HabitCheckin[] = [
    { habitId: 201, dayIndex: mon, done: true, updatedAt: 1000 },
    { habitId: 201, dayIndex: sat, done: true, updatedAt: 2000 }, // off-schedule check-in
  ];
  const snapshot: DomainSnapshot = {
    habits: [monSatOnly],
    checkins,
    notes: [],
    tasks: [],
  };

  const fullWeek = AdvancedAnalytics.compute({
    snapshot,
    targetHabits: [monSatOnly],
    startDay: mon,
    endDay: mon + 6,
    todayDay: mon + 6,
    timeZone: 'UTC',
  });

  const row = fullWeek.habitWeekdayMatrix[0];
  assert.equal(row.isFlexible, true);
  for (const cell of row.cells) {
    assert.equal(cell.scheduledCount, 0);
    assert.equal(cell.rate, null);
  }
  assert.equal(row.cells[0].doneCount, 1); // Mon
  assert.equal(row.cells[0].isOffSchedule, false);
  assert.equal(row.cells[1].doneCount, 0); // Tue (allowed, 0 completions)
  assert.equal(row.cells[1].isOffSchedule, false);
  assert.equal(row.cells[5].doneCount, 1); // Sat (off-schedule, 1 completion)
  assert.equal(row.cells[5].isOffSchedule, true);
  assert.equal(row.cells[6].doneCount, 0); // Sun (off-schedule, 0 completions)
  assert.equal(row.cells[6].isOffSchedule, true);

  // Even in a 1-day range (Monday), Tue-Fri remain allowed and Sat-Sun remain off-schedule
  const singleDay = AdvancedAnalytics.compute({
    snapshot,
    targetHabits: [monSatOnly],
    startDay: mon,
    endDay: mon,
    todayDay: mon,
    timeZone: 'UTC',
  });
  const singleRow = singleDay.habitWeekdayMatrix[0];
  assert.equal(singleRow.cells[1].isOffSchedule, false);
  assert.equal(singleRow.cells[5].isOffSchedule, true);
});

test('Helpers.formatByteSize scales across B, KB, MB, and GB cleanly', () => {
  assert.equal(Helpers.formatByteSize(undefined), '—');
  assert.equal(Helpers.formatByteSize(Number.NaN), '—');
  assert.equal(Helpers.formatByteSize(Number.POSITIVE_INFINITY), '—');
  assert.equal(Helpers.formatByteSize(-10), '—');

  assert.equal(Helpers.formatByteSize(0), '0 B');
  assert.equal(Helpers.formatByteSize(512), '512 B');
  assert.equal(Helpers.formatByteSize(1023), '1023 B');

  assert.equal(Helpers.formatByteSize(1024), '1 KB');
  assert.equal(Helpers.formatByteSize(1536), '1.5 KB');
  assert.equal(Helpers.formatByteSize(12800), '12.5 KB');
  // Avoid displaying 1024.0 KB due to rounding just below 1 MB
  assert.equal(Helpers.formatByteSize(1024 * 1024 - 10), '1 MB');

  assert.equal(Helpers.formatByteSize(1024 * 1024), '1 MB');
  assert.equal(Helpers.formatByteSize(1.25 * 1024 * 1024), '1.25 MB');
  assert.equal(Helpers.formatByteSize(1.5 * 1024 * 1024), '1.5 MB');
  assert.equal(Helpers.formatByteSize(1024 * 1024 * 1024 - 100), '1 GB');

  assert.equal(Helpers.formatByteSize(1024 * 1024 * 1024), '1 GB');
  assert.equal(Helpers.formatByteSize(2.45 * 1024 * 1024 * 1024), '2.45 GB');
});

test('ChartsAnalytics.perfectDaysSummary preserves prior streak while todayDay is partially completed', () => {
  const start = CivilCalendar.fromLocalDate(2026, 11, 20);
  const today = CivilCalendar.fromLocalDate(2026, 11, 25);
  const habits: Habit[] = [
    {
      id: 1,
      name: 'Habit A',
      color: '#3B82F6',
      weekdays: 0b1111111,
      weeklyTarget: null,
      startDay: start,
      archivedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 2,
      name: 'Habit B',
      color: '#22C55E',
      weekdays: 0b1111111,
      weeklyTarget: null,
      startDay: start,
      archivedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ];

  const baseCheckins: HabitCheckin[] = [];
  for (let d = start; d < today; d++) {
    baseCheckins.push({ habitId: 1, dayIndex: d, done: true, updatedAt: 1 });
    baseCheckins.push({ habitId: 2, dayIndex: d, done: true, updatedAt: 1 });
  }

  // 0 of 2 done today -> preserves 5d perfect streak
  const morning = ChartsAnalytics.perfectDaysSummary(habits, baseCheckins, start, today, today);
  assert.equal(morning.perfectDays, 5);
  assert.equal(morning.currentPerfectStreak, 5);

  // 1 of 2 done today -> still in progress, preserves 5d perfect streak
  const midDay = ChartsAnalytics.perfectDaysSummary(
    habits,
    [...baseCheckins, { habitId: 1, dayIndex: today, done: true, updatedAt: 2 }],
    start,
    today,
    today
  );
  assert.equal(midDay.perfectDays, 5);
  assert.equal(midDay.currentPerfectStreak, 5);

  // 2 of 2 done today -> extends streak to 6d
  const completedToday = ChartsAnalytics.perfectDaysSummary(
    habits,
    [
      ...baseCheckins,
      { habitId: 1, dayIndex: today, done: true, updatedAt: 2 },
      { habitId: 2, dayIndex: today, done: true, updatedAt: 3 },
    ],
    start,
    today,
    today
  );
  assert.equal(completedToday.perfectDays, 6);
  assert.equal(completedToday.currentPerfectStreak, 6);

  // Incomplete past day (e.g. viewing a range ending before today) resets currentPerfectStreak to 0
  const pastIncomplete = ChartsAnalytics.perfectDaysSummary(
    habits,
    [...baseCheckins, { habitId: 1, dayIndex: today, done: true, updatedAt: 2 }],
    start,
    today,
    today + 1
  );
  assert.equal(pastIncomplete.currentPerfectStreak, 0);

  // Streak extending prior to range startDay (like Best Current Streak) while period rate stays scoped to [s..e]
  const earlierStart = start - 5;
  const extendedHabits = habits.map((h) => ({ ...h, startDay: earlierStart }));
  const extendedCheckins = [...baseCheckins];
  for (let d = earlierStart; d < start; d++) {
    extendedCheckins.push({ habitId: 1, dayIndex: d, done: true, updatedAt: 1 });
    extendedCheckins.push({ habitId: 2, dayIndex: d, done: true, updatedAt: 1 });
  }
  const windowed = ChartsAnalytics.perfectDaysSummary(
    extendedHabits,
    extendedCheckins,
    start,
    today,
    today
  );
  assert.equal(windowed.perfectDays, 5);
  assert.equal(windowed.scheduledDaysWithHabits, 6);
  assert.equal(windowed.currentPerfectStreak, 10);
  assert.equal(windowed.longestPerfectStreak, 10);
});

test('Utils edge cases: CivilCalendar labels/parsing, DateRangeResolver custom inversion, HabitAppearance invalid inputs, and empty analytics', () => {
  const day = CivilCalendar.fromLocalDate(2026, 2, 28);
  assert.equal(CivilCalendar.weekdayShortLabel(0), 'Mon');
  assert.equal(CivilCalendar.weekdayShortLabel(99), '');
  assert.equal(CivilCalendar.weekdayFullLabel(6), 'Sunday');
  assert.equal(CivilCalendar.weekdayFullLabel(-1), '');
  assert.equal(CivilCalendar.formatShortDate(day), 'Feb 28');
  assert.equal(CivilCalendar.formatShortDateWithYear(day), 'Feb 28, 2026');
  assert.match(CivilCalendar.formatFullDate(day), /Feb 28, 2026/);
  assert.equal(CivilCalendar.formatMonthYear(2026, 2), 'February 2026');
  assert.equal(CivilCalendar.toInputDateValue(day), '2026-02-28');
  assert.equal(CivilCalendar.fromInputDateValue('2026-02-28'), day);
  assert.equal(CivilCalendar.fromInputDateValue('invalid'), null);
  assert.equal(CivilCalendar.fromInputDateValue('2026-13-01'), null);
  assert.equal(CivilCalendar.countScheduledDays(0), 0);
  assert.equal(CivilCalendar.countScheduledInRange(0, day, day + 5), 0);
  assert.equal(CivilCalendar.countScheduledInRange(127, day + 5, day), 0);

  // DateRangeResolver custom inversion & previousPeriod null for all_time
  const custom = DateRangeResolver.resolve('custom', day, {
    customStartDay: day + 5,
    customEndDay: day - 10,
  });
  assert.equal(custom.startDay, day - 10);
  assert.equal(custom.endDay, day + 5);
  assert.equal(DateRangeResolver.previousPeriod('all_time', day - 30, day), null);

  // HabitAppearance fallbacks
  assert.equal(HabitAppearance.normalizeHex('not-hex'), null);
  const parsedFallback = HabitAppearance.parse('not-valid');
  assert.equal(parsedFallback.badge.kind, 'none');
  assert.equal(HabitAppearance.getContrastTextColor('#FFFFFF'), '#0A0B0E');
  assert.equal(HabitAppearance.getContrastTextColor('#000000'), '#FFFFFF');

  // Empty snapshot analytics across StreakCalculator, ChartsAnalytics, AdvancedAnalytics
  const emptySnap: DomainSnapshot = { habits: [], checkins: [], notes: [], tasks: [] };
  const emptyPerfect = ChartsAnalytics.perfectDaysSummary([], [], day - 6, day, day);
  assert.equal(emptyPerfect.scheduledDaysWithHabits, 0);
  assert.equal(emptyPerfect.perfectRate, null);

  const emptyAdv = AdvancedAnalytics.compute({
    snapshot: emptySnap,
    targetHabits: [],
    startDay: day - 6,
    endDay: day,
    todayDay: day,
    timeZone: 'UTC',
  });
  assert.equal(emptyAdv.bounceBack.bounceBackRate, null);
  assert.equal(emptyAdv.loggingDiscipline.retroactiveRate, null);
  assert.deepEqual(emptyAdv.atRiskHabits, []);
  assert.deepEqual(emptyAdv.notesInsights.entries, []);
});

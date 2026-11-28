import { Accessor, createMemo } from 'solid-js';
import { DomainSnapshot, Habit } from '../../types/domain';
import { AdvancedAnalytics, AdvancedAnalyticsReport } from '../../utils/advanced-analytics';
import { ChartsAnalytics } from '../../utils/charts-analytics';
import { CivilCalendar } from '../../utils/civil-calendar';
import {
  DateRangePresetId,
  DateRangeResolver,
  DayCellClassifier,
  DayCellTone,
} from '../../utils/date-range';
import { StreakCalculator, StreakUnit } from '../../utils/streak-calculator';
import { TaskAnalytics } from '../../utils/task-analytics';
import { createLazyActiveMemo } from '../lazy-memo';
import { PeriodComparisonView } from './HistoryChartsPanel';

export interface HistorySummaryReport {
  currentStreak: number;
  currentStreakUnit: StreakUnit;
  longestStreak: number;
  longestStreakUnit: StreakUnit;
  completionRate: number;
  scheduledDays: number;
  completedScheduledDays: number;
  missedScheduledDays: number;
}

export interface HistoryHeatmapData {
  weeks: {
    weekStart: number;
    monthLabel: string;
    days: {
      dayIndex: number;
      inRange: boolean;
      done: number;
      scheduled: number;
      tone: DayCellTone;
    }[];
  }[];
  totalDone: number;
  clampedStart: number;
  effectiveEnd: number;
  isCapped: boolean;
}

export interface HistoryChartsReport {
  perfectDays: ReturnType<typeof ChartsAnalytics.perfectDaysSummary>;
  prevComparison: PeriodComparisonView | null;
  habitTrends: ReturnType<typeof ChartsAnalytics.habitTrendDeltas>;
  taskSummary: ReturnType<typeof TaskAnalytics.summarizeRange>;
  taskOutcomeBuckets: ReturnType<typeof TaskAnalytics.rangeOutcomeBuckets>;
  habitBreakdown: ReturnType<typeof StreakCalculator.summarizeHabitsForRange>;
  heatmapData: HistoryHeatmapData;
}

export interface HistorySelectorInput {
  isActive: Accessor<boolean>;
  snapshot: Accessor<DomainSnapshot>;
  habitFilter: Accessor<'all' | number[]>;
  rangePreset: Accessor<DateRangePresetId>;
  customStartDay: Accessor<number>;
  customEndDay: Accessor<number>;
  todayDay: Accessor<number>;
  timeZone: Accessor<string>;
}

interface ResolvedHistoryInputs {
  snapshot: DomainSnapshot;
  targetHabits: Habit[];
  rangePreset: DateRangePresetId;
  startDay: number;
  endDay: number;
  todayDay: number;
  timeZone: string;
}

function resolveHistoryInputs(input: HistorySelectorInput): ResolvedHistoryInputs {
  const snapshot = input.snapshot();
  const todayDay = input.todayDay();
  const timeZone = input.timeZone();
  const rangePreset = input.rangePreset();
  const resolved = DateRangeResolver.resolve(rangePreset, todayDay, {
    customStartDay: input.customStartDay(),
    customEndDay: input.customEndDay(),
    snapshot,
    timeZone,
  });
  const endDay = Math.min(resolved.endDay, todayDay);
  const startDay = Math.min(resolved.startDay, endDay);
  const filter = input.habitFilter();
  let targetHabits = snapshot.habits;
  if (filter !== 'all') {
    const allowed = new Set(filter);
    targetHabits = snapshot.habits.filter((h) => allowed.has(h.id));
  }
  return { snapshot, targetHabits, rangePreset, startDay, endDay, todayDay, timeZone };
}

function trackHistoryDeps(
  input: HistorySelectorInput,
  habitFilterKey: Accessor<string>
): () => void {
  return () => {
    input.snapshot();
    habitFilterKey();
    const preset = input.rangePreset();
    if (preset === 'custom') {
      input.customStartDay();
      input.customEndDay();
    }
    input.todayDay();
    input.timeZone();
  };
}

function computeHistorySummary(ctx: ResolvedHistoryInputs): HistorySummaryReport {
  const habits = ctx.targetHabits;
  if (habits.length === 0) {
    return {
      currentStreak: 0,
      currentStreakUnit: 'days',
      longestStreak: 0,
      longestStreakUnit: 'days',
      completionRate: 0,
      scheduledDays: 0,
      completedScheduledDays: 0,
      missedScheduledDays: 0,
    };
  }

  let bestCurrent = 0;
  let bestCurrentEquiv = -1;
  let bestCurrentUnit: StreakUnit = 'days';
  let bestLongest = 0;
  let bestLongestEquiv = -1;
  let bestLongestUnit: StreakUnit = 'days';
  let totalScheduled = 0;
  let totalCompleted = 0;
  const allowPending = ctx.endDay >= ctx.todayDay;

  for (const habit of habits) {
    const m = StreakCalculator.calculate(
      habit,
      ctx.snapshot.checkins,
      ctx.startDay,
      ctx.endDay,
      allowPending
    );
    const currEquiv = m.streakUnit === 'weeks' ? m.currentStreak * 7 : m.currentStreak;
    if (currEquiv > bestCurrentEquiv) {
      bestCurrentEquiv = currEquiv;
      bestCurrent = m.currentStreak;
      bestCurrentUnit = m.streakUnit;
    }
    const longEquiv = m.streakUnit === 'weeks' ? m.longestStreak * 7 : m.longestStreak;
    if (longEquiv > bestLongestEquiv) {
      bestLongestEquiv = longEquiv;
      bestLongest = m.longestStreak;
      bestLongestUnit = m.streakUnit;
    }
    totalScheduled += m.scheduledDays;
    totalCompleted += m.completedScheduledDays;
  }

  return {
    currentStreak: bestCurrent,
    currentStreakUnit: bestCurrentUnit,
    longestStreak: bestLongest,
    longestStreakUnit: bestLongestUnit,
    completionRate: totalScheduled === 0 ? 0 : totalCompleted / totalScheduled,
    scheduledDays: totalScheduled,
    completedScheduledDays: totalCompleted,
    missedScheduledDays: Math.max(0, totalScheduled - totalCompleted),
  };
}

function computeHeatmapData(ctx: ResolvedHistoryInputs): HistoryHeatmapData {
  const effectiveEnd = ctx.endDay;
  const effectiveStart = ctx.startDay;
  const maxWeeks = 104;
  const minAllowedStart = effectiveEnd - (maxWeeks * 7 - 1);
  const clampedStart = Math.max(effectiveStart, minAllowedStart);
  const isCapped = clampedStart > effectiveStart;

  const firstWeekStart = CivilCalendar.startOfWeek(clampedStart);
  const endWeekStart = CivilCalendar.startOfWeek(effectiveEnd);
  const weeksCount = Math.max(1, Math.floor((endWeekStart - firstWeekStart) / 7) + 1);
  const dayStats = StreakCalculator.getPeriodDayStats(
    ctx.targetHabits,
    ctx.snapshot.checkins,
    clampedStart,
    effectiveEnd,
    ctx.todayDay
  );

  const weeks: HistoryHeatmapData['weeks'] = [];
  let lastMonth = -1;
  let totalDone = 0;

  for (let w = 0; w < weeksCount; w++) {
    const weekStart = firstWeekStart + w * 7;
    const startLocal = CivilCalendar.toLocalDate(weekStart);
    let monthLabel = '';
    if (startLocal.month !== lastMonth) {
      const shortMonth = CivilCalendar.formatShortDate(weekStart).split(' ')[0];
      if (w === 0 && weeksCount > 4) {
        const nextLocal = CivilCalendar.toLocalDate(weekStart + 7);
        if (nextLocal.month === startLocal.month) {
          monthLabel = shortMonth;
        }
      } else {
        monthLabel = shortMonth;
      }
      lastMonth = startLocal.month;
    }

    const days: HistoryHeatmapData['weeks'][number]['days'] = [];
    for (let d = 0; d < 7; d++) {
      const dayIndex = weekStart + d;
      if (dayIndex < clampedStart || dayIndex > effectiveEnd) {
        days.push({
          dayIndex,
          inRange: false,
          done: 0,
          scheduled: 0,
          tone: 'future',
        });
        continue;
      }
      const entry = dayStats.get(dayIndex);
      const scheduled = entry?.scheduled ?? 0;
      const done = entry?.done ?? 0;
      totalDone += done;
      const tone = DayCellClassifier.classify(dayIndex, ctx.todayDay, scheduled, done);
      days.push({ dayIndex, inRange: true, done, scheduled, tone });
    }
    weeks.push({ weekStart, monthLabel, days });
  }

  return { weeks, totalDone, clampedStart, effectiveEnd, isCapped };
}

export function createHistorySummarySelector(
  input: HistorySelectorInput
): Accessor<HistorySummaryReport | null> {
  const habitFilterKey = createMemo(() => {
    const filter = input.habitFilter();
    return filter === 'all' ? 'all' : filter.join(',');
  });

  return createLazyActiveMemo(input.isActive, trackHistoryDeps(input, habitFilterKey), () =>
    computeHistorySummary(resolveHistoryInputs(input))
  );
}

export function createHistoryChartsSelector(
  input: HistorySelectorInput & { summary?: Accessor<HistorySummaryReport | null> }
): Accessor<HistoryChartsReport | null> {
  const habitFilterKey = createMemo(() => {
    const filter = input.habitFilter();
    return filter === 'all' ? 'all' : filter.join(',');
  });

  return createLazyActiveMemo(input.isActive, trackHistoryDeps(input, habitFilterKey), () => {
    const ctx = resolveHistoryInputs(input);
    const curHabitsSummary = input.summary?.() ?? computeHistorySummary(ctx);

    const perfectDays = ChartsAnalytics.perfectDaysSummary(
      ctx.targetHabits,
      ctx.snapshot.checkins,
      ctx.startDay,
      ctx.endDay,
      ctx.todayDay
    );
    const habitTrends = ChartsAnalytics.habitTrendDeltas(
      ctx.targetHabits,
      ctx.snapshot.checkins,
      ctx.startDay,
      ctx.endDay,
      ctx.todayDay
    );
    const habitBreakdown = StreakCalculator.summarizeHabitsForRange(
      ctx.targetHabits,
      ctx.snapshot.checkins,
      ctx.startDay,
      ctx.endDay,
      ctx.todayDay
    );
    const taskSummary = TaskAnalytics.summarizeRange(
      ctx.snapshot.tasks,
      ctx.startDay,
      ctx.endDay,
      ctx.timeZone
    );
    const taskOutcomeBuckets = TaskAnalytics.rangeOutcomeBuckets(
      ctx.snapshot.tasks,
      ctx.startDay,
      ctx.endDay,
      12,
      ctx.timeZone
    );
    const heatmapData = computeHeatmapData(ctx);

    let prevComparison: PeriodComparisonView | null = null;
    const prev = DateRangeResolver.previousPeriod(ctx.rangePreset, ctx.startDay, ctx.endDay);
    if (prev) {
      let prevScheduled = 0;
      let prevCompleted = 0;
      for (const h of ctx.targetHabits) {
        const m = StreakCalculator.calculate(
          h,
          ctx.snapshot.checkins,
          prev.startDay,
          prev.endDay,
          false
        );
        prevScheduled += m.scheduledDays;
        prevCompleted += m.completedScheduledDays;
      }

      const habitRateDeltaPct =
        prevScheduled > 0 && curHabitsSummary.scheduledDays > 0
          ? Math.round((curHabitsSummary.completionRate - prevCompleted / prevScheduled) * 100)
          : null;

      const prevTasks = TaskAnalytics.summarizeRange(
        ctx.snapshot.tasks,
        prev.startDay,
        prev.endDay,
        ctx.timeZone
      );
      const taskDoneDelta =
        prevTasks.doneCount > 0 || taskSummary.doneCount > 0
          ? taskSummary.doneCount - prevTasks.doneCount
          : null;
      const taskRateDeltaPct =
        prevTasks.completionRate !== null && taskSummary.completionRate !== null
          ? Math.round((taskSummary.completionRate - prevTasks.completionRate) * 100)
          : null;

      prevComparison = {
        prevLabel: prev.label,
        habitRateDeltaPct,
        taskDoneDelta,
        taskRateDeltaPct,
      };
    }

    return {
      perfectDays,
      prevComparison,
      habitTrends,
      taskSummary,
      taskOutcomeBuckets,
      habitBreakdown,
      heatmapData,
    };
  });
}

export function createAdvancedReportSelector(
  input: HistorySelectorInput
): Accessor<AdvancedAnalyticsReport | null> {
  const habitFilterKey = createMemo(() => {
    const filter = input.habitFilter();
    return filter === 'all' ? 'all' : filter.join(',');
  });

  return createLazyActiveMemo(input.isActive, trackHistoryDeps(input, habitFilterKey), () => {
    const ctx = resolveHistoryInputs(input);
    return AdvancedAnalytics.compute({
      snapshot: ctx.snapshot,
      targetHabits: ctx.targetHabits,
      startDay: ctx.startDay,
      endDay: ctx.endDay,
      todayDay: ctx.todayDay,
      timeZone: ctx.timeZone,
    });
  });
}

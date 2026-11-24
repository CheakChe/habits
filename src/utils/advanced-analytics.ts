import { DomainSnapshot, Habit, HabitCheckin, HabitNote, Task, TaskStatus } from '../types/domain';
import { CivilCalendar } from './civil-calendar';
import { DayCellTone } from './date-range';
import { HabitSchedule } from './habit-schedule';
import { StreakCalculator } from './streak-calculator';

export type AdvancedHeatmapMode = 'habits' | 'tasks' | 'combined';
export type AdvancedNotesFilter = 'all' | 'missed' | 'done';

export interface BounceBackSummary {
  totalMissesEvaluated: number;
  recoveredMisses: number;
  chainedMisses: number;
  bounceBackRate: number | null;
}

export interface AtRiskHabitItem {
  habit: Habit;
  recentRate: number;
  baselineRate: number | null;
  dropPct: number | null;
  consecutiveMisses: number;
  reason: 'drop' | 'miss_streak' | 'both';
}

export interface HabitWeekdayMatrixCell {
  weekdayBit: number;
  scheduledCount: number;
  doneCount: number;
  rate: number | null;
  isOffSchedule: boolean;
}

export interface HabitWeekdayMatrixRow {
  habit: Habit;
  isFlexible: boolean;
  cells: HabitWeekdayMatrixCell[];
  overallRate: number;
}

export interface FlexibleHabitsInsight {
  flexibleHabitsCount: number;
  totalWeeks: number;
  perfectWeeks: number;
  perfectWeeksRate: number | null;
  bonusCheckins: number;
  weekdayDistribution: {
    weekdayBit: number;
    label: string;
    count: number;
    share: number;
  }[];
}

export interface MeasuredIntensityItem {
  habit: Habit;
  unit: string | null;
  partialDays: number;
  exactDays: number;
  overachievedDays: number;
  totalLoggedDays: number;
  avgPartialPct: number | null;
  bestDayValue: number;
  bestDayIndex: number | null;
}

export interface ScheduleImpactItem {
  habit: Habit;
  changeDay: number;
  beforeLabel: string;
  afterLabel: string;
  beforeRate: number | null;
  afterRate: number | null;
  beforeScheduled: number;
  afterScheduled: number;
  deltaPct: number | null;
}

export interface LoggingDisciplineStats {
  totalDoneCheckins: number;
  sameDayCount: number;
  retroactiveCount: number;
  earlyOrOtherCount: number;
  retroactiveRate: number | null;
  timeOfDayBuckets: {
    id: 'morning' | 'afternoon' | 'evening' | 'night';
    label: string;
    hoursLabel: string;
    count: number;
    share: number;
  }[];
}

export interface BacklogFlowBucket {
  key: string;
  label: string;
  shortLabel: string;
  createdCount: number;
  doneCount: number;
  notDoneCount: number;
  archivedCount: number;
  closedCount: number;
  netFlow: number;
}

export interface TaskVelocityAndAging {
  totalCreatedInRange: number;
  totalClosedInRange: number;
  netBacklogDelta: number;
  lateTasksCount: number;
  avgLateDays: number | null;
  medianLateDays: number | null;
  maxLateDays: number;
  earlyTasksCount: number;
  avgDaysEarly: number | null;
  datedCycleTimeAvgDays: number | null;
  datedCycleCount: number;
  goalsCycleTimeAvgDays: number | null;
  goalsCycleCount: number;
  openOverdueCount: number;
  avgOverdueAgeDays: number | null;
  maxOverdueAgeDays: number;
  oldestOverdueTitle: string | null;
  openGoalsCount: number;
  avgGoalAgeDays: number | null;
  oldestGoalTitle: string | null;
}

export interface RepeatableTaskStat {
  title: string;
  doneCount: number;
  notDoneCount: number;
  openCount: number;
  archivedCount: number;
  lastDoneDay: number | null;
  avgGapDays: number | null;
}

export interface WorkloadForecastDay {
  dayIndex: number;
  label: string;
  shortLabel: string;
  weekdayLabel: string;
  fixedHabitsCount: number;
  flexHabitsPendingCount: number;
  tasksDueCount: number;
  totalLoad: number;
}

export interface CrossDomainLoadBucket {
  id: 'light' | 'medium' | 'heavy';
  label: string;
  taskCountLabel: string;
  daysCount: number;
  scheduledCount: number;
  doneCount: number;
  habitRate: number | null;
  perfectDaysCount: number;
}

export interface MultiModeHeatmapCell {
  dayIndex: number;
  inRange: boolean;
  habitsDone: number;
  habitsScheduled: number;
  tasksDone: number;
  tasksNotDone: number;
  tasksDueOpen: number;
  habitTone: DayCellTone;
  taskTone: DayCellTone;
  combinedTone: DayCellTone;
}

export interface MultiModeHeatmapData {
  weeks: {
    weekStart: number;
    monthLabel: string;
    days: MultiModeHeatmapCell[];
  }[];
  clampedStart: number;
  effectiveEnd: number;
  isCapped: boolean;
  totalTaskDone: number;
  totalHabitDone: number;
}

export interface NoteInsightEntry {
  habitId: number;
  habitName: string;
  habitColor: string;
  dayIndex: number;
  text: string;
  status: 'done' | 'missed' | 'unscheduled';
}

export interface NoteKeywordStat {
  word: string;
  count: number;
  missedCount: number;
  doneCount: number;
}

export interface NotesInsightsSummary {
  totalNotes: number;
  notesOnDoneDays: number;
  notesOnMissedDays: number;
  notesOnUnscheduledDays: number;
  topKeywords: NoteKeywordStat[];
  entries: NoteInsightEntry[];
}

export interface AdvancedAnalyticsReport {
  bounceBack: BounceBackSummary;
  atRiskHabits: AtRiskHabitItem[];
  habitWeekdayMatrix: HabitWeekdayMatrixRow[];
  flexibleInsight: FlexibleHabitsInsight | null;
  measuredIntensity: MeasuredIntensityItem[];
  scheduleImpacts: ScheduleImpactItem[];
  loggingDiscipline: LoggingDisciplineStats;
  backlogFlowBuckets: BacklogFlowBucket[];
  taskVelocity: TaskVelocityAndAging;
  repeatableTasks: RepeatableTaskStat[];
  workloadForecast: WorkloadForecastDay[];
  overdueBacklogCount: number;
  crossDomainLoad: CrossDomainLoadBucket[];
  multiHeatmap: MultiModeHeatmapData;
  notesInsights: NotesInsightsSummary;
}

const STOP_WORDS = new Set([
  // English
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'has',
  'had',
  'was',
  'were',
  'are',
  'but',
  'not',
  'you',
  'your',
  'all',
  'can',
  'just',
  'very',
  'more',
  'out',
  'too',
  'day',
  'days',
  'today',
  'did',
  'done',
  'into',
  'after',
  'before',
  'about',
  'only',
  'then',
  'than',
  'when',
  'what',
  'why',
  'how',
  'some',
  'much',
  // Russian
  'это',
  'как',
  'так',
  'для',
  'что',
  'или',
  'при',
  'без',
  'под',
  'над',
  'про',
  'уже',
  'еще',
  'ещё',
  'был',
  'была',
  'были',
  'было',
  'быть',
  'все',
  'всё',
  'очень',
  'только',
  'день',
  'дня',
  'дней',
  'сегодня',
  'вчера',
  'после',
  'перед',
  'если',
  'когда',
  'чтобы',
  'меня',
  'мне',
  'мой',
  'моя',
  'мои',
  'свой',
  'своя',
  'него',
  'неё',
  'них',
  'тоже',
  'тут',
  'там',
  'раз',
  'два',
  'три',
  'надо',
  'нужно',
  'можно',
  'нет',
  'даже',
]);

function resolveTaskStatus(task: Task): TaskStatus {
  if (
    task.status === 'open' ||
    task.status === 'done' ||
    task.status === 'not_done' ||
    task.status === 'archived'
  ) {
    return task.status;
  }
  return task.done ? 'done' : 'open';
}

function getHourInTimeZone(timestampMs: number, timeZone?: string): number {
  const d = new Date(timestampMs);
  if (!timeZone || timeZone === 'local') {
    return d.getHours();
  }
  if (timeZone.toUpperCase() === 'UTC') {
    return d.getUTCHours();
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const raw = Number(parts.find((p) => p.type === 'hour')?.value);
    if (Number.isFinite(raw)) {
      return raw === 24 ? 0 : raw;
    }
  } catch {
    // fallback below
  }
  return d.getUTCHours();
}

function describeScheduleVersion(
  weekdays: number,
  weeklyTarget: number | null,
  dailyTarget: number | null,
  unit?: string | null
): string {
  const freq =
    weeklyTarget !== null
      ? `${weeklyTarget}×/wk`
      : weekdays === 0x7f
        ? 'Daily'
        : `${CivilCalendar.countScheduledDays(weekdays)}d/wk`;
  if (dailyTarget !== null) {
    const u = unit ? ` ${unit}` : '';
    return `${freq} · ${HabitSchedule.formatNumericValue(dailyTarget)}${u}`;
  }
  return freq;
}

function classifyRatioTone(
  dayIndex: number,
  todayDay: number,
  total: number,
  done: number,
  hasAnyActivity: boolean
): DayCellTone {
  if (dayIndex > todayDay) return 'future';
  if (total <= 0) return hasAnyActivity ? 'complete' : 'unscheduled';
  if (done >= total) return 'complete';
  if (dayIndex === todayDay && done === 0) return 'today-open';
  if (done <= 0) return 'missed-all';
  const ratio = done / total;
  if (ratio < 0.35) return 'missed-heavy';
  if (ratio < 0.7) return 'missed-moderate';
  return 'missed-slight';
}

export class AdvancedAnalytics {
  public static compute(params: {
    snapshot: DomainSnapshot;
    targetHabits: Habit[];
    startDay: number;
    endDay: number;
    todayDay: number;
    timeZone: string;
  }): AdvancedAnalyticsReport {
    const { snapshot, targetHabits, todayDay, timeZone } = params;
    const s = Math.min(params.startDay, params.endDay);
    const e = Math.min(Math.max(params.startDay, params.endDay), todayDay);

    const targetHabitIds = new Set(targetHabits.map((h) => h.id));
    const checkinMap = new Map<string, HabitCheckin>();
    const doneByHabit = new Map<number, Set<number>>();

    for (const c of snapshot.checkins) {
      checkinMap.set(`${c.habitId}:${c.dayIndex}`, c);
    }
    for (const h of targetHabits) {
      const doneSet = new Set<number>();
      for (const c of snapshot.checkins) {
        if (c.habitId === h.id && HabitSchedule.isCheckinDoneForDay(h, c, c.dayIndex)) {
          doneSet.add(c.dayIndex);
        }
      }
      doneByHabit.set(h.id, doneSet);
    }

    const bounceBack = AdvancedAnalytics.computeBounceBack(
      targetHabits,
      doneByHabit,
      s,
      e,
      todayDay
    );
    const atRiskHabits = AdvancedAnalytics.computeAtRiskHabits(
      targetHabits,
      snapshot.checkins,
      doneByHabit,
      s,
      e,
      todayDay
    );
    const habitWeekdayMatrix = AdvancedAnalytics.computeHabitWeekdayMatrix(
      targetHabits,
      snapshot.checkins,
      doneByHabit,
      s,
      e,
      todayDay
    );
    const flexibleInsight = AdvancedAnalytics.computeFlexibleInsight(
      targetHabits,
      doneByHabit,
      s,
      e,
      todayDay
    );
    const measuredIntensity = AdvancedAnalytics.computeMeasuredIntensity(
      targetHabits,
      snapshot.checkins,
      s,
      e
    );
    const scheduleImpacts = AdvancedAnalytics.computeScheduleImpacts(
      targetHabits,
      snapshot.checkins,
      s,
      e,
      todayDay
    );
    const loggingDiscipline = AdvancedAnalytics.computeLoggingDiscipline(
      targetHabits,
      targetHabitIds,
      snapshot.checkins,
      s,
      e,
      timeZone
    );
    const backlogFlowBuckets = AdvancedAnalytics.computeBacklogFlowBuckets(
      snapshot.tasks,
      s,
      e,
      12,
      timeZone
    );
    const taskVelocity = AdvancedAnalytics.computeTaskVelocityAndAging(
      snapshot.tasks,
      s,
      e,
      todayDay,
      timeZone
    );
    const repeatableTasks = AdvancedAnalytics.computeRepeatableTasks(snapshot.tasks, timeZone);
    const { forecast: workloadForecast, overdueBacklogCount } =
      AdvancedAnalytics.computeWorkloadForecast(
        snapshot.habits,
        snapshot.checkins,
        snapshot.tasks,
        todayDay,
        7
      );
    const crossDomainLoad = AdvancedAnalytics.computeCrossDomainLoad(
      targetHabits,
      snapshot.checkins,
      snapshot.tasks,
      s,
      e,
      todayDay,
      timeZone
    );
    const multiHeatmap = AdvancedAnalytics.computeMultiModeHeatmap(
      targetHabits,
      snapshot.checkins,
      snapshot.tasks,
      s,
      e,
      todayDay,
      timeZone
    );
    const notesInsights = AdvancedAnalytics.computeNotesInsights(
      targetHabits,
      targetHabitIds,
      snapshot.notes,
      doneByHabit,
      s,
      e
    );

    return {
      bounceBack,
      atRiskHabits,
      habitWeekdayMatrix,
      flexibleInsight,
      measuredIntensity,
      scheduleImpacts,
      loggingDiscipline,
      backlogFlowBuckets,
      taskVelocity,
      repeatableTasks,
      workloadForecast,
      overdueBacklogCount,
      crossDomainLoad,
      multiHeatmap,
      notesInsights,
    };
  }

  private static computeBounceBack(
    habits: Habit[],
    doneByHabit: Map<number, Set<number>>,
    startDay: number,
    endDay: number,
    todayDay: number
  ): BounceBackSummary {
    let recoveredMisses = 0;
    let chainedMisses = 0;

    if (endDay >= startDay) {
      for (const habit of habits) {
        const effStart = Math.max(habit.startDay, startDay);
        const effEnd = Math.min(endDay, todayDay);
        if (effEnd < effStart) continue;
        const doneSet = doneByHabit.get(habit.id) ?? new Set<number>();

        // Evaluate scheduled occurrences chronologically (for fixed-schedule segments)
        // and week outcomes for flexible segments.
        const latestSched = HabitSchedule.getAtDay(habit, effEnd);
        if (latestSched.weeklyTarget === null) {
          let prevWasMiss = false;
          for (let d = effStart; d <= effEnd; d++) {
            const sched = HabitSchedule.getAtDay(habit, d);
            if (sched.weeklyTarget !== null) continue;
            if (!CivilCalendar.isScheduled(sched.weekdays, d)) continue;
            const isDone = doneSet.has(d);
            if (!isDone && d === todayDay) {
              // Today still pending — do not penalize as a chain yet
              continue;
            }
            if (prevWasMiss) {
              if (isDone) {
                recoveredMisses += 1;
              } else {
                chainedMisses += 1;
              }
            }
            prevWasMiss = !isDone;
          }
        } else {
          // Flexible habit: evaluate week-by-week recovery
          const firstWs = CivilCalendar.startOfWeek(effStart);
          const lastWs = CivilCalendar.startOfWeek(effEnd);
          let prevWeekFailed = false;
          for (let ws = firstWs; ws <= lastWs; ws += 7) {
            const wFullEnd = ws + 6;
            if (ws === CivilCalendar.startOfWeek(todayDay) && todayDay < wFullEnd) {
              // Ongoing current week
              const wk = StreakCalculator.calculateWeeklyProgress(
                habit,
                Array.from(doneSet).map((dayIndex) => ({
                  habitId: habit.id,
                  dayIndex,
                  done: true,
                  updatedAt: 0,
                })),
                todayDay
              );
              if (prevWeekFailed && wk.isComplete) {
                recoveredMisses += 1;
              }
              break;
            }
            const wStart = Math.max(habit.startDay, ws);
            const sched = HabitSchedule.getAtDay(habit, wFullEnd);
            if (sched.weeklyTarget === null) continue;
            const eligibleMask = sched.weekdays & 0x7f || 0x7f;
            const eligibleDays = CivilCalendar.countScheduledInRange(
              eligibleMask,
              wStart,
              wFullEnd
            );
            const target = Math.min(sched.weeklyTarget, eligibleDays);
            if (target <= 0) continue;
            let doneCount = 0;
            for (let d = wStart; d <= wFullEnd; d++) {
              if (doneSet.has(d)) doneCount += 1;
            }
            const passed = doneCount >= target;
            if (prevWeekFailed) {
              if (passed) recoveredMisses += 1;
              else chainedMisses += 1;
            }
            prevWeekFailed = !passed;
          }
        }
      }
    }

    const total = recoveredMisses + chainedMisses;
    return {
      totalMissesEvaluated: total,
      recoveredMisses,
      chainedMisses,
      bounceBackRate: total === 0 ? null : recoveredMisses / total,
    };
  }

  private static computeAtRiskHabits(
    habits: Habit[],
    checkins: HabitCheckin[],
    doneByHabit: Map<number, Set<number>>,
    startDay: number,
    endDay: number,
    todayDay: number
  ): AtRiskHabitItem[] {
    const out: AtRiskHabitItem[] = [];
    const span = Math.max(1, endDay - startDay + 1);
    const recentWindow = Math.min(14, Math.max(7, Math.floor(span / 3)));
    const recentStart = Math.max(startDay, endDay - recentWindow + 1);

    for (const habit of habits) {
      if (habit.archivedAt !== null) continue;
      const effStart = Math.max(habit.startDay, startDay);
      if (endDay < effStart) continue;

      const recentMetrics = StreakCalculator.calculate(
        habit,
        checkins,
        Math.max(effStart, recentStart),
        endDay,
        endDay >= todayDay
      );

      let baselineRate: number | null = null;
      let dropPct: number | null = null;
      if (recentStart - 1 >= effStart) {
        const baseMetrics = StreakCalculator.calculate(
          habit,
          checkins,
          effStart,
          recentStart - 1,
          false
        );
        if (baseMetrics.scheduledDays >= 3 && recentMetrics.scheduledDays >= 2) {
          baselineRate = baseMetrics.completionRate;
          dropPct = Math.round((recentMetrics.completionRate - baselineRate) * 100);
        }
      }

      // Count trailing consecutive scheduled misses
      let consecutiveMisses = 0;
      const doneSet = doneByHabit.get(habit.id) ?? new Set<number>();
      const latestSched = HabitSchedule.getAtDay(habit, endDay);
      if (latestSched.weeklyTarget === null) {
        for (let d = endDay; d >= effStart; d--) {
          const sc = HabitSchedule.getAtDay(habit, d);
          if (sc.weeklyTarget !== null) break;
          if (!CivilCalendar.isScheduled(sc.weekdays, d)) continue;
          if (!doneSet.has(d)) {
            if (d === todayDay) continue;
            consecutiveMisses += 1;
          } else {
            break;
          }
        }
      }

      const hasDrop = dropPct !== null && dropPct <= -15;
      const hasMissStreak = consecutiveMisses >= 2;
      if (hasDrop || hasMissStreak) {
        out.push({
          habit,
          recentRate: recentMetrics.completionRate,
          baselineRate,
          dropPct,
          consecutiveMisses,
          reason: hasDrop && hasMissStreak ? 'both' : hasDrop ? 'drop' : 'miss_streak',
        });
      }
    }

    return out.sort(
      (a, b) => b.consecutiveMisses - a.consecutiveMisses || (a.dropPct ?? 0) - (b.dropPct ?? 0)
    );
  }

  private static computeHabitWeekdayMatrix(
    habits: Habit[],
    checkins: HabitCheckin[],
    doneByHabit: Map<number, Set<number>>,
    startDay: number,
    endDay: number,
    todayDay: number
  ): HabitWeekdayMatrixRow[] {
    const rows: HabitWeekdayMatrixRow[] = [];

    for (const habit of habits) {
      const effStart = Math.max(habit.startDay, startDay);
      if (endDay < effStart) continue;
      const latestSched = HabitSchedule.getAtDay(habit, endDay);
      const isFlexible = latestSched.weeklyTarget !== null;
      const doneSet = doneByHabit.get(habit.id) ?? new Set<number>();

      const scheduled = new Array<number>(7).fill(0);
      const done = new Array<number>(7).fill(0);
      let allowedWeekdaysMask = 0;

      if (isFlexible) {
        const segments = HabitSchedule.getSegmentsInRange(habit, effStart, endDay);
        for (const seg of segments) {
          if (seg.weeklyTarget !== null) {
            allowedWeekdaysMask |= seg.weekdays & 0x7f || 0x7f;
          } else {
            allowedWeekdaysMask |= seg.weekdays & 0x7f;
          }
        }
        for (let d = effStart; d <= endDay; d++) {
          if (doneSet.has(d)) {
            done[CivilCalendar.weekdayBit(d)] += 1;
          }
        }
      } else {
        const dayStats = StreakCalculator.getPeriodDayStats(
          [habit],
          checkins,
          effStart,
          endDay,
          todayDay
        );
        for (let d = effStart; d <= endDay; d++) {
          const entry = dayStats.get(d);
          if (!entry) continue;
          const bit = CivilCalendar.weekdayBit(d);
          scheduled[bit] += entry.scheduled;
          done[bit] += entry.done;
        }
      }

      const overall = StreakCalculator.calculate(
        habit,
        checkins,
        effStart,
        endDay,
        endDay >= todayDay
      );

      rows.push({
        habit,
        isFlexible,
        overallRate: overall.completionRate,
        cells: [0, 1, 2, 3, 4, 5, 6].map((bit) => {
          if (isFlexible) {
            return {
              weekdayBit: bit,
              scheduledCount: 0,
              doneCount: done[bit],
              rate: null,
              isOffSchedule: (allowedWeekdaysMask & (1 << bit)) === 0,
            };
          }
          return {
            weekdayBit: bit,
            scheduledCount: scheduled[bit],
            doneCount: done[bit],
            rate: scheduled[bit] === 0 ? null : done[bit] / scheduled[bit],
            isOffSchedule: scheduled[bit] === 0,
          };
        }),
      });
    }

    return rows;
  }

  private static computeFlexibleInsight(
    habits: Habit[],
    doneByHabit: Map<number, Set<number>>,
    startDay: number,
    endDay: number,
    todayDay: number
  ): FlexibleHabitsInsight | null {
    const flexHabits = habits.filter((h) => {
      const latest = HabitSchedule.getAtDay(h, Math.max(h.startDay, endDay));
      return latest.weeklyTarget !== null;
    });

    if (flexHabits.length === 0 || endDay < startDay) {
      return null;
    }

    let totalWeeks = 0;
    let perfectWeeks = 0;
    let bonusCheckins = 0;
    const weekdayCounts = new Array<number>(7).fill(0);
    let totalDoneOnFlex = 0;

    for (const habit of flexHabits) {
      const effStart = Math.max(habit.startDay, startDay);
      if (endDay < effStart) continue;
      const doneSet = doneByHabit.get(habit.id) ?? new Set<number>();

      for (let d = effStart; d <= endDay; d++) {
        if (doneSet.has(d)) {
          weekdayCounts[CivilCalendar.weekdayBit(d)] += 1;
          totalDoneOnFlex += 1;
        }
      }

      const firstWs = CivilCalendar.startOfWeek(effStart);
      const lastWs = CivilCalendar.startOfWeek(endDay);
      for (let ws = firstWs; ws <= lastWs; ws += 7) {
        const wFullStart = Math.max(habit.startDay, ws);
        const wFullEnd = Math.min(ws + 6, todayDay);
        if (wFullEnd < wFullStart) continue;
        const sc = HabitSchedule.getAtDay(habit, wFullEnd);
        if (sc.weeklyTarget === null) continue;
        const eligibleMask = sc.weekdays & 0x7f || 0x7f;
        const eligible = CivilCalendar.countScheduledInRange(eligibleMask, wFullStart, ws + 6);
        const target = Math.min(sc.weeklyTarget, eligible);
        if (target <= 0) continue;

        let doneInWeek = 0;
        for (let d = wFullStart; d <= wFullEnd; d++) {
          if (doneSet.has(d)) doneInWeek += 1;
        }
        totalWeeks += 1;
        if (doneInWeek >= target) {
          perfectWeeks += 1;
          if (doneInWeek > target) {
            bonusCheckins += doneInWeek - target;
          }
        }
      }
    }

    return {
      flexibleHabitsCount: flexHabits.length,
      totalWeeks,
      perfectWeeks,
      perfectWeeksRate: totalWeeks === 0 ? null : perfectWeeks / totalWeeks,
      bonusCheckins,
      weekdayDistribution: [0, 1, 2, 3, 4, 5, 6].map((bit) => ({
        weekdayBit: bit,
        label: CivilCalendar.weekdayShortLabel(bit),
        count: weekdayCounts[bit],
        share: totalDoneOnFlex === 0 ? 0 : weekdayCounts[bit] / totalDoneOnFlex,
      })),
    };
  }

  private static computeMeasuredIntensity(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number
  ): MeasuredIntensityItem[] {
    const out: MeasuredIntensityItem[] = [];
    for (const habit of habits) {
      if (!HabitSchedule.hasAnyDailyTarget(habit)) continue;
      const effStart = Math.max(habit.startDay, startDay);
      if (endDay < effStart) continue;

      let partialDays = 0;
      let exactDays = 0;
      let overachievedDays = 0;
      let partialRatioSum = 0;
      let bestDayValue = 0;
      let bestDayIndex: number | null = null;

      for (const c of checkins) {
        if (c.habitId !== habit.id || c.dayIndex < effStart || c.dayIndex > endDay) {
          continue;
        }
        const val = HabitSchedule.getCheckinValueForDay(habit, c, c.dayIndex);
        if (val <= 0) continue;

        if (val > bestDayValue) {
          bestDayValue = val;
          bestDayIndex = c.dayIndex;
        }

        const target = HabitSchedule.getAtDay(habit, c.dayIndex).dailyTarget;
        if (target === null) {
          exactDays += 1;
          continue;
        }

        if (val < target) {
          partialDays += 1;
          partialRatioSum += val / target;
        } else if (Math.abs(val - target) < 0.005) {
          exactDays += 1;
        } else {
          overachievedDays += 1;
        }
      }

      const totalLoggedDays = partialDays + exactDays + overachievedDays;
      out.push({
        habit,
        unit: habit.unit ?? null,
        partialDays,
        exactDays,
        overachievedDays,
        totalLoggedDays,
        avgPartialPct: partialDays === 0 ? null : Math.round((partialRatioSum / partialDays) * 100),
        bestDayValue: Math.round(bestDayValue * 100) / 100,
        bestDayIndex,
      });
    }
    return out;
  }

  private static computeScheduleImpacts(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number,
    todayDay: number
  ): ScheduleImpactItem[] {
    const out: ScheduleImpactItem[] = [];
    for (const habit of habits) {
      const timeline = HabitSchedule.getTimeline(habit);
      if (timeline.length <= 1) continue;

      for (let i = 1; i < timeline.length; i++) {
        const prev = timeline[i - 1];
        const next = timeline[i];
        if (next.fromDay > endDay || next.fromDay <= habit.startDay) continue;

        const beforeStart = Math.max(habit.startDay, prev.fromDay, startDay - 30);
        const beforeEnd = next.fromDay - 1;
        const afterStart = next.fromDay;
        const afterEnd = Math.min(
          i + 1 < timeline.length ? timeline[i + 1].fromDay - 1 : endDay,
          todayDay
        );

        if (beforeEnd < beforeStart || afterEnd < afterStart) continue;

        const beforeM = StreakCalculator.calculate(habit, checkins, beforeStart, beforeEnd, false);
        const afterM = StreakCalculator.calculate(
          habit,
          checkins,
          afterStart,
          afterEnd,
          afterEnd >= todayDay
        );

        const beforeRate = beforeM.scheduledDays > 0 ? beforeM.completionRate : null;
        const afterRate = afterM.scheduledDays > 0 ? afterM.completionRate : null;
        const deltaPct =
          beforeRate !== null && afterRate !== null
            ? Math.round((afterRate - beforeRate) * 100)
            : null;

        out.push({
          habit,
          changeDay: next.fromDay,
          beforeLabel: describeScheduleVersion(
            prev.weekdays,
            prev.weeklyTarget,
            prev.dailyTarget ?? null,
            habit.unit
          ),
          afterLabel: describeScheduleVersion(
            next.weekdays,
            next.weeklyTarget,
            next.dailyTarget ?? null,
            habit.unit
          ),
          beforeRate,
          afterRate,
          beforeScheduled: beforeM.scheduledDays,
          afterScheduled: afterM.scheduledDays,
          deltaPct,
        });
      }
    }

    return out.sort((a, b) => b.changeDay - a.changeDay);
  }

  private static computeLoggingDiscipline(
    habits: Habit[],
    targetHabitIds: Set<number>,
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number,
    timeZone: string
  ): LoggingDisciplineStats {
    const habitById = new Map<number, Habit>();
    for (const h of habits) habitById.set(h.id, h);

    let totalDoneCheckins = 0;
    let sameDayCount = 0;
    let retroactiveCount = 0;
    let earlyOrOtherCount = 0;
    const hourCounts = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    };

    for (const c of checkins) {
      if (!targetHabitIds.has(c.habitId)) continue;
      if (c.dayIndex < startDay || c.dayIndex > endDay) continue;
      const habit = habitById.get(c.habitId);
      if (!habit || !HabitSchedule.isCheckinDoneForDay(habit, c, c.dayIndex)) continue;

      totalDoneCheckins += 1;
      const loggedDay = CivilCalendar.fromTimestamp(c.updatedAt, timeZone);
      if (loggedDay === c.dayIndex) {
        sameDayCount += 1;
      } else if (loggedDay > c.dayIndex) {
        retroactiveCount += 1;
      } else {
        earlyOrOtherCount += 1;
      }

      const hour = getHourInTimeZone(c.updatedAt, timeZone);
      if (hour >= 5 && hour <= 11) hourCounts.morning += 1;
      else if (hour >= 12 && hour <= 16) hourCounts.afternoon += 1;
      else if (hour >= 17 && hour <= 21) hourCounts.evening += 1;
      else hourCounts.night += 1;
    }

    const total = Math.max(1, totalDoneCheckins);
    return {
      totalDoneCheckins,
      sameDayCount,
      retroactiveCount,
      earlyOrOtherCount,
      retroactiveRate: totalDoneCheckins === 0 ? null : retroactiveCount / totalDoneCheckins,
      timeOfDayBuckets: [
        {
          id: 'morning',
          label: 'Morning',
          hoursLabel: '05–11',
          count: hourCounts.morning,
          share: totalDoneCheckins === 0 ? 0 : hourCounts.morning / total,
        },
        {
          id: 'afternoon',
          label: 'Afternoon',
          hoursLabel: '12–16',
          count: hourCounts.afternoon,
          share: totalDoneCheckins === 0 ? 0 : hourCounts.afternoon / total,
        },
        {
          id: 'evening',
          label: 'Evening',
          hoursLabel: '17–21',
          count: hourCounts.evening,
          share: totalDoneCheckins === 0 ? 0 : hourCounts.evening / total,
        },
        {
          id: 'night',
          label: 'Night',
          hoursLabel: '22–04',
          count: hourCounts.night,
          share: totalDoneCheckins === 0 ? 0 : hourCounts.night / total,
        },
      ],
    };
  }

  private static computeBacklogFlowBuckets(
    tasks: Task[],
    startDay: number,
    endDay: number,
    maxBuckets: number,
    timeZone: string
  ): BacklogFlowBucket[] {
    if (endDay < startDay) return [];

    interface FlowEvent {
      day: number;
      kind: 'created' | 'done' | 'not_done' | 'archived';
    }
    const events: FlowEvent[] = [];

    for (const task of tasks) {
      if (task.deletedAt !== null) continue;
      const createdDay = CivilCalendar.fromTimestamp(task.createdAt, timeZone);
      if (createdDay >= startDay && createdDay <= endDay) {
        events.push({ day: createdDay, kind: 'created' });
      }
      const status = resolveTaskStatus(task);
      if (status === 'open') continue;
      const closeDay =
        status === 'done'
          ? (task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone))
          : status === 'not_done'
            ? (task.dueDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone))
            : CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
      if (closeDay >= startDay && closeDay <= endDay) {
        events.push({ day: closeDay, kind: status });
      }
    }

    const buildBucket = (
      key: string,
      label: string,
      shortLabel: string,
      bStart: number,
      bEnd: number
    ): BacklogFlowBucket => {
      let createdCount = 0;
      let doneCount = 0;
      let notDoneCount = 0;
      let archivedCount = 0;
      for (const ev of events) {
        if (ev.day < bStart || ev.day > bEnd) continue;
        if (ev.kind === 'created') createdCount += 1;
        else if (ev.kind === 'done') doneCount += 1;
        else if (ev.kind === 'not_done') notDoneCount += 1;
        else archivedCount += 1;
      }
      const closedCount = doneCount + notDoneCount + archivedCount;
      return {
        key,
        label,
        shortLabel,
        createdCount,
        doneCount,
        notDoneCount,
        archivedCount,
        closedCount,
        netFlow: createdCount - closedCount,
      };
    };

    const firstWeek = CivilCalendar.startOfWeek(startDay);
    const lastWeek = CivilCalendar.startOfWeek(endDay);
    const weekCount = Math.floor((lastWeek - firstWeek) / 7) + 1;

    if (weekCount <= maxBuckets) {
      const out: BacklogFlowBucket[] = [];
      for (let w = 0; w < weekCount; w++) {
        const ws = firstWeek + w * 7;
        const bs = Math.max(startDay, ws);
        const be = Math.min(endDay, ws + 6);
        const formatted = CivilCalendar.formatShortDate(bs);
        out.push(
          buildBucket(
            `w:${ws}`,
            `${CivilCalendar.formatShortDate(bs)} – ${CivilCalendar.formatShortDate(be)}`,
            formatted.split(' ')[1] ?? formatted,
            bs,
            be
          )
        );
      }
      return out;
    }

    const startLocal = CivilCalendar.toLocalDate(startDay);
    const endLocal = CivilCalendar.toLocalDate(endDay);
    const monthCount =
      (endLocal.year - startLocal.year) * 12 + (endLocal.month - startLocal.month) + 1;

    if (monthCount <= maxBuckets) {
      const out: BacklogFlowBucket[] = [];
      for (let m = 0; m < monthCount; m++) {
        const total = startLocal.year * 12 + (startLocal.month - 1) + m;
        const year = Math.floor(total / 12);
        const month = (((total % 12) + 12) % 12) + 1;
        const monthStart = CivilCalendar.fromLocalDate(year, month, 1);
        const daysInMonth = CivilCalendar.getMonthDays(year, month).days.length;
        const bs = Math.max(startDay, monthStart);
        const be = Math.min(endDay, monthStart + daysInMonth - 1);
        out.push(
          buildBucket(
            `m:${year}-${month}`,
            CivilCalendar.formatMonthYear(year, month),
            CivilCalendar.formatShortDate(monthStart).split(' ')[0],
            bs,
            be
          )
        );
      }
      return out;
    }

    const totalDays = endDay - startDay + 1;
    const step = Math.ceil(totalDays / maxBuckets);
    const out: BacklogFlowBucket[] = [];
    for (let cursor = startDay; cursor <= endDay; cursor += step) {
      const be = Math.min(endDay, cursor + step - 1);
      out.push(
        buildBucket(
          `r:${cursor}-${be}`,
          `${CivilCalendar.formatShortDate(cursor)} – ${CivilCalendar.formatShortDate(be)}`,
          CivilCalendar.formatShortDate(cursor).split(' ')[0],
          cursor,
          be
        )
      );
    }
    return out;
  }

  private static computeTaskVelocityAndAging(
    tasks: Task[],
    startDay: number,
    endDay: number,
    todayDay: number,
    timeZone: string
  ): TaskVelocityAndAging {
    let totalCreatedInRange = 0;
    let totalClosedInRange = 0;
    const lateDeltas: number[] = [];
    const earlyDeltas: number[] = [];
    let datedCycleSum = 0;
    let datedCycleCount = 0;
    let goalsCycleSum = 0;
    let goalsCycleCount = 0;

    let openOverdueCount = 0;
    let overdueAgeSum = 0;
    let maxOverdueAgeDays = 0;
    let oldestOverdueTitle: string | null = null;

    let openGoalsCount = 0;
    let goalAgeSum = 0;
    let maxGoalAge = -1;
    let oldestGoalTitle: string | null = null;

    for (const task of tasks) {
      if (task.deletedAt !== null) continue;
      const createdDay = CivilCalendar.fromTimestamp(task.createdAt, timeZone);
      if (createdDay >= startDay && createdDay <= endDay) {
        totalCreatedInRange += 1;
      }

      const status = resolveTaskStatus(task);
      if (status === 'open') {
        if (task.dueDay !== null && task.dueDay < todayDay) {
          const age = todayDay - task.dueDay;
          openOverdueCount += 1;
          overdueAgeSum += age;
          if (age > maxOverdueAgeDays) {
            maxOverdueAgeDays = age;
            oldestOverdueTitle = task.title;
          }
        } else if (task.dueDay === null) {
          const age = Math.max(0, todayDay - createdDay);
          openGoalsCount += 1;
          goalAgeSum += age;
          if (age > maxGoalAge) {
            maxGoalAge = age;
            oldestGoalTitle = task.title;
          }
        }
        continue;
      }

      const closeDay =
        status === 'done'
          ? (task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone))
          : status === 'not_done'
            ? (task.dueDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone))
            : CivilCalendar.fromTimestamp(task.updatedAt, timeZone);

      if (closeDay < startDay || closeDay > endDay) continue;
      totalClosedInRange += 1;

      if (status === 'done') {
        const cycleDays = Math.max(0, closeDay - createdDay);
        if (task.dueDay === null) {
          goalsCycleSum += cycleDays;
          goalsCycleCount += 1;
        } else {
          datedCycleSum += cycleDays;
          datedCycleCount += 1;
          const diff = closeDay - task.dueDay;
          if (diff > 0) {
            lateDeltas.push(diff);
          } else if (diff < 0) {
            earlyDeltas.push(-diff);
          }
        }
      }
    }

    lateDeltas.sort((a, b) => a - b);
    const lateTasksCount = lateDeltas.length;
    const avgLateDays =
      lateTasksCount === 0
        ? null
        : Math.round((lateDeltas.reduce((acc, v) => acc + v, 0) / lateTasksCount) * 10) / 10;
    const medianLateDays =
      lateTasksCount === 0
        ? null
        : lateTasksCount % 2 === 1
          ? lateDeltas[Math.floor(lateTasksCount / 2)]
          : Math.round(
              ((lateDeltas[lateTasksCount / 2 - 1] + lateDeltas[lateTasksCount / 2]) / 2) * 10
            ) / 10;
    const maxLateDays = lateTasksCount === 0 ? 0 : lateDeltas[lateTasksCount - 1];

    const earlyTasksCount = earlyDeltas.length;
    const avgDaysEarly =
      earlyTasksCount === 0
        ? null
        : Math.round((earlyDeltas.reduce((acc, v) => acc + v, 0) / earlyTasksCount) * 10) / 10;

    return {
      totalCreatedInRange,
      totalClosedInRange,
      netBacklogDelta: totalCreatedInRange - totalClosedInRange,
      lateTasksCount,
      avgLateDays,
      medianLateDays,
      maxLateDays,
      earlyTasksCount,
      avgDaysEarly,
      datedCycleTimeAvgDays:
        datedCycleCount === 0 ? null : Math.round((datedCycleSum / datedCycleCount) * 10) / 10,
      datedCycleCount,
      goalsCycleTimeAvgDays:
        goalsCycleCount === 0 ? null : Math.round((goalsCycleSum / goalsCycleCount) * 10) / 10,
      goalsCycleCount,
      openOverdueCount,
      avgOverdueAgeDays:
        openOverdueCount === 0 ? null : Math.round((overdueAgeSum / openOverdueCount) * 10) / 10,
      maxOverdueAgeDays,
      oldestOverdueTitle,
      openGoalsCount,
      avgGoalAgeDays:
        openGoalsCount === 0 ? null : Math.round((goalAgeSum / openGoalsCount) * 10) / 10,
      oldestGoalTitle,
    };
  }

  private static computeRepeatableTasks(tasks: Task[], timeZone: string): RepeatableTaskStat[] {
    interface Group {
      title: string;
      doneDays: number[];
      notDoneCount: number;
      openCount: number;
      archivedCount: number;
    }
    const groups = new Map<string, Group>();

    for (const task of tasks) {
      if (task.deletedAt !== null || !task.repeatable) continue;
      const key = task.title.trim().toLowerCase();
      if (!key) continue;
      let g = groups.get(key);
      if (!g) {
        g = {
          title: task.title.trim(),
          doneDays: [],
          notDoneCount: 0,
          openCount: 0,
          archivedCount: 0,
        };
        groups.set(key, g);
      }
      const status = resolveTaskStatus(task);
      if (status === 'done') {
        const day = task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
        g.doneDays.push(day);
      } else if (status === 'not_done') {
        g.notDoneCount += 1;
      } else if (status === 'archived') {
        g.archivedCount += 1;
      } else {
        g.openCount += 1;
      }
    }

    const out: RepeatableTaskStat[] = [];
    for (const g of groups.values()) {
      g.doneDays.sort((a, b) => a - b);
      let avgGapDays: number | null = null;
      if (g.doneDays.length >= 2) {
        let gapSum = 0;
        for (let i = 1; i < g.doneDays.length; i++) {
          gapSum += g.doneDays[i] - g.doneDays[i - 1];
        }
        avgGapDays = Math.round((gapSum / (g.doneDays.length - 1)) * 10) / 10;
      }
      out.push({
        title: g.title,
        doneCount: g.doneDays.length,
        notDoneCount: g.notDoneCount,
        openCount: g.openCount,
        archivedCount: g.archivedCount,
        lastDoneDay: g.doneDays.length > 0 ? g.doneDays[g.doneDays.length - 1] : null,
        avgGapDays,
      });
    }

    return out.sort(
      (a, b) =>
        b.doneCount + b.notDoneCount + b.openCount - (a.doneCount + a.notDoneCount + a.openCount) ||
        b.doneCount - a.doneCount
    );
  }

  private static computeWorkloadForecast(
    habits: Habit[],
    checkins: HabitCheckin[],
    tasks: Task[],
    todayDay: number,
    daysAhead: number = 7
  ): { forecast: WorkloadForecastDay[]; overdueBacklogCount: number } {
    const dueCounts = new Map<number, number>();
    let overdueBacklogCount = 0;

    for (const task of tasks) {
      if (task.deletedAt !== null || resolveTaskStatus(task) !== 'open') continue;
      if (task.dueDay === null) continue;
      if (task.dueDay < todayDay) {
        overdueBacklogCount += 1;
      } else {
        dueCounts.set(task.dueDay, (dueCounts.get(task.dueDay) ?? 0) + 1);
      }
    }

    // Track remaining flexible quota in the current week
    const todayWs = CivilCalendar.startOfWeek(todayDay);
    const doneInCurrentWeekByHabit = new Map<number, number>();
    for (const h of habits) {
      if (h.archivedAt !== null) continue;
      const doneCount = checkins.filter(
        (c) =>
          c.habitId === h.id &&
          c.dayIndex >= Math.max(h.startDay, todayWs) &&
          c.dayIndex <= todayWs + 6 &&
          HabitSchedule.isCheckinDoneForDay(h, c, c.dayIndex)
      ).length;
      doneInCurrentWeekByHabit.set(h.id, doneCount);
    }

    const forecast: WorkloadForecastDay[] = [];
    for (let offset = 1; offset <= daysAhead; offset++) {
      const dayIndex = todayDay + offset;
      const dayWs = CivilCalendar.startOfWeek(dayIndex);
      let fixedHabitsCount = 0;
      let flexHabitsPendingCount = 0;

      for (const h of habits) {
        if (h.archivedAt !== null || h.startDay > dayIndex) continue;
        const sc = HabitSchedule.getAtDay(h, dayIndex);
        if (sc.weeklyTarget === null) {
          if (CivilCalendar.isScheduled(sc.weekdays, dayIndex)) {
            fixedHabitsCount += 1;
          }
        } else {
          const eligibleMask = sc.weekdays & 0x7f || 0x7f;
          if (!CivilCalendar.isScheduled(eligibleMask, dayIndex)) continue;
          if (dayWs === todayWs) {
            const doneSoFar = doneInCurrentWeekByHabit.get(h.id) ?? 0;
            if (doneSoFar < sc.weeklyTarget) {
              flexHabitsPendingCount += 1;
            }
          } else {
            flexHabitsPendingCount += 1;
          }
        }
      }

      const tasksDueCount = dueCounts.get(dayIndex) ?? 0;
      const formatted = CivilCalendar.formatShortDate(dayIndex);
      forecast.push({
        dayIndex,
        label: formatted,
        shortLabel: formatted.split(' ')[1] ?? formatted,
        weekdayLabel: CivilCalendar.weekdayShortLabel(CivilCalendar.weekdayBit(dayIndex)),
        fixedHabitsCount,
        flexHabitsPendingCount,
        tasksDueCount,
        totalLoad: fixedHabitsCount + flexHabitsPendingCount + tasksDueCount,
      });
    }

    return { forecast, overdueBacklogCount };
  }

  private static computeCrossDomainLoad(
    habits: Habit[],
    checkins: HabitCheckin[],
    tasks: Task[],
    startDay: number,
    endDay: number,
    todayDay: number,
    timeZone: string
  ): CrossDomainLoadBucket[] {
    const buckets: Record<
      'light' | 'medium' | 'heavy',
      { daysCount: number; scheduledCount: number; doneCount: number; perfectDaysCount: number }
    > = {
      light: { daysCount: 0, scheduledCount: 0, doneCount: 0, perfectDaysCount: 0 },
      medium: { daysCount: 0, scheduledCount: 0, doneCount: 0, perfectDaysCount: 0 },
      heavy: { daysCount: 0, scheduledCount: 0, doneCount: 0, perfectDaysCount: 0 },
    };

    if (endDay < startDay || habits.length === 0) {
      return [
        {
          id: 'light',
          label: 'Light Days',
          taskCountLabel: '0–1 tasks',
          ...buckets.light,
          habitRate: null,
        },
        {
          id: 'medium',
          label: 'Medium Days',
          taskCountLabel: '2–3 tasks',
          ...buckets.medium,
          habitRate: null,
        },
        {
          id: 'heavy',
          label: 'Heavy Days',
          taskCountLabel: '4+ tasks',
          ...buckets.heavy,
          habitRate: null,
        },
      ];
    }

    const dayStats = StreakCalculator.getPeriodDayStats(
      habits,
      checkins,
      startDay,
      endDay,
      todayDay
    );

    const tasksPerDay = new Map<number, Set<number>>();
    const registerTaskDay = (day: number, taskId: number) => {
      if (day < startDay || day > endDay) return;
      let set = tasksPerDay.get(day);
      if (!set) {
        set = new Set<number>();
        tasksPerDay.set(day, set);
      }
      set.add(taskId);
    };

    for (const task of tasks) {
      if (task.deletedAt !== null) continue;
      const status = resolveTaskStatus(task);
      if (status === 'archived') continue;
      if (task.dueDay !== null) {
        registerTaskDay(task.dueDay, task.id);
      }
      if (status === 'done') {
        const doneDay = task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
        registerTaskDay(doneDay, task.id);
      }
    }

    for (let d = startDay; d <= endDay; d++) {
      const entry = dayStats.get(d);
      if (!entry || entry.scheduled <= 0) continue;
      const taskCount = tasksPerDay.get(d)?.size ?? 0;
      const key = taskCount <= 1 ? 'light' : taskCount <= 3 ? 'medium' : 'heavy';
      buckets[key].daysCount += 1;
      buckets[key].scheduledCount += entry.scheduled;
      buckets[key].doneCount += entry.done;
      if (entry.done >= entry.scheduled) {
        buckets[key].perfectDaysCount += 1;
      }
    }

    return [
      {
        id: 'light',
        label: 'Light Task Days',
        taskCountLabel: '0–1 tasks',
        ...buckets.light,
        habitRate:
          buckets.light.scheduledCount === 0
            ? null
            : buckets.light.doneCount / buckets.light.scheduledCount,
      },
      {
        id: 'medium',
        label: 'Medium Task Days',
        taskCountLabel: '2–3 tasks',
        ...buckets.medium,
        habitRate:
          buckets.medium.scheduledCount === 0
            ? null
            : buckets.medium.doneCount / buckets.medium.scheduledCount,
      },
      {
        id: 'heavy',
        label: 'Heavy Task Days',
        taskCountLabel: '4+ tasks',
        ...buckets.heavy,
        habitRate:
          buckets.heavy.scheduledCount === 0
            ? null
            : buckets.heavy.doneCount / buckets.heavy.scheduledCount,
      },
    ];
  }

  private static computeMultiModeHeatmap(
    habits: Habit[],
    checkins: HabitCheckin[],
    tasks: Task[],
    startDay: number,
    endDay: number,
    todayDay: number,
    timeZone: string
  ): MultiModeHeatmapData {
    const effectiveEnd = Math.min(endDay, todayDay);
    const maxWeeks = 104;
    const minAllowedStart = effectiveEnd - (maxWeeks * 7 - 1);
    const clampedStart = Math.max(Math.min(startDay, effectiveEnd), minAllowedStart);
    const isCapped = clampedStart > startDay;

    const firstWeekStart = CivilCalendar.startOfWeek(clampedStart);
    const endWeekStart = CivilCalendar.startOfWeek(effectiveEnd);
    const weeksCount = Math.max(1, Math.floor((endWeekStart - firstWeekStart) / 7) + 1);

    const habitStats = StreakCalculator.getPeriodDayStats(
      habits,
      checkins,
      clampedStart,
      effectiveEnd,
      todayDay
    );

    const taskDayMap = new Map<number, { done: number; notDone: number; dueOpen: number }>();
    const getT = (d: number) => {
      let item = taskDayMap.get(d);
      if (!item) {
        item = { done: 0, notDone: 0, dueOpen: 0 };
        taskDayMap.set(d, item);
      }
      return item;
    };

    for (const task of tasks) {
      if (task.deletedAt !== null) continue;
      const status = resolveTaskStatus(task);
      if (status === 'done') {
        const day = task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
        if (day >= clampedStart && day <= effectiveEnd) {
          getT(day).done += 1;
        }
      } else if (status === 'not_done') {
        const day = task.dueDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
        if (day >= clampedStart && day <= effectiveEnd) {
          getT(day).notDone += 1;
        }
      } else if (status === 'open' && task.dueDay !== null) {
        if (task.dueDay >= clampedStart && task.dueDay <= effectiveEnd) {
          getT(task.dueDay).dueOpen += 1;
        }
      }
    }

    const weeks: MultiModeHeatmapData['weeks'] = [];
    let lastMonth = -1;
    let totalTaskDone = 0;
    let totalHabitDone = 0;

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

      const days: MultiModeHeatmapCell[] = [];
      for (let d = 0; d < 7; d++) {
        const dayIndex = weekStart + d;
        if (dayIndex < clampedStart || dayIndex > effectiveEnd) {
          days.push({
            dayIndex,
            inRange: false,
            habitsDone: 0,
            habitsScheduled: 0,
            tasksDone: 0,
            tasksNotDone: 0,
            tasksDueOpen: 0,
            habitTone: 'future',
            taskTone: 'future',
            combinedTone: 'future',
          });
          continue;
        }

        const hEntry = habitStats.get(dayIndex);
        const habitsScheduled = hEntry?.scheduled ?? 0;
        const habitsDone = hEntry?.done ?? 0;
        totalHabitDone += habitsDone;

        const tEntry = taskDayMap.get(dayIndex);
        const tasksDone = tEntry?.done ?? 0;
        const tasksNotDone = tEntry?.notDone ?? 0;
        const tasksDueOpen = tEntry?.dueOpen ?? 0;
        totalTaskDone += tasksDone;

        const habitTone = classifyRatioTone(dayIndex, todayDay, habitsScheduled, habitsDone, false);

        const taskTotal = tasksDone + tasksNotDone + tasksDueOpen;
        const taskTone = classifyRatioTone(dayIndex, todayDay, taskTotal, tasksDone, false);

        const combinedTotal = habitsScheduled + taskTotal;
        const combinedDone = habitsDone + tasksDone;
        const combinedTone = classifyRatioTone(
          dayIndex,
          todayDay,
          combinedTotal,
          combinedDone,
          false
        );

        days.push({
          dayIndex,
          inRange: true,
          habitsDone,
          habitsScheduled,
          tasksDone,
          tasksNotDone,
          tasksDueOpen,
          habitTone,
          taskTone,
          combinedTone,
        });
      }
      weeks.push({ weekStart, monthLabel, days });
    }

    return {
      weeks,
      clampedStart,
      effectiveEnd,
      isCapped,
      totalTaskDone,
      totalHabitDone,
    };
  }

  private static computeNotesInsights(
    habits: Habit[],
    targetHabitIds: Set<number>,
    notes: HabitNote[],
    doneByHabit: Map<number, Set<number>>,
    startDay: number,
    endDay: number
  ): NotesInsightsSummary {
    const habitById = new Map<number, Habit>();
    for (const h of habits) habitById.set(h.id, h);

    let notesOnDoneDays = 0;
    let notesOnMissedDays = 0;
    let notesOnUnscheduledDays = 0;
    const keywordMap = new Map<string, { count: number; missedCount: number; doneCount: number }>();
    const entries: NoteInsightEntry[] = [];

    for (const note of notes) {
      if (!targetHabitIds.has(note.habitId)) continue;
      if (note.dayIndex < startDay || note.dayIndex > endDay) continue;
      const trimmed = note.text.trim();
      if (!trimmed) continue;

      const habit = habitById.get(note.habitId);
      if (!habit) continue;

      const doneSet = doneByHabit.get(habit.id) ?? new Set<number>();
      const isDone = doneSet.has(note.dayIndex);
      const sched = HabitSchedule.getAtDay(habit, note.dayIndex);
      const isScheduled =
        sched.weeklyTarget !== null
          ? CivilCalendar.isScheduled(sched.weekdays & 0x7f || 0x7f, note.dayIndex)
          : CivilCalendar.isScheduled(sched.weekdays, note.dayIndex);

      let status: NoteInsightEntry['status'];
      if (isDone) {
        status = 'done';
        notesOnDoneDays += 1;
      } else if (isScheduled) {
        status = 'missed';
        notesOnMissedDays += 1;
      } else {
        status = 'unscheduled';
        notesOnUnscheduledDays += 1;
      }

      entries.push({
        habitId: habit.id,
        habitName: habit.name,
        habitColor: habit.color,
        dayIndex: note.dayIndex,
        text: trimmed,
        status,
      });

      const tokens = trimmed.toLowerCase().match(/#?[\p{L}\p{N}_]{3,}/gu);
      if (tokens) {
        const seenInNote = new Set<string>();
        for (const clean of tokens) {
          if (STOP_WORDS.has(clean) || seenInNote.has(clean)) continue;
          seenInNote.add(clean);
          const stat = keywordMap.get(clean) ?? {
            count: 0,
            missedCount: 0,
            doneCount: 0,
          };
          stat.count += 1;
          if (status === 'missed') stat.missedCount += 1;
          else if (status === 'done') stat.doneCount += 1;
          keywordMap.set(clean, stat);
        }
      }
    }

    entries.sort((a, b) => b.dayIndex - a.dayIndex || a.habitId - b.habitId);

    const topKeywords: NoteKeywordStat[] = Array.from(keywordMap.entries())
      .map(([word, stat]) => ({ word, ...stat }))
      .filter((item) => item.count >= 2 || entries.length <= 4)
      .sort((a, b) => b.count - a.count || b.missedCount - a.missedCount)
      .slice(0, 8);

    return {
      totalNotes: entries.length,
      notesOnDoneDays,
      notesOnMissedDays,
      notesOnUnscheduledDays,
      topKeywords,
      entries,
    };
  }
}

import { Habit, HabitCheckin } from '../../types/domain';
import { CivilCalendar } from '../civil-calendar';
import { HabitSchedule } from '../habit-schedule';
import { StreakCalculator } from '../streak-calculator';
import { describeScheduleVersion, getHourInTimeZone } from './shared';
import {
  AtRiskHabitItem,
  BounceBackSummary,
  FlexibleHabitsInsight,
  HabitWeekdayMatrixRow,
  LoggingDisciplineStats,
  MeasuredIntensityItem,
  ScheduleImpactItem,
} from './types';

export function computeBounceBack(
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
          const eligibleDays = CivilCalendar.countScheduledInRange(eligibleMask, wStart, wFullEnd);
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

export function computeAtRiskHabits(
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

export function computeHabitWeekdayMatrix(
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

export function computeFlexibleInsight(
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

export function computeMeasuredIntensity(
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

export function computeScheduleImpacts(
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

export function computeLoggingDiscipline(
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

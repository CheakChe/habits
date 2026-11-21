import { Habit, HabitCheckin, normalizeWeeklyTarget } from '../types/domain';
import { CivilCalendar } from './civil-calendar';

export const STREAK_MILESTONES = [7, 30, 100] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];
export type StreakUnit = 'days' | 'weeks';

export interface StreakMetrics {
  currentStreak: number;
  longestStreak: number;
  streakUnit: StreakUnit;
  completionRate: number;
  scheduledDays: number;
  completedScheduledDays: number;
}

export interface WeeklyHabitProgress {
  weekStart: number;
  weekEnd: number;
  completedDays: number;
  scheduledDays: number;
  isComplete: boolean;
}

export interface HabitPeriodSummary {
  habit: Habit;
  currentStreak: number;
  longestStreak: number;
  streakUnit: StreakUnit;
  completionRate: number;
  scheduledDays: number;
  completedDays: number;
  missedDays: number;
}

export interface DayHabitCounts {
  scheduled: number;
  done: number;
}

function buildHabitDoneSet(habitId: number, checkins: HabitCheckin[]): Set<number> {
  const doneSet = new Set<number>();
  for (const entry of checkins) {
    if (entry.habitId === habitId && entry.done) {
      doneSet.add(entry.dayIndex);
    }
  }
  return doneSet;
}

function countDoneInRange(doneSet: Set<number>, startDay: number, endDay: number): number {
  if (endDay < startDay) return 0;
  let count = 0;
  for (let d = startDay; d <= endDay; d++) {
    if (doneSet.has(d)) count += 1;
  }
  return count;
}

function effectiveFlexibleWeekTarget(
  habitStartDay: number,
  weekStart: number,
  target: number
): number {
  const wStart = Math.max(habitStartDay, weekStart);
  const wEnd = weekStart + 6;
  if (wEnd < wStart) return 0;
  return Math.min(target, wEnd - wStart + 1);
}

export class StreakCalculator {
  public static getPeriodDayStats(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number,
    todayDay: number
  ): Map<number, DayHabitCounts> {
    const s = Math.min(startDay, endDay);
    const e = Math.min(Math.max(startDay, endDay), todayDay);
    const result = new Map<number, DayHabitCounts>();
    if (e < s || habits.length === 0) {
      return result;
    }

    const add = (dayIndex: number, scheduledDelta: number, doneDelta: number) => {
      if (dayIndex < s || dayIndex > e) return;
      const prev = result.get(dayIndex);
      if (prev) {
        prev.scheduled += scheduledDelta;
        prev.done += doneDelta;
      } else {
        result.set(dayIndex, { scheduled: scheduledDelta, done: doneDelta });
      }
    };

    const doneByHabit = new Map<number, Set<number>>();
    for (const c of checkins) {
      if (!c.done) continue;
      let set = doneByHabit.get(c.habitId);
      if (!set) {
        set = new Set<number>();
        doneByHabit.set(c.habitId, set);
      }
      set.add(c.dayIndex);
    }

    for (const habit of habits) {
      const hStart = Math.max(habit.startDay, s);
      if (e < hStart) continue;
      const doneSet = doneByHabit.get(habit.id) ?? new Set<number>();
      const weeklyTarget = normalizeWeeklyTarget(habit.weeklyTarget);

      if (weeklyTarget === null) {
        for (let d = hStart; d <= e; d++) {
          if (CivilCalendar.isScheduled(habit.weekdays, d)) {
            add(d, 1, doneSet.has(d) ? 1 : 0);
          }
        }
        continue;
      }

      const firstWs = CivilCalendar.startOfWeek(hStart);
      const lastWs = CivilCalendar.startOfWeek(e);
      for (let ws = firstWs; ws <= lastWs; ws += 7) {
        const wFullStart = Math.max(habit.startDay, ws);
        const wFullEnd = ws + 6;
        const evalEnd = Math.min(wFullEnd, todayDay);
        if (evalEnd < wFullStart) continue;

        const effTarget = effectiveFlexibleWeekTarget(habit.startDay, ws, weeklyTarget);
        const uncheckedDays: number[] = [];
        let doneCount = 0;

        for (let d = wFullStart; d <= evalEnd; d++) {
          if (doneSet.has(d)) {
            doneCount += 1;
            add(d, 1, 1);
          } else {
            uncheckedDays.push(d);
          }
        }

        if (doneCount < effTarget) {
          const remainingFutureDaysInWeek = Math.max(0, wFullEnd - evalEnd);
          const stillAchievable =
            evalEnd === todayDay &&
            todayDay < wFullEnd &&
            doneCount + remainingFutureDaysInWeek >= effTarget;

          if (stillAchievable) {
            if (!doneSet.has(todayDay) && todayDay >= wFullStart) {
              add(todayDay, 1, 0);
            }
          } else {
            const shortfall = Math.min(effTarget - doneCount, uncheckedDays.length);
            const firstMissIdx = uncheckedDays.length - shortfall;
            for (let idx = firstMissIdx; idx < uncheckedDays.length; idx++) {
              add(uncheckedDays[idx], 1, 0);
            }
          }
        }
      }
    }

    return result;
  }

  public static summarizeHabitsForRange(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number,
    todayDay: number
  ): HabitPeriodSummary[] {
    const effectiveEnd = Math.min(endDay, todayDay);
    const allowPending = effectiveEnd >= todayDay;

    const rows: HabitPeriodSummary[] = habits.map((habit) => {
      const effectiveStart = Math.max(habit.startDay, startDay);
      const metrics = StreakCalculator.calculate(
        habit,
        checkins,
        effectiveStart,
        effectiveEnd,
        allowPending
      );
      return {
        habit,
        currentStreak: metrics.currentStreak,
        longestStreak: metrics.longestStreak,
        streakUnit: metrics.streakUnit,
        completionRate: metrics.completionRate,
        scheduledDays: metrics.scheduledDays,
        completedDays: metrics.completedScheduledDays,
        missedDays: Math.max(0, metrics.scheduledDays - metrics.completedScheduledDays),
      };
    });

    return rows.sort((a, b) => {
      const aArch = a.habit.archivedAt !== null ? 1 : 0;
      const bArch = b.habit.archivedAt !== null ? 1 : 0;
      if (aArch !== bArch) return aArch - bArch;
      if (b.completionRate !== a.completionRate) {
        return b.completionRate - a.completionRate;
      }
      if (b.completedDays !== a.completedDays) {
        return b.completedDays - a.completedDays;
      }
      return a.habit.id - b.habit.id;
    });
  }

  public static summarizeHabitsForPeriod(
    habits: Habit[],
    checkins: HabitCheckin[],
    periodDays: number | 'all',
    todayDay: number
  ): HabitPeriodSummary[] {
    const minHabitStart = habits.reduce(
      (min, h) => (h.startDay < min ? h.startDay : min),
      todayDay
    );
    const startDay =
      periodDays === 'all' ? minHabitStart : todayDay - (periodDays - 1);
    return StreakCalculator.summarizeHabitsForRange(
      habits,
      checkins,
      startDay,
      todayDay,
      todayDay
    );
  }

  public static getMilestone(streak: number): StreakMilestone | null {
    if (streak >= 100) return 100;
    if (streak >= 30) return 30;
    if (streak >= 7) return 7;
    return null;
  }

  public static isExactMilestone(streak: number): streak is StreakMilestone {
    return streak === 7 || streak === 30 || streak === 100;
  }

  public static calculateWeeklyProgress(
    habit: Habit,
    checkins: HabitCheckin[],
    todayDay: number
  ): WeeklyHabitProgress {
    const weekStart = CivilCalendar.startOfWeek(todayDay);
    const weekEnd = weekStart + 6;
    const effectiveStart = Math.max(weekStart, habit.startDay);
    const doneSet = buildHabitDoneSet(habit.id, checkins);
    const weeklyTarget = normalizeWeeklyTarget(habit.weeklyTarget);

    if (weeklyTarget !== null) {
      if (weekEnd < effectiveStart) {
        return {
          weekStart,
          weekEnd,
          completedDays: 0,
          scheduledDays: 0,
          isComplete: false,
        };
      }
      const scheduledDays = effectiveFlexibleWeekTarget(
        habit.startDay,
        weekStart,
        weeklyTarget
      );
      const completedDays = countDoneInRange(
        doneSet,
        effectiveStart,
        Math.min(weekEnd, todayDay)
      );
      return {
        weekStart,
        weekEnd,
        completedDays,
        scheduledDays,
        isComplete: scheduledDays > 0 && completedDays >= scheduledDays,
      };
    }

    let scheduledDays = 0;
    let completedDays = 0;
    if (weekEnd >= effectiveStart) {
      for (let d = effectiveStart; d <= weekEnd; d++) {
        if (!CivilCalendar.isScheduled(habit.weekdays, d)) {
          continue;
        }
        scheduledDays += 1;
        if (d <= todayDay && doneSet.has(d)) {
          completedDays += 1;
        }
      }
    }

    return {
      weekStart,
      weekEnd,
      completedDays,
      scheduledDays,
      isComplete: scheduledDays > 0 && completedDays >= scheduledDays,
    };
  }

  public static calculate(
    habit: Habit,
    checkins: HabitCheckin[],
    periodStartDay: number,
    periodEndDay: number,
    allowPendingEndDay: boolean = true
  ): StreakMetrics {
    const doneSet = buildHabitDoneSet(habit.id, checkins);
    const effectiveEnd = periodEndDay;
    const effectiveStart = Math.max(habit.startDay, periodStartDay);
    const weeklyTarget = normalizeWeeklyTarget(habit.weeklyTarget);

    if (weeklyTarget !== null) {
      let currentStreak = 0;
      let longestStreak = 0;

      if (effectiveEnd >= habit.startDay) {
        const firstWeekStart = CivilCalendar.startOfWeek(habit.startDay);
        const endWeekStart = CivilCalendar.startOfWeek(effectiveEnd);

        // 1. Current streak measured in consecutive successful weeks
        for (let ws = endWeekStart; ws >= firstWeekStart; ws -= 7) {
          const wStart = Math.max(habit.startDay, ws);
          const wFullEnd = ws + 6;
          const reqTarget = effectiveFlexibleWeekTarget(
            habit.startDay,
            ws,
            weeklyTarget
          );
          if (ws === endWeekStart) {
            const evalEnd = Math.min(wFullEnd, effectiveEnd);
            const doneSoFar = countDoneInRange(doneSet, wStart, evalEnd);
            if (reqTarget > 0 && doneSoFar >= reqTarget) {
              currentStreak += 1;
            } else if (allowPendingEndDay) {
              const remainingDaysInWeek = Math.max(0, wFullEnd - effectiveEnd);
              if (doneSoFar + remainingDaysInWeek < reqTarget) {
                break;
              }
            } else {
              break;
            }
          } else {
            const doneInWeek = countDoneInRange(doneSet, wStart, wFullEnd);
            if (reqTarget > 0 && doneInWeek >= reqTarget) {
              currentStreak += 1;
            } else {
              break;
            }
          }
        }

        // 2. Longest streak across full habit lifespan weeks up to effectiveEnd
        let runningStreak = 0;
        for (let ws = firstWeekStart; ws <= endWeekStart; ws += 7) {
          const wStart = Math.max(habit.startDay, ws);
          const wEvalEnd = Math.min(ws + 6, effectiveEnd);
          const reqTarget = effectiveFlexibleWeekTarget(
            habit.startDay,
            ws,
            weeklyTarget
          );
          const doneInWeek = countDoneInRange(doneSet, wStart, wEvalEnd);
          if (reqTarget > 0 && doneInWeek >= reqTarget) {
            runningStreak += 1;
            if (runningStreak > longestStreak) {
              longestStreak = runningStreak;
            }
          } else {
            runningStreak = 0;
          }
        }
      }

      // 3. Period completion rate capped per weekly quota across active weeks
      let scheduledDays = 0;
      let completedScheduledDays = 0;
      if (effectiveEnd >= effectiveStart) {
        const firstPeriodWeek = CivilCalendar.startOfWeek(effectiveStart);
        const lastPeriodWeek = CivilCalendar.startOfWeek(effectiveEnd);
        for (let ws = firstPeriodWeek; ws <= lastPeriodWeek; ws += 7) {
          const wFullStart = Math.max(habit.startDay, ws);
          const wFullEnd = ws + 6;
          const fullWeekTarget = effectiveFlexibleWeekTarget(
            habit.startDay,
            ws,
            weeklyTarget
          );
          const sliceStart = Math.max(effectiveStart, ws);
          const sliceEnd = Math.min(effectiveEnd, wFullEnd);
          if (sliceEnd < sliceStart) continue;

          const donePrior =
            sliceStart > wFullStart
              ? countDoneInRange(doneSet, wFullStart, sliceStart - 1)
              : 0;
          const remainingQuota = Math.max(0, fullWeekTarget - donePrior);
          const sliceDays = sliceEnd - sliceStart + 1;
          const sliceTarget = Math.min(remainingQuota, sliceDays);
          const doneInSlice = countDoneInRange(doneSet, sliceStart, sliceEnd);

          scheduledDays += sliceTarget;
          completedScheduledDays += Math.min(doneInSlice, sliceTarget);
        }
      }

      const completionRate =
        scheduledDays === 0 ? 0 : completedScheduledDays / scheduledDays;

      return {
        currentStreak,
        longestStreak,
        streakUnit: 'weeks',
        completionRate,
        scheduledDays,
        completedScheduledDays,
      };
    }

    // Fixed-weekday schedule metrics
    // 1. Current streak walking backwards from effectiveEnd down to habit.startDay
    let currentStreak = 0;
    let cursor = effectiveEnd;
    if (allowPendingEndDay && cursor >= habit.startDay) {
      if (CivilCalendar.isScheduled(habit.weekdays, cursor) && !doneSet.has(cursor)) {
        cursor -= 1;
      }
    }

    while (cursor >= habit.startDay) {
      if (!CivilCalendar.isScheduled(habit.weekdays, cursor)) {
        cursor -= 1;
        continue;
      }
      if (doneSet.has(cursor)) {
        currentStreak += 1;
        cursor -= 1;
      } else {
        break;
      }
    }

    // 2. Longest streak across full habit lifespan up to effectiveEnd
    let longestStreak = 0;
    let runningStreak = 0;
    for (let d = habit.startDay; d <= effectiveEnd; d++) {
      if (!CivilCalendar.isScheduled(habit.weekdays, d)) {
        continue;
      }
      if (doneSet.has(d)) {
        runningStreak += 1;
        if (runningStreak > longestStreak) {
          longestStreak = runningStreak;
        }
      } else {
        runningStreak = 0;
      }
    }

    // 3. Period completion rate
    let scheduledDays = 0;
    let completedScheduledDays = 0;
    if (effectiveEnd >= effectiveStart) {
      for (let d = effectiveStart; d <= effectiveEnd; d++) {
        if (!CivilCalendar.isScheduled(habit.weekdays, d)) {
          continue;
        }
        scheduledDays += 1;
        if (doneSet.has(d)) {
          completedScheduledDays += 1;
        }
      }
    }

    const completionRate = scheduledDays === 0 ? 0 : completedScheduledDays / scheduledDays;

    return {
      currentStreak,
      longestStreak,
      streakUnit: 'days',
      completionRate,
      scheduledDays,
      completedScheduledDays,
    };
  }
}

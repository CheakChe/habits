import { Habit, HabitCheckin } from '../types/domain';
import { CivilCalendar } from './civil-calendar';

export const STREAK_MILESTONES = [7, 30, 100] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

export interface StreakMetrics {
  currentStreak: number;
  longestStreak: number;
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
  completionRate: number;
  scheduledDays: number;
  completedDays: number;
  missedDays: number;
}

export class StreakCalculator {
  public static summarizeHabitsForPeriod(
    habits: Habit[],
    checkins: HabitCheckin[],
    periodDays: number | 'all',
    todayDay: number
  ): HabitPeriodSummary[] {
    const rows: HabitPeriodSummary[] = habits.map((habit) => {
      const startDay =
        periodDays === 'all' ? habit.startDay : todayDay - (periodDays - 1);
      const metrics = StreakCalculator.calculate(
        habit,
        checkins,
        startDay,
        todayDay,
        true
      );
      return {
        habit,
        currentStreak: metrics.currentStreak,
        longestStreak: metrics.longestStreak,
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

    const doneSet = new Set<number>();
    for (const entry of checkins) {
      if (entry.habitId === habit.id && entry.done) {
        doneSet.add(entry.dayIndex);
      }
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
    const doneSet = new Set<number>();
    for (const entry of checkins) {
      if (entry.habitId === habit.id && entry.done) {
        doneSet.add(entry.dayIndex);
      }
    }

    const effectiveEnd = periodEndDay;
    const effectiveStart = Math.max(habit.startDay, periodStartDay);

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
      completionRate,
      scheduledDays,
      completedScheduledDays,
    };
  }
}

import { Habit, HabitCheckin } from '../types/domain';
import {
  calculateHabitStreaks,
  calculateWeeklyProgress,
  getStreakMilestone,
  isExactStreakMilestone,
} from './streaks/habit-metrics';
import {
  computePeriodDayStats,
  summarizeHabitsForPeriod,
  summarizeHabitsForRange,
} from './streaks/period-stats';
import {
  DayHabitCounts,
  HabitPeriodSummary,
  StreakMetrics,
  StreakMilestone,
  StreakUnit,
  WeeklyHabitProgress,
} from './streaks/types';

export type {
  DayHabitCounts,
  HabitPeriodSummary,
  StreakMetrics,
  StreakMilestone,
  StreakUnit,
  WeeklyHabitProgress,
};

export class StreakCalculator {
  public static getPeriodDayStats(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number,
    todayDay: number
  ): Map<number, DayHabitCounts> {
    return computePeriodDayStats(habits, checkins, startDay, endDay, todayDay);
  }

  public static summarizeHabitsForRange(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number,
    todayDay: number
  ): HabitPeriodSummary[] {
    return summarizeHabitsForRange(habits, checkins, startDay, endDay, todayDay);
  }

  public static summarizeHabitsForPeriod(
    habits: Habit[],
    checkins: HabitCheckin[],
    periodDays: number | 'all',
    todayDay: number
  ): HabitPeriodSummary[] {
    return summarizeHabitsForPeriod(habits, checkins, periodDays, todayDay);
  }

  public static getMilestone(streak: number): StreakMilestone | null {
    return getStreakMilestone(streak);
  }

  public static isExactMilestone(streak: number): streak is StreakMilestone {
    return isExactStreakMilestone(streak);
  }

  public static calculateWeeklyProgress(
    habit: Habit,
    checkins: HabitCheckin[],
    todayDay: number
  ): WeeklyHabitProgress {
    return calculateWeeklyProgress(habit, checkins, todayDay);
  }

  public static calculate(
    habit: Habit,
    checkins: HabitCheckin[],
    periodStartDay: number,
    periodEndDay: number,
    allowPendingEndDay: boolean = true
  ): StreakMetrics {
    return calculateHabitStreaks(habit, checkins, periodStartDay, periodEndDay, allowPendingEndDay);
  }
}

import { Habit } from '../../types/domain';

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
  totalValue?: number;
  unit?: string | null;
}

export interface DayHabitCounts {
  scheduled: number;
  done: number;
}

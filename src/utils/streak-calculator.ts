import { Habit, HabitCheckin } from '../types/domain';
import { CivilCalendar } from './civil-calendar';

export interface StreakMetrics {
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
  scheduledDays: number;
  completedScheduledDays: number;
}

export class StreakCalculator {
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

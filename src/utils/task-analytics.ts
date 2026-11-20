import { Task } from '../types/domain';
import { CivilCalendar } from './civil-calendar';

export interface WeeklyTaskBucket {
  weekStartDay: number;
  label: string;
  count: number;
}

export class TaskAnalytics {
  /**
   * Computes completed task counts grouped by calendar week (Mon-Sun).
   * Returns an array of buckets ordered chronologically from oldest week to newest week.
   */
  public static weeklyCompletedCounts(
    tasks: Task[],
    endDay: number,
    weeksCount: number = 8
  ): WeeklyTaskBucket[] {
    if (weeksCount <= 0) return [];

    const currentWeekStart = CivilCalendar.startOfWeek(endDay);
    const firstWeekStart = currentWeekStart - (weeksCount - 1) * 7;

    const counts = new Map<number, number>();
    for (let w = 0; w < weeksCount; w++) {
      counts.set(firstWeekStart + w * 7, 0);
    }

    for (const task of tasks) {
      if (task.deletedAt !== null || !task.done) continue;
      const completedDay = task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt);
      const weekStart = CivilCalendar.startOfWeek(completedDay);
      if (counts.has(weekStart)) {
        counts.set(weekStart, (counts.get(weekStart) ?? 0) + 1);
      }
    }

    const buckets: WeeklyTaskBucket[] = [];
    for (let w = 0; w < weeksCount; w++) {
      const weekStart = firstWeekStart + w * 7;
      buckets.push({
        weekStartDay: weekStart,
        label: CivilCalendar.formatShortDate(weekStart),
        count: counts.get(weekStart) ?? 0,
      });
    }

    return buckets;
  }
}

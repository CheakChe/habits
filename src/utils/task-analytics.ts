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

  public static countCompletedInRange(
    tasks: Task[],
    startDay: number,
    endDay: number,
    timeZone?: string
  ): number {
    let total = 0;
    for (const task of tasks) {
      if (task.deletedAt !== null || !task.done) continue;
      const completedDay =
        task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
      if (completedDay >= startDay && completedDay <= endDay) {
        total += 1;
      }
    }
    return total;
  }

  public static rangeCompletedBuckets(
    tasks: Task[],
    startDay: number,
    endDay: number,
    maxBuckets: number = 12,
    timeZone?: string
  ): { key: string; label: string; shortLabel: string; count: number }[] {
    const s = Math.min(startDay, endDay);
    const e = Math.max(startDay, endDay);

    const completedDays: number[] = [];
    for (const task of tasks) {
      if (task.deletedAt !== null || !task.done) continue;
      const completedDay =
        task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
      if (completedDay >= s && completedDay <= e) {
        completedDays.push(completedDay);
      }
    }

    const firstWeek = CivilCalendar.startOfWeek(s);
    const lastWeek = CivilCalendar.startOfWeek(e);
    const weekCount = Math.floor((lastWeek - firstWeek) / 7) + 1;

    if (weekCount <= maxBuckets) {
      const counts = new Map<number, number>();
      for (let w = 0; w < weekCount; w++) {
        counts.set(firstWeek + w * 7, 0);
      }
      for (const day of completedDays) {
        const ws = CivilCalendar.startOfWeek(day);
        counts.set(ws, (counts.get(ws) ?? 0) + 1);
      }
      const out: { key: string; label: string; shortLabel: string; count: number }[] = [];
      for (let w = 0; w < weekCount; w++) {
        const ws = firstWeek + w * 7;
        const formatted = CivilCalendar.formatShortDate(ws);
        out.push({
          key: `w:${ws}`,
          label: `Week of ${formatted}`,
          shortLabel: formatted.split(' ')[1] ?? formatted,
          count: counts.get(ws) ?? 0,
        });
      }
      return out;
    }

    const startLocal = CivilCalendar.toLocalDate(s);
    const endLocal = CivilCalendar.toLocalDate(e);
    const monthCount =
      (endLocal.year - startLocal.year) * 12 + (endLocal.month - startLocal.month) + 1;

    if (monthCount <= maxBuckets) {
      const monthBuckets: { year: number; month: number; count: number }[] = [];
      const idxMap = new Map<string, number>();
      for (let m = 0; m < monthCount; m++) {
        const total = startLocal.year * 12 + (startLocal.month - 1) + m;
        const year = Math.floor(total / 12);
        const month = ((total % 12) + 12) % 12 + 1;
        idxMap.set(`${year}-${month}`, monthBuckets.length);
        monthBuckets.push({ year, month, count: 0 });
      }
      for (const day of completedDays) {
        const loc = CivilCalendar.toLocalDate(day);
        const idx = idxMap.get(`${loc.year}-${loc.month}`);
        if (idx !== undefined) {
          monthBuckets[idx].count += 1;
        }
      }
      return monthBuckets.map((b) => {
        const monthShort = CivilCalendar.formatShortDate(
          CivilCalendar.fromLocalDate(b.year, b.month, 1)
        ).split(' ')[0];
        return {
          key: `m:${b.year}-${b.month}`,
          label: CivilCalendar.formatMonthYear(b.year, b.month),
          shortLabel: monthShort,
          count: b.count,
        };
      });
    }

    const totalDays = e - s + 1;
    const step = Math.ceil(totalDays / maxBuckets);
    const out: { key: string; label: string; shortLabel: string; count: number }[] = [];
    for (let cursor = s; cursor <= e; cursor += step) {
      const bucketEnd = Math.min(e, cursor + step - 1);
      let count = 0;
      for (const day of completedDays) {
        if (day >= cursor && day <= bucketEnd) count += 1;
      }
      out.push({
        key: `r:${cursor}-${bucketEnd}`,
        label: `${CivilCalendar.formatShortDate(cursor)} – ${CivilCalendar.formatShortDate(bucketEnd)}`,
        shortLabel: CivilCalendar.formatShortDate(cursor).split(' ')[0],
        count,
      });
    }
    return out;
  }
}

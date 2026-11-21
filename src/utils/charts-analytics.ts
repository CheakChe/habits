import {
  Habit,
  HabitCheckin,
  Task,
  TaskStatus,
  normalizeWeeklyTarget,
} from '../types/domain';
import { CivilCalendar } from './civil-calendar';
import { StreakCalculator } from './streak-calculator';

export interface HabitTrendBucket {
  key: string;
  label: string;
  shortLabel: string;
  startDay: number;
  endDay: number;
  scheduledCount: number;
  doneCount: number;
  rate: number | null;
}

export interface WeekdayHabitStat {
  weekdayBit: number;
  label: string;
  scheduledCount: number;
  doneCount: number;
  rate: number | null;
}

export interface WeekdayTaskStat {
  weekdayBit: number;
  label: string;
  doneCount: number;
  notDoneCount: number;
  totalCount: number;
  rate: number | null;
}

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

function countHabitRange(
  habits: Habit[],
  checkins: HabitCheckin[],
  dayStats: Map<number, { scheduled: number; done: number }>,
  startDay: number,
  endDay: number
): { scheduledCount: number; doneCount: number; rate: number | null } {
  let scheduledCount = 0;
  let doneCount = 0;

  if (startDay === endDay) {
    const entry = dayStats.get(startDay);
    if (entry) {
      scheduledCount = entry.scheduled;
      doneCount = entry.done;
    }
  } else {
    for (const h of habits) {
      if (normalizeWeeklyTarget(h.weeklyTarget) !== null) {
        const m = StreakCalculator.calculate(h, checkins, startDay, endDay, false);
        scheduledCount += m.scheduledDays;
        doneCount += m.completedScheduledDays;
      } else {
        const effStart = Math.max(startDay, h.startDay);
        for (let d = effStart; d <= endDay; d++) {
          if (CivilCalendar.isScheduled(h.weekdays, d)) {
            scheduledCount += 1;
          }
        }
      }
    }
    // For fixed habits' doneCount in multi-day buckets, derive from checkins directly
    const fixedIds = new Set(
      habits
        .filter((h) => normalizeWeeklyTarget(h.weeklyTarget) === null)
        .map((h) => h.id)
    );
    if (fixedIds.size > 0) {
      const doneLookup = new Set<string>();
      for (const c of checkins) {
        if (c.done && fixedIds.has(c.habitId) && c.dayIndex >= startDay && c.dayIndex <= endDay) {
          doneLookup.add(`${c.habitId}:${c.dayIndex}`);
        }
      }
      for (const h of habits) {
        if (!fixedIds.has(h.id)) continue;
        const effStart = Math.max(startDay, h.startDay);
        for (let d = effStart; d <= endDay; d++) {
          if (CivilCalendar.isScheduled(h.weekdays, d) && doneLookup.has(`${h.id}:${d}`)) {
            doneCount += 1;
          }
        }
      }
    }
  }

  return {
    scheduledCount,
    doneCount,
    rate: scheduledCount === 0 ? null : doneCount / scheduledCount,
  };
}

export class ChartsAnalytics {
  public static habitTrendBuckets(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number,
    maxBuckets: number = 14
  ): HabitTrendBucket[] {
    const s = Math.min(startDay, endDay);
    const e = Math.max(startDay, endDay);
    const cap = Math.max(1, maxBuckets);
    const totalDays = e - s + 1;
    const dayStats =
      totalDays <= cap
        ? StreakCalculator.getPeriodDayStats(habits, checkins, s, e, e)
        : new Map<number, { scheduled: number; done: number }>();

    if (totalDays <= cap) {
      const out: HabitTrendBucket[] = [];
      for (let d = s; d <= e; d++) {
        const formatted = CivilCalendar.formatShortDate(d);
        const counts = countHabitRange(habits, checkins, dayStats, d, d);
        out.push({
          key: `d:${d}`,
          label: formatted,
          shortLabel: formatted.split(' ')[1] ?? formatted,
          startDay: d,
          endDay: d,
          ...counts,
        });
      }
      return out;
    }

    const firstWeek = CivilCalendar.startOfWeek(s);
    const lastWeek = CivilCalendar.startOfWeek(e);
    const weekCount = Math.floor((lastWeek - firstWeek) / 7) + 1;

    if (weekCount <= cap) {
      const out: HabitTrendBucket[] = [];
      for (let w = 0; w < weekCount; w++) {
        const ws = firstWeek + w * 7;
        const bucketStart = Math.max(s, ws);
        const bucketEnd = Math.min(e, ws + 6);
        const formatted = CivilCalendar.formatShortDate(bucketStart);
        const counts = countHabitRange(habits, checkins, dayStats, bucketStart, bucketEnd);
        out.push({
          key: `w:${ws}`,
          label: `${CivilCalendar.formatShortDate(bucketStart)} – ${CivilCalendar.formatShortDate(bucketEnd)}`,
          shortLabel: formatted.split(' ')[1] ?? formatted,
          startDay: bucketStart,
          endDay: bucketEnd,
          ...counts,
        });
      }
      return out;
    }

    const startLocal = CivilCalendar.toLocalDate(s);
    const endLocal = CivilCalendar.toLocalDate(e);
    const monthCount =
      (endLocal.year - startLocal.year) * 12 + (endLocal.month - startLocal.month) + 1;

    if (monthCount <= cap) {
      const out: HabitTrendBucket[] = [];
      for (let m = 0; m < monthCount; m++) {
        const total = startLocal.year * 12 + (startLocal.month - 1) + m;
        const year = Math.floor(total / 12);
        const month = ((total % 12) + 12) % 12 + 1;
        const monthStart = CivilCalendar.fromLocalDate(year, month, 1);
        const daysInMonth = CivilCalendar.getMonthDays(year, month).days.length;
        const monthEnd = monthStart + daysInMonth - 1;
        const bucketStart = Math.max(s, monthStart);
        const bucketEnd = Math.min(e, monthEnd);
        const counts = countHabitRange(habits, checkins, dayStats, bucketStart, bucketEnd);
        out.push({
          key: `m:${year}-${month}`,
          label: CivilCalendar.formatMonthYear(year, month),
          shortLabel: CivilCalendar.formatShortDate(monthStart).split(' ')[0],
          startDay: bucketStart,
          endDay: bucketEnd,
          ...counts,
        });
      }
      return out;
    }

    const step = Math.ceil(totalDays / cap);
    const out: HabitTrendBucket[] = [];
    for (let cursor = s; cursor <= e; cursor += step) {
      const bucketEnd = Math.min(e, cursor + step - 1);
      const counts = countHabitRange(habits, checkins, dayStats, cursor, bucketEnd);
      out.push({
        key: `r:${cursor}-${bucketEnd}`,
        label: `${CivilCalendar.formatShortDate(cursor)} – ${CivilCalendar.formatShortDate(bucketEnd)}`,
        shortLabel: CivilCalendar.formatShortDate(cursor).split(' ')[0],
        startDay: cursor,
        endDay: bucketEnd,
        ...counts,
      });
    }
    return out;
  }

  public static weekdayHabitStats(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number
  ): WeekdayHabitStat[] {
    const s = Math.min(startDay, endDay);
    const e = Math.max(startDay, endDay);
    const dayStats = StreakCalculator.getPeriodDayStats(habits, checkins, s, e, e);

    const scheduled = new Array<number>(7).fill(0);
    const done = new Array<number>(7).fill(0);

    for (let d = s; d <= e; d++) {
      const entry = dayStats.get(d);
      if (!entry) continue;
      const bit = CivilCalendar.weekdayBit(d);
      scheduled[bit] += entry.scheduled;
      done[bit] += entry.done;
    }

    return [0, 1, 2, 3, 4, 5, 6].map((bit) => ({
      weekdayBit: bit,
      label: CivilCalendar.weekdayShortLabel(bit),
      scheduledCount: scheduled[bit],
      doneCount: done[bit],
      rate: scheduled[bit] === 0 ? null : done[bit] / scheduled[bit],
    }));
  }

  public static weekdayTaskStats(
    tasks: Task[],
    startDay: number,
    endDay: number,
    timeZone?: string
  ): WeekdayTaskStat[] {
    const s = Math.min(startDay, endDay);
    const e = Math.max(startDay, endDay);

    const done = new Array<number>(7).fill(0);
    const notDone = new Array<number>(7).fill(0);

    for (const task of tasks) {
      if (task.deletedAt !== null) continue;
      const status = resolveTaskStatus(task);
      if (status !== 'done' && status !== 'not_done') continue;

      const dayIndex =
        status === 'done'
          ? task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone)
          : task.dueDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);

      if (dayIndex < s || dayIndex > e) continue;

      const bit = CivilCalendar.weekdayBit(dayIndex);
      if (status === 'done') {
        done[bit] += 1;
      } else {
        notDone[bit] += 1;
      }
    }

    return [0, 1, 2, 3, 4, 5, 6].map((bit) => {
      const total = done[bit] + notDone[bit];
      return {
        weekdayBit: bit,
        label: CivilCalendar.weekdayShortLabel(bit),
        doneCount: done[bit],
        notDoneCount: notDone[bit],
        totalCount: total,
        rate: total === 0 ? null : done[bit] / total,
      };
    });
  }
}

import { Task, TaskStatus } from '../types/domain';
import { CivilCalendar } from './civil-calendar';

export interface WeeklyTaskBucket {
  weekStartDay: number;
  label: string;
  count: number;
}

export interface TaskOutcomeBucket {
  key: string;
  label: string;
  shortLabel: string;
  doneCount: number;
  notDoneCount: number;
  archivedCount: number;
}

export interface TaskRangeSummary {
  doneCount: number;
  notDoneCount: number;
  archivedCount: number;
  completionRate: number | null;
  datedDoneCount: number;
  onTimeCount: number;
  lateCount: number;
  onTimeRate: number | null;
  goalsDoneCount: number;
  goalsNotDoneCount: number;
  goalsArchivedCount: number;
  goalsOpenCount: number;
  repeatableDoneCount: number;
}

export interface DayTasksBreakdown {
  done: Task[];
  notDone: Task[];
  archived: Task[];
  dueOpen: Task[];
}

function getStatus(task: Task): TaskStatus {
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

function getOutcomeDay(task: Task, status: TaskStatus, timeZone?: string): number {
  if (status === 'done') {
    return task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
  }
  if (status === 'not_done') {
    return task.dueDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
  }
  return CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
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
      if (task.deletedAt !== null || getStatus(task) !== 'done') continue;
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
    const s = Math.min(startDay, endDay);
    const e = Math.max(startDay, endDay);
    let total = 0;
    for (const task of tasks) {
      if (task.deletedAt !== null || getStatus(task) !== 'done') continue;
      const completedDay = getOutcomeDay(task, 'done', timeZone);
      if (completedDay >= s && completedDay <= e) {
        total += 1;
      }
    }
    return total;
  }

  public static summarizeRange(
    tasks: Task[],
    startDay: number,
    endDay: number,
    timeZone?: string
  ): TaskRangeSummary {
    const s = Math.min(startDay, endDay);
    const e = Math.max(startDay, endDay);

    let doneCount = 0;
    let notDoneCount = 0;
    let archivedCount = 0;
    let datedDoneCount = 0;
    let onTimeCount = 0;
    let goalsDoneCount = 0;
    let goalsNotDoneCount = 0;
    let goalsArchivedCount = 0;
    let goalsOpenCount = 0;
    let repeatableDoneCount = 0;

    for (const task of tasks) {
      if (task.deletedAt !== null) continue;
      const status = getStatus(task);

      if (status === 'open') {
        if (task.dueDay === null) {
          goalsOpenCount += 1;
        }
        continue;
      }

      const eventDay = getOutcomeDay(task, status, timeZone);
      if (eventDay < s || eventDay > e) continue;

      if (status === 'done') {
        doneCount += 1;
        if (task.repeatable) repeatableDoneCount += 1;
        if (task.dueDay === null) {
          goalsDoneCount += 1;
        } else {
          datedDoneCount += 1;
          if (eventDay <= task.dueDay) {
            onTimeCount += 1;
          }
        }
      } else if (status === 'not_done') {
        notDoneCount += 1;
        if (task.dueDay === null) {
          goalsNotDoneCount += 1;
        }
      } else if (status === 'archived') {
        archivedCount += 1;
        if (task.dueDay === null) {
          goalsArchivedCount += 1;
        }
      }
    }

    const judgedTotal = doneCount + notDoneCount;
    const lateCount = datedDoneCount - onTimeCount;

    return {
      doneCount,
      notDoneCount,
      archivedCount,
      completionRate: judgedTotal === 0 ? null : doneCount / judgedTotal,
      datedDoneCount,
      onTimeCount,
      lateCount,
      onTimeRate: datedDoneCount === 0 ? null : onTimeCount / datedDoneCount,
      goalsDoneCount,
      goalsNotDoneCount,
      goalsArchivedCount,
      goalsOpenCount,
      repeatableDoneCount,
    };
  }

  public static rangeOutcomeBuckets(
    tasks: Task[],
    startDay: number,
    endDay: number,
    maxBuckets: number = 12,
    timeZone?: string
  ): TaskOutcomeBucket[] {
    const s = Math.min(startDay, endDay);
    const e = Math.max(startDay, endDay);

    const events: { day: number; status: 'done' | 'not_done' | 'archived' }[] = [];
    for (const task of tasks) {
      if (task.deletedAt !== null) continue;
      const status = getStatus(task);
      if (status === 'open') continue;
      const day = getOutcomeDay(task, status, timeZone);
      if (day >= s && day <= e) {
        events.push({ day, status });
      }
    }

    const firstWeek = CivilCalendar.startOfWeek(s);
    const lastWeek = CivilCalendar.startOfWeek(e);
    const weekCount = Math.floor((lastWeek - firstWeek) / 7) + 1;

    if (weekCount <= maxBuckets) {
      const bucketsMap = new Map<
        number,
        { doneCount: number; notDoneCount: number; archivedCount: number }
      >();
      for (let w = 0; w < weekCount; w++) {
        bucketsMap.set(firstWeek + w * 7, {
          doneCount: 0,
          notDoneCount: 0,
          archivedCount: 0,
        });
      }
      for (const ev of events) {
        const ws = CivilCalendar.startOfWeek(ev.day);
        const bucket = bucketsMap.get(ws);
        if (!bucket) continue;
        if (ev.status === 'done') bucket.doneCount += 1;
        else if (ev.status === 'not_done') bucket.notDoneCount += 1;
        else bucket.archivedCount += 1;
      }
      const out: TaskOutcomeBucket[] = [];
      for (let w = 0; w < weekCount; w++) {
        const ws = firstWeek + w * 7;
        const formatted = CivilCalendar.formatShortDate(ws);
        const counts = bucketsMap.get(ws)!;
        out.push({
          key: `w:${ws}`,
          label: `Week of ${formatted}`,
          shortLabel: formatted.split(' ')[1] ?? formatted,
          ...counts,
        });
      }
      return out;
    }

    const startLocal = CivilCalendar.toLocalDate(s);
    const endLocal = CivilCalendar.toLocalDate(e);
    const monthCount =
      (endLocal.year - startLocal.year) * 12 + (endLocal.month - startLocal.month) + 1;

    if (monthCount <= maxBuckets) {
      const monthBuckets: {
        year: number;
        month: number;
        doneCount: number;
        notDoneCount: number;
        archivedCount: number;
      }[] = [];
      const idxMap = new Map<string, number>();
      for (let m = 0; m < monthCount; m++) {
        const total = startLocal.year * 12 + (startLocal.month - 1) + m;
        const year = Math.floor(total / 12);
        const month = (((total % 12) + 12) % 12) + 1;
        idxMap.set(`${year}-${month}`, monthBuckets.length);
        monthBuckets.push({
          year,
          month,
          doneCount: 0,
          notDoneCount: 0,
          archivedCount: 0,
        });
      }
      for (const ev of events) {
        const loc = CivilCalendar.toLocalDate(ev.day);
        const idx = idxMap.get(`${loc.year}-${loc.month}`);
        if (idx === undefined) continue;
        if (ev.status === 'done') monthBuckets[idx].doneCount += 1;
        else if (ev.status === 'not_done') monthBuckets[idx].notDoneCount += 1;
        else monthBuckets[idx].archivedCount += 1;
      }
      return monthBuckets.map((b) => {
        const monthShort = CivilCalendar.formatShortDate(
          CivilCalendar.fromLocalDate(b.year, b.month, 1)
        ).split(' ')[0];
        return {
          key: `m:${b.year}-${b.month}`,
          label: CivilCalendar.formatMonthYear(b.year, b.month),
          shortLabel: monthShort,
          doneCount: b.doneCount,
          notDoneCount: b.notDoneCount,
          archivedCount: b.archivedCount,
        };
      });
    }

    const totalDays = e - s + 1;
    const step = Math.ceil(totalDays / maxBuckets);
    const out: TaskOutcomeBucket[] = [];
    for (let cursor = s; cursor <= e; cursor += step) {
      const bucketEnd = Math.min(e, cursor + step - 1);
      let doneCount = 0;
      let notDoneCount = 0;
      let archivedCount = 0;
      for (const ev of events) {
        if (ev.day >= cursor && ev.day <= bucketEnd) {
          if (ev.status === 'done') doneCount += 1;
          else if (ev.status === 'not_done') notDoneCount += 1;
          else archivedCount += 1;
        }
      }
      out.push({
        key: `r:${cursor}-${bucketEnd}`,
        label: `${CivilCalendar.formatShortDate(cursor)} – ${CivilCalendar.formatShortDate(bucketEnd)}`,
        shortLabel: CivilCalendar.formatShortDate(cursor).split(' ')[0],
        doneCount,
        notDoneCount,
        archivedCount,
      });
    }
    return out;
  }

  public static rangeCompletedBuckets(
    tasks: Task[],
    startDay: number,
    endDay: number,
    maxBuckets: number = 12,
    timeZone?: string
  ): { key: string; label: string; shortLabel: string; count: number }[] {
    return TaskAnalytics.rangeOutcomeBuckets(tasks, startDay, endDay, maxBuckets, timeZone).map(
      (b) => ({
        key: b.key,
        label: b.label,
        shortLabel: b.shortLabel,
        count: b.doneCount,
      })
    );
  }

  public static tasksForDay(tasks: Task[], dayIndex: number, timeZone?: string): DayTasksBreakdown {
    const done: Task[] = [];
    const notDone: Task[] = [];
    const archived: Task[] = [];
    const dueOpen: Task[] = [];

    for (const task of tasks) {
      if (task.deletedAt !== null) continue;
      const status = getStatus(task);
      if (status === 'open') {
        if (task.dueDay === dayIndex) {
          dueOpen.push(task);
        }
        continue;
      }
      const eventDay = getOutcomeDay(task, status, timeZone);
      if (eventDay !== dayIndex) continue;

      if (status === 'done') done.push(task);
      else if (status === 'not_done') notDone.push(task);
      else archived.push(task);
    }

    const byId = (a: Task, b: Task) => a.id - b.id;
    done.sort(byId);
    notDone.sort(byId);
    archived.sort(byId);
    dueOpen.sort(byId);

    return { done, notDone, archived, dueOpen };
  }
}

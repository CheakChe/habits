import { Habit, HabitCheckin, Task } from '../../types/domain';
import { CivilCalendar } from '../civil-calendar';
import { HabitSchedule } from '../habit-schedule';
import { resolveTaskStatus } from './shared';
import {
  BacklogFlowBucket,
  RepeatableTaskStat,
  TaskVelocityAndAging,
  WorkloadForecastDay,
} from './types';

export function computeBacklogFlowBuckets(
  tasks: Task[],
  startDay: number,
  endDay: number,
  maxBuckets: number,
  timeZone: string
): BacklogFlowBucket[] {
  if (endDay < startDay) return [];

  interface FlowEvent {
    day: number;
    kind: 'created' | 'done' | 'not_done' | 'archived';
  }
  const events: FlowEvent[] = [];

  for (const task of tasks) {
    if (task.deletedAt !== null) continue;
    const createdDay = CivilCalendar.fromTimestamp(task.createdAt, timeZone);
    if (createdDay >= startDay && createdDay <= endDay) {
      events.push({ day: createdDay, kind: 'created' });
    }
    const status = resolveTaskStatus(task);
    if (status === 'open') continue;
    const closeDay =
      status === 'done'
        ? (task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone))
        : status === 'not_done'
          ? (task.dueDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone))
          : CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
    if (closeDay >= startDay && closeDay <= endDay) {
      events.push({ day: closeDay, kind: status });
    }
  }

  const buildBucket = (
    key: string,
    label: string,
    shortLabel: string,
    bStart: number,
    bEnd: number
  ): BacklogFlowBucket => {
    let createdCount = 0;
    let doneCount = 0;
    let notDoneCount = 0;
    let archivedCount = 0;
    for (const ev of events) {
      if (ev.day < bStart || ev.day > bEnd) continue;
      if (ev.kind === 'created') createdCount += 1;
      else if (ev.kind === 'done') doneCount += 1;
      else if (ev.kind === 'not_done') notDoneCount += 1;
      else archivedCount += 1;
    }
    const closedCount = doneCount + notDoneCount + archivedCount;
    return {
      key,
      label,
      shortLabel,
      createdCount,
      doneCount,
      notDoneCount,
      archivedCount,
      closedCount,
      netFlow: createdCount - closedCount,
    };
  };

  const firstWeek = CivilCalendar.startOfWeek(startDay);
  const lastWeek = CivilCalendar.startOfWeek(endDay);
  const weekCount = Math.floor((lastWeek - firstWeek) / 7) + 1;

  if (weekCount <= maxBuckets) {
    const out: BacklogFlowBucket[] = [];
    for (let w = 0; w < weekCount; w++) {
      const ws = firstWeek + w * 7;
      const bs = Math.max(startDay, ws);
      const be = Math.min(endDay, ws + 6);
      const formatted = CivilCalendar.formatShortDate(bs);
      out.push(
        buildBucket(
          `w:${ws}`,
          `${CivilCalendar.formatShortDate(bs)} – ${CivilCalendar.formatShortDate(be)}`,
          formatted.split(' ')[1] ?? formatted,
          bs,
          be
        )
      );
    }
    return out;
  }

  const startLocal = CivilCalendar.toLocalDate(startDay);
  const endLocal = CivilCalendar.toLocalDate(endDay);
  const monthCount =
    (endLocal.year - startLocal.year) * 12 + (endLocal.month - startLocal.month) + 1;

  if (monthCount <= maxBuckets) {
    const out: BacklogFlowBucket[] = [];
    for (let m = 0; m < monthCount; m++) {
      const total = startLocal.year * 12 + (startLocal.month - 1) + m;
      const year = Math.floor(total / 12);
      const month = (((total % 12) + 12) % 12) + 1;
      const monthStart = CivilCalendar.fromLocalDate(year, month, 1);
      const daysInMonth = CivilCalendar.getMonthDays(year, month).days.length;
      const bs = Math.max(startDay, monthStart);
      const be = Math.min(endDay, monthStart + daysInMonth - 1);
      out.push(
        buildBucket(
          `m:${year}-${month}`,
          CivilCalendar.formatMonthYear(year, month),
          CivilCalendar.formatShortDate(monthStart).split(' ')[0],
          bs,
          be
        )
      );
    }
    return out;
  }

  const totalDays = endDay - startDay + 1;
  const step = Math.ceil(totalDays / maxBuckets);
  const out: BacklogFlowBucket[] = [];
  for (let cursor = startDay; cursor <= endDay; cursor += step) {
    const be = Math.min(endDay, cursor + step - 1);
    out.push(
      buildBucket(
        `r:${cursor}-${be}`,
        `${CivilCalendar.formatShortDate(cursor)} – ${CivilCalendar.formatShortDate(be)}`,
        CivilCalendar.formatShortDate(cursor).split(' ')[0],
        cursor,
        be
      )
    );
  }
  return out;
}

export function computeTaskVelocityAndAging(
  tasks: Task[],
  startDay: number,
  endDay: number,
  todayDay: number,
  timeZone: string
): TaskVelocityAndAging {
  let totalCreatedInRange = 0;
  let totalClosedInRange = 0;
  const lateDeltas: number[] = [];
  const earlyDeltas: number[] = [];
  let datedCycleSum = 0;
  let datedCycleCount = 0;
  let goalsCycleSum = 0;
  let goalsCycleCount = 0;

  let openOverdueCount = 0;
  let overdueAgeSum = 0;
  let maxOverdueAgeDays = 0;
  let oldestOverdueTitle: string | null = null;

  let openGoalsCount = 0;
  let goalAgeSum = 0;
  let maxGoalAge = -1;
  let oldestGoalTitle: string | null = null;

  for (const task of tasks) {
    if (task.deletedAt !== null) continue;
    const createdDay = CivilCalendar.fromTimestamp(task.createdAt, timeZone);
    if (createdDay >= startDay && createdDay <= endDay) {
      totalCreatedInRange += 1;
    }

    const status = resolveTaskStatus(task);
    if (status === 'open') {
      if (task.dueDay !== null && task.dueDay < todayDay) {
        const age = todayDay - task.dueDay;
        openOverdueCount += 1;
        overdueAgeSum += age;
        if (age > maxOverdueAgeDays) {
          maxOverdueAgeDays = age;
          oldestOverdueTitle = task.title;
        }
      } else if (task.dueDay === null) {
        const age = Math.max(0, todayDay - createdDay);
        openGoalsCount += 1;
        goalAgeSum += age;
        if (age > maxGoalAge) {
          maxGoalAge = age;
          oldestGoalTitle = task.title;
        }
      }
      continue;
    }

    const closeDay =
      status === 'done'
        ? (task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone))
        : status === 'not_done'
          ? (task.dueDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone))
          : CivilCalendar.fromTimestamp(task.updatedAt, timeZone);

    if (closeDay < startDay || closeDay > endDay) continue;
    totalClosedInRange += 1;

    if (status === 'done') {
      const cycleDays = Math.max(0, closeDay - createdDay);
      if (task.dueDay === null) {
        goalsCycleSum += cycleDays;
        goalsCycleCount += 1;
      } else {
        datedCycleSum += cycleDays;
        datedCycleCount += 1;
        const diff = closeDay - task.dueDay;
        if (diff > 0) {
          lateDeltas.push(diff);
        } else if (diff < 0) {
          earlyDeltas.push(-diff);
        }
      }
    }
  }

  lateDeltas.sort((a, b) => a - b);
  const lateTasksCount = lateDeltas.length;
  const avgLateDays =
    lateTasksCount === 0
      ? null
      : Math.round((lateDeltas.reduce((acc, v) => acc + v, 0) / lateTasksCount) * 10) / 10;
  const medianLateDays =
    lateTasksCount === 0
      ? null
      : lateTasksCount % 2 === 1
        ? lateDeltas[Math.floor(lateTasksCount / 2)]
        : Math.round(
            ((lateDeltas[lateTasksCount / 2 - 1] + lateDeltas[lateTasksCount / 2]) / 2) * 10
          ) / 10;
  const maxLateDays = lateTasksCount === 0 ? 0 : lateDeltas[lateTasksCount - 1];

  const earlyTasksCount = earlyDeltas.length;
  const avgDaysEarly =
    earlyTasksCount === 0
      ? null
      : Math.round((earlyDeltas.reduce((acc, v) => acc + v, 0) / earlyTasksCount) * 10) / 10;

  return {
    totalCreatedInRange,
    totalClosedInRange,
    netBacklogDelta: totalCreatedInRange - totalClosedInRange,
    lateTasksCount,
    avgLateDays,
    medianLateDays,
    maxLateDays,
    earlyTasksCount,
    avgDaysEarly,
    datedCycleTimeAvgDays:
      datedCycleCount === 0 ? null : Math.round((datedCycleSum / datedCycleCount) * 10) / 10,
    datedCycleCount,
    goalsCycleTimeAvgDays:
      goalsCycleCount === 0 ? null : Math.round((goalsCycleSum / goalsCycleCount) * 10) / 10,
    goalsCycleCount,
    openOverdueCount,
    avgOverdueAgeDays:
      openOverdueCount === 0 ? null : Math.round((overdueAgeSum / openOverdueCount) * 10) / 10,
    maxOverdueAgeDays,
    oldestOverdueTitle,
    openGoalsCount,
    avgGoalAgeDays:
      openGoalsCount === 0 ? null : Math.round((goalAgeSum / openGoalsCount) * 10) / 10,
    oldestGoalTitle,
  };
}

export function computeRepeatableTasks(tasks: Task[], timeZone: string): RepeatableTaskStat[] {
  interface Group {
    title: string;
    doneDays: number[];
    notDoneCount: number;
    openCount: number;
    archivedCount: number;
  }
  const groups = new Map<string, Group>();

  for (const task of tasks) {
    if (task.deletedAt !== null || !task.repeatable) continue;
    const key = task.title.trim().toLowerCase();
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = {
        title: task.title.trim(),
        doneDays: [],
        notDoneCount: 0,
        openCount: 0,
        archivedCount: 0,
      };
      groups.set(key, g);
    }
    const status = resolveTaskStatus(task);
    if (status === 'done') {
      const day = task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
      g.doneDays.push(day);
    } else if (status === 'not_done') {
      g.notDoneCount += 1;
    } else if (status === 'archived') {
      g.archivedCount += 1;
    } else {
      g.openCount += 1;
    }
  }

  const out: RepeatableTaskStat[] = [];
  for (const g of groups.values()) {
    g.doneDays.sort((a, b) => a - b);
    let avgGapDays: number | null = null;
    if (g.doneDays.length >= 2) {
      let gapSum = 0;
      for (let i = 1; i < g.doneDays.length; i++) {
        gapSum += g.doneDays[i] - g.doneDays[i - 1];
      }
      avgGapDays = Math.round((gapSum / (g.doneDays.length - 1)) * 10) / 10;
    }
    out.push({
      title: g.title,
      doneCount: g.doneDays.length,
      notDoneCount: g.notDoneCount,
      openCount: g.openCount,
      archivedCount: g.archivedCount,
      lastDoneDay: g.doneDays.length > 0 ? g.doneDays[g.doneDays.length - 1] : null,
      avgGapDays,
    });
  }

  return out.sort(
    (a, b) =>
      b.doneCount + b.notDoneCount + b.openCount - (a.doneCount + a.notDoneCount + a.openCount) ||
      b.doneCount - a.doneCount
  );
}

export function computeWorkloadForecast(
  habits: Habit[],
  checkins: HabitCheckin[],
  tasks: Task[],
  todayDay: number,
  daysAhead: number = 7
): { forecast: WorkloadForecastDay[]; overdueBacklogCount: number } {
  const dueCounts = new Map<number, number>();
  let overdueBacklogCount = 0;

  for (const task of tasks) {
    if (task.deletedAt !== null || resolveTaskStatus(task) !== 'open') continue;
    if (task.dueDay === null) continue;
    if (task.dueDay < todayDay) {
      overdueBacklogCount += 1;
    } else {
      dueCounts.set(task.dueDay, (dueCounts.get(task.dueDay) ?? 0) + 1);
    }
  }

  // Track remaining flexible quota in the current week
  const todayWs = CivilCalendar.startOfWeek(todayDay);
  const doneInCurrentWeekByHabit = new Map<number, number>();
  for (const h of habits) {
    if (h.archivedAt !== null) continue;
    const doneCount = checkins.filter(
      (c) =>
        c.habitId === h.id &&
        c.dayIndex >= Math.max(h.startDay, todayWs) &&
        c.dayIndex <= todayWs + 6 &&
        HabitSchedule.isCheckinDoneForDay(h, c, c.dayIndex)
    ).length;
    doneInCurrentWeekByHabit.set(h.id, doneCount);
  }

  const forecast: WorkloadForecastDay[] = [];
  for (let offset = 1; offset <= daysAhead; offset++) {
    const dayIndex = todayDay + offset;
    const dayWs = CivilCalendar.startOfWeek(dayIndex);
    let fixedHabitsCount = 0;
    let flexHabitsPendingCount = 0;

    for (const h of habits) {
      if (h.archivedAt !== null || h.startDay > dayIndex) continue;
      const sc = HabitSchedule.getAtDay(h, dayIndex);
      if (sc.weeklyTarget === null) {
        if (CivilCalendar.isScheduled(sc.weekdays, dayIndex)) {
          fixedHabitsCount += 1;
        }
      } else {
        const eligibleMask = sc.weekdays & 0x7f || 0x7f;
        if (!CivilCalendar.isScheduled(eligibleMask, dayIndex)) continue;
        if (dayWs === todayWs) {
          const doneSoFar = doneInCurrentWeekByHabit.get(h.id) ?? 0;
          if (doneSoFar < sc.weeklyTarget) {
            flexHabitsPendingCount += 1;
          }
        } else {
          flexHabitsPendingCount += 1;
        }
      }
    }

    const tasksDueCount = dueCounts.get(dayIndex) ?? 0;
    const formatted = CivilCalendar.formatShortDate(dayIndex);
    forecast.push({
      dayIndex,
      label: formatted,
      shortLabel: formatted.split(' ')[1] ?? formatted,
      weekdayLabel: CivilCalendar.weekdayShortLabel(CivilCalendar.weekdayBit(dayIndex)),
      fixedHabitsCount,
      flexHabitsPendingCount,
      tasksDueCount,
      totalLoad: fixedHabitsCount + flexHabitsPendingCount + tasksDueCount,
    });
  }

  return { forecast, overdueBacklogCount };
}

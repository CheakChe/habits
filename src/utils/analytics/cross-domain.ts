import { Habit, HabitCheckin, Task } from '../../types/domain';
import { CivilCalendar } from '../civil-calendar';
import { StreakCalculator } from '../streak-calculator';
import { classifyRatioTone, resolveTaskStatus } from './shared';
import { CrossDomainLoadBucket, MultiModeHeatmapCell, MultiModeHeatmapData } from './types';

export function computeCrossDomainLoad(
  habits: Habit[],
  checkins: HabitCheckin[],
  tasks: Task[],
  startDay: number,
  endDay: number,
  todayDay: number,
  timeZone: string
): CrossDomainLoadBucket[] {
  const buckets: Record<
    'light' | 'medium' | 'heavy',
    { daysCount: number; scheduledCount: number; doneCount: number; perfectDaysCount: number }
  > = {
    light: { daysCount: 0, scheduledCount: 0, doneCount: 0, perfectDaysCount: 0 },
    medium: { daysCount: 0, scheduledCount: 0, doneCount: 0, perfectDaysCount: 0 },
    heavy: { daysCount: 0, scheduledCount: 0, doneCount: 0, perfectDaysCount: 0 },
  };

  if (endDay < startDay || habits.length === 0) {
    return [
      {
        id: 'light',
        label: 'Light Days',
        taskCountLabel: '0–1 tasks',
        ...buckets.light,
        habitRate: null,
      },
      {
        id: 'medium',
        label: 'Medium Days',
        taskCountLabel: '2–3 tasks',
        ...buckets.medium,
        habitRate: null,
      },
      {
        id: 'heavy',
        label: 'Heavy Days',
        taskCountLabel: '4+ tasks',
        ...buckets.heavy,
        habitRate: null,
      },
    ];
  }

  const dayStats = StreakCalculator.getPeriodDayStats(habits, checkins, startDay, endDay, todayDay);

  const tasksPerDay = new Map<number, Set<number>>();
  const registerTaskDay = (day: number, taskId: number) => {
    if (day < startDay || day > endDay) return;
    let set = tasksPerDay.get(day);
    if (!set) {
      set = new Set<number>();
      tasksPerDay.set(day, set);
    }
    set.add(taskId);
  };

  for (const task of tasks) {
    if (task.deletedAt !== null) continue;
    const status = resolveTaskStatus(task);
    if (status === 'archived') continue;
    if (task.dueDay !== null) {
      registerTaskDay(task.dueDay, task.id);
    }
    if (status === 'done') {
      const doneDay = task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
      registerTaskDay(doneDay, task.id);
    }
  }

  for (let d = startDay; d <= endDay; d++) {
    const entry = dayStats.get(d);
    if (!entry || entry.scheduled <= 0) continue;
    const taskCount = tasksPerDay.get(d)?.size ?? 0;
    const key = taskCount <= 1 ? 'light' : taskCount <= 3 ? 'medium' : 'heavy';
    buckets[key].daysCount += 1;
    buckets[key].scheduledCount += entry.scheduled;
    buckets[key].doneCount += entry.done;
    if (entry.done >= entry.scheduled) {
      buckets[key].perfectDaysCount += 1;
    }
  }

  return [
    {
      id: 'light',
      label: 'Light Task Days',
      taskCountLabel: '0–1 tasks',
      ...buckets.light,
      habitRate:
        buckets.light.scheduledCount === 0
          ? null
          : buckets.light.doneCount / buckets.light.scheduledCount,
    },
    {
      id: 'medium',
      label: 'Medium Task Days',
      taskCountLabel: '2–3 tasks',
      ...buckets.medium,
      habitRate:
        buckets.medium.scheduledCount === 0
          ? null
          : buckets.medium.doneCount / buckets.medium.scheduledCount,
    },
    {
      id: 'heavy',
      label: 'Heavy Task Days',
      taskCountLabel: '4+ tasks',
      ...buckets.heavy,
      habitRate:
        buckets.heavy.scheduledCount === 0
          ? null
          : buckets.heavy.doneCount / buckets.heavy.scheduledCount,
    },
  ];
}

export function computeMultiModeHeatmap(
  habits: Habit[],
  checkins: HabitCheckin[],
  tasks: Task[],
  startDay: number,
  endDay: number,
  todayDay: number,
  timeZone: string
): MultiModeHeatmapData {
  const effectiveEnd = Math.min(endDay, todayDay);
  const maxWeeks = 104;
  const minAllowedStart = effectiveEnd - (maxWeeks * 7 - 1);
  const clampedStart = Math.max(Math.min(startDay, effectiveEnd), minAllowedStart);
  const isCapped = clampedStart > startDay;

  const firstWeekStart = CivilCalendar.startOfWeek(clampedStart);
  const endWeekStart = CivilCalendar.startOfWeek(effectiveEnd);
  const weeksCount = Math.max(1, Math.floor((endWeekStart - firstWeekStart) / 7) + 1);

  const habitStats = StreakCalculator.getPeriodDayStats(
    habits,
    checkins,
    clampedStart,
    effectiveEnd,
    todayDay
  );

  const taskDayMap = new Map<number, { done: number; notDone: number; dueOpen: number }>();
  const getT = (d: number) => {
    let item = taskDayMap.get(d);
    if (!item) {
      item = { done: 0, notDone: 0, dueOpen: 0 };
      taskDayMap.set(d, item);
    }
    return item;
  };

  for (const task of tasks) {
    if (task.deletedAt !== null) continue;
    const status = resolveTaskStatus(task);
    if (status === 'done') {
      const day = task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
      if (day >= clampedStart && day <= effectiveEnd) {
        getT(day).done += 1;
      }
    } else if (status === 'not_done') {
      const day = task.dueDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone);
      if (day >= clampedStart && day <= effectiveEnd) {
        getT(day).notDone += 1;
      }
    } else if (status === 'open' && task.dueDay !== null) {
      if (task.dueDay >= clampedStart && task.dueDay <= effectiveEnd) {
        getT(task.dueDay).dueOpen += 1;
      }
    }
  }

  const weeks: MultiModeHeatmapData['weeks'] = [];
  let lastMonth = -1;
  let totalTaskDone = 0;
  let totalHabitDone = 0;

  for (let w = 0; w < weeksCount; w++) {
    const weekStart = firstWeekStart + w * 7;
    const startLocal = CivilCalendar.toLocalDate(weekStart);
    let monthLabel = '';
    if (startLocal.month !== lastMonth) {
      const shortMonth = CivilCalendar.formatShortDate(weekStart).split(' ')[0];
      if (w === 0 && weeksCount > 4) {
        const nextLocal = CivilCalendar.toLocalDate(weekStart + 7);
        if (nextLocal.month === startLocal.month) {
          monthLabel = shortMonth;
        }
      } else {
        monthLabel = shortMonth;
      }
      lastMonth = startLocal.month;
    }

    const days: MultiModeHeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const dayIndex = weekStart + d;
      if (dayIndex < clampedStart || dayIndex > effectiveEnd) {
        days.push({
          dayIndex,
          inRange: false,
          habitsDone: 0,
          habitsScheduled: 0,
          tasksDone: 0,
          tasksNotDone: 0,
          tasksDueOpen: 0,
          habitTone: 'future',
          taskTone: 'future',
          combinedTone: 'future',
        });
        continue;
      }

      const hEntry = habitStats.get(dayIndex);
      const habitsScheduled = hEntry?.scheduled ?? 0;
      const habitsDone = hEntry?.done ?? 0;
      totalHabitDone += habitsDone;

      const tEntry = taskDayMap.get(dayIndex);
      const tasksDone = tEntry?.done ?? 0;
      const tasksNotDone = tEntry?.notDone ?? 0;
      const tasksDueOpen = tEntry?.dueOpen ?? 0;
      totalTaskDone += tasksDone;

      const habitTone = classifyRatioTone(dayIndex, todayDay, habitsScheduled, habitsDone, false);

      const taskTotal = tasksDone + tasksNotDone + tasksDueOpen;
      const taskTone = classifyRatioTone(dayIndex, todayDay, taskTotal, tasksDone, false);

      const combinedTotal = habitsScheduled + taskTotal;
      const combinedDone = habitsDone + tasksDone;
      const combinedTone = classifyRatioTone(
        dayIndex,
        todayDay,
        combinedTotal,
        combinedDone,
        false
      );

      days.push({
        dayIndex,
        inRange: true,
        habitsDone,
        habitsScheduled,
        tasksDone,
        tasksNotDone,
        tasksDueOpen,
        habitTone,
        taskTone,
        combinedTone,
      });
    }
    weeks.push({ weekStart, monthLabel, days });
  }

  return {
    weeks,
    clampedStart,
    effectiveEnd,
    isCapped,
    totalTaskDone,
    totalHabitDone,
  };
}

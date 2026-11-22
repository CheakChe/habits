import { Habit, HabitCheckin, Task, TaskStatus, normalizeWeeklyTarget } from '../types/domain';
import { CivilCalendar } from './civil-calendar';

export type TaskFilterMode =
  | 'all'
  | 'today'
  | 'overdue'
  | 'nodate'
  | 'completed'
  | 'not_done'
  | 'archived';
export type TaskStatusBucket =
  | 'overdue'
  | 'today'
  | 'upcoming'
  | 'nodate'
  | 'completed'
  | 'not_done'
  | 'archived';
export type TaskStatusFilterSelection = 'all' | TaskStatusBucket[];

export const TASK_STATUS_BUCKETS: readonly TaskStatusBucket[] = [
  'overdue',
  'today',
  'upcoming',
  'nodate',
  'completed',
  'not_done',
  'archived',
] as const;

export const OPEN_TASK_BUCKETS: TaskStatusBucket[] = [
  'overdue',
  'today',
  'upcoming',
  'nodate',
];

export type TaskSortMode = 'default' | 'due_asc' | 'due_desc' | 'newest' | 'title';

export interface TodayTasksPartition {
  overdue: Task[];
  dueToday: Task[];
}

export interface FlexibleWeekStatus {
  target: number;
  effectiveTarget: number;
  doneInWeek: number;
  isDoneOnDay: boolean;
  remainingDays: number;
  remainingNeeded: number;
  mustDoToday: boolean;
  isComplete: boolean;
}

export class TodayBoard {
  public static getStatus(task: Task): TaskStatus {
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

  public static getFlexibleWeekStatus(
    habit: Habit,
    checkins: HabitCheckin[],
    dayIndex: number
  ): FlexibleWeekStatus | null {
    const target = normalizeWeeklyTarget(habit.weeklyTarget);
    if (target === null || habit.startDay > dayIndex) {
      return null;
    }

    const weekStart = CivilCalendar.startOfWeek(dayIndex);
    const weekEnd = weekStart + 6;
    const effectiveStart = Math.max(weekStart, habit.startDay);
    const availableDays = Math.max(0, weekEnd - effectiveStart + 1);
    const effectiveTarget = Math.min(target, availableDays);

    let doneInWeek = 0;
    let isDoneOnDay = false;
    for (const entry of checkins) {
      if (
        entry.habitId === habit.id &&
        entry.done &&
        entry.dayIndex >= effectiveStart &&
        entry.dayIndex <= weekEnd
      ) {
        doneInWeek += 1;
        if (entry.dayIndex === dayIndex) {
          isDoneOnDay = true;
        }
      }
    }

    const remainingDays = Math.max(0, weekEnd - Math.max(dayIndex, effectiveStart) + 1);
    const remainingNeeded = Math.max(0, effectiveTarget - doneInWeek);
    const mustDoToday =
      !isDoneOnDay && remainingNeeded > 0 && remainingDays <= remainingNeeded;

    return {
      target,
      effectiveTarget,
      doneInWeek,
      isDoneOnDay,
      remainingDays,
      remainingNeeded,
      mustDoToday,
      isComplete: effectiveTarget > 0 && doneInWeek >= effectiveTarget,
    };
  }

  public static getScheduledHabits(
    habits: Habit[],
    dayIndex: number,
    checkins: HabitCheckin[] = []
  ): Habit[] {
    return habits
      .filter((habit) => {
        if (habit.archivedAt !== null || habit.startDay > dayIndex) {
          return false;
        }
        const flex = TodayBoard.getFlexibleWeekStatus(habit, checkins, dayIndex);
        if (flex !== null) {
          return flex.isDoneOnDay || flex.doneInWeek < flex.effectiveTarget;
        }
        return CivilCalendar.isScheduled(habit.weekdays, dayIndex);
      })
      .sort((a, b) => a.id - b.id);
  }

  public static getTodayAndOverdueTasks(tasks: Task[], todayDay: number): TodayTasksPartition {
    const overdue: Task[] = [];
    const dueToday: Task[] = [];

    for (const task of tasks) {
      if (
        task.deletedAt !== null ||
        TodayBoard.getStatus(task) !== 'open' ||
        task.dueDay === null
      ) {
        continue;
      }
      if (task.dueDay < todayDay) {
        overdue.push(task);
      } else if (task.dueDay === todayDay) {
        dueToday.push(task);
      }
    }

    overdue.sort((a, b) => (a.dueDay ?? 0) - (b.dueDay ?? 0) || a.id - b.id);
    dueToday.sort((a, b) => a.id - b.id);

    return { overdue, dueToday };
  }

  public static getNoDateTasks(tasks: Task[]): Task[] {
    return tasks
      .filter(
        (task) =>
          task.deletedAt === null &&
          TodayBoard.getStatus(task) === 'open' &&
          task.dueDay === null
      )
      .sort((a, b) => a.id - b.id);
  }

  public static suggestNextOccurrenceDueDay(task: Task, todayDay: number): number | null {
    if (task.dueDay === null) return null;
    return Math.max(todayDay + 1, task.dueDay + 1);
  }

  public static filterTasks(
    tasks: Task[],
    todayDay: number,
    filter: TaskFilterMode,
    searchQuery: string = '',
    sort: TaskSortMode = 'default'
  ): Task[] {
    const q = searchQuery.trim().toLowerCase();

    return tasks
      .filter((task) => {
        if (task.deletedAt !== null) return false;
        const status = TodayBoard.getStatus(task);

        if (filter === 'completed') {
          if (status !== 'done') return false;
        } else if (filter === 'not_done') {
          if (status !== 'not_done') return false;
        } else if (filter === 'archived') {
          if (status !== 'archived') return false;
        } else if (filter === 'today') {
          if (status !== 'open' || task.dueDay !== todayDay) return false;
        } else if (filter === 'overdue') {
          if (status !== 'open' || task.dueDay === null || task.dueDay >= todayDay) return false;
        } else if (filter === 'nodate') {
          if (status !== 'open' || task.dueDay !== null) return false;
        } else {
          if (status !== 'open') return false;
        }

        if (q.length > 0) {
          const inTitle = task.title.toLowerCase().includes(q);
          const inNote = task.note.toLowerCase().includes(q);
          if (!inTitle && !inNote) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sort === 'title') {
          const cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
          return cmp !== 0 ? cmp : a.id - b.id;
        }
        if (sort === 'newest') {
          return b.createdAt - a.createdAt || b.id - a.id;
        }
        if (sort === 'due_asc') {
          if (a.dueDay === null && b.dueDay !== null) return 1;
          if (a.dueDay !== null && b.dueDay === null) return -1;
          if (a.dueDay !== null && b.dueDay !== null && a.dueDay !== b.dueDay) {
            return a.dueDay - b.dueDay;
          }
          return a.id - b.id;
        }
        if (sort === 'due_desc') {
          if (a.dueDay === null && b.dueDay !== null) return 1;
          if (a.dueDay !== null && b.dueDay === null) return -1;
          if (a.dueDay !== null && b.dueDay !== null && a.dueDay !== b.dueDay) {
            return b.dueDay - a.dueDay;
          }
          return a.id - b.id;
        }

        if (filter === 'completed') {
          const dayDiff = (b.completedDay ?? 0) - (a.completedDay ?? 0);
          if (dayDiff !== 0) return dayDiff;
          return b.updatedAt - a.updatedAt;
        }
        if (filter === 'not_done' || filter === 'archived') {
          return b.updatedAt - a.updatedAt || b.id - a.id;
        }
        if (a.dueDay === null && b.dueDay !== null) return 1;
        if (a.dueDay !== null && b.dueDay === null) return -1;
        if (a.dueDay !== null && b.dueDay !== null && a.dueDay !== b.dueDay) {
          return a.dueDay - b.dueDay;
        }
        return a.id - b.id;
      });
  }

  public static getTaskBucket(task: Task, todayDay: number): TaskStatusBucket {
    const status = TodayBoard.getStatus(task);
    if (status === 'done') return 'completed';
    if (status === 'not_done') return 'not_done';
    if (status === 'archived') return 'archived';
    if (task.dueDay === null) return 'nodate';
    if (task.dueDay < todayDay) return 'overdue';
    if (task.dueDay === todayDay) return 'today';
    return 'upcoming';
  }

  public static normalizeStatusFilterSelection(
    raw: unknown
  ): TaskStatusFilterSelection {
    if (raw === 'all') return 'all';
    if (!Array.isArray(raw)) {
      return [...OPEN_TASK_BUCKETS];
    }
    const allowed = new Set<TaskStatusBucket>(TASK_STATUS_BUCKETS);
    const deduped: TaskStatusBucket[] = [];
    for (const item of raw) {
      if (typeof item === 'string' && allowed.has(item as TaskStatusBucket)) {
        const bucket = item as TaskStatusBucket;
        if (!deduped.includes(bucket)) {
          deduped.push(bucket);
        }
      }
    }
    if (deduped.length === TASK_STATUS_BUCKETS.length) {
      return 'all';
    }
    return deduped;
  }

  public static filterTasksByStatuses(
    tasks: Task[],
    todayDay: number,
    selection: TaskStatusFilterSelection,
    searchQuery: string = '',
    sort: TaskSortMode = 'default'
  ): Task[] {
    const q = searchQuery.trim().toLowerCase();
    const activeSet =
      selection === 'all' ? null : new Set<TaskStatusBucket>(selection);

    if (activeSet && activeSet.size === 0) {
      return [];
    }

    return tasks
      .filter((task) => {
        if (task.deletedAt !== null) return false;
        if (activeSet) {
          const bucket = TodayBoard.getTaskBucket(task, todayDay);
          if (!activeSet.has(bucket)) return false;
        }
        if (q.length > 0) {
          const inTitle = task.title.toLowerCase().includes(q);
          const inNote = task.note.toLowerCase().includes(q);
          if (!inTitle && !inNote) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === 'title') {
          const cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
          return cmp !== 0 ? cmp : a.id - b.id;
        }
        if (sort === 'newest') {
          return b.createdAt - a.createdAt || b.id - a.id;
        }
        if (sort === 'due_asc') {
          if (a.dueDay === null && b.dueDay !== null) return 1;
          if (a.dueDay !== null && b.dueDay === null) return -1;
          if (a.dueDay !== null && b.dueDay !== null && a.dueDay !== b.dueDay) {
            return a.dueDay - b.dueDay;
          }
          return a.id - b.id;
        }
        if (sort === 'due_desc') {
          if (a.dueDay === null && b.dueDay !== null) return 1;
          if (a.dueDay !== null && b.dueDay === null) return -1;
          if (a.dueDay !== null && b.dueDay !== null && a.dueDay !== b.dueDay) {
            return b.dueDay - a.dueDay;
          }
          return a.id - b.id;
        }

        // Default ordering across arbitrary status combinations:
        // Open tasks first (dueDay ascending, null dueDay last), then Completed, Not Done, Archived.
        const sa = TodayBoard.getStatus(a);
        const sb = TodayBoard.getStatus(b);
        const rank = (s: TaskStatus): number =>
          s === 'open' ? 0 : s === 'done' ? 1 : s === 'not_done' ? 2 : 3;
        const ra = rank(sa);
        const rb = rank(sb);
        if (ra !== rb) return ra - rb;

        if (sa === 'open') {
          if (a.dueDay === null && b.dueDay !== null) return 1;
          if (a.dueDay !== null && b.dueDay === null) return -1;
          if (a.dueDay !== null && b.dueDay !== null && a.dueDay !== b.dueDay) {
            return a.dueDay - b.dueDay;
          }
          return a.id - b.id;
        }
        if (sa === 'done') {
          const dayDiff = (b.completedDay ?? 0) - (a.completedDay ?? 0);
          if (dayDiff !== 0) return dayDiff;
          return b.updatedAt - a.updatedAt || b.id - a.id;
        }
        return b.updatedAt - a.updatedAt || b.id - a.id;
      });
  }
}

import { Habit, Task, TaskStatus } from '../types/domain';
import { CivilCalendar } from './civil-calendar';

export type TaskFilterMode =
  | 'all'
  | 'today'
  | 'overdue'
  | 'nodate'
  | 'completed'
  | 'not_done'
  | 'archived';
export type TaskSortMode = 'default' | 'due_asc' | 'due_desc' | 'newest' | 'title';

export interface TodayTasksPartition {
  overdue: Task[];
  dueToday: Task[];
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

  public static getScheduledHabits(habits: Habit[], dayIndex: number): Habit[] {
    return habits
      .filter(
        (habit) =>
          habit.archivedAt === null &&
          habit.startDay <= dayIndex &&
          CivilCalendar.isScheduled(habit.weekdays, dayIndex)
      )
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
}

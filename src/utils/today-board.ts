import { Habit, Task } from '../types/domain';
import { CivilCalendar } from './civil-calendar';

export type TaskFilterMode = 'all' | 'today' | 'overdue' | 'nodate' | 'completed';

export interface TodayTasksPartition {
  overdue: Task[];
  dueToday: Task[];
}

export class TodayBoard {
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
      if (task.deletedAt !== null || task.done || task.dueDay === null) continue;
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

  public static filterTasks(
    tasks: Task[],
    todayDay: number,
    filter: TaskFilterMode,
    searchQuery: string = ''
  ): Task[] {
    const q = searchQuery.trim().toLowerCase();

    return tasks
      .filter((task) => {
        if (task.deletedAt !== null) return false;

        if (filter === 'completed') {
          if (!task.done) return false;
        } else if (filter === 'today') {
          if (task.done || task.dueDay !== todayDay) return false;
        } else if (filter === 'overdue') {
          if (task.done || task.dueDay === null || task.dueDay >= todayDay) return false;
        } else if (filter === 'nodate') {
          if (task.done || task.dueDay !== null) return false;
        } else {
          if (task.done) return false;
        }

        if (q.length > 0) {
          const inTitle = task.title.toLowerCase().includes(q);
          const inNote = task.note.toLowerCase().includes(q);
          if (!inTitle && !inNote) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (filter === 'completed') {
          const dayDiff = (b.completedDay ?? 0) - (a.completedDay ?? 0);
          if (dayDiff !== 0) return dayDiff;
          return b.updatedAt - a.updatedAt;
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

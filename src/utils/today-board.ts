import { Habit, Task } from '../types/domain';
import { CivilCalendar } from './civil-calendar';

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
}

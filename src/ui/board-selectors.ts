import { Accessor, createMemo } from 'solid-js';
import { DomainSnapshot, Habit, HabitCheckin, ReminderSlot, Task } from '../types/domain';
import { HabitSchedule } from '../utils/habit-schedule';
import { ReminderPlanner } from '../utils/reminder-planner';
import { StreakCalculator } from '../utils/streak-calculator';
import {
  TaskSortMode,
  TaskStatusBucket,
  TaskStatusFilterSelection,
  TodayBoard,
} from '../utils/today-board';
import { createLazyActiveMemo } from './lazy-memo';

export interface TodayHabitMetrics {
  metrics: ReturnType<typeof StreakCalculator.calculate>;
  weekly: ReturnType<typeof StreakCalculator.calculateWeeklyProgress>;
  flexStatus: ReturnType<typeof TodayBoard.getFlexibleWeekStatus>;
}

export interface TodayViewData {
  scheduledHabits: Habit[];
  partitionedTasks: ReturnType<typeof TodayBoard.getTodayAndOverdueTasks>;
  noDateTasks: Task[];
  checkinMap: Map<number, HabitCheckin>;
  noteMap: Map<number, string>;
  activeSlotMap: Map<string, ReminderSlot>;
  completedHabitsCount: number;
  habitMetricsMap: Map<number, TodayHabitMetrics>;
}

export interface HabitsHabitMetrics {
  metrics: ReturnType<typeof StreakCalculator.calculate>;
  weekly: ReturnType<typeof StreakCalculator.calculateWeeklyProgress>;
  activeSchedule: ReturnType<typeof HabitSchedule.getAtDay>;
}

export interface HabitsViewData {
  activeCount: number;
  archivedCount: number;
  activeSlotMap: Map<string, ReminderSlot>;
  habitMetricsMap: Map<number, HabitsHabitMetrics>;
}

export interface TasksViewData {
  visibleTasks: Task[];
  activeSlotMap: Map<string, ReminderSlot>;
  bucketCounts: Record<TaskStatusBucket, number>;
  baseFiltered: Task[];
}

function buildActiveSlotMap(snapshot: DomainSnapshot): Map<string, ReminderSlot> {
  const map = new Map<string, ReminderSlot>();
  for (const slot of ReminderPlanner.getActiveSlots(snapshot)) {
    map.set(slot.id, slot);
  }
  return map;
}

export function createTodayDataSelector(input: {
  isActive: Accessor<boolean>;
  snapshot: Accessor<DomainSnapshot>;
  todayDay: Accessor<number>;
}): Accessor<TodayViewData | null> {
  return createLazyActiveMemo(
    input.isActive,
    () => {
      input.snapshot();
      input.todayDay();
    },
    () => {
      const snapshot = input.snapshot();
      const todayDay = input.todayDay();
      const scheduledHabits = TodayBoard.getScheduledHabits(
        snapshot.habits,
        todayDay,
        snapshot.checkins
      );
      const partitionedTasks = TodayBoard.getTodayAndOverdueTasks(snapshot.tasks, todayDay);
      const noDateTasks = TodayBoard.getNoDateTasks(snapshot.tasks);

      const checkinMap = new Map<number, HabitCheckin>();
      for (const c of snapshot.checkins) {
        if (c.dayIndex === todayDay) {
          checkinMap.set(c.habitId, c);
        }
      }

      const noteMap = new Map<number, string>();
      for (const n of snapshot.notes) {
        if (n.dayIndex === todayDay) {
          noteMap.set(n.habitId, n.text);
        }
      }

      const activeSlotMap = buildActiveSlotMap(snapshot);

      let completedHabitsCount = 0;
      const habitMetricsMap = new Map<number, TodayHabitMetrics>();
      for (const habit of scheduledHabits) {
        if (HabitSchedule.isCheckinDoneForDay(habit, checkinMap.get(habit.id), todayDay)) {
          completedHabitsCount += 1;
        }
        habitMetricsMap.set(habit.id, {
          metrics: StreakCalculator.calculate(
            habit,
            snapshot.checkins,
            todayDay - 29,
            todayDay,
            true
          ),
          weekly: StreakCalculator.calculateWeeklyProgress(habit, snapshot.checkins, todayDay),
          flexStatus: TodayBoard.getFlexibleWeekStatus(habit, snapshot.checkins, todayDay),
        });
      }

      return {
        scheduledHabits,
        partitionedTasks,
        noDateTasks,
        checkinMap,
        noteMap,
        activeSlotMap,
        completedHabitsCount,
        habitMetricsMap,
      };
    }
  );
}

export function createHabitsDataSelector(input: {
  isActive: Accessor<boolean>;
  snapshot: Accessor<DomainSnapshot>;
  todayDay: Accessor<number>;
}): Accessor<HabitsViewData | null> {
  return createLazyActiveMemo(
    input.isActive,
    () => {
      input.snapshot();
      input.todayDay();
    },
    () => {
      const snapshot = input.snapshot();
      const todayDay = input.todayDay();
      let activeCount = 0;
      const habitMetricsMap = new Map<number, HabitsHabitMetrics>();

      for (const habit of snapshot.habits) {
        if (habit.archivedAt === null) {
          activeCount += 1;
        }
        habitMetricsMap.set(habit.id, {
          metrics: StreakCalculator.calculate(
            habit,
            snapshot.checkins,
            todayDay - 29,
            todayDay,
            true
          ),
          weekly: StreakCalculator.calculateWeeklyProgress(habit, snapshot.checkins, todayDay),
          activeSchedule: HabitSchedule.getAtDay(habit, todayDay),
        });
      }

      return {
        activeCount,
        archivedCount: snapshot.habits.length - activeCount,
        activeSlotMap: buildActiveSlotMap(snapshot),
        habitMetricsMap,
      };
    }
  );
}

export function createTasksDataSelector(input: {
  isActive: Accessor<boolean>;
  snapshot: Accessor<DomainSnapshot>;
  todayDay: Accessor<number>;
  statusFilter: Accessor<TaskStatusFilterSelection>;
  sortMode: Accessor<TaskSortMode>;
}): Accessor<TasksViewData | null> {
  const statusFilterKey = createMemo(() => {
    const sel = input.statusFilter();
    return sel === 'all' ? 'all' : sel.join(',');
  });

  return createLazyActiveMemo(
    input.isActive,
    () => {
      input.snapshot();
      input.todayDay();
      statusFilterKey();
      input.sortMode();
    },
    () => {
      const snapshot = input.snapshot();
      const todayDay = input.todayDay();
      const visibleTasks = snapshot.tasks.filter((task) => task.deletedAt === null);
      const bucketCounts: Record<TaskStatusBucket, number> = {
        overdue: 0,
        today: 0,
        upcoming: 0,
        nodate: 0,
        completed: 0,
        not_done: 0,
        archived: 0,
      };
      for (const task of visibleTasks) {
        const bucket = TodayBoard.getTaskBucket(task, todayDay);
        bucketCounts[bucket] += 1;
      }

      return {
        visibleTasks,
        activeSlotMap: buildActiveSlotMap(snapshot),
        bucketCounts,
        baseFiltered: TodayBoard.filterTasksByStatuses(
          snapshot.tasks,
          todayDay,
          input.statusFilter(),
          '',
          input.sortMode()
        ),
      };
    }
  );
}

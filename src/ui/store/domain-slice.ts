import { Accessor, Setter, createSignal, untrack } from 'solid-js';
import { HabitDatabase } from '../../db/habit-database';
import { BackupService } from '../../sync/backup-service';
import { DomainSnapshot, Habit, ScheduleApplyScope, Task, TaskStatus } from '../../types/domain';
import { HabitSchedule } from '../../utils/habit-schedule';
import { Helpers } from '../../utils/helpers';
import { TodayBoard } from '../../utils/today-board';

export type TaskModalMode = 'create' | 'edit' | 'next';

export interface TaskDraftPrefill {
  title: string;
  note: string;
  dueDay: number | null;
  repeatable: boolean;
  reminderSlotIds?: string[];
}

const EMPTY_SNAPSHOT: DomainSnapshot = {
  habits: [],
  checkins: [],
  notes: [],
  tasks: [],
};

export interface DomainSliceDeps {
  db: HabitDatabase;
  getTodayDay: Accessor<number>;
  onSnapshotReloaded: (snapshot: DomainSnapshot) => void;
  onBackupImported: () => void;
  onSyncSuccessBanner: (text: string) => void;
}

export interface DomainSlice {
  snapshot: Accessor<DomainSnapshot>;
  dbReady: Accessor<boolean>;
  setDbReady: Setter<boolean>;
  habitModalOpen: Accessor<boolean>;
  editingHabit: Accessor<Habit | null>;
  taskModalOpen: Accessor<boolean>;
  taskModalMode: Accessor<TaskModalMode>;
  taskDraftPrefill: Accessor<TaskDraftPrefill | null>;
  editingTask: Accessor<Task | null>;
  reloadFromDb: () => Promise<void>;
  toggleCheckin: (
    habitId: number,
    dayIndex: number,
    nextDone: boolean,
    nextValue?: number
  ) => Promise<void>;
  setCheckinValue: (habitId: number, dayIndex: number, rawValue: number) => Promise<void>;
  incrementCheckinValue: (habitId: number, dayIndex: number, delta: number) => Promise<void>;
  saveNote: (habitId: number, dayIndex: number, text: string) => Promise<void>;
  openCreateHabit: () => void;
  openEditHabit: (habit: Habit) => void;
  closeHabitModal: () => void;
  saveHabit: (data: {
    name: string;
    color: string;
    weekdays: number;
    weeklyTarget?: number | null;
    dailyTarget?: number | null;
    unit?: string | null;
    reminderSlotIds?: string[];
    startDay: number;
    scheduleApplyScope?: ScheduleApplyScope;
    scheduleEffectiveFromDay?: number;
  }) => Promise<void>;
  toggleArchiveHabit: (habit: Habit) => Promise<void>;
  openCreateTask: (options?: { dueDay?: number | null; reminderSlotIds?: string[] }) => void;
  openEditTask: (task: Task) => void;
  closeTaskModal: () => void;
  saveTask: (data: {
    title: string;
    note: string;
    dueDay: number | null;
    repeatable?: boolean;
    reminderSlotIds?: string[];
    status?: TaskStatus;
  }) => Promise<void>;
  quickAddTask: (title: string, dueDay: number | null, repeatable?: boolean) => Promise<void>;
  scheduleTaskForDay: (task: Task, dueDay: number | null) => Promise<void>;
  toggleTaskDone: (task: Task) => Promise<void>;
  deleteTask: (taskId: number) => Promise<void>;
  exportBackup: () => Promise<{ filename: string; bytes: Uint8Array }>;
  importBackup: (fileBytes: Uint8Array) => Promise<void>;
}

export function createDomainSlice(deps: DomainSliceDeps): DomainSlice {
  const [snapshot, setSnapshot] = createSignal<DomainSnapshot>(EMPTY_SNAPSHOT);
  const [dbReady, setDbReady] = createSignal(false);
  const [habitModalOpen, setHabitModalOpen] = createSignal(false);
  const [editingHabit, setEditingHabit] = createSignal<Habit | null>(null);
  const [taskModalOpen, setTaskModalOpen] = createSignal(false);
  const [taskModalMode, setTaskModalMode] = createSignal<TaskModalMode>('create');
  const [taskDraftPrefill, setTaskDraftPrefill] = createSignal<TaskDraftPrefill | null>(null);
  const [editingTask, setEditingTask] = createSignal<Task | null>(null);

  let checkinWriteChain: Promise<void> = Promise.resolve();

  const reloadFromDb = async (): Promise<void> => {
    const data = await deps.db.getAllSnapshot();
    setSnapshot(data);
    setDbReady(true);
    deps.onSnapshotReloaded(data);
  };

  const enqueueCheckinWrite = (task: () => Promise<void>): Promise<void> => {
    const run = checkinWriteChain.then(task, task);
    checkinWriteChain = run.catch(() => undefined);
    return run;
  };

  const writeCheckinValue = async (
    habitId: number,
    dayIndex: number,
    rawValue: number
  ): Promise<void> => {
    const cleanVal = Number.isFinite(rawValue) ? Math.max(0, Math.round(rawValue * 100) / 100) : 0;
    const habit = untrack(snapshot).habits.find((h) => h.id === habitId);
    const activeTarget = habit ? HabitSchedule.getAtDay(habit, dayIndex).dailyTarget : null;
    const done = activeTarget !== null ? cleanVal >= activeTarget : cleanVal > 0;
    await deps.db.upsertCheckin(habitId, dayIndex, done, cleanVal > 0 ? cleanVal : undefined);
    await reloadFromDb();
  };

  const toggleCheckin = async (
    habitId: number,
    dayIndex: number,
    nextDone: boolean,
    nextValue?: number
  ): Promise<void> => {
    return enqueueCheckinWrite(async () => {
      const habit = untrack(snapshot).habits.find((h) => h.id === habitId);
      const activeTarget = habit ? HabitSchedule.getAtDay(habit, dayIndex).dailyTarget : null;

      if (activeTarget !== null) {
        if (nextValue !== undefined) {
          const cleanVal = Number.isFinite(nextValue)
            ? Math.max(0, Math.round(nextValue * 100) / 100)
            : 0;
          const resolvedDone = cleanVal >= activeTarget;
          await deps.db.upsertCheckin(
            habitId,
            dayIndex,
            resolvedDone,
            cleanVal > 0 ? cleanVal : undefined
          );
        } else {
          await deps.db.upsertCheckin(
            habitId,
            dayIndex,
            nextDone,
            nextDone ? activeTarget : undefined
          );
        }
      } else {
        await deps.db.upsertCheckin(habitId, dayIndex, nextDone);
      }
      await reloadFromDb();
    });
  };

  const setCheckinValue = async (
    habitId: number,
    dayIndex: number,
    rawValue: number
  ): Promise<void> => {
    return enqueueCheckinWrite(async () => {
      await writeCheckinValue(habitId, dayIndex, rawValue);
    });
  };

  const incrementCheckinValue = async (
    habitId: number,
    dayIndex: number,
    delta: number
  ): Promise<void> => {
    return enqueueCheckinWrite(async () => {
      const snap = untrack(snapshot);
      const habit = snap.habits.find((h) => h.id === habitId);
      const existing = snap.checkins.find((c) => c.habitId === habitId && c.dayIndex === dayIndex);
      const currentVal = habit
        ? HabitSchedule.getCheckinValueForDay(habit, existing, dayIndex)
        : (existing?.value ?? 0);
      await writeCheckinValue(habitId, dayIndex, currentVal + delta);
    });
  };

  const saveNote = async (habitId: number, dayIndex: number, text: string): Promise<void> => {
    await deps.db.upsertNote(habitId, dayIndex, text);
    await reloadFromDb();
  };

  const openCreateHabit = (): void => {
    setEditingHabit(null);
    setHabitModalOpen(true);
  };

  const openEditHabit = (habit: Habit): void => {
    setEditingHabit(habit);
    setHabitModalOpen(true);
  };

  const closeHabitModal = (): void => {
    setHabitModalOpen(false);
  };

  const saveHabit = async (data: {
    name: string;
    color: string;
    weekdays: number;
    weeklyTarget?: number | null;
    dailyTarget?: number | null;
    unit?: string | null;
    reminderSlotIds?: string[];
    startDay: number;
    scheduleApplyScope?: ScheduleApplyScope;
    scheduleEffectiveFromDay?: number;
  }): Promise<void> => {
    const target = editingHabit();
    if (target) {
      await deps.db.updateHabit(target.id, data);
    } else {
      await deps.db.createHabit(data);
    }
    await reloadFromDb();
  };

  const toggleArchiveHabit = async (habit: Habit): Promise<void> => {
    await deps.db.setHabitArchived(habit.id, habit.archivedAt === null);
    await reloadFromDb();
  };

  const openCreateTask = (options?: {
    dueDay?: number | null;
    reminderSlotIds?: string[];
  }): void => {
    setEditingTask(null);
    setTaskModalMode('create');
    const cleanSlots = options?.reminderSlotIds?.filter((s) => s.trim().length > 0) ?? [];
    setTaskDraftPrefill({
      title: '',
      note: '',
      dueDay: options?.dueDay !== undefined ? options.dueDay : deps.getTodayDay(),
      repeatable: false,
      ...(cleanSlots.length > 0 ? { reminderSlotIds: cleanSlots } : {}),
    });
    setTaskModalOpen(true);
  };

  const openEditTask = (task: Task): void => {
    setEditingTask(task);
    setTaskModalMode('edit');
    setTaskDraftPrefill(null);
    setTaskModalOpen(true);
  };

  const closeTaskModal = (): void => {
    setTaskModalOpen(false);
    setTaskDraftPrefill(null);
  };

  const saveTask = async (data: {
    title: string;
    note: string;
    dueDay: number | null;
    repeatable?: boolean;
    reminderSlotIds?: string[];
    status?: TaskStatus;
  }): Promise<void> => {
    const target = taskModalMode() === 'edit' ? editingTask() : null;
    if (target) {
      const nextStatus = data.status ?? TodayBoard.getStatus(target);
      const prevStatus = TodayBoard.getStatus(target);
      await deps.db.updateTask(target.id, {
        title: data.title,
        note: data.note,
        dueDay: data.dueDay,
        repeatable: data.repeatable,
        reminderSlotIds: data.reminderSlotIds,
        status: nextStatus,
        completedDay:
          nextStatus === 'done'
            ? prevStatus !== 'done'
              ? deps.getTodayDay()
              : target.completedDay
            : null,
      });
    } else {
      await deps.db.createTask(data);
    }
    await reloadFromDb();
  };

  const quickAddTask = async (
    title: string,
    dueDay: number | null,
    repeatable: boolean = false
  ): Promise<void> => {
    await deps.db.createTask({ title, note: '', dueDay, repeatable });
    await reloadFromDb();
  };

  const scheduleTaskForDay = async (task: Task, dueDay: number | null): Promise<void> => {
    await deps.db.updateTask(task.id, { dueDay });
    await reloadFromDb();
  };

  const toggleTaskDone = async (task: Task): Promise<void> => {
    const nextDone = TodayBoard.getStatus(task) !== 'done';
    const todayDay = deps.getTodayDay();
    await deps.db.updateTask(task.id, {
      status: nextDone ? 'done' : 'open',
      done: nextDone,
      completedDay: nextDone ? todayDay : null,
    });
    await reloadFromDb();

    if (nextDone && task.repeatable) {
      setEditingTask(null);
      setTaskModalMode('next');
      const inheritedSlots = task.reminderSlotIds?.filter((s) => s.trim().length > 0) ?? [];
      setTaskDraftPrefill({
        title: task.title,
        note: task.note,
        dueDay: TodayBoard.suggestNextOccurrenceDueDay(task, todayDay),
        repeatable: true,
        ...(inheritedSlots.length > 0 ? { reminderSlotIds: inheritedSlots } : {}),
      });
      setTaskModalOpen(true);
    }
  };

  const deleteTask = async (taskId: number): Promise<void> => {
    await deps.db.deleteTask(taskId);
    await reloadFromDb();
  };

  const exportBackup = async (): Promise<{ filename: string; bytes: Uint8Array }> => {
    const currentSnapshot = await deps.db.getAllSnapshot();
    const bytes = BackupService.exportBytes(currentSnapshot);
    const filename = BackupService.buildFilename(deps.getTodayDay());
    deps.onSyncSuccessBanner(`Backup exported (${Helpers.formatByteSize(bytes.byteLength)}).`);
    return { filename, bytes };
  };

  const importBackup = async (fileBytes: Uint8Array): Promise<void> => {
    const currentSnapshot = await deps.db.getAllSnapshot();
    const { mergedSnapshot, importedCounts } = BackupService.importBytes(
      currentSnapshot,
      fileBytes
    );
    await deps.db.replaceSnapshot(mergedSnapshot);
    await reloadFromDb();
    deps.onBackupImported();
    deps.onSyncSuccessBanner(
      `Backup merged (${importedCounts.habits} habits, ${importedCounts.tasks} tasks imported).`
    );
  };

  return {
    snapshot,
    dbReady,
    setDbReady,
    habitModalOpen,
    editingHabit,
    taskModalOpen,
    taskModalMode,
    taskDraftPrefill,
    editingTask,
    reloadFromDb,
    toggleCheckin,
    setCheckinValue,
    incrementCheckinValue,
    saveNote,
    openCreateHabit,
    openEditHabit,
    closeHabitModal,
    saveHabit,
    toggleArchiveHabit,
    openCreateTask,
    openEditTask,
    closeTaskModal,
    saveTask,
    quickAddTask,
    scheduleTaskForDay,
    toggleTaskDone,
    deleteTask,
    exportBackup,
    importBackup,
  };
}

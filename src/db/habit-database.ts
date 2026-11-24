import {
  DomainSnapshot,
  Habit,
  HabitCheckin,
  HabitNote,
  ScheduleApplyScope,
  Task,
  TaskStatus,
  normalizeCheckinValue,
  normalizeDailyTarget,
  normalizeHabitUnit,
  normalizeWeeklyTarget,
} from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { HabitSchedule } from '../utils/habit-schedule';

const DB_NAME = 'habits_tracker_db';
const DB_VERSION = 1;

export interface CreateHabitInput {
  name: string;
  color: string;
  weekdays: number;
  weeklyTarget?: number | null;
  dailyTarget?: number | null;
  unit?: string | null;
  startDay: number;
}

export interface UpdateHabitPatch {
  name?: string;
  color?: string;
  weekdays?: number;
  weeklyTarget?: number | null;
  dailyTarget?: number | null;
  unit?: string | null;
  startDay?: number;
  scheduleApplyScope?: ScheduleApplyScope;
  scheduleEffectiveFromDay?: number;
}

export interface CreateTaskInput {
  title: string;
  note: string;
  dueDay: number | null;
  repeatable?: boolean;
}

export interface UpdateTaskPatch {
  title?: string;
  note?: string;
  dueDay?: number | null;
  done?: boolean;
  status?: TaskStatus;
  completedDay?: number | null;
  repeatable?: boolean;
}

function normalizeHabitRecord(habit: Habit): Habit {
  const norm = HabitSchedule.normalizeHistory(
    habit.startDay,
    habit.weekdays,
    habit.weeklyTarget,
    habit.scheduleHistory,
    habit.dailyTarget
  );
  const { scheduleHistory: _ignored, dailyTarget: _ignoredDt, unit: _ignoredUnit, ...rest } = habit;
  const cleaned: Habit = {
    ...rest,
    weekdays: norm.weekdays,
    weeklyTarget: norm.weeklyTarget,
  };
  if (norm.dailyTarget !== null) {
    cleaned.dailyTarget = norm.dailyTarget;
  }
  const hasAnyTarget =
    norm.dailyTarget !== null ||
    (norm.scheduleHistory?.some((entry) => normalizeDailyTarget(entry.dailyTarget) !== null) ??
      false);
  const cleanUnit = normalizeHabitUnit(habit.unit);
  if (hasAnyTarget && cleanUnit !== null) {
    cleaned.unit = cleanUnit;
  }
  if (norm.scheduleHistory && norm.scheduleHistory.length > 1) {
    cleaned.scheduleHistory = norm.scheduleHistory;
  }
  return cleaned;
}

function normalizeCheckinRecord(checkin: HabitCheckin): HabitCheckin {
  const cleanValue = normalizeCheckinValue(checkin.value);
  const { value: _ignored, ...rest } = checkin;
  return cleanValue !== undefined ? { ...rest, value: cleanValue } : rest;
}

function normalizeTaskStatus(task: Pick<Task, 'done'> & { status?: TaskStatus }): TaskStatus {
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

export class HabitDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  public open(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains('habits')) {
          db.createObjectStore('habits', { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains('checkins')) {
          const checkins = db.createObjectStore('checkins', {
            keyPath: ['habitId', 'dayIndex'],
          });
          checkins.createIndex('by_habit', 'habitId', { unique: false });
          checkins.createIndex('by_day', 'dayIndex', { unique: false });
        }

        if (!db.objectStoreNames.contains('notes')) {
          const notes = db.createObjectStore('notes', {
            keyPath: ['habitId', 'dayIndex'],
          });
          notes.createIndex('by_habit', 'habitId', { unique: false });
          notes.createIndex('by_day', 'dayIndex', { unique: false });
        }

        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error ?? new Error('Failed to open IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  }

  private promisifyTx(tx: IDBTransaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  }

  public async getAllSnapshot(): Promise<DomainSnapshot> {
    const db = await this.open();
    const tx = db.transaction(['habits', 'checkins', 'notes', 'tasks'], 'readonly');

    const [habits, checkins, notes, tasks] = await Promise.all([
      this.promisifyRequest<Habit[]>(tx.objectStore('habits').getAll()),
      this.promisifyRequest<HabitCheckin[]>(tx.objectStore('checkins').getAll()),
      this.promisifyRequest<HabitNote[]>(tx.objectStore('notes').getAll()),
      this.promisifyRequest<Task[]>(tx.objectStore('tasks').getAll()),
    ]);

    return {
      habits: habits.map((h) => normalizeHabitRecord(h)).sort((a, b) => a.id - b.id),
      checkins: checkins
        .map((c) => normalizeCheckinRecord(c))
        .sort((a, b) => a.habitId - b.habitId || a.dayIndex - b.dayIndex),
      notes: notes.sort((a, b) => a.habitId - b.habitId || a.dayIndex - b.dayIndex),
      tasks: tasks
        .map((t) => {
          const status = normalizeTaskStatus(t);
          const done = status === 'done';
          return {
            ...t,
            done,
            status,
            completedDay:
              t.completedDay !== undefined
                ? done
                  ? t.completedDay
                  : null
                : done
                  ? CivilCalendar.fromTimestamp(t.updatedAt)
                  : null,
            repeatable: Boolean(t.repeatable),
            deletedAt: t.deletedAt ?? null,
          };
        })
        .sort((a, b) => a.id - b.id),
    };
  }

  private nextTimestamp(previousUpdatedAt?: number): number {
    const now = Date.now();
    if (previousUpdatedAt === undefined) return now;
    return Math.max(now, previousUpdatedAt + 1);
  }

  public async replaceSnapshot(snapshot: DomainSnapshot): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(['habits', 'checkins', 'notes', 'tasks'], 'readwrite');

    const habitsStore = tx.objectStore('habits');
    const checkinsStore = tx.objectStore('checkins');
    const notesStore = tx.objectStore('notes');
    const tasksStore = tx.objectStore('tasks');

    habitsStore.clear();
    checkinsStore.clear();
    notesStore.clear();
    tasksStore.clear();

    for (const habit of snapshot.habits) {
      habitsStore.put(normalizeHabitRecord(habit));
    }
    for (const checkin of snapshot.checkins) {
      checkinsStore.put(normalizeCheckinRecord(checkin));
    }
    for (const note of snapshot.notes) {
      notesStore.put(note);
    }
    for (const task of snapshot.tasks) {
      tasksStore.put(task);
    }

    await this.promisifyTx(tx);
  }

  public async createHabit(input: CreateHabitInput): Promise<Habit> {
    const db = await this.open();
    const now = Date.now();
    const tx = db.transaction('habits', 'readwrite');
    const store = tx.objectStore('habits');
    const weeklyTarget = normalizeWeeklyTarget(input.weeklyTarget);
    const dailyTarget = normalizeDailyTarget(input.dailyTarget);
    const cleanUnit = dailyTarget !== null ? normalizeHabitUnit(input.unit) : null;
    const maskedWeekdays = input.weekdays & 0x7f;
    const payload: Omit<Habit, 'id'> = {
      name: input.name.trim(),
      color: input.color,
      weekdays: weeklyTarget !== null && maskedWeekdays === 0 ? 0x7f : maskedWeekdays,
      weeklyTarget,
      startDay: input.startDay,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      ...(dailyTarget !== null ? { dailyTarget } : {}),
      ...(cleanUnit !== null ? { unit: cleanUnit } : {}),
    };
    const key = await this.promisifyRequest<IDBValidKey>(store.add(payload));
    await this.promisifyTx(tx);
    return { id: Number(key), ...payload };
  }

  public async updateHabit(id: number, patch: UpdateHabitPatch): Promise<Habit> {
    const db = await this.open();
    const tx = db.transaction('habits', 'readwrite');
    const store = tx.objectStore('habits');
    const existing = await this.promisifyRequest<Habit | undefined>(store.get(id));
    if (!existing) {
      throw new Error(`Habit ${id} not found`);
    }
    const nextStartDay = patch.startDay !== undefined ? patch.startDay : existing.startDay;
    const rawNextWt =
      patch.weeklyTarget !== undefined
        ? normalizeWeeklyTarget(patch.weeklyTarget)
        : normalizeWeeklyTarget(existing.weeklyTarget);
    const rawNextWd =
      patch.weekdays !== undefined ? patch.weekdays & 0x7f : existing.weekdays & 0x7f;
    const rawNextDt =
      patch.dailyTarget !== undefined
        ? normalizeDailyTarget(patch.dailyTarget)
        : normalizeDailyTarget(existing.dailyTarget);

    const scheduleResult = HabitSchedule.applyEdit({
      existing,
      nextWeekdays: rawNextWd,
      nextWeeklyTarget: rawNextWt,
      nextDailyTarget: rawNextDt,
      nextStartDay,
      scope: patch.scheduleApplyScope,
      effectiveFromDay: patch.scheduleEffectiveFromDay,
    });

    const hasAnyTarget =
      scheduleResult.dailyTarget !== null ||
      (scheduleResult.scheduleHistory?.some(
        (entry) => normalizeDailyTarget(entry.dailyTarget) !== null
      ) ??
        false);
    const candidateUnit =
      patch.unit !== undefined ? normalizeHabitUnit(patch.unit) : normalizeHabitUnit(existing.unit);
    const resolvedUnit = hasAnyTarget
      ? (candidateUnit ??
        (scheduleResult.dailyTarget === null ? normalizeHabitUnit(existing.unit) : null))
      : null;

    const {
      scheduleHistory: _prevHistory,
      dailyTarget: _prevDt,
      unit: _prevUnit,
      ...existingWithoutExtras
    } = existing;
    const updated: Habit = {
      ...existingWithoutExtras,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      color: patch.color !== undefined ? patch.color : existing.color,
      weekdays: scheduleResult.weekdays,
      weeklyTarget: scheduleResult.weeklyTarget,
      startDay: nextStartDay,
      updatedAt: this.nextTimestamp(existing.updatedAt),
    };
    if (scheduleResult.dailyTarget !== null) {
      updated.dailyTarget = scheduleResult.dailyTarget;
    }
    if (resolvedUnit !== null) {
      updated.unit = resolvedUnit;
    }
    if (scheduleResult.scheduleHistory && scheduleResult.scheduleHistory.length > 1) {
      updated.scheduleHistory = scheduleResult.scheduleHistory;
    }
    store.put(updated);
    await this.promisifyTx(tx);
    return updated;
  }

  public async setHabitArchived(id: number, archived: boolean): Promise<Habit> {
    const db = await this.open();
    const tx = db.transaction('habits', 'readwrite');
    const store = tx.objectStore('habits');
    const existing = await this.promisifyRequest<Habit | undefined>(store.get(id));
    if (!existing) {
      throw new Error(`Habit ${id} not found`);
    }
    const now = this.nextTimestamp(existing.updatedAt);
    const updated: Habit = {
      ...existing,
      archivedAt: archived ? now : null,
      updatedAt: now,
    };
    store.put(updated);
    await this.promisifyTx(tx);
    return updated;
  }

  public async upsertCheckin(
    habitId: number,
    dayIndex: number,
    done: boolean,
    value?: number
  ): Promise<HabitCheckin> {
    const db = await this.open();
    const tx = db.transaction('checkins', 'readwrite');
    const store = tx.objectStore('checkins');
    const existing = await this.promisifyRequest<HabitCheckin | undefined>(
      store.get([habitId, dayIndex])
    );
    const cleanValue = normalizeCheckinValue(value);
    const record: HabitCheckin = {
      habitId,
      dayIndex,
      done,
      ...(cleanValue !== undefined ? { value: cleanValue } : {}),
      updatedAt: this.nextTimestamp(existing?.updatedAt),
    };
    store.put(record);
    await this.promisifyTx(tx);
    return record;
  }

  public async upsertNote(habitId: number, dayIndex: number, text: string): Promise<HabitNote> {
    const db = await this.open();
    const tx = db.transaction('notes', 'readwrite');
    const store = tx.objectStore('notes');
    const existing = await this.promisifyRequest<HabitNote | undefined>(
      store.get([habitId, dayIndex])
    );
    const record: HabitNote = {
      habitId,
      dayIndex,
      text: text.trim(),
      updatedAt: this.nextTimestamp(existing?.updatedAt),
    };
    store.put(record);
    await this.promisifyTx(tx);
    return record;
  }

  public async createTask(input: CreateTaskInput): Promise<Task> {
    const db = await this.open();
    const now = this.nextTimestamp();
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    const payload: Omit<Task, 'id'> = {
      title: input.title.trim(),
      note: input.note.trim(),
      dueDay: input.dueDay,
      done: false,
      status: 'open',
      completedDay: null,
      repeatable: Boolean(input.repeatable),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const key = await this.promisifyRequest<IDBValidKey>(store.add(payload));
    await this.promisifyTx(tx);
    return { id: Number(key), ...payload };
  }

  public async updateTask(id: number, patch: UpdateTaskPatch): Promise<Task> {
    const db = await this.open();
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    const existing = await this.promisifyRequest<Task | undefined>(store.get(id));
    if (!existing) {
      throw new Error(`Task ${id} not found`);
    }
    const existingStatus = normalizeTaskStatus(existing);
    const existingCompletedDay =
      existing.completedDay !== undefined
        ? existing.completedDay
        : existingStatus === 'done'
          ? CivilCalendar.fromTimestamp(existing.updatedAt)
          : null;

    let nextStatus: TaskStatus;
    if (patch.status !== undefined) {
      nextStatus = patch.status;
    } else if (patch.done !== undefined) {
      nextStatus = patch.done ? 'done' : 'open';
    } else {
      nextStatus = existingStatus;
    }

    const nextDone = nextStatus === 'done';
    let nextCompletedDay: number | null;
    if (!nextDone) {
      nextCompletedDay = null;
    } else if (patch.completedDay !== undefined) {
      nextCompletedDay = patch.completedDay;
    } else if (existingStatus !== 'done') {
      nextCompletedDay = CivilCalendar.todayDayIndex();
    } else {
      nextCompletedDay = existingCompletedDay;
    }

    const updated: Task = {
      ...existing,
      title: patch.title !== undefined ? patch.title.trim() : existing.title,
      note: patch.note !== undefined ? patch.note.trim() : existing.note,
      dueDay: patch.dueDay !== undefined ? patch.dueDay : existing.dueDay,
      done: nextDone,
      status: nextStatus,
      completedDay: nextCompletedDay,
      repeatable: patch.repeatable !== undefined ? patch.repeatable : Boolean(existing.repeatable),
      deletedAt: existing.deletedAt ?? null,
      updatedAt: this.nextTimestamp(existing.updatedAt),
    };
    store.put(updated);
    await this.promisifyTx(tx);
    return updated;
  }

  public async deleteTask(id: number): Promise<void> {
    const db = await this.open();
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    const existing = await this.promisifyRequest<Task | undefined>(store.get(id));
    if (!existing) {
      await this.promisifyTx(tx);
      return;
    }
    const now = this.nextTimestamp(existing.updatedAt);
    const deleted: Task = {
      ...existing,
      completedDay:
        existing.completedDay !== undefined
          ? existing.completedDay
          : existing.done
            ? CivilCalendar.fromTimestamp(existing.updatedAt)
            : null,
      repeatable: Boolean(existing.repeatable),
      deletedAt: now,
      updatedAt: now,
    };
    store.put(deleted);
    await this.promisifyTx(tx);
  }
}

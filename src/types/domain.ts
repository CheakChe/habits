export interface HabitScheduleVersion {
  /** Local civil dayIndex from which this schedule takes effect (inclusive) */
  fromDay: number;
  /** 7-bit mask: bit 0 = Monday .. bit 6 = Sunday */
  weekdays: number;
  /** Flexible weekly goal (1..7 times per week, Mon–Sun), or null for fixed weekdays */
  weeklyTarget: number | null;
  /** Optional quantitative daily goal (positive number, e.g. 15 min, 20 pages) */
  dailyTarget?: number | null;
}

export type ScheduleApplyScope = 'all' | 'from_day';

export interface ReminderSlot {
  id: string;
  label: string;
  /** 24-hour local time HH:MM */
  time: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Habit {
  id: number;
  name: string;
  color: string;
  /** Current 7-bit mask: bit 0 = Monday .. bit 6 = Sunday */
  weekdays: number;
  /** Current flexible weekly goal (1..7 times per week, Mon–Sun), or null for fixed weekdays */
  weeklyTarget: number | null;
  /** Current quantitative daily target (positive number), or null/omitted for check-off habits */
  dailyTarget?: number | null;
  /** Optional unit label for quantitative habits (e.g. "min", "pages", "reps") */
  unit?: string | null;
  /** Chronological schedule versions when a habit's schedule or target changed from a specific day */
  scheduleHistory?: HabitScheduleVersion[];
  /** Explicitly assigned reminder slot IDs (omitted/empty means no reminder by default) */
  reminderSlotIds?: string[];
  /** Local civil dayIndex when the habit starts */
  startDay: number;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export function normalizeWeeklyTarget(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7) {
    return value;
  }
  return null;
}

export function normalizeDailyTarget(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? rounded : null;
}

export function normalizeHabitUnit(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeCheckinValue(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? rounded : undefined;
}

export function normalizeReminderSlotTime(value: unknown, fallback: string = '20:00'): string {
  if (typeof value !== 'string') return fallback;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallback;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return fallback;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function normalizeReminderSlotLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 32);
}

export function normalizeReminderSlotIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed.length > 0) {
        seen.add(trimmed);
      }
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

export interface HabitCheckin {
  habitId: number;
  dayIndex: number;
  done: boolean;
  /** Optional recorded numeric value for measured habits */
  value?: number;
  updatedAt: number;
}

export interface HabitNote {
  habitId: number;
  dayIndex: number;
  text: string;
  updatedAt: number;
}

export type TaskStatus = 'open' | 'done' | 'not_done' | 'archived';

export interface Task {
  id: number;
  title: string;
  note: string;
  dueDay: number | null;
  done: boolean;
  status: TaskStatus;
  completedDay: number | null;
  repeatable: boolean;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface DomainSnapshot {
  habits: Habit[];
  checkins: HabitCheckin[];
  notes: HabitNote[];
  tasks: Task[];
  reminderSlots?: ReminderSlot[];
}

export type SessionMode = 'guest' | 'google';

export type ActiveTab = 'today' | 'habits' | 'tasks' | 'history';

export type HistorySubTab = 'calendar' | 'charts' | 'advanced';

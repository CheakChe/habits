export interface Habit {
  id: number;
  name: string;
  color: string;
  /** 7-bit mask: bit 0 = Monday .. bit 6 = Sunday */
  weekdays: number;
  /** Local civil dayIndex when the habit starts */
  startDay: number;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface HabitCheckin {
  habitId: number;
  dayIndex: number;
  done: boolean;
  updatedAt: number;
}

export interface HabitNote {
  habitId: number;
  dayIndex: number;
  text: string;
  updatedAt: number;
}

export interface Task {
  id: number;
  title: string;
  note: string;
  dueDay: number | null;
  done: boolean;
  completedDay: number | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface DomainSnapshot {
  habits: Habit[];
  checkins: HabitCheckin[];
  notes: HabitNote[];
  tasks: Task[];
}

export type SessionMode = 'guest' | 'google';

export type ActiveTab = 'today' | 'habits' | 'tasks' | 'history';

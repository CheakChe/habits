import { DomainSnapshot, Habit, Task } from '../types/domain';
import { CivilCalendar } from './civil-calendar';
import { HabitSchedule } from './habit-schedule';
import { TodayBoard } from './today-board';

export type BadgePermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface ReminderPreferences {
  badgeEnabled: boolean;
  calendarEnabled: boolean;
  reminderTime: string; // HH:MM
  horizonDays: number; // 1..7
  calendarId: string | null;
  calendarTimeZone: string | null;
  lastSyncedSignature: string | null;
  lastSyncedAt: number | null;
}

export interface TodayPendingSummary {
  unfinishedHabits: Habit[];
  dueTodayTasks: Task[];
  overdueTasks: Task[];
  unfinishedHabitsCount: number;
  openTasksCount: number;
  totalPendingCount: number;
}

export interface DesiredReminderEvent {
  dayIndex: number;
  dateStr: string;
  summary: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
  signature: string;
}

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  badgeEnabled: true,
  calendarEnabled: false,
  reminderTime: '20:00',
  horizonDays: 3,
  calendarId: null,
  calendarTimeZone: null,
  lastSyncedSignature: null,
  lastSyncedAt: null,
};

function addMinutesToTime(
  hhmm: string,
  deltaMinutes: number
): {
  timeStr: string;
  dayCarry: number;
} {
  const [hStr, mStr] = hhmm.split(':');
  const total = Number(hStr) * 60 + Number(mStr) + deltaMinutes;
  const dayCarry = Math.floor(total / 1440);
  const mod = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(mod / 60)).padStart(2, '0');
  const mm = String(mod % 60).padStart(2, '0');
  return { timeStr: `${hh}:${mm}`, dayCarry };
}

function buildCountPhrase(habitsCount: number, tasksCount: number): string {
  const parts: string[] = [];
  if (habitsCount > 0) {
    parts.push(`${habitsCount} ${habitsCount === 1 ? 'habit' : 'habits'}`);
  }
  if (tasksCount > 0) {
    parts.push(`${tasksCount} ${tasksCount === 1 ? 'task' : 'tasks'}`);
  }
  return parts.join(' & ');
}

export class ReminderPlanner {
  public static normalizeTime(raw: unknown): string {
    if (typeof raw !== 'string') return '20:00';
    const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
    if (!match) return '20:00';
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return '20:00';
    }
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  public static normalizeHorizonDays(raw: unknown): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 3;
    return Math.min(7, Math.max(1, Math.trunc(raw)));
  }

  public static normalizePreferences(raw: unknown): ReminderPreferences {
    if (!raw || typeof raw !== 'object') {
      return { ...DEFAULT_REMINDER_PREFERENCES };
    }
    const obj = raw as Record<string, unknown>;
    return {
      badgeEnabled: typeof obj.badgeEnabled === 'boolean' ? obj.badgeEnabled : true,
      calendarEnabled: typeof obj.calendarEnabled === 'boolean' ? obj.calendarEnabled : false,
      reminderTime: ReminderPlanner.normalizeTime(obj.reminderTime),
      horizonDays: ReminderPlanner.normalizeHorizonDays(obj.horizonDays),
      calendarId:
        typeof obj.calendarId === 'string' && obj.calendarId.trim().length > 0
          ? obj.calendarId.trim()
          : null,
      calendarTimeZone:
        typeof obj.calendarTimeZone === 'string' && obj.calendarTimeZone.trim().length > 0
          ? obj.calendarTimeZone.trim()
          : null,
      lastSyncedSignature:
        typeof obj.lastSyncedSignature === 'string' && obj.lastSyncedSignature.length > 0
          ? obj.lastSyncedSignature
          : null,
      lastSyncedAt:
        typeof obj.lastSyncedAt === 'number' && Number.isFinite(obj.lastSyncedAt)
          ? obj.lastSyncedAt
          : null,
    };
  }

  public static resolveCalendarTimeZone(trackerTimeZone: string): string {
    if (!trackerTimeZone || trackerTimeZone === 'local') {
      const detected = CivilCalendar.getDeviceTimeZone();
      return detected && CivilCalendar.isValidTimeZone(detected) ? detected : 'UTC';
    }
    return CivilCalendar.isValidTimeZone(trackerTimeZone) ? trackerTimeZone : 'UTC';
  }

  public static getTodayPendingSummary(
    snapshot: DomainSnapshot,
    todayDay: number
  ): TodayPendingSummary {
    const scheduledToday = TodayBoard.getScheduledHabits(
      snapshot.habits,
      todayDay,
      snapshot.checkins
    );
    const habitById = new Map<number, Habit>();
    for (const h of snapshot.habits) {
      habitById.set(h.id, h);
    }
    const doneTodayIds = new Set<number>();
    for (const c of snapshot.checkins) {
      if (c.dayIndex !== todayDay) continue;
      const habit = habitById.get(c.habitId);
      if (habit && HabitSchedule.isCheckinDoneForDay(habit, c, todayDay)) {
        doneTodayIds.add(c.habitId);
      }
    }

    const unfinishedHabits = scheduledToday.filter((h) => !doneTodayIds.has(h.id));
    const { overdue, dueToday } = TodayBoard.getTodayAndOverdueTasks(snapshot.tasks, todayDay);

    return {
      unfinishedHabits,
      dueTodayTasks: dueToday,
      overdueTasks: overdue,
      unfinishedHabitsCount: unfinishedHabits.length,
      openTasksCount: overdue.length + dueToday.length,
      totalPendingCount: unfinishedHabits.length + overdue.length + dueToday.length,
    };
  }

  public static buildDesiredEvents(
    snapshot: DomainSnapshot,
    todayDay: number,
    prefs: Pick<ReminderPreferences, 'reminderTime' | 'horizonDays'>,
    trackerTimeZone: string
  ): DesiredReminderEvent[] {
    const reminderTime = ReminderPlanner.normalizeTime(prefs.reminderTime);
    const horizonDays = ReminderPlanner.normalizeHorizonDays(prefs.horizonDays);
    const timeZone = ReminderPlanner.resolveCalendarTimeZone(trackerTimeZone);
    const endCalc = addMinutesToTime(reminderTime, 15);
    const results: DesiredReminderEvent[] = [];

    const todayWeekStart = CivilCalendar.startOfWeek(todayDay);

    for (let offset = 0; offset < horizonDays; offset++) {
      const dayIndex = todayDay + offset;
      let pendingHabits: Habit[];
      let overdueTasks: Task[] = [];
      let dueOnDayTasks: Task[];

      if (offset === 0) {
        const pending = ReminderPlanner.getTodayPendingSummary(snapshot, todayDay);
        if (pending.totalPendingCount === 0) {
          continue;
        }
        pendingHabits = pending.unfinishedHabits;
        overdueTasks = pending.overdueTasks;
        dueOnDayTasks = pending.dueTodayTasks;
      } else {
        const dayWeekStart = CivilCalendar.startOfWeek(dayIndex);
        pendingHabits = snapshot.habits.filter((habit) => {
          if (habit.archivedAt !== null || habit.startDay > dayIndex) {
            return false;
          }
          const sched = HabitSchedule.getAtDay(habit, dayIndex);
          if (sched.weeklyTarget !== null) {
            const eligibleMask = sched.weekdays & 0x7f || 0x7f;
            if (!CivilCalendar.isScheduled(eligibleMask, dayIndex)) {
              return false;
            }
            if (dayWeekStart === todayWeekStart) {
              const flexToday = TodayBoard.getFlexibleWeekStatus(
                habit,
                snapshot.checkins,
                todayDay
              );
              if (flexToday !== null) {
                return flexToday.remainingNeeded > 0;
              }
              const flexTargetDay = TodayBoard.getFlexibleWeekStatus(
                habit,
                snapshot.checkins,
                dayIndex
              );
              return flexTargetDay ? flexTargetDay.remainingNeeded > 0 : true;
            }
            return true;
          }
          return CivilCalendar.isScheduled(sched.weekdays, dayIndex);
        });

        dueOnDayTasks = snapshot.tasks.filter(
          (task) =>
            task.deletedAt === null &&
            TodayBoard.getStatus(task) === 'open' &&
            task.dueDay === dayIndex
        );

        if (pendingHabits.length === 0 && dueOnDayTasks.length === 0) {
          continue;
        }
      }

      const dateStr = CivilCalendar.toInputDateValue(dayIndex);
      const endDateStr =
        endCalc.dayCarry > 0
          ? CivilCalendar.toInputDateValue(dayIndex + endCalc.dayCarry)
          : dateStr;
      const startDateTime = `${dateStr}T${reminderTime}:00`;
      const endDateTime = `${endDateStr}T${endCalc.timeStr}:00`;

      const tasksCount = overdueTasks.length + dueOnDayTasks.length;
      const countPhrase = buildCountPhrase(pendingHabits.length, tasksCount);
      const summary =
        offset === 0 ? `Habits — ${countPhrase} left today` : `Habits — ${countPhrase} planned`;

      const lines: string[] = [];
      if (pendingHabits.length > 0) {
        lines.push(offset === 0 ? 'Remaining habits:' : 'Habits:');
        for (const h of pendingHabits.slice(0, 8)) {
          lines.push(`• ${h.name}`);
        }
        if (pendingHabits.length > 8) {
          lines.push(`• +${pendingHabits.length - 8} more`);
        }
      }

      if (overdueTasks.length > 0) {
        if (lines.length > 0) lines.push('');
        lines.push('Overdue tasks:');
        for (const t of overdueTasks.slice(0, 5)) {
          lines.push(`• ${t.title}`);
        }
        if (overdueTasks.length > 5) {
          lines.push(`• +${overdueTasks.length - 5} more`);
        }
      }

      if (dueOnDayTasks.length > 0) {
        if (lines.length > 0) lines.push('');
        lines.push(offset === 0 ? 'Tasks due today:' : 'Scheduled tasks:');
        for (const t of dueOnDayTasks.slice(0, 6)) {
          lines.push(`• ${t.title}`);
        }
        if (dueOnDayTasks.length > 6) {
          lines.push(`• +${dueOnDayTasks.length - 6} more`);
        }
      }

      const description = lines.join('\n');
      const signature = [dayIndex, startDateTime, endDateTime, timeZone, summary, description].join(
        '|'
      );

      results.push({
        dayIndex,
        dateStr,
        summary,
        description,
        startDateTime,
        endDateTime,
        timeZone,
        signature,
      });
    }

    return results;
  }

  public static computeStateSignature(
    snapshot: DomainSnapshot,
    todayDay: number,
    prefs: Pick<ReminderPreferences, 'reminderTime' | 'horizonDays'>,
    trackerTimeZone: string
  ): string {
    const timeZone = ReminderPlanner.resolveCalendarTimeZone(trackerTimeZone);
    const events = ReminderPlanner.buildDesiredEvents(snapshot, todayDay, prefs, trackerTimeZone);
    return JSON.stringify({
      todayDay,
      reminderTime: ReminderPlanner.normalizeTime(prefs.reminderTime),
      horizonDays: ReminderPlanner.normalizeHorizonDays(prefs.horizonDays),
      timeZone,
      events: events.map((e) => e.signature),
    });
  }

  public static isAppBadgeSupported(): boolean {
    if (typeof navigator === 'undefined') return false;
    return 'setAppBadge' in navigator || 'clearAppBadge' in navigator;
  }

  public static isStandalonePwa(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const displayStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    return iosStandalone || displayStandalone;
  }

  public static getNotificationPermission(): BadgePermissionState {
    if (typeof Notification === 'undefined') {
      return 'unsupported';
    }
    const perm = Notification.permission;
    if (perm === 'granted' || perm === 'denied' || perm === 'default') {
      return perm;
    }
    return 'unsupported';
  }

  public static async requestBadgePermission(): Promise<BadgePermissionState> {
    if (
      typeof Notification === 'undefined' ||
      typeof Notification.requestPermission !== 'function'
    ) {
      return 'unsupported';
    }
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted' || result === 'denied' || result === 'default') {
        return result;
      }
    } catch {
      // Ignore permission request errors in restricted contexts
    }
    return ReminderPlanner.getNotificationPermission();
  }

  public static async syncAppBadge(count: number | null): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    try {
      if (count !== null && count > 0 && typeof nav.setAppBadge === 'function') {
        await nav.setAppBadge(count);
        return true;
      }
      if (typeof nav.clearAppBadge === 'function') {
        await nav.clearAppBadge();
        return true;
      }
      if (typeof nav.setAppBadge === 'function') {
        await nav.setAppBadge(0);
        return true;
      }
    } catch {
      // Ignore permission / unsupported context (e.g. cross-origin iframe or iOS ungranted Notifications)
    }
    return false;
  }
}

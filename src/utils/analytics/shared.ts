import { Task, TaskStatus } from '../../types/domain';
import { CivilCalendar } from '../civil-calendar';
import { DayCellTone } from '../date-range';
import { HabitSchedule } from '../habit-schedule';

export function resolveTaskStatus(task: Task): TaskStatus {
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

export function getHourInTimeZone(timestampMs: number, timeZone?: string): number {
  const d = new Date(timestampMs);
  if (!timeZone || timeZone === 'local') {
    return d.getHours();
  }
  if (timeZone.toUpperCase() === 'UTC') {
    return d.getUTCHours();
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const raw = Number(parts.find((p) => p.type === 'hour')?.value);
    if (Number.isFinite(raw)) {
      return raw === 24 ? 0 : raw;
    }
  } catch {
    // fallback below
  }
  return d.getUTCHours();
}

export function describeScheduleVersion(
  weekdays: number,
  weeklyTarget: number | null,
  dailyTarget: number | null,
  unit?: string | null
): string {
  const freq =
    weeklyTarget !== null
      ? `${weeklyTarget}×/wk`
      : weekdays === 0x7f
        ? 'Daily'
        : `${CivilCalendar.countScheduledDays(weekdays)}d/wk`;
  if (dailyTarget !== null) {
    const u = unit ? ` ${unit}` : '';
    return `${freq} · ${HabitSchedule.formatNumericValue(dailyTarget)}${u}`;
  }
  return freq;
}

export function classifyRatioTone(
  dayIndex: number,
  todayDay: number,
  total: number,
  done: number,
  hasAnyActivity: boolean
): DayCellTone {
  if (dayIndex > todayDay) return 'future';
  if (total <= 0) return hasAnyActivity ? 'complete' : 'unscheduled';
  if (done >= total) return 'complete';
  if (dayIndex === todayDay && done === 0) return 'today-open';
  if (done <= 0) return 'missed-all';
  const ratio = done / total;
  if (ratio < 0.35) return 'missed-heavy';
  if (ratio < 0.7) return 'missed-moderate';
  return 'missed-slight';
}

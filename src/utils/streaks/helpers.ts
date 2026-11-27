import { Habit, HabitCheckin } from '../../types/domain';
import { CivilCalendar } from '../civil-calendar';
import { HabitSchedule } from '../habit-schedule';

export function buildHabitDoneSet(habit: Habit, checkins: HabitCheckin[]): Set<number> {
  const doneSet = new Set<number>();
  for (const entry of checkins) {
    if (
      entry.habitId === habit.id &&
      HabitSchedule.isCheckinDoneForDay(habit, entry, entry.dayIndex)
    ) {
      doneSet.add(entry.dayIndex);
    }
  }
  return doneSet;
}

export function countDoneInRange(
  doneSet: Set<number>,
  startDay: number,
  endDay: number,
  weekdaysMask: number = 0x7f
): number {
  if (endDay < startDay) return 0;
  let count = 0;
  for (let d = startDay; d <= endDay; d++) {
    if (CivilCalendar.isScheduled(weekdaysMask, d) && doneSet.has(d)) {
      count += 1;
    }
  }
  return count;
}

export function effectiveFlexibleWeekTarget(
  habitStartDay: number,
  weekdays: number,
  weekStart: number,
  target: number
): number {
  const wStart = Math.max(habitStartDay, weekStart);
  const wEnd = weekStart + 6;
  if (wEnd < wStart) return 0;
  const eligibleDays = CivilCalendar.countScheduledInRange(weekdays, wStart, wEnd);
  return Math.min(target, eligibleDays);
}

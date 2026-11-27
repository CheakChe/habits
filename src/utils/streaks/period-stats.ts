import { Habit, HabitCheckin, normalizeWeeklyTarget } from '../../types/domain';
import { CivilCalendar } from '../civil-calendar';
import { HabitSchedule } from '../habit-schedule';
import { calculateHabitStreaks } from './habit-metrics';
import { effectiveFlexibleWeekTarget } from './helpers';
import { DayHabitCounts, HabitPeriodSummary } from './types';

export function computePeriodDayStats(
  habits: Habit[],
  checkins: HabitCheckin[],
  startDay: number,
  endDay: number,
  todayDay: number
): Map<number, DayHabitCounts> {
  const s = Math.min(startDay, endDay);
  const e = Math.min(Math.max(startDay, endDay), todayDay);
  const result = new Map<number, DayHabitCounts>();
  if (e < s || habits.length === 0) {
    return result;
  }

  const add = (dayIndex: number, scheduledDelta: number, doneDelta: number) => {
    if (dayIndex < s || dayIndex > e) return;
    const prev = result.get(dayIndex);
    if (prev) {
      prev.scheduled += scheduledDelta;
      prev.done += doneDelta;
    } else {
      result.set(dayIndex, { scheduled: scheduledDelta, done: doneDelta });
    }
  };

  const habitById = new Map<number, Habit>();
  for (const h of habits) {
    habitById.set(h.id, h);
  }

  const doneByHabit = new Map<number, Set<number>>();
  for (const c of checkins) {
    const habit = habitById.get(c.habitId);
    if (!habit || !HabitSchedule.isCheckinDoneForDay(habit, c, c.dayIndex)) {
      continue;
    }
    let set = doneByHabit.get(c.habitId);
    if (!set) {
      set = new Set<number>();
      doneByHabit.set(c.habitId, set);
    }
    set.add(c.dayIndex);
  }

  for (const habit of habits) {
    const hStart = Math.max(habit.startDay, s);
    if (e < hStart) continue;
    const doneSet = doneByHabit.get(habit.id) ?? new Set<number>();

    if (!habit.scheduleHistory || habit.scheduleHistory.length <= 1) {
      const weeklyTarget = normalizeWeeklyTarget(habit.weeklyTarget);

      if (weeklyTarget === null) {
        for (let d = hStart; d <= e; d++) {
          if (CivilCalendar.isScheduled(habit.weekdays, d)) {
            add(d, 1, doneSet.has(d) ? 1 : 0);
          }
        }
        continue;
      }

      const eligibleMask = habit.weekdays & 0x7f || 0x7f;
      const firstWs = CivilCalendar.startOfWeek(hStart);
      const lastWs = CivilCalendar.startOfWeek(e);
      for (let ws = firstWs; ws <= lastWs; ws += 7) {
        const wFullStart = Math.max(habit.startDay, ws);
        const wFullEnd = ws + 6;
        const evalEnd = Math.min(wFullEnd, todayDay);
        if (evalEnd < wFullStart) continue;

        const effTarget = effectiveFlexibleWeekTarget(
          habit.startDay,
          eligibleMask,
          ws,
          weeklyTarget
        );
        if (effTarget <= 0) continue;

        const uncheckedDays: number[] = [];
        let doneCount = 0;

        for (let d = wFullStart; d <= evalEnd; d++) {
          const isEligible = CivilCalendar.isScheduled(eligibleMask, d);
          if (doneSet.has(d)) {
            doneCount += 1;
            add(d, 1, 1);
          } else if (isEligible) {
            uncheckedDays.push(d);
          }
        }

        if (doneCount < effTarget) {
          const remainingFutureDaysInWeek = CivilCalendar.countScheduledInRange(
            eligibleMask,
            evalEnd + 1,
            wFullEnd
          );
          const stillAchievable =
            evalEnd === todayDay &&
            todayDay < wFullEnd &&
            doneCount + remainingFutureDaysInWeek >= effTarget;

          if (stillAchievable) {
            if (
              !doneSet.has(todayDay) &&
              todayDay >= wFullStart &&
              CivilCalendar.isScheduled(eligibleMask, todayDay)
            ) {
              add(todayDay, 1, 0);
            }
          } else {
            const shortfall = Math.min(effTarget - doneCount, uncheckedDays.length);
            const firstMissIdx = uncheckedDays.length - shortfall;
            for (let idx = firstMissIdx; idx < uncheckedDays.length; idx++) {
              add(uncheckedDays[idx], 1, 0);
            }
          }
        }
      }
      continue;
    }

    // Versioned schedule history path
    const firstWs = CivilCalendar.startOfWeek(hStart);
    const lastWs = CivilCalendar.startOfWeek(e);
    for (let ws = firstWs; ws <= lastWs; ws += 7) {
      const wFullStart = Math.max(habit.startDay, ws);
      const wFullEnd = ws + 6;
      const evalEnd = Math.min(wFullEnd, todayDay);
      if (evalEnd < wFullStart) continue;

      const segs = HabitSchedule.getSegmentsInRange(habit, wFullStart, wFullEnd);
      let donePriorInWeek = 0;

      for (let idx = 0; idx < segs.length; idx++) {
        const seg = segs[idx];
        const segEvalEnd = Math.min(seg.end, evalEnd);
        if (segEvalEnd < seg.start) continue;

        if (seg.weeklyTarget === null) {
          for (let d = seg.start; d <= segEvalEnd; d++) {
            if (CivilCalendar.isScheduled(seg.weekdays, d)) {
              const isDone = doneSet.has(d);
              add(d, 1, isDone ? 1 : 0);
              if (isDone) donePriorInWeek += 1;
            }
          }
          continue;
        }

        const eligibleMask = seg.weekdays & 0x7f || 0x7f;
        if (idx < segs.length - 1) {
          for (let d = seg.start; d <= segEvalEnd; d++) {
            if (doneSet.has(d)) {
              add(d, 1, 1);
              donePriorInWeek += 1;
            }
          }
          continue;
        }

        const remainingQuota = Math.max(0, seg.weeklyTarget - donePriorInWeek);
        const eligibleInSeg = CivilCalendar.countScheduledInRange(eligibleMask, seg.start, seg.end);
        const effTarget = Math.min(remainingQuota, eligibleInSeg);
        if (effTarget <= 0) continue;

        const uncheckedDays: number[] = [];
        let doneCount = 0;

        for (let d = seg.start; d <= segEvalEnd; d++) {
          const isEligible = CivilCalendar.isScheduled(eligibleMask, d);
          if (doneSet.has(d)) {
            doneCount += 1;
            add(d, 1, 1);
          } else if (isEligible) {
            uncheckedDays.push(d);
          }
        }

        if (doneCount < effTarget) {
          const remainingFutureDaysInWeek = CivilCalendar.countScheduledInRange(
            eligibleMask,
            segEvalEnd + 1,
            seg.end
          );
          const stillAchievable =
            evalEnd === todayDay &&
            todayDay < seg.end &&
            doneCount + remainingFutureDaysInWeek >= effTarget;

          if (stillAchievable) {
            if (
              !doneSet.has(todayDay) &&
              todayDay >= seg.start &&
              todayDay <= segEvalEnd &&
              CivilCalendar.isScheduled(eligibleMask, todayDay)
            ) {
              add(todayDay, 1, 0);
            }
          } else {
            const shortfall = Math.min(effTarget - doneCount, uncheckedDays.length);
            const firstMissIdx = uncheckedDays.length - shortfall;
            for (let k = firstMissIdx; k < uncheckedDays.length; k++) {
              add(uncheckedDays[k], 1, 0);
            }
          }
        }
      }
    }
  }

  return result;
}

export function summarizeHabitsForRange(
  habits: Habit[],
  checkins: HabitCheckin[],
  startDay: number,
  endDay: number,
  todayDay: number
): HabitPeriodSummary[] {
  const effectiveEnd = Math.min(endDay, todayDay);
  const allowPending = effectiveEnd >= todayDay;

  const rows: HabitPeriodSummary[] = habits.map((habit) => {
    const effectiveStart = Math.max(habit.startDay, startDay);
    const metrics = calculateHabitStreaks(
      habit,
      checkins,
      effectiveStart,
      effectiveEnd,
      allowPending
    );
    const baseSummary: HabitPeriodSummary = {
      habit,
      currentStreak: metrics.currentStreak,
      longestStreak: metrics.longestStreak,
      streakUnit: metrics.streakUnit,
      completionRate: metrics.completionRate,
      scheduledDays: metrics.scheduledDays,
      completedDays: metrics.completedScheduledDays,
      missedDays: Math.max(0, metrics.scheduledDays - metrics.completedScheduledDays),
    };
    if (HabitSchedule.hasAnyDailyTarget(habit) && effectiveEnd >= effectiveStart) {
      let totalValue = 0;
      for (const c of checkins) {
        if (c.habitId === habit.id && c.dayIndex >= effectiveStart && c.dayIndex <= effectiveEnd) {
          totalValue += HabitSchedule.getCheckinValueForDay(habit, c, c.dayIndex);
        }
      }
      baseSummary.totalValue = Math.round(totalValue * 100) / 100;
      baseSummary.unit = habit.unit ?? null;
    }
    return baseSummary;
  });

  return rows.sort((a, b) => {
    const aArch = a.habit.archivedAt !== null ? 1 : 0;
    const bArch = b.habit.archivedAt !== null ? 1 : 0;
    if (aArch !== bArch) return aArch - bArch;
    if (b.completionRate !== a.completionRate) {
      return b.completionRate - a.completionRate;
    }
    if (b.completedDays !== a.completedDays) {
      return b.completedDays - a.completedDays;
    }
    return a.habit.id - b.habit.id;
  });
}

export function summarizeHabitsForPeriod(
  habits: Habit[],
  checkins: HabitCheckin[],
  periodDays: number | 'all',
  todayDay: number
): HabitPeriodSummary[] {
  const minHabitStart = habits.reduce((min, h) => (h.startDay < min ? h.startDay : min), todayDay);
  const startDay = periodDays === 'all' ? minHabitStart : todayDay - (periodDays - 1);
  return summarizeHabitsForRange(habits, checkins, startDay, todayDay, todayDay);
}

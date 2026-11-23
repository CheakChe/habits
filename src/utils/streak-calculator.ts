import { Habit, HabitCheckin, normalizeWeeklyTarget } from '../types/domain';
import { CivilCalendar } from './civil-calendar';
import { HabitSchedule } from './habit-schedule';

export const STREAK_MILESTONES = [7, 30, 100] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];
export type StreakUnit = 'days' | 'weeks';

export interface StreakMetrics {
  currentStreak: number;
  longestStreak: number;
  streakUnit: StreakUnit;
  completionRate: number;
  scheduledDays: number;
  completedScheduledDays: number;
}

export interface WeeklyHabitProgress {
  weekStart: number;
  weekEnd: number;
  completedDays: number;
  scheduledDays: number;
  isComplete: boolean;
}

export interface HabitPeriodSummary {
  habit: Habit;
  currentStreak: number;
  longestStreak: number;
  streakUnit: StreakUnit;
  completionRate: number;
  scheduledDays: number;
  completedDays: number;
  missedDays: number;
  totalValue?: number;
  unit?: string | null;
}

export interface DayHabitCounts {
  scheduled: number;
  done: number;
}

function buildHabitDoneSet(habit: Habit, checkins: HabitCheckin[]): Set<number> {
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

function countDoneInRange(
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

function effectiveFlexibleWeekTarget(
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

export class StreakCalculator {
  public static getPeriodDayStats(
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

        const eligibleMask = (habit.weekdays & 0x7f) || 0x7f;
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

          const eligibleMask = (seg.weekdays & 0x7f) || 0x7f;
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
          const eligibleInSeg = CivilCalendar.countScheduledInRange(
            eligibleMask,
            seg.start,
            seg.end
          );
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

  public static summarizeHabitsForRange(
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
      const metrics = StreakCalculator.calculate(
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
          if (
            c.habitId === habit.id &&
            c.dayIndex >= effectiveStart &&
            c.dayIndex <= effectiveEnd
          ) {
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

  public static summarizeHabitsForPeriod(
    habits: Habit[],
    checkins: HabitCheckin[],
    periodDays: number | 'all',
    todayDay: number
  ): HabitPeriodSummary[] {
    const minHabitStart = habits.reduce(
      (min, h) => (h.startDay < min ? h.startDay : min),
      todayDay
    );
    const startDay =
      periodDays === 'all' ? minHabitStart : todayDay - (periodDays - 1);
    return StreakCalculator.summarizeHabitsForRange(
      habits,
      checkins,
      startDay,
      todayDay,
      todayDay
    );
  }

  public static getMilestone(streak: number): StreakMilestone | null {
    if (streak >= 100) return 100;
    if (streak >= 30) return 30;
    if (streak >= 7) return 7;
    return null;
  }

  public static isExactMilestone(streak: number): streak is StreakMilestone {
    return streak === 7 || streak === 30 || streak === 100;
  }

  public static calculateWeeklyProgress(
    habit: Habit,
    checkins: HabitCheckin[],
    todayDay: number
  ): WeeklyHabitProgress {
    const weekStart = CivilCalendar.startOfWeek(todayDay);
    const weekEnd = weekStart + 6;
    const effectiveStart = Math.max(weekStart, habit.startDay);
    const doneSet = buildHabitDoneSet(habit, checkins);

    if (weekEnd < effectiveStart) {
      return {
        weekStart,
        weekEnd,
        completedDays: 0,
        scheduledDays: 0,
        isComplete: false,
      };
    }

    const activeSched = HabitSchedule.getAtDay(habit, todayDay);
    const segs = HabitSchedule.getSegmentsInRange(habit, effectiveStart, weekEnd);

    if (segs.length === 1) {
      const weeklyTarget = activeSched.weeklyTarget;
      if (weeklyTarget !== null) {
        const eligibleMask = (activeSched.weekdays & 0x7f) || 0x7f;
        const scheduledDays = effectiveFlexibleWeekTarget(
          habit.startDay,
          eligibleMask,
          weekStart,
          weeklyTarget
        );
        const completedDays = countDoneInRange(
          doneSet,
          effectiveStart,
          Math.min(weekEnd, todayDay),
          0x7f
        );
        return {
          weekStart,
          weekEnd,
          completedDays,
          scheduledDays,
          isComplete: scheduledDays > 0 && completedDays >= scheduledDays,
        };
      }

      let scheduledDays = 0;
      let completedDays = 0;
      for (let d = effectiveStart; d <= weekEnd; d++) {
        if (!CivilCalendar.isScheduled(activeSched.weekdays, d)) {
          continue;
        }
        scheduledDays += 1;
        if (d <= todayDay && doneSet.has(d)) {
          completedDays += 1;
        }
      }
      return {
        weekStart,
        weekEnd,
        completedDays,
        scheduledDays,
        isComplete: scheduledDays > 0 && completedDays >= scheduledDays,
      };
    }

    // Split week across multiple schedule versions
    if (activeSched.weeklyTarget !== null) {
      const activeSeg =
        segs.find((s) => todayDay >= s.start && todayDay <= s.end) ??
        segs[segs.length - 1];
      let donePriorInWeek = 0;
      for (const seg of segs) {
        if (seg.start >= activeSeg.start) break;
        const mask = seg.weeklyTarget === null ? seg.weekdays : 0x7f;
        donePriorInWeek += countDoneInRange(doneSet, seg.start, seg.end, mask);
      }
      const eligibleMask = (activeSeg.weekdays & 0x7f) || 0x7f;
      const availableInSeg = CivilCalendar.countScheduledInRange(
        eligibleMask,
        activeSeg.start,
        activeSeg.end
      );
      const scheduledDays = Math.min(
        activeSched.weeklyTarget,
        donePriorInWeek + availableInSeg
      );
      const doneInSeg = countDoneInRange(
        doneSet,
        activeSeg.start,
        Math.min(activeSeg.end, todayDay),
        0x7f
      );
      const completedDays = donePriorInWeek + doneInSeg;
      return {
        weekStart,
        weekEnd,
        completedDays,
        scheduledDays,
        isComplete: scheduledDays > 0 && completedDays >= scheduledDays,
      };
    }

    let scheduledDays = 0;
    let completedDays = 0;
    for (const seg of segs) {
      if (seg.weeklyTarget === null) {
        for (let d = seg.start; d <= seg.end; d++) {
          if (!CivilCalendar.isScheduled(seg.weekdays, d)) continue;
          scheduledDays += 1;
          if (d <= todayDay && doneSet.has(d)) {
            completedDays += 1;
          }
        }
      } else {
        const cap = Math.min(seg.end, todayDay);
        for (let d = seg.start; d <= cap; d++) {
          if (doneSet.has(d)) {
            scheduledDays += 1;
            completedDays += 1;
          }
        }
      }
    }

    return {
      weekStart,
      weekEnd,
      completedDays,
      scheduledDays,
      isComplete: scheduledDays > 0 && completedDays >= scheduledDays,
    };
  }

  public static calculate(
    habit: Habit,
    checkins: HabitCheckin[],
    periodStartDay: number,
    periodEndDay: number,
    allowPendingEndDay: boolean = true
  ): StreakMetrics {
    const doneSet = buildHabitDoneSet(habit, checkins);
    const effectiveEnd = periodEndDay;
    const effectiveStart = Math.max(habit.startDay, periodStartDay);

    if (!habit.scheduleHistory || habit.scheduleHistory.length <= 1) {
      const weeklyTarget = normalizeWeeklyTarget(habit.weeklyTarget);

      if (weeklyTarget !== null) {
        const eligibleMask = (habit.weekdays & 0x7f) || 0x7f;
        let currentStreak = 0;
        let longestStreak = 0;

        if (effectiveEnd >= habit.startDay) {
          const firstWeekStart = CivilCalendar.startOfWeek(habit.startDay);
          const endWeekStart = CivilCalendar.startOfWeek(effectiveEnd);

          for (let ws = endWeekStart; ws >= firstWeekStart; ws -= 7) {
            const wStart = Math.max(habit.startDay, ws);
            const wFullEnd = ws + 6;
            const reqTarget = effectiveFlexibleWeekTarget(
              habit.startDay,
              eligibleMask,
              ws,
              weeklyTarget
            );
            if (ws === endWeekStart) {
              const evalEnd = Math.min(wFullEnd, effectiveEnd);
              const doneSoFar = countDoneInRange(doneSet, wStart, evalEnd, 0x7f);
              if (reqTarget > 0 && doneSoFar >= reqTarget) {
                currentStreak += 1;
              } else if (allowPendingEndDay) {
                const remainingDaysInWeek = CivilCalendar.countScheduledInRange(
                  eligibleMask,
                  effectiveEnd + 1,
                  wFullEnd
                );
                if (doneSoFar + remainingDaysInWeek < reqTarget) {
                  break;
                }
              } else {
                break;
              }
            } else {
              const doneInWeek = countDoneInRange(doneSet, wStart, wFullEnd, 0x7f);
              if (reqTarget > 0 && doneInWeek >= reqTarget) {
                currentStreak += 1;
              } else {
                break;
              }
            }
          }

          let runningStreak = 0;
          for (let ws = firstWeekStart; ws <= endWeekStart; ws += 7) {
            const wStart = Math.max(habit.startDay, ws);
            const wEvalEnd = Math.min(ws + 6, effectiveEnd);
            const reqTarget = effectiveFlexibleWeekTarget(
              habit.startDay,
              eligibleMask,
              ws,
              weeklyTarget
            );
            const doneInWeek = countDoneInRange(doneSet, wStart, wEvalEnd, 0x7f);
            if (reqTarget > 0 && doneInWeek >= reqTarget) {
              runningStreak += 1;
              if (runningStreak > longestStreak) {
                longestStreak = runningStreak;
              }
            } else {
              runningStreak = 0;
            }
          }
        }

        let scheduledDays = 0;
        let completedScheduledDays = 0;
        if (effectiveEnd >= effectiveStart) {
          const firstPeriodWeek = CivilCalendar.startOfWeek(effectiveStart);
          const lastPeriodWeek = CivilCalendar.startOfWeek(effectiveEnd);
          for (let ws = firstPeriodWeek; ws <= lastPeriodWeek; ws += 7) {
            const wFullStart = Math.max(habit.startDay, ws);
            const wFullEnd = ws + 6;
            const fullWeekTarget = effectiveFlexibleWeekTarget(
              habit.startDay,
              eligibleMask,
              ws,
              weeklyTarget
            );
            const sliceStart = Math.max(effectiveStart, ws);
            const sliceEnd = Math.min(effectiveEnd, wFullEnd);
            if (sliceEnd < sliceStart) continue;

            const donePrior =
              sliceStart > wFullStart
                ? countDoneInRange(doneSet, wFullStart, sliceStart - 1, 0x7f)
                : 0;
            const remainingQuota = Math.max(0, fullWeekTarget - donePrior);
            const sliceDays = CivilCalendar.countScheduledInRange(
              eligibleMask,
              sliceStart,
              sliceEnd
            );
            const doneInSlice = countDoneInRange(doneSet, sliceStart, sliceEnd, 0x7f);
            const sliceTarget = Math.min(
              remainingQuota,
              Math.max(sliceDays, doneInSlice)
            );

            scheduledDays += sliceTarget;
            completedScheduledDays += Math.min(doneInSlice, sliceTarget);
          }
        }

        const completionRate =
          scheduledDays === 0 ? 0 : completedScheduledDays / scheduledDays;

        return {
          currentStreak,
          longestStreak,
          streakUnit: 'weeks',
          completionRate,
          scheduledDays,
          completedScheduledDays,
        };
      }

      // Fixed-weekday schedule metrics
      let currentStreak = 0;
      let cursor = effectiveEnd;
      if (allowPendingEndDay && cursor >= habit.startDay) {
        if (CivilCalendar.isScheduled(habit.weekdays, cursor) && !doneSet.has(cursor)) {
          cursor -= 1;
        }
      }

      while (cursor >= habit.startDay) {
        if (!CivilCalendar.isScheduled(habit.weekdays, cursor)) {
          cursor -= 1;
          continue;
        }
        if (doneSet.has(cursor)) {
          currentStreak += 1;
          cursor -= 1;
        } else {
          break;
        }
      }

      let longestStreak = 0;
      let runningStreak = 0;
      for (let d = habit.startDay; d <= effectiveEnd; d++) {
        if (!CivilCalendar.isScheduled(habit.weekdays, d)) {
          continue;
        }
        if (doneSet.has(d)) {
          runningStreak += 1;
          if (runningStreak > longestStreak) {
            longestStreak = runningStreak;
          }
        } else {
          runningStreak = 0;
        }
      }

      let scheduledDays = 0;
      let completedScheduledDays = 0;
      if (effectiveEnd >= effectiveStart) {
        for (let d = effectiveStart; d <= effectiveEnd; d++) {
          if (!CivilCalendar.isScheduled(habit.weekdays, d)) {
            continue;
          }
          scheduledDays += 1;
          if (doneSet.has(d)) {
            completedScheduledDays += 1;
          }
        }
      }

      const completionRate =
        scheduledDays === 0 ? 0 : completedScheduledDays / scheduledDays;

      return {
        currentStreak,
        longestStreak,
        streakUnit: 'days',
        completionRate,
        scheduledDays,
        completedScheduledDays,
      };
    }

    // Versioned scheduleHistory path
    const latestSchedule = HabitSchedule.getAtDay(
      habit,
      Math.max(habit.startDay, effectiveEnd)
    );
    const streakUnit: StreakUnit =
      latestSchedule.weeklyTarget !== null ? 'weeks' : 'days';

    // 1. Period completion rate across [effectiveStart .. effectiveEnd]
    let scheduledDays = 0;
    let completedScheduledDays = 0;
    if (effectiveEnd >= effectiveStart) {
      const firstPeriodWeek = CivilCalendar.startOfWeek(effectiveStart);
      const lastPeriodWeek = CivilCalendar.startOfWeek(effectiveEnd);
      for (let ws = firstPeriodWeek; ws <= lastPeriodWeek; ws += 7) {
        const wFullStart = Math.max(habit.startDay, ws);
        const wFullEnd = ws + 6;
        const segs = HabitSchedule.getSegmentsInRange(habit, wFullStart, wFullEnd);
        let donePriorInWeek = 0;

        for (let idx = 0; idx < segs.length; idx++) {
          const seg = segs[idx];
          if (seg.weeklyTarget === null) {
            for (let d = seg.start; d <= seg.end; d++) {
              if (!CivilCalendar.isScheduled(seg.weekdays, d)) continue;
              const isDone = doneSet.has(d);
              if (isDone) donePriorInWeek += 1;
              if (d >= effectiveStart && d <= effectiveEnd) {
                scheduledDays += 1;
                if (isDone) completedScheduledDays += 1;
              }
            }
            continue;
          }

          const eligibleMask = (seg.weekdays & 0x7f) || 0x7f;
          if (idx < segs.length - 1) {
            for (let d = seg.start; d <= seg.end; d++) {
              if (doneSet.has(d)) {
                donePriorInWeek += 1;
                if (d >= effectiveStart && d <= effectiveEnd) {
                  scheduledDays += 1;
                  completedScheduledDays += 1;
                }
              }
            }
            continue;
          }

          const remainingQuota = Math.max(0, seg.weeklyTarget - donePriorInWeek);
          const eligibleInFullSeg = CivilCalendar.countScheduledInRange(
            eligibleMask,
            seg.start,
            seg.end
          );
          const fullSegTarget = Math.min(remainingQuota, eligibleInFullSeg);
          const sliceStart = Math.max(effectiveStart, seg.start);
          const sliceEnd = Math.min(effectiveEnd, seg.end);
          if (sliceEnd < sliceStart) continue;

          const donePriorInSlice =
            sliceStart > seg.start
              ? countDoneInRange(doneSet, seg.start, sliceStart - 1, 0x7f)
              : 0;
          const sliceRemainingQuota = Math.max(0, fullSegTarget - donePriorInSlice);
          const sliceDays = CivilCalendar.countScheduledInRange(
            eligibleMask,
            sliceStart,
            sliceEnd
          );
          const doneInSlice = countDoneInRange(
            doneSet,
            sliceStart,
            sliceEnd,
            0x7f
          );
          const sliceTarget = Math.min(
            sliceRemainingQuota,
            Math.max(sliceDays, doneInSlice)
          );

          scheduledDays += sliceTarget;
          completedScheduledDays += Math.min(doneInSlice, sliceTarget);
        }
      }
    }

    let currentStreak = 0;
    let longestStreak = 0;

    if (effectiveEnd >= habit.startDay) {
      const firstWeekStart = CivilCalendar.startOfWeek(habit.startDay);
      const endWeekStart = CivilCalendar.startOfWeek(effectiveEnd);

      if (streakUnit === 'weeks') {
        const evaluateWeekStatus = (
          ws: number,
          allowPendingThisWeek: boolean
        ): 'passed' | 'failed' | 'pending' | 'neutral' => {
          const wFullStart = Math.max(habit.startDay, ws);
          const wFullEnd = ws + 6;
          const wEvalEnd = Math.min(wFullEnd, effectiveEnd);
          const segs = HabitSchedule.getSegmentsInRange(habit, wFullStart, wFullEnd);
          let donePriorInWeek = 0;
          let anyFixedScheduled = false;
          let allFixedPassed = true;
          let flexOutcome: 'none' | 'passed' | 'pending' | 'failed' = 'none';

          for (let idx = 0; idx < segs.length; idx++) {
            const seg = segs[idx];
            const segEvalEnd = Math.min(seg.end, wEvalEnd);
            if (seg.weeklyTarget === null) {
              for (let d = seg.start; d <= segEvalEnd; d++) {
                if (!CivilCalendar.isScheduled(seg.weekdays, d)) continue;
                anyFixedScheduled = true;
                if (doneSet.has(d)) {
                  donePriorInWeek += 1;
                } else if (!(allowPendingThisWeek && d === effectiveEnd)) {
                  allFixedPassed = false;
                }
              }
              continue;
            }

            const eligibleMask = (seg.weekdays & 0x7f) || 0x7f;
            if (idx < segs.length - 1) {
              for (let d = seg.start; d <= segEvalEnd; d++) {
                if (doneSet.has(d)) {
                  donePriorInWeek += 1;
                }
              }
              continue;
            }

            const remainingQuota = Math.max(0, seg.weeklyTarget - donePriorInWeek);
            const eligibleInSeg = CivilCalendar.countScheduledInRange(
              eligibleMask,
              seg.start,
              seg.end
            );
            const segTarget = Math.min(remainingQuota, eligibleInSeg);
            const doneInSeg = countDoneInRange(
              doneSet,
              seg.start,
              segEvalEnd,
              0x7f
            );
            if (segTarget === 0 || doneInSeg >= segTarget) {
              flexOutcome = 'passed';
            } else if (allowPendingThisWeek) {
              const remainingDaysInSeg = CivilCalendar.countScheduledInRange(
                eligibleMask,
                wEvalEnd + 1,
                seg.end
              );
              flexOutcome =
                doneInSeg + remainingDaysInSeg >= segTarget ? 'pending' : 'failed';
            } else {
              flexOutcome = 'failed';
            }
          }

          if (!allFixedPassed || flexOutcome === 'failed') return 'failed';
          if (flexOutcome === 'pending') return 'pending';
          if (flexOutcome === 'passed' || anyFixedScheduled) return 'passed';
          return 'neutral';
        };

        for (let ws = endWeekStart; ws >= firstWeekStart; ws -= 7) {
          const outcome = evaluateWeekStatus(
            ws,
            allowPendingEndDay && ws === endWeekStart
          );
          if (outcome === 'passed') {
            currentStreak += 1;
          } else if (outcome === 'pending' || outcome === 'neutral') {
            continue;
          } else {
            break;
          }
        }

        let runningStreak = 0;
        for (let ws = firstWeekStart; ws <= endWeekStart; ws += 7) {
          const outcome = evaluateWeekStatus(ws, false);
          if (outcome === 'passed') {
            runningStreak += 1;
            if (runningStreak > longestStreak) {
              longestStreak = runningStreak;
            }
          } else if (outcome === 'failed') {
            runningStreak = 0;
          }
        }
      } else {
        // streakUnit === 'days'
        let runningStreak = 0;
        for (let ws = firstWeekStart; ws <= endWeekStart; ws += 7) {
          const wFullStart = Math.max(habit.startDay, ws);
          const wFullEnd = ws + 6;
          const wEvalEnd = Math.min(wFullEnd, effectiveEnd);
          const segs = HabitSchedule.getSegmentsInRange(habit, wFullStart, wFullEnd);
          let donePriorInWeek = 0;

          for (let idx = 0; idx < segs.length; idx++) {
            const seg = segs[idx];
            const segEvalEnd = Math.min(seg.end, wEvalEnd);
            if (segEvalEnd < seg.start) continue;

            if (seg.weeklyTarget === null) {
              for (let d = seg.start; d <= segEvalEnd; d++) {
                if (!CivilCalendar.isScheduled(seg.weekdays, d)) continue;
                if (doneSet.has(d)) {
                  donePriorInWeek += 1;
                  runningStreak += 1;
                  if (runningStreak > longestStreak) {
                    longestStreak = runningStreak;
                  }
                } else {
                  runningStreak = 0;
                }
              }
              continue;
            }

            const eligibleMask = (seg.weekdays & 0x7f) || 0x7f;
            const doneInSeg = countDoneInRange(
              doneSet,
              seg.start,
              segEvalEnd,
              0x7f
            );
            if (idx < segs.length - 1) {
              donePriorInWeek += doneInSeg;
              runningStreak += doneInSeg;
              if (runningStreak > longestStreak) {
                longestStreak = runningStreak;
              }
              continue;
            }

            const remainingQuota = Math.max(0, seg.weeklyTarget - donePriorInWeek);
            const eligibleInSeg = CivilCalendar.countScheduledInRange(
              eligibleMask,
              seg.start,
              seg.end
            );
            const segTarget = Math.min(remainingQuota, eligibleInSeg);
            if (segTarget === 0 || doneInSeg >= segTarget) {
              runningStreak += doneInSeg;
              if (runningStreak > longestStreak) {
                longestStreak = runningStreak;
              }
            } else {
              runningStreak = 0;
            }
          }
        }

        let broken = false;
        for (let ws = endWeekStart; ws >= firstWeekStart && !broken; ws -= 7) {
          const wFullStart = Math.max(habit.startDay, ws);
          const wFullEnd = ws + 6;
          const wEvalEnd = Math.min(wFullEnd, effectiveEnd);
          const segs = HabitSchedule.getSegmentsInRange(habit, wFullStart, wFullEnd);

          const donePriorBeforeIdx: number[] = new Array(segs.length).fill(0);
          let runningPrior = 0;
          for (let idx = 0; idx < segs.length; idx++) {
            donePriorBeforeIdx[idx] = runningPrior;
            const seg = segs[idx];
            const segEvalEnd = Math.min(seg.end, wEvalEnd);
            if (segEvalEnd < seg.start) continue;
            const mask = seg.weeklyTarget === null ? seg.weekdays : 0x7f;
            runningPrior += countDoneInRange(doneSet, seg.start, segEvalEnd, mask);
          }

          for (let idx = segs.length - 1; idx >= 0 && !broken; idx--) {
            const seg = segs[idx];
            const segEvalEnd = Math.min(seg.end, wEvalEnd);
            if (segEvalEnd < seg.start) continue;

            if (seg.weeklyTarget === null) {
              for (let d = segEvalEnd; d >= seg.start; d--) {
                if (!CivilCalendar.isScheduled(seg.weekdays, d)) continue;
                if (doneSet.has(d)) {
                  currentStreak += 1;
                } else if (allowPendingEndDay && d === effectiveEnd) {
                  continue;
                } else {
                  broken = true;
                  break;
                }
              }
              continue;
            }

            const eligibleMask = (seg.weekdays & 0x7f) || 0x7f;
            const doneInSeg = countDoneInRange(
              doneSet,
              seg.start,
              segEvalEnd,
              0x7f
            );
            if (idx < segs.length - 1) {
              currentStreak += doneInSeg;
              continue;
            }

            const remainingQuota = Math.max(
              0,
              seg.weeklyTarget - donePriorBeforeIdx[idx]
            );
            const eligibleInSeg = CivilCalendar.countScheduledInRange(
              eligibleMask,
              seg.start,
              seg.end
            );
            const segTarget = Math.min(remainingQuota, eligibleInSeg);
            if (segTarget === 0 || doneInSeg >= segTarget) {
              currentStreak += doneInSeg;
            } else if (ws === endWeekStart && allowPendingEndDay) {
              const remainingDaysInSeg = CivilCalendar.countScheduledInRange(
                eligibleMask,
                wEvalEnd + 1,
                seg.end
              );
              if (doneInSeg + remainingDaysInSeg >= segTarget) {
                currentStreak += doneInSeg;
              } else {
                broken = true;
              }
            } else {
              broken = true;
            }
          }
        }
      }
    }

    const completionRate =
      scheduledDays === 0 ? 0 : completedScheduledDays / scheduledDays;

    return {
      currentStreak,
      longestStreak,
      streakUnit,
      completionRate,
      scheduledDays,
      completedScheduledDays,
    };
  }
}

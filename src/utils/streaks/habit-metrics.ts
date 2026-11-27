import { Habit, HabitCheckin, normalizeWeeklyTarget } from '../../types/domain';
import { CivilCalendar } from '../civil-calendar';
import { HabitSchedule } from '../habit-schedule';
import { buildHabitDoneSet, countDoneInRange, effectiveFlexibleWeekTarget } from './helpers';
import { StreakMetrics, StreakMilestone, StreakUnit, WeeklyHabitProgress } from './types';

export function getStreakMilestone(streak: number): StreakMilestone | null {
  if (streak >= 100) return 100;
  if (streak >= 30) return 30;
  if (streak >= 7) return 7;
  return null;
}

export function isExactStreakMilestone(streak: number): streak is StreakMilestone {
  return streak === 7 || streak === 30 || streak === 100;
}

export function calculateWeeklyProgress(
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
      const eligibleMask = activeSched.weekdays & 0x7f || 0x7f;
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
      segs.find((s) => todayDay >= s.start && todayDay <= s.end) ?? segs[segs.length - 1];
    let donePriorInWeek = 0;
    for (const seg of segs) {
      if (seg.start >= activeSeg.start) break;
      const mask = seg.weeklyTarget === null ? seg.weekdays : 0x7f;
      donePriorInWeek += countDoneInRange(doneSet, seg.start, seg.end, mask);
    }
    const eligibleMask = activeSeg.weekdays & 0x7f || 0x7f;
    const availableInSeg = CivilCalendar.countScheduledInRange(
      eligibleMask,
      activeSeg.start,
      activeSeg.end
    );
    const scheduledDays = Math.min(activeSched.weeklyTarget, donePriorInWeek + availableInSeg);
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

export function calculateHabitStreaks(
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
      const eligibleMask = habit.weekdays & 0x7f || 0x7f;
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
          const sliceDays = CivilCalendar.countScheduledInRange(eligibleMask, sliceStart, sliceEnd);
          const doneInSlice = countDoneInRange(doneSet, sliceStart, sliceEnd, 0x7f);
          const sliceTarget = Math.min(remainingQuota, Math.max(sliceDays, doneInSlice));

          scheduledDays += sliceTarget;
          completedScheduledDays += Math.min(doneInSlice, sliceTarget);
        }
      }

      const completionRate = scheduledDays === 0 ? 0 : completedScheduledDays / scheduledDays;

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

    const completionRate = scheduledDays === 0 ? 0 : completedScheduledDays / scheduledDays;

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
  const latestSchedule = HabitSchedule.getAtDay(habit, Math.max(habit.startDay, effectiveEnd));
  const streakUnit: StreakUnit = latestSchedule.weeklyTarget !== null ? 'weeks' : 'days';

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

        const eligibleMask = seg.weekdays & 0x7f || 0x7f;
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
          sliceStart > seg.start ? countDoneInRange(doneSet, seg.start, sliceStart - 1, 0x7f) : 0;
        const sliceRemainingQuota = Math.max(0, fullSegTarget - donePriorInSlice);
        const sliceDays = CivilCalendar.countScheduledInRange(eligibleMask, sliceStart, sliceEnd);
        const doneInSlice = countDoneInRange(doneSet, sliceStart, sliceEnd, 0x7f);
        const sliceTarget = Math.min(sliceRemainingQuota, Math.max(sliceDays, doneInSlice));

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

          const eligibleMask = seg.weekdays & 0x7f || 0x7f;
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
          const doneInSeg = countDoneInRange(doneSet, seg.start, segEvalEnd, 0x7f);
          if (segTarget === 0 || doneInSeg >= segTarget) {
            flexOutcome = 'passed';
          } else if (allowPendingThisWeek) {
            const remainingDaysInSeg = CivilCalendar.countScheduledInRange(
              eligibleMask,
              wEvalEnd + 1,
              seg.end
            );
            flexOutcome = doneInSeg + remainingDaysInSeg >= segTarget ? 'pending' : 'failed';
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
        const outcome = evaluateWeekStatus(ws, allowPendingEndDay && ws === endWeekStart);
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

          const eligibleMask = seg.weekdays & 0x7f || 0x7f;
          const doneInSeg = countDoneInRange(doneSet, seg.start, segEvalEnd, 0x7f);
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

        const donePriorBeforeIdx: number[] = new Array<number>(segs.length).fill(0);
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

          const eligibleMask = seg.weekdays & 0x7f || 0x7f;
          const doneInSeg = countDoneInRange(doneSet, seg.start, segEvalEnd, 0x7f);
          if (idx < segs.length - 1) {
            currentStreak += doneInSeg;
            continue;
          }

          const remainingQuota = Math.max(0, seg.weeklyTarget - donePriorBeforeIdx[idx]);
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

  const completionRate = scheduledDays === 0 ? 0 : completedScheduledDays / scheduledDays;

  return {
    currentStreak,
    longestStreak,
    streakUnit,
    completionRate,
    scheduledDays,
    completedScheduledDays,
  };
}

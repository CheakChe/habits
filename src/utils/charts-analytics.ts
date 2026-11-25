import { Habit, HabitCheckin, Task, TaskStatus } from '../types/domain';
import { CivilCalendar } from './civil-calendar';
import { HabitSchedule } from './habit-schedule';
import { StreakCalculator } from './streak-calculator';

export interface HabitTrendBucket {
  key: string;
  label: string;
  shortLabel: string;
  startDay: number;
  endDay: number;
  scheduledCount: number;
  doneCount: number;
  rate: number | null;
  movingAvgRate: number | null;
}

export interface PerfectDaysSummary {
  perfectDays: number;
  scheduledDaysWithHabits: number;
  perfectRate: number | null;
  currentPerfectStreak: number;
  longestPerfectStreak: number;
}

export interface HabitRowTrendInfo {
  deltaPct: number | null;
  bonusCount: number;
}

export interface HabitVolumeBucket {
  key: string;
  label: string;
  shortLabel: string;
  startDay: number;
  endDay: number;
  actualTotal: number;
  targetTotal: number;
  targetPerDay: number | null;
}

export interface HabitVolumeSummary {
  totalVolume: number;
  totalTargetVolume: number;
  volumeAchievementRate: number | null;
  activeDaysLogged: number;
  averagePerActiveDay: number;
  averagePerScheduledDay: number;
  targetStart: number | null;
  targetEnd: number | null;
  unit: string | null;
}

export interface WeekdayHabitStat {
  weekdayBit: number;
  label: string;
  scheduledCount: number;
  doneCount: number;
  rate: number | null;
}

export interface WeekdayTaskStat {
  weekdayBit: number;
  label: string;
  doneCount: number;
  notDoneCount: number;
  totalCount: number;
  rate: number | null;
}

function resolveTaskStatus(task: Task): TaskStatus {
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

function countHabitRange(
  habits: Habit[],
  checkins: HabitCheckin[],
  dayStats: Map<number, { scheduled: number; done: number }>,
  startDay: number,
  endDay: number
): { scheduledCount: number; doneCount: number; rate: number | null } {
  let scheduledCount = 0;
  let doneCount = 0;

  if (startDay === endDay) {
    const entry = dayStats.get(startDay);
    if (entry) {
      scheduledCount = entry.scheduled;
      doneCount = entry.done;
    }
  } else {
    for (const h of habits) {
      const m = StreakCalculator.calculate(h, checkins, startDay, endDay, false);
      scheduledCount += m.scheduledDays;
      doneCount += m.completedScheduledDays;
    }
  }

  return {
    scheduledCount,
    doneCount,
    rate: scheduledCount === 0 ? null : doneCount / scheduledCount,
  };
}

export class ChartsAnalytics {
  private static attachMovingAverage(
    buckets: Omit<HabitTrendBucket, 'movingAvgRate'>[],
    windowSize: number
  ): HabitTrendBucket[] {
    const w = Math.max(2, windowSize);
    const recentRates: number[] = [];
    return buckets.map((bucket) => {
      if (bucket.rate === null) {
        return { ...bucket, movingAvgRate: null };
      }
      recentRates.push(bucket.rate);
      if (recentRates.length > w) {
        recentRates.shift();
      }
      const avg = recentRates.reduce((acc, val) => acc + val, 0) / recentRates.length;
      return { ...bucket, movingAvgRate: avg };
    });
  }

  public static habitTrendBuckets(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number,
    maxBuckets: number = 14
  ): HabitTrendBucket[] {
    const s = Math.min(startDay, endDay);
    const e = Math.max(startDay, endDay);
    const cap = Math.max(1, maxBuckets);
    const totalDays = e - s + 1;
    const dayStats =
      totalDays <= cap
        ? StreakCalculator.getPeriodDayStats(habits, checkins, s, e, e)
        : new Map<number, { scheduled: number; done: number }>();

    if (totalDays <= cap) {
      const out: Omit<HabitTrendBucket, 'movingAvgRate'>[] = [];
      for (let d = s; d <= e; d++) {
        const formatted = CivilCalendar.formatShortDate(d);
        const counts = countHabitRange(habits, checkins, dayStats, d, d);
        out.push({
          key: `d:${d}`,
          label: formatted,
          shortLabel: formatted.split(' ')[1] ?? formatted,
          startDay: d,
          endDay: d,
          ...counts,
        });
      }
      return ChartsAnalytics.attachMovingAverage(out, 5);
    }

    const firstWeek = CivilCalendar.startOfWeek(s);
    const lastWeek = CivilCalendar.startOfWeek(e);
    const weekCount = Math.floor((lastWeek - firstWeek) / 7) + 1;

    if (weekCount <= cap) {
      const out: Omit<HabitTrendBucket, 'movingAvgRate'>[] = [];
      for (let w = 0; w < weekCount; w++) {
        const ws = firstWeek + w * 7;
        const bucketStart = Math.max(s, ws);
        const bucketEnd = Math.min(e, ws + 6);
        const formatted = CivilCalendar.formatShortDate(bucketStart);
        const counts = countHabitRange(habits, checkins, dayStats, bucketStart, bucketEnd);
        out.push({
          key: `w:${ws}`,
          label: `${CivilCalendar.formatShortDate(bucketStart)} – ${CivilCalendar.formatShortDate(bucketEnd)}`,
          shortLabel: formatted.split(' ')[1] ?? formatted,
          startDay: bucketStart,
          endDay: bucketEnd,
          ...counts,
        });
      }
      return ChartsAnalytics.attachMovingAverage(out, 3);
    }

    const startLocal = CivilCalendar.toLocalDate(s);
    const endLocal = CivilCalendar.toLocalDate(e);
    const monthCount =
      (endLocal.year - startLocal.year) * 12 + (endLocal.month - startLocal.month) + 1;

    if (monthCount <= cap) {
      const out: Omit<HabitTrendBucket, 'movingAvgRate'>[] = [];
      for (let m = 0; m < monthCount; m++) {
        const total = startLocal.year * 12 + (startLocal.month - 1) + m;
        const year = Math.floor(total / 12);
        const month = (((total % 12) + 12) % 12) + 1;
        const monthStart = CivilCalendar.fromLocalDate(year, month, 1);
        const daysInMonth = CivilCalendar.getMonthDays(year, month).days.length;
        const monthEnd = monthStart + daysInMonth - 1;
        const bucketStart = Math.max(s, monthStart);
        const bucketEnd = Math.min(e, monthEnd);
        const counts = countHabitRange(habits, checkins, dayStats, bucketStart, bucketEnd);
        out.push({
          key: `m:${year}-${month}`,
          label: CivilCalendar.formatMonthYear(year, month),
          shortLabel: CivilCalendar.formatShortDate(monthStart).split(' ')[0],
          startDay: bucketStart,
          endDay: bucketEnd,
          ...counts,
        });
      }
      return ChartsAnalytics.attachMovingAverage(out, 3);
    }

    const step = Math.ceil(totalDays / cap);
    const out: Omit<HabitTrendBucket, 'movingAvgRate'>[] = [];
    for (let cursor = s; cursor <= e; cursor += step) {
      const bucketEnd = Math.min(e, cursor + step - 1);
      const counts = countHabitRange(habits, checkins, dayStats, cursor, bucketEnd);
      out.push({
        key: `r:${cursor}-${bucketEnd}`,
        label: `${CivilCalendar.formatShortDate(cursor)} – ${CivilCalendar.formatShortDate(bucketEnd)}`,
        shortLabel: CivilCalendar.formatShortDate(cursor).split(' ')[0],
        startDay: cursor,
        endDay: bucketEnd,
        ...counts,
      });
    }
    return ChartsAnalytics.attachMovingAverage(out, 3);
  }

  public static perfectDaysSummary(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number,
    todayDay: number
  ): PerfectDaysSummary {
    const s = Math.min(startDay, endDay);
    const e = Math.min(Math.max(startDay, endDay), todayDay);
    if (e < s || habits.length === 0) {
      return {
        perfectDays: 0,
        scheduledDaysWithHabits: 0,
        perfectRate: null,
        currentPerfectStreak: 0,
        longestPerfectStreak: 0,
      };
    }

    const minHabitStart = habits.reduce(
      (min, h) => (h.startDay < min ? h.startDay : min),
      habits[0].startDay
    );
    const statsStart = Math.min(s, minHabitStart);
    const dayStats = StreakCalculator.getPeriodDayStats(habits, checkins, statsStart, e, todayDay);

    let perfectDays = 0;
    let scheduledDaysWithHabits = 0;

    for (let d = s; d <= e; d++) {
      const entry = dayStats.get(d);
      if (!entry || entry.scheduled <= 0) continue;
      scheduledDaysWithHabits += 1;
      if (entry.done >= entry.scheduled) {
        perfectDays += 1;
      }
    }

    let longestPerfectStreak = 0;
    let running = 0;
    for (let d = minHabitStart; d <= e; d++) {
      const entry = dayStats.get(d);
      if (!entry || entry.scheduled <= 0) continue;
      if (entry.done >= entry.scheduled) {
        running += 1;
        if (running > longestPerfectStreak) {
          longestPerfectStreak = running;
        }
      } else {
        running = 0;
      }
    }

    let currentPerfectStreak = 0;
    for (let d = e; d >= minHabitStart; d--) {
      const entry = dayStats.get(d);
      if (!entry || entry.scheduled <= 0) continue;
      if (entry.done >= entry.scheduled) {
        currentPerfectStreak += 1;
      } else if (d === todayDay) {
        // Pending today (even with partial progress) doesn't break yesterday's perfect streak
        continue;
      } else {
        break;
      }
    }

    return {
      perfectDays,
      scheduledDaysWithHabits,
      perfectRate: scheduledDaysWithHabits === 0 ? null : perfectDays / scheduledDaysWithHabits,
      currentPerfectStreak,
      longestPerfectStreak,
    };
  }

  public static habitTrendDeltas(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number,
    todayDay: number
  ): Map<number, HabitRowTrendInfo> {
    const s = Math.min(startDay, endDay);
    const e = Math.min(Math.max(startDay, endDay), todayDay);
    const map = new Map<number, HabitRowTrendInfo>();
    if (e < s) return map;

    const doneByHabit = new Map<number, Set<number>>();
    const habitById = new Map<number, Habit>();
    for (const h of habits) habitById.set(h.id, h);
    for (const c of checkins) {
      const h = habitById.get(c.habitId);
      if (!h || !HabitSchedule.isCheckinDoneForDay(h, c, c.dayIndex)) continue;
      let set = doneByHabit.get(h.id);
      if (!set) {
        set = new Set<number>();
        doneByHabit.set(h.id, set);
      }
      set.add(c.dayIndex);
    }

    for (const habit of habits) {
      const effStart = Math.max(habit.startDay, s);
      let deltaPct: number | null = null;
      if (e - effStart + 1 >= 6) {
        const mid = Math.floor((effStart + e) / 2);
        const firstHalf = StreakCalculator.calculate(habit, checkins, effStart, mid, false);
        const secondHalf = StreakCalculator.calculate(habit, checkins, mid + 1, e, e >= todayDay);
        if (firstHalf.scheduledDays >= 2 && secondHalf.scheduledDays >= 2) {
          deltaPct = Math.round((secondHalf.completionRate - firstHalf.completionRate) * 100);
        }
      }

      let bonusCount = 0;
      const doneSet = doneByHabit.get(habit.id);
      if (doneSet && e >= effStart) {
        const firstWs = CivilCalendar.startOfWeek(effStart);
        const lastWs = CivilCalendar.startOfWeek(e);
        for (let ws = firstWs; ws <= lastWs; ws += 7) {
          const wStart = Math.max(effStart, ws);
          const wEnd = Math.min(e, ws + 6);
          if (wEnd < wStart) continue;
          const sched = HabitSchedule.getAtDay(habit, wEnd);
          if (sched.weeklyTarget === null) continue;
          let doneInWeek = 0;
          for (let d = Math.max(habit.startDay, ws); d <= Math.min(ws + 6, e); d++) {
            if (doneSet.has(d)) doneInWeek += 1;
          }
          if (doneInWeek > sched.weeklyTarget) {
            bonusCount += doneInWeek - sched.weeklyTarget;
          }
        }
      }

      map.set(habit.id, { deltaPct, bonusCount });
    }

    return map;
  }

  public static weekdayHabitStats(
    habits: Habit[],
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number
  ): WeekdayHabitStat[] {
    const s = Math.min(startDay, endDay);
    const e = Math.max(startDay, endDay);
    const dayStats = StreakCalculator.getPeriodDayStats(habits, checkins, s, e, e);

    const scheduled = new Array<number>(7).fill(0);
    const done = new Array<number>(7).fill(0);

    for (let d = s; d <= e; d++) {
      const entry = dayStats.get(d);
      if (!entry) continue;
      const bit = CivilCalendar.weekdayBit(d);
      scheduled[bit] += entry.scheduled;
      done[bit] += entry.done;
    }

    return [0, 1, 2, 3, 4, 5, 6].map((bit) => ({
      weekdayBit: bit,
      label: CivilCalendar.weekdayShortLabel(bit),
      scheduledCount: scheduled[bit],
      doneCount: done[bit],
      rate: scheduled[bit] === 0 ? null : done[bit] / scheduled[bit],
    }));
  }

  public static weekdayTaskStats(
    tasks: Task[],
    startDay: number,
    endDay: number,
    timeZone?: string
  ): WeekdayTaskStat[] {
    const s = Math.min(startDay, endDay);
    const e = Math.max(startDay, endDay);

    const done = new Array<number>(7).fill(0);
    const notDone = new Array<number>(7).fill(0);

    for (const task of tasks) {
      if (task.deletedAt !== null) continue;
      const status = resolveTaskStatus(task);
      if (status !== 'done' && status !== 'not_done') continue;

      const dayIndex =
        status === 'done'
          ? (task.completedDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone))
          : (task.dueDay ?? CivilCalendar.fromTimestamp(task.updatedAt, timeZone));

      if (dayIndex < s || dayIndex > e) continue;

      const bit = CivilCalendar.weekdayBit(dayIndex);
      if (status === 'done') {
        done[bit] += 1;
      } else {
        notDone[bit] += 1;
      }
    }

    return [0, 1, 2, 3, 4, 5, 6].map((bit) => {
      const total = done[bit] + notDone[bit];
      return {
        weekdayBit: bit,
        label: CivilCalendar.weekdayShortLabel(bit),
        doneCount: done[bit],
        notDoneCount: notDone[bit],
        totalCount: total,
        rate: total === 0 ? null : done[bit] / total,
      };
    });
  }

  public static habitVolumeBuckets(
    habit: Habit,
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number,
    maxBuckets: number = 14
  ): HabitVolumeBucket[] {
    const s = Math.min(startDay, endDay);
    const e = Math.max(startDay, endDay);
    const cap = Math.max(1, maxBuckets);
    const totalDays = e - s + 1;

    const checkinByDay = new Map<number, HabitCheckin>();
    for (const c of checkins) {
      if (c.habitId === habit.id && c.dayIndex >= s && c.dayIndex <= e) {
        checkinByDay.set(c.dayIndex, c);
      }
    }

    const computeBucket = (
      key: string,
      label: string,
      shortLabel: string,
      bucketStart: number,
      bucketEnd: number
    ): HabitVolumeBucket => {
      const effectiveStart = Math.max(habit.startDay, bucketStart);
      let actualTotal = 0;
      let targetTotal = 0;
      let targetPerDay: number | null = null;

      if (bucketEnd >= effectiveStart) {
        for (let d = effectiveStart; d <= bucketEnd; d++) {
          const entry = checkinByDay.get(d);
          if (entry) {
            actualTotal += HabitSchedule.getCheckinValueForDay(habit, entry, d);
          }
        }

        targetPerDay = HabitSchedule.getAtDay(habit, bucketEnd).dailyTarget;
        const segments = HabitSchedule.getSegmentsInRange(habit, effectiveStart, bucketEnd);
        for (const seg of segments) {
          if (seg.dailyTarget === null) continue;
          if (seg.weeklyTarget === null) {
            const schedCount = CivilCalendar.countScheduledInRange(
              seg.weekdays,
              seg.start,
              seg.end
            );
            targetTotal += schedCount * seg.dailyTarget;
          } else {
            const eligibleMask = seg.weekdays & 0x7f || 0x7f;
            const firstWs = CivilCalendar.startOfWeek(seg.start);
            const lastWs = CivilCalendar.startOfWeek(seg.end);
            for (let ws = firstWs; ws <= lastWs; ws += 7) {
              const weekFullStart = Math.max(habit.startDay, ws);
              const weekFullEnd = ws + 6;
              const sliceStart = Math.max(seg.start, weekFullStart);
              const sliceEnd = Math.min(seg.end, weekFullEnd);
              if (sliceEnd < sliceStart) continue;
              const weekEligible = CivilCalendar.countScheduledInRange(
                eligibleMask,
                weekFullStart,
                weekFullEnd
              );
              if (weekEligible === 0) continue;
              const effWeekTarget = Math.min(seg.weeklyTarget, weekEligible);
              const sliceEligible = CivilCalendar.countScheduledInRange(
                eligibleMask,
                sliceStart,
                sliceEnd
              );
              targetTotal += (sliceEligible / weekEligible) * effWeekTarget * seg.dailyTarget;
            }
          }
        }
      }

      return {
        key,
        label,
        shortLabel,
        startDay: bucketStart,
        endDay: bucketEnd,
        actualTotal: Math.round(actualTotal * 100) / 100,
        targetTotal: Math.round(targetTotal * 100) / 100,
        targetPerDay,
      };
    };

    if (totalDays <= cap) {
      const out: HabitVolumeBucket[] = [];
      for (let d = s; d <= e; d++) {
        const formatted = CivilCalendar.formatShortDate(d);
        out.push(computeBucket(`d:${d}`, formatted, formatted.split(' ')[1] ?? formatted, d, d));
      }
      return out;
    }

    const firstWeek = CivilCalendar.startOfWeek(s);
    const lastWeek = CivilCalendar.startOfWeek(e);
    const weekCount = Math.floor((lastWeek - firstWeek) / 7) + 1;

    if (weekCount <= cap) {
      const out: HabitVolumeBucket[] = [];
      for (let w = 0; w < weekCount; w++) {
        const ws = firstWeek + w * 7;
        const bucketStart = Math.max(s, ws);
        const bucketEnd = Math.min(e, ws + 6);
        const formatted = CivilCalendar.formatShortDate(bucketStart);
        out.push(
          computeBucket(
            `w:${ws}`,
            `${CivilCalendar.formatShortDate(bucketStart)} – ${CivilCalendar.formatShortDate(bucketEnd)}`,
            formatted.split(' ')[1] ?? formatted,
            bucketStart,
            bucketEnd
          )
        );
      }
      return out;
    }

    const startLocal = CivilCalendar.toLocalDate(s);
    const endLocal = CivilCalendar.toLocalDate(e);
    const monthCount =
      (endLocal.year - startLocal.year) * 12 + (endLocal.month - startLocal.month) + 1;

    if (monthCount <= cap) {
      const out: HabitVolumeBucket[] = [];
      for (let m = 0; m < monthCount; m++) {
        const total = startLocal.year * 12 + (startLocal.month - 1) + m;
        const year = Math.floor(total / 12);
        const month = (((total % 12) + 12) % 12) + 1;
        const monthStart = CivilCalendar.fromLocalDate(year, month, 1);
        const daysInMonth = CivilCalendar.getMonthDays(year, month).days.length;
        const monthEnd = monthStart + daysInMonth - 1;
        const bucketStart = Math.max(s, monthStart);
        const bucketEnd = Math.min(e, monthEnd);
        out.push(
          computeBucket(
            `m:${year}-${month}`,
            CivilCalendar.formatMonthYear(year, month),
            CivilCalendar.formatShortDate(monthStart).split(' ')[0],
            bucketStart,
            bucketEnd
          )
        );
      }
      return out;
    }

    const step = Math.ceil(totalDays / cap);
    const out: HabitVolumeBucket[] = [];
    for (let cursor = s; cursor <= e; cursor += step) {
      const bucketEnd = Math.min(e, cursor + step - 1);
      out.push(
        computeBucket(
          `r:${cursor}-${bucketEnd}`,
          `${CivilCalendar.formatShortDate(cursor)} – ${CivilCalendar.formatShortDate(bucketEnd)}`,
          CivilCalendar.formatShortDate(cursor).split(' ')[0],
          cursor,
          bucketEnd
        )
      );
    }
    return out;
  }

  public static summarizeHabitVolume(
    habit: Habit,
    checkins: HabitCheckin[],
    startDay: number,
    endDay: number
  ): HabitVolumeSummary {
    const s = Math.max(habit.startDay, Math.min(startDay, endDay));
    const e = Math.max(startDay, endDay);
    let totalVolume = 0;
    let activeDaysLogged = 0;

    if (e >= s) {
      for (const c of checkins) {
        if (c.habitId !== habit.id || c.dayIndex < s || c.dayIndex > e) continue;
        const val = HabitSchedule.getCheckinValueForDay(habit, c, c.dayIndex);
        if (val > 0) {
          totalVolume += val;
          activeDaysLogged += 1;
        }
      }
    }

    const roundedTotal = Math.round(totalVolume * 100) / 100;
    const metrics = StreakCalculator.calculate(habit, checkins, s, e, false);
    const buckets = e >= s ? ChartsAnalytics.habitVolumeBuckets(habit, checkins, s, e, 1) : [];
    const totalTargetVolume =
      buckets.length > 0 ? Math.round(buckets[0].targetTotal * 100) / 100 : 0;
    const targetStart =
      e >= s
        ? HabitSchedule.getAtDay(habit, s).dailyTarget
        : HabitSchedule.getAtDay(habit, habit.startDay).dailyTarget;
    const targetEnd =
      e >= s
        ? HabitSchedule.getAtDay(habit, e).dailyTarget
        : HabitSchedule.getAtDay(habit, habit.startDay).dailyTarget;

    return {
      totalVolume: roundedTotal,
      totalTargetVolume,
      volumeAchievementRate: totalTargetVolume > 0 ? roundedTotal / totalTargetVolume : null,
      activeDaysLogged,
      averagePerActiveDay:
        activeDaysLogged > 0 ? Math.round((roundedTotal / activeDaysLogged) * 100) / 100 : 0,
      averagePerScheduledDay:
        metrics.scheduledDays > 0
          ? Math.round((roundedTotal / metrics.scheduledDays) * 100) / 100
          : 0,
      targetStart,
      targetEnd,
      unit: habit.unit ?? null,
    };
  }
}

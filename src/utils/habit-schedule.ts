import {
  Habit,
  HabitCheckin,
  HabitScheduleVersion,
  ScheduleApplyScope,
  normalizeCheckinValue,
  normalizeDailyTarget,
  normalizeWeeklyTarget,
} from '../types/domain';

export interface ResolvedHabitSchedule {
  fromDay: number;
  weekdays: number;
  weeklyTarget: number | null;
  dailyTarget: number | null;
}

export interface HabitScheduleSegment {
  start: number;
  end: number;
  fromDay: number;
  weekdays: number;
  weeklyTarget: number | null;
  dailyTarget: number | null;
}

function buildVersionEntry(
  fromDay: number,
  weekdays: number,
  weeklyTarget: number | null,
  dailyTarget: number | null
): HabitScheduleVersion {
  const entry: HabitScheduleVersion = {
    fromDay,
    weekdays,
    weeklyTarget,
  };
  if (dailyTarget !== null) {
    entry.dailyTarget = dailyTarget;
  }
  return entry;
}

export class HabitSchedule {
  public static normalizeWeekdays(weekdays: number, weeklyTarget: number | null): number {
    const masked = weekdays & 0x7f;
    if (weeklyTarget !== null && masked === 0) {
      return 0x7f;
    }
    return masked;
  }

  public static normalizeHistory(
    startDay: number,
    fallbackWeekdays: number,
    fallbackWeeklyTarget: number | null,
    rawHistory?: readonly HabitScheduleVersion[],
    fallbackDailyTarget: number | null = null
  ): {
    weekdays: number;
    weeklyTarget: number | null;
    dailyTarget: number | null;
    scheduleHistory?: HabitScheduleVersion[];
  } {
    const cleanFallbackWt = normalizeWeeklyTarget(fallbackWeeklyTarget);
    const cleanFallbackWd = HabitSchedule.normalizeWeekdays(fallbackWeekdays, cleanFallbackWt);
    const cleanFallbackDt = normalizeDailyTarget(fallbackDailyTarget);

    if (!rawHistory || rawHistory.length === 0) {
      return {
        weekdays: cleanFallbackWd,
        weeklyTarget: cleanFallbackWt,
        dailyTarget: cleanFallbackDt,
      };
    }

    // Canonicalize entries and fold entries with the same fromDay (later wins)
    const byFromDay = new Map<number, HabitScheduleVersion>();
    for (const entry of rawHistory) {
      if (!entry || !Number.isFinite(entry.fromDay)) continue;
      const fromDay = Math.trunc(entry.fromDay);
      const wt = normalizeWeeklyTarget(entry.weeklyTarget);
      const wd = HabitSchedule.normalizeWeekdays(entry.weekdays, wt);
      const dt = normalizeDailyTarget(entry.dailyTarget);
      byFromDay.set(fromDay, buildVersionEntry(fromDay, wd, wt, dt));
    }

    const sorted = Array.from(byFromDay.values()).sort((a, b) => a.fromDay - b.fromDay);
    if (sorted.length === 0) {
      return {
        weekdays: cleanFallbackWd,
        weeklyTarget: cleanFallbackWt,
        dailyTarget: cleanFallbackDt,
      };
    }

    // Clamp/fold any entries at or before startDay into a single baseline entry at startDay
    const clamped: HabitScheduleVersion[] = [];
    for (const item of sorted) {
      const dt = normalizeDailyTarget(item.dailyTarget);
      if (item.fromDay <= startDay) {
        const baseline = buildVersionEntry(startDay, item.weekdays, item.weeklyTarget, dt);
        if (clamped.length === 0) {
          clamped.push(baseline);
        } else {
          clamped[0] = baseline;
        }
      } else {
        if (clamped.length === 0) {
          clamped.push(buildVersionEntry(startDay, item.weekdays, item.weeklyTarget, dt));
        } else {
          clamped.push(item);
        }
      }
    }

    // Deduplicate consecutive identical schedules (weekdays, weeklyTarget, dailyTarget)
    const deduped: HabitScheduleVersion[] = [];
    for (const item of clamped) {
      const prev = deduped[deduped.length - 1];
      const prevDt = prev ? normalizeDailyTarget(prev.dailyTarget) : null;
      const itemDt = normalizeDailyTarget(item.dailyTarget);
      if (
        prev &&
        prev.weekdays === item.weekdays &&
        prev.weeklyTarget === item.weeklyTarget &&
        prevDt === itemDt
      ) {
        continue;
      }
      deduped.push(item);
    }

    if (deduped.length <= 1) {
      const only = deduped[0];
      return {
        weekdays: only ? only.weekdays : cleanFallbackWd,
        weeklyTarget: only ? only.weeklyTarget : cleanFallbackWt,
        dailyTarget: only ? normalizeDailyTarget(only.dailyTarget) : cleanFallbackDt,
      };
    }

    const latest = deduped[deduped.length - 1];
    return {
      weekdays: latest.weekdays,
      weeklyTarget: latest.weeklyTarget,
      dailyTarget: normalizeDailyTarget(latest.dailyTarget),
      scheduleHistory: deduped,
    };
  }

  public static getTimeline(habit: Habit): HabitScheduleVersion[] {
    const fallbackDt = normalizeDailyTarget(habit.dailyTarget);
    if (!habit.scheduleHistory || habit.scheduleHistory.length === 0) {
      const wt = normalizeWeeklyTarget(habit.weeklyTarget);
      return [
        buildVersionEntry(
          habit.startDay,
          HabitSchedule.normalizeWeekdays(habit.weekdays, wt),
          wt,
          fallbackDt
        ),
      ];
    }
    const norm = HabitSchedule.normalizeHistory(
      habit.startDay,
      habit.weekdays,
      habit.weeklyTarget,
      habit.scheduleHistory,
      fallbackDt
    );
    if (norm.scheduleHistory && norm.scheduleHistory.length > 0) {
      return norm.scheduleHistory;
    }
    return [
      buildVersionEntry(habit.startDay, norm.weekdays, norm.weeklyTarget, norm.dailyTarget),
    ];
  }

  public static getAtDay(habit: Habit, dayIndex: number): ResolvedHabitSchedule {
    if (!habit.scheduleHistory || habit.scheduleHistory.length === 0) {
      const wt = normalizeWeeklyTarget(habit.weeklyTarget);
      return {
        fromDay: habit.startDay,
        weekdays: HabitSchedule.normalizeWeekdays(habit.weekdays, wt),
        weeklyTarget: wt,
        dailyTarget: normalizeDailyTarget(habit.dailyTarget),
      };
    }

    const timeline = HabitSchedule.getTimeline(habit);
    let active = timeline[0];
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i].fromDay <= dayIndex) {
        active = timeline[i];
      } else {
        break;
      }
    }
    return {
      fromDay: active.fromDay,
      weekdays: active.weekdays,
      weeklyTarget: active.weeklyTarget,
      dailyTarget: normalizeDailyTarget(active.dailyTarget),
    };
  }

  public static getSegmentsInRange(
    habit: Habit,
    startDay: number,
    endDay: number
  ): HabitScheduleSegment[] {
    if (endDay < startDay) return [];

    if (!habit.scheduleHistory || habit.scheduleHistory.length <= 1) {
      const wt = normalizeWeeklyTarget(habit.weeklyTarget);
      return [
        {
          start: startDay,
          end: endDay,
          fromDay: habit.startDay,
          weekdays: HabitSchedule.normalizeWeekdays(habit.weekdays, wt),
          weeklyTarget: wt,
          dailyTarget: normalizeDailyTarget(habit.dailyTarget),
        },
      ];
    }

    const timeline = HabitSchedule.getTimeline(habit);
    const segments: HabitScheduleSegment[] = [];
    let cursor = startDay;

    while (cursor <= endDay) {
      let activeIdx = 0;
      for (let i = 1; i < timeline.length; i++) {
        if (timeline[i].fromDay <= cursor) {
          activeIdx = i;
        } else {
          break;
        }
      }
      const active = timeline[activeIdx];
      const nextChange =
        activeIdx + 1 < timeline.length ? timeline[activeIdx + 1].fromDay : Infinity;
      const segEnd = Math.min(endDay, nextChange - 1);
      segments.push({
        start: cursor,
        end: segEnd,
        fromDay: active.fromDay,
        weekdays: active.weekdays,
        weeklyTarget: active.weeklyTarget,
        dailyTarget: normalizeDailyTarget(active.dailyTarget),
      });
      cursor = segEnd + 1;
    }

    return segments;
  }

  public static hasAnyDailyTarget(habit: Habit): boolean {
    if (normalizeDailyTarget(habit.dailyTarget) !== null) return true;
    return (
      habit.scheduleHistory?.some(
        (entry) => normalizeDailyTarget(entry.dailyTarget) !== null
      ) ?? false
    );
  }

  public static isCheckinDoneForDay(
    habit: Habit,
    checkin: HabitCheckin | undefined,
    dayIndex: number
  ): boolean {
    if (!checkin) return false;
    const activeTarget = HabitSchedule.getAtDay(habit, dayIndex).dailyTarget;
    if (activeTarget === null) {
      return checkin.done;
    }
    const numeric = normalizeCheckinValue(checkin.value);
    if (numeric !== undefined) {
      return numeric >= activeTarget;
    }
    if (checkin.value !== undefined) {
      // Explicit 0 or non-positive value stored
      return false;
    }
    // Legacy boolean checkin without explicit value (e.g. converted Entire history)
    return checkin.done;
  }

  public static getCheckinValueForDay(
    habit: Habit,
    checkin: HabitCheckin | undefined,
    dayIndex: number
  ): number {
    if (!checkin) return 0;
    const numeric = normalizeCheckinValue(checkin.value);
    if (numeric !== undefined) {
      return numeric;
    }
    if (checkin.value !== undefined) {
      return 0;
    }
    if (checkin.done) {
      const activeTarget = HabitSchedule.getAtDay(habit, dayIndex).dailyTarget;
      return activeTarget !== null ? activeTarget : 0;
    }
    return 0;
  }

  public static formatNumericValue(value: number): string {
    if (!Number.isFinite(value)) return '0';
    const rounded = Math.round(value * 100) / 100;
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  public static applyEdit(params: {
    existing: Habit;
    nextWeekdays: number;
    nextWeeklyTarget: number | null;
    nextDailyTarget?: number | null;
    nextStartDay: number;
    scope?: ScheduleApplyScope;
    effectiveFromDay?: number;
  }): {
    weekdays: number;
    weeklyTarget: number | null;
    dailyTarget: number | null;
    scheduleHistory?: HabitScheduleVersion[];
  } {
    const { existing, nextStartDay, scope, effectiveFromDay } = params;
    const prevWt = normalizeWeeklyTarget(existing.weeklyTarget);
    const prevWd = HabitSchedule.normalizeWeekdays(existing.weekdays, prevWt);
    const prevDt = normalizeDailyTarget(existing.dailyTarget);

    const cleanWt = normalizeWeeklyTarget(params.nextWeeklyTarget);
    const cleanWd = HabitSchedule.normalizeWeekdays(params.nextWeekdays, cleanWt);
    const cleanDt =
      params.nextDailyTarget !== undefined
        ? normalizeDailyTarget(params.nextDailyTarget)
        : prevDt;

    const scheduleChanged =
      cleanWd !== prevWd || cleanWt !== prevWt || cleanDt !== prevDt;

    if (scope === 'from_day') {
      const fromDay = Math.max(
        nextStartDay,
        Math.trunc(effectiveFromDay ?? nextStartDay)
      );
      const baseTimeline = HabitSchedule.getTimeline(existing).filter(
        (entry) => entry.fromDay < fromDay
      );
      baseTimeline.push(buildVersionEntry(fromDay, cleanWd, cleanWt, cleanDt));
      return HabitSchedule.normalizeHistory(
        nextStartDay,
        cleanWd,
        cleanWt,
        baseTimeline,
        cleanDt
      );
    }

    if (scope === 'all' || scheduleChanged) {
      return {
        weekdays: cleanWd,
        weeklyTarget: cleanWt,
        dailyTarget: cleanDt,
      };
    }

    // No schedule/target change & no explicit reset: preserve existing scheduleHistory
    return HabitSchedule.normalizeHistory(
      nextStartDay,
      cleanWd,
      cleanWt,
      existing.scheduleHistory,
      cleanDt
    );
  }
}


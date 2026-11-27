import { DomainSnapshot, Habit } from '../types/domain';
import { HabitSchedule } from './habit-schedule';
import { computeCrossDomainLoad, computeMultiModeHeatmap } from './analytics/cross-domain';
import {
  computeAtRiskHabits,
  computeBounceBack,
  computeFlexibleInsight,
  computeHabitWeekdayMatrix,
  computeLoggingDiscipline,
  computeMeasuredIntensity,
  computeScheduleImpacts,
} from './analytics/habit-resilience';
import { computeNotesInsights } from './analytics/notes-insights';
import {
  computeBacklogFlowBuckets,
  computeRepeatableTasks,
  computeTaskVelocityAndAging,
  computeWorkloadForecast,
} from './analytics/task-forecast';
import {
  AdvancedAnalyticsReport,
  AdvancedHeatmapMode,
  AdvancedNotesFilter,
  BacklogFlowBucket,
  WorkloadForecastDay,
} from './analytics/types';

export type {
  AdvancedAnalyticsReport,
  AdvancedHeatmapMode,
  AdvancedNotesFilter,
  BacklogFlowBucket,
  WorkloadForecastDay,
};

export class AdvancedAnalytics {
  public static compute(params: {
    snapshot: DomainSnapshot;
    targetHabits: Habit[];
    startDay: number;
    endDay: number;
    todayDay: number;
    timeZone: string;
  }): AdvancedAnalyticsReport {
    const { snapshot, targetHabits, todayDay, timeZone } = params;
    const s = Math.min(params.startDay, params.endDay);
    const e = Math.min(Math.max(params.startDay, params.endDay), todayDay);

    const targetHabitIds = new Set(targetHabits.map((h) => h.id));
    const doneByHabit = new Map<number, Set<number>>();

    for (const h of targetHabits) {
      const doneSet = new Set<number>();
      for (const c of snapshot.checkins) {
        if (c.habitId === h.id && HabitSchedule.isCheckinDoneForDay(h, c, c.dayIndex)) {
          doneSet.add(c.dayIndex);
        }
      }
      doneByHabit.set(h.id, doneSet);
    }

    const bounceBack = computeBounceBack(targetHabits, doneByHabit, s, e, todayDay);
    const atRiskHabits = computeAtRiskHabits(
      targetHabits,
      snapshot.checkins,
      doneByHabit,
      s,
      e,
      todayDay
    );
    const habitWeekdayMatrix = computeHabitWeekdayMatrix(
      targetHabits,
      snapshot.checkins,
      doneByHabit,
      s,
      e,
      todayDay
    );
    const flexibleInsight = computeFlexibleInsight(targetHabits, doneByHabit, s, e, todayDay);
    const measuredIntensity = computeMeasuredIntensity(targetHabits, snapshot.checkins, s, e);
    const scheduleImpacts = computeScheduleImpacts(targetHabits, snapshot.checkins, s, e, todayDay);
    const loggingDiscipline = computeLoggingDiscipline(
      targetHabits,
      targetHabitIds,
      snapshot.checkins,
      s,
      e,
      timeZone
    );
    const backlogFlowBuckets = computeBacklogFlowBuckets(snapshot.tasks, s, e, 12, timeZone);
    const taskVelocity = computeTaskVelocityAndAging(snapshot.tasks, s, e, todayDay, timeZone);
    const repeatableTasks = computeRepeatableTasks(snapshot.tasks, timeZone);
    const { forecast: workloadForecast, overdueBacklogCount } = computeWorkloadForecast(
      snapshot.habits,
      snapshot.checkins,
      snapshot.tasks,
      todayDay,
      7
    );
    const crossDomainLoad = computeCrossDomainLoad(
      targetHabits,
      snapshot.checkins,
      snapshot.tasks,
      s,
      e,
      todayDay,
      timeZone
    );
    const multiHeatmap = computeMultiModeHeatmap(
      targetHabits,
      snapshot.checkins,
      snapshot.tasks,
      s,
      e,
      todayDay,
      timeZone
    );
    const notesInsights = computeNotesInsights(
      targetHabits,
      targetHabitIds,
      snapshot.notes,
      doneByHabit,
      s,
      e
    );

    return {
      bounceBack,
      atRiskHabits,
      habitWeekdayMatrix,
      flexibleInsight,
      measuredIntensity,
      scheduleImpacts,
      loggingDiscipline,
      backlogFlowBuckets,
      taskVelocity,
      repeatableTasks,
      workloadForecast,
      overdueBacklogCount,
      crossDomainLoad,
      multiHeatmap,
      notesInsights,
    };
  }
}

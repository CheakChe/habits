import { Habit } from '../../types/domain';
import { DayCellTone } from '../date-range';

export type AdvancedHeatmapMode = 'habits' | 'tasks' | 'combined';
export type AdvancedNotesFilter = 'all' | 'missed' | 'done';

export interface BounceBackSummary {
  totalMissesEvaluated: number;
  recoveredMisses: number;
  chainedMisses: number;
  bounceBackRate: number | null;
}

export interface AtRiskHabitItem {
  habit: Habit;
  recentRate: number;
  baselineRate: number | null;
  dropPct: number | null;
  consecutiveMisses: number;
  reason: 'drop' | 'miss_streak' | 'both';
}

export interface HabitWeekdayMatrixCell {
  weekdayBit: number;
  scheduledCount: number;
  doneCount: number;
  rate: number | null;
  isOffSchedule: boolean;
}

export interface HabitWeekdayMatrixRow {
  habit: Habit;
  isFlexible: boolean;
  cells: HabitWeekdayMatrixCell[];
  overallRate: number;
}

export interface FlexibleHabitsInsight {
  flexibleHabitsCount: number;
  totalWeeks: number;
  perfectWeeks: number;
  perfectWeeksRate: number | null;
  bonusCheckins: number;
  weekdayDistribution: {
    weekdayBit: number;
    label: string;
    count: number;
    share: number;
  }[];
}

export interface MeasuredIntensityItem {
  habit: Habit;
  unit: string | null;
  partialDays: number;
  exactDays: number;
  overachievedDays: number;
  totalLoggedDays: number;
  avgPartialPct: number | null;
  bestDayValue: number;
  bestDayIndex: number | null;
}

export interface ScheduleImpactItem {
  habit: Habit;
  changeDay: number;
  beforeLabel: string;
  afterLabel: string;
  beforeRate: number | null;
  afterRate: number | null;
  beforeScheduled: number;
  afterScheduled: number;
  deltaPct: number | null;
}

export interface LoggingDisciplineStats {
  totalDoneCheckins: number;
  sameDayCount: number;
  retroactiveCount: number;
  earlyOrOtherCount: number;
  retroactiveRate: number | null;
  timeOfDayBuckets: {
    id: 'morning' | 'afternoon' | 'evening' | 'night';
    label: string;
    hoursLabel: string;
    count: number;
    share: number;
  }[];
}

export interface BacklogFlowBucket {
  key: string;
  label: string;
  shortLabel: string;
  createdCount: number;
  doneCount: number;
  notDoneCount: number;
  archivedCount: number;
  closedCount: number;
  netFlow: number;
}

export interface TaskVelocityAndAging {
  totalCreatedInRange: number;
  totalClosedInRange: number;
  netBacklogDelta: number;
  lateTasksCount: number;
  avgLateDays: number | null;
  medianLateDays: number | null;
  maxLateDays: number;
  earlyTasksCount: number;
  avgDaysEarly: number | null;
  datedCycleTimeAvgDays: number | null;
  datedCycleCount: number;
  goalsCycleTimeAvgDays: number | null;
  goalsCycleCount: number;
  openOverdueCount: number;
  avgOverdueAgeDays: number | null;
  maxOverdueAgeDays: number;
  oldestOverdueTitle: string | null;
  openGoalsCount: number;
  avgGoalAgeDays: number | null;
  oldestGoalTitle: string | null;
}

export interface RepeatableTaskStat {
  title: string;
  doneCount: number;
  notDoneCount: number;
  openCount: number;
  archivedCount: number;
  lastDoneDay: number | null;
  avgGapDays: number | null;
}

export interface WorkloadForecastDay {
  dayIndex: number;
  label: string;
  shortLabel: string;
  weekdayLabel: string;
  fixedHabitsCount: number;
  flexHabitsPendingCount: number;
  tasksDueCount: number;
  totalLoad: number;
}

export interface CrossDomainLoadBucket {
  id: 'light' | 'medium' | 'heavy';
  label: string;
  taskCountLabel: string;
  daysCount: number;
  scheduledCount: number;
  doneCount: number;
  habitRate: number | null;
  perfectDaysCount: number;
}

export interface MultiModeHeatmapCell {
  dayIndex: number;
  inRange: boolean;
  habitsDone: number;
  habitsScheduled: number;
  tasksDone: number;
  tasksNotDone: number;
  tasksDueOpen: number;
  habitTone: DayCellTone;
  taskTone: DayCellTone;
  combinedTone: DayCellTone;
}

export interface MultiModeHeatmapData {
  weeks: {
    weekStart: number;
    monthLabel: string;
    days: MultiModeHeatmapCell[];
  }[];
  clampedStart: number;
  effectiveEnd: number;
  isCapped: boolean;
  totalTaskDone: number;
  totalHabitDone: number;
}

export interface NoteInsightEntry {
  habitId: number;
  habitName: string;
  habitColor: string;
  dayIndex: number;
  text: string;
  status: 'done' | 'missed' | 'unscheduled';
}

export interface NoteKeywordStat {
  word: string;
  count: number;
  missedCount: number;
  doneCount: number;
}

export interface NotesInsightsSummary {
  totalNotes: number;
  notesOnDoneDays: number;
  notesOnMissedDays: number;
  notesOnUnscheduledDays: number;
  topKeywords: NoteKeywordStat[];
  entries: NoteInsightEntry[];
}

export interface AdvancedAnalyticsReport {
  bounceBack: BounceBackSummary;
  atRiskHabits: AtRiskHabitItem[];
  habitWeekdayMatrix: HabitWeekdayMatrixRow[];
  flexibleInsight: FlexibleHabitsInsight | null;
  measuredIntensity: MeasuredIntensityItem[];
  scheduleImpacts: ScheduleImpactItem[];
  loggingDiscipline: LoggingDisciplineStats;
  backlogFlowBuckets: BacklogFlowBucket[];
  taskVelocity: TaskVelocityAndAging;
  repeatableTasks: RepeatableTaskStat[];
  workloadForecast: WorkloadForecastDay[];
  overdueBacklogCount: number;
  crossDomainLoad: CrossDomainLoadBucket[];
  multiHeatmap: MultiModeHeatmapData;
  notesInsights: NotesInsightsSummary;
}

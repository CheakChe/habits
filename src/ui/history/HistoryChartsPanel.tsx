import { JSX } from 'solid-js';
import { Habit, HabitCheckin, HabitNote, Task } from '../../types/domain';
import { HabitRowTrendInfo, PerfectDaysSummary } from '../../utils/charts-analytics';
import { HabitPeriodSummary } from '../../utils/streak-calculator';
import { TaskOutcomeBucket, TaskRangeSummary } from '../../utils/task-analytics';
import { ConsistencyHeatmapCard } from './ConsistencyHeatmapCard';
import { ConsistencyTrendChart } from './ConsistencyTrendChart';
import { HabitBreakdownList } from './HabitBreakdownList';
import { HistoryKpiStrip } from './HistoryKpiStrip';
import { MeasuredVolumeCard } from './MeasuredVolumeCard';
import { TaskDisciplineDonut } from './TaskDisciplineDonut';
import { TasksTimelineChart } from './TasksTimelineChart';
import { AnalyticsSummaryView, HeatmapDataView, PeriodComparisonView } from './types';
import { WeekdayRhythmCard } from './WeekdayRhythmCard';

export type { PeriodComparisonView };

interface HistoryChartsPanelProps {
  habits: Habit[];
  targetHabits: Habit[];
  habitFilter: 'all' | number[];
  checkins: HabitCheckin[];
  notes: HabitNote[];
  tasks: Task[];
  effectiveRangeStart: number;
  effectiveRangeEnd: number;
  rangeLabel: string;
  timeZone: string;
  analyticsSummary: AnalyticsSummaryView;
  perfectDays: PerfectDaysSummary;
  prevComparison: PeriodComparisonView | null;
  habitTrends: Map<number, HabitRowTrendInfo>;
  taskSummary: TaskRangeSummary;
  taskOutcomeBuckets: TaskOutcomeBucket[];
  habitBreakdown: HabitPeriodSummary[];
  heatmapData: HeatmapDataView;
  selectedDay: number;
  onSelectDay: (dayIndex: number) => void;
  onInspectDayInCalendar: (dayIndex: number) => void;
  onSelectHabitFilter: (filter: 'all' | number[]) => void;
}

export function HistoryChartsPanel(props: HistoryChartsPanelProps): JSX.Element {
  return (
    <div class="space-y-6">
      {/* 4-Column KPI Strip */}
      <HistoryKpiStrip
        targetHabitsCount={props.targetHabits.length}
        analyticsSummary={props.analyticsSummary}
        perfectDays={props.perfectDays}
        prevComparison={props.prevComparison}
        taskSummary={props.taskSummary}
      />

      {/* Row 1: Consistency Trend (Area/Line SVG) + Task Discipline (Donut SVG) */}
      <div class="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        <ConsistencyTrendChart
          targetHabits={props.targetHabits}
          checkins={props.checkins}
          effectiveRangeStart={props.effectiveRangeStart}
          effectiveRangeEnd={props.effectiveRangeEnd}
          completionRate={props.analyticsSummary.completionRate}
        />

        <TaskDisciplineDonut taskSummary={props.taskSummary} />
      </div>

      {/* Row 2: Tasks Overview (Stacked Bars) + Weekday Rhythm */}
      <div class="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        <TasksTimelineChart
          rangeLabel={props.rangeLabel}
          taskSummary={props.taskSummary}
          taskOutcomeBuckets={props.taskOutcomeBuckets}
        />

        <WeekdayRhythmCard
          targetHabits={props.targetHabits}
          checkins={props.checkins}
          tasks={props.tasks}
          effectiveRangeStart={props.effectiveRangeStart}
          effectiveRangeEnd={props.effectiveRangeEnd}
          timeZone={props.timeZone}
        />
      </div>

      {/* Row 2.5: Measured Volume Progression */}
      <MeasuredVolumeCard
        targetHabits={props.targetHabits}
        checkins={props.checkins}
        effectiveRangeStart={props.effectiveRangeStart}
        effectiveRangeEnd={props.effectiveRangeEnd}
      />

      {/* Row 3: Full-Width Consistency Heatmap */}
      <ConsistencyHeatmapCard
        targetHabits={props.targetHabits}
        notes={props.notes}
        heatmapData={props.heatmapData}
        selectedDay={props.selectedDay}
        onSelectDay={props.onSelectDay}
        onInspectDayInCalendar={props.onInspectDayInCalendar}
      />

      {/* Row 4: Habit Breakdown */}
      <HabitBreakdownList
        habitFilter={props.habitFilter}
        targetHabits={props.targetHabits}
        habitBreakdown={props.habitBreakdown}
        habitTrends={props.habitTrends}
        rangeLabel={props.rangeLabel}
        effectiveRangeStart={props.effectiveRangeStart}
        effectiveRangeEnd={props.effectiveRangeEnd}
        onSelectHabitFilter={props.onSelectHabitFilter}
      />
    </div>
  );
}

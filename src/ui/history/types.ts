import { DayCellTone } from '../../utils/date-range';
import { StreakUnit } from '../../utils/streak-calculator';

export interface HeatmapDayCell {
  dayIndex: number;
  inRange: boolean;
  done: number;
  scheduled: number;
  tone: DayCellTone;
}

export interface HeatmapDataView {
  weeks: {
    weekStart: number;
    monthLabel: string;
    days: HeatmapDayCell[];
  }[];
  totalDone: number;
  clampedStart: number;
  effectiveEnd: number;
  isCapped: boolean;
}

export interface AnalyticsSummaryView {
  currentStreak: number;
  currentStreakUnit: StreakUnit;
  longestStreak: number;
  longestStreakUnit: StreakUnit;
  completionRate: number;
  scheduledDays: number;
  completedScheduledDays: number;
  missedScheduledDays: number;
}

export interface PeriodComparisonView {
  prevLabel: string;
  habitRateDeltaPct: number | null;
  taskDoneDelta: number | null;
  taskRateDeltaPct: number | null;
}

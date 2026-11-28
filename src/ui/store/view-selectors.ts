import { Accessor, createRoot } from 'solid-js';
import { ActiveTab, DomainSnapshot, HistorySubTab, SessionMode } from '../../types/domain';
import { AdvancedAnalyticsReport } from '../../utils/advanced-analytics';
import { DateRangePresetId } from '../../utils/date-range';
import { TaskSortMode, TaskStatusFilterSelection } from '../../utils/today-board';
import {
  HabitsViewData,
  TasksViewData,
  TodayViewData,
  createHabitsDataSelector,
  createTasksDataSelector,
  createTodayDataSelector,
} from '../board-selectors';
import {
  HistoryChartsReport,
  HistorySummaryReport,
  createAdvancedReportSelector,
  createHistoryChartsSelector,
  createHistorySummarySelector,
} from '../history/history-selectors';

export interface StoreViewSelectorsDeps {
  mode: Accessor<SessionMode | null>;
  dbReady: Accessor<boolean>;
  activeTab: Accessor<ActiveTab>;
  snapshot: Accessor<DomainSnapshot>;
  todayDay: Accessor<number>;
  timeZone: Accessor<string>;
  historySubTab: Accessor<HistorySubTab>;
  historyHabitFilter: Accessor<'all' | number[]>;
  historyRangePreset: Accessor<DateRangePresetId>;
  historyCustomStartDay: Accessor<number>;
  historyCustomEndDay: Accessor<number>;
  tasksStatusFilter: Accessor<TaskStatusFilterSelection>;
  tasksSortMode: Accessor<TaskSortMode>;
}

export interface StoreViewSelectors {
  todayData: Accessor<TodayViewData | null>;
  habitsData: Accessor<HabitsViewData | null>;
  tasksData: Accessor<TasksViewData | null>;
  historySummary: Accessor<HistorySummaryReport | null>;
  chartsReport: Accessor<HistoryChartsReport | null>;
  advancedReport: Accessor<AdvancedAnalyticsReport | null>;
  dispose: () => void;
}

export function createStoreViewSelectors(deps: StoreViewSelectorsDeps): StoreViewSelectors {
  return createRoot((dispose) => {
    const isSessionReady = () => deps.mode() !== null && deps.dbReady();
    const hasHistoryData = () => {
      const snap = deps.snapshot();
      return snap.habits.length > 0 || snap.tasks.some((t) => t.deletedAt === null);
    };

    const todayData = createTodayDataSelector({
      isActive: () => isSessionReady() && deps.activeTab() === 'today',
      snapshot: deps.snapshot,
      todayDay: deps.todayDay,
    });

    const habitsData = createHabitsDataSelector({
      isActive: () => isSessionReady() && deps.activeTab() === 'habits',
      snapshot: deps.snapshot,
      todayDay: deps.todayDay,
    });

    const tasksData = createTasksDataSelector({
      isActive: () => isSessionReady() && deps.activeTab() === 'tasks',
      snapshot: deps.snapshot,
      todayDay: deps.todayDay,
      statusFilter: deps.tasksStatusFilter,
      sortMode: deps.tasksSortMode,
    });

    const historySummary = createHistorySummarySelector({
      isActive: () =>
        isSessionReady() &&
        deps.activeTab() === 'history' &&
        hasHistoryData() &&
        (deps.historySubTab() === 'calendar' || deps.historySubTab() === 'charts'),
      snapshot: deps.snapshot,
      habitFilter: deps.historyHabitFilter,
      rangePreset: deps.historyRangePreset,
      customStartDay: deps.historyCustomStartDay,
      customEndDay: deps.historyCustomEndDay,
      todayDay: deps.todayDay,
      timeZone: deps.timeZone,
    });

    const chartsReport = createHistoryChartsSelector({
      isActive: () =>
        isSessionReady() &&
        deps.activeTab() === 'history' &&
        hasHistoryData() &&
        deps.historySubTab() === 'charts',
      snapshot: deps.snapshot,
      habitFilter: deps.historyHabitFilter,
      rangePreset: deps.historyRangePreset,
      customStartDay: deps.historyCustomStartDay,
      customEndDay: deps.historyCustomEndDay,
      todayDay: deps.todayDay,
      timeZone: deps.timeZone,
      summary: historySummary,
    });

    const advancedReport = createAdvancedReportSelector({
      isActive: () =>
        isSessionReady() &&
        deps.activeTab() === 'history' &&
        hasHistoryData() &&
        deps.historySubTab() === 'advanced',
      snapshot: deps.snapshot,
      habitFilter: deps.historyHabitFilter,
      rangePreset: deps.historyRangePreset,
      customStartDay: deps.historyCustomStartDay,
      customEndDay: deps.historyCustomEndDay,
      todayDay: deps.todayDay,
      timeZone: deps.timeZone,
    });

    return {
      todayData,
      habitsData,
      tasksData,
      historySummary,
      chartsReport,
      advancedReport,
      dispose,
    };
  });
}

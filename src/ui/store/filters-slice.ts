import { Accessor, Setter, batch, createSignal } from 'solid-js';
import { ActiveTab, Habit, HistorySubTab } from '../../types/domain';
import { AdvancedHeatmapMode, AdvancedNotesFilter } from '../../utils/advanced-analytics';
import { CivilCalendar } from '../../utils/civil-calendar';
import { DateRangePresetId } from '../../utils/date-range';
import { TaskSortMode, TaskStatusFilterSelection, TodayBoard } from '../../utils/today-board';
import { PreferencesStorage } from '../preferences-store';

export interface FiltersSliceDeps {
  onTimeZoneChanged: () => void;
  getHabitCount?: () => number;
}

export interface FiltersSlice {
  activeTab: Accessor<ActiveTab>;
  setActiveTab: Setter<ActiveTab>;
  todayDay: Accessor<number>;
  setTodayDay: Setter<number>;
  timeZone: Accessor<string>;
  todayGoalsExpanded: Accessor<boolean>;
  historyRangePreset: Accessor<DateRangePresetId>;
  historyCustomStartDay: Accessor<number>;
  historyCustomEndDay: Accessor<number>;
  historySubTab: Accessor<HistorySubTab>;
  historyHabitFilter: Accessor<'all' | number[]>;
  tasksStatusFilter: Accessor<TaskStatusFilterSelection>;
  tasksSortMode: Accessor<TaskSortMode>;
  advancedHeatmapMode: Accessor<AdvancedHeatmapMode>;
  advancedNotesFilter: Accessor<AdvancedNotesFilter>;
  applyTimeZoneValue: (nextTz: string, updatedAt: number) => void;
  setTimeZone: (nextTz: string) => void;
  toggleTodayGoalsExpanded: () => void;
  setTodayGoalsExpanded: (expanded: boolean) => void;
  setHistoryRangePreset: (nextPreset: DateRangePresetId) => void;
  setHistoryCustomRange: (startDay: number, endDay: number) => void;
  setHistorySubTab: (nextTab: HistorySubTab) => void;
  setHistoryHabitFilter: (nextFilter: 'all' | number[], habitCount?: number) => void;
  pruneHabitFilter: (habits: Habit[]) => void;
  setTasksStatusFilter: (nextFilter: TaskStatusFilterSelection) => void;
  setTasksSortMode: (nextSort: TaskSortMode) => void;
  setAdvancedHeatmapMode: (mode: AdvancedHeatmapMode) => void;
  setAdvancedNotesFilter: (filter: AdvancedNotesFilter) => void;
}

export function createFiltersSlice(deps: FiltersSliceDeps): FiltersSlice {
  const [activeTab, setActiveTab] = createSignal<ActiveTab>('today');
  const initialTz = PreferencesStorage.readStoredTimeZone();
  const [timeZone, setTimeZoneSignal] = createSignal(initialTz);
  const initialTodayDay = CivilCalendar.todayDayIndex(new Date(), initialTz);
  const [todayDay, setTodayDay] = createSignal(initialTodayDay);
  const [todayGoalsExpanded, setTodayGoalsExpandedSignal] = createSignal(
    PreferencesStorage.readStoredTodayGoalsExpanded()
  );
  const storedRange = PreferencesStorage.readStoredHistoryRange(initialTodayDay);
  const [historyRangePreset, setHistoryRangePresetSignal] = createSignal(storedRange.preset);
  const [historyCustomStartDay, setHistoryCustomStartDaySignal] = createSignal(
    storedRange.customStartDay
  );
  const [historyCustomEndDay, setHistoryCustomEndDaySignal] = createSignal(
    storedRange.customEndDay
  );
  const [historySubTab, setHistorySubTabSignal] = createSignal<HistorySubTab>(
    PreferencesStorage.readStoredHistorySubTab()
  );
  const [historyHabitFilter, setHistoryHabitFilterSignal] = createSignal<'all' | number[]>(
    PreferencesStorage.readStoredHistoryHabitFilter()
  );
  const [tasksStatusFilter, setTasksStatusFilterSignal] = createSignal<TaskStatusFilterSelection>(
    PreferencesStorage.readStoredTasksStatusFilter()
  );
  const [tasksSortMode, setTasksSortModeSignal] = createSignal<TaskSortMode>(
    PreferencesStorage.readStoredTasksSortMode()
  );
  const [advancedHeatmapMode, setAdvancedHeatmapModeSignal] = createSignal<AdvancedHeatmapMode>(
    PreferencesStorage.readStoredAdvancedHeatmapMode()
  );
  const [advancedNotesFilter, setAdvancedNotesFilterSignal] = createSignal<AdvancedNotesFilter>(
    PreferencesStorage.readStoredAdvancedNotesFilter()
  );

  const applyTimeZoneValue = (nextTz: string, updatedAt: number): void => {
    const normalized = PreferencesStorage.persistTimeZone(nextTz, updatedAt);
    setTimeZoneSignal(normalized);
    setTodayDay(CivilCalendar.todayDayIndex(new Date(), normalized));
    deps.onTimeZoneChanged();
  };

  const setTimeZone = (nextTz: string): void => {
    applyTimeZoneValue(nextTz, Date.now());
  };

  const setTodayGoalsExpanded = (expanded: boolean): void => {
    PreferencesStorage.persistTodayGoalsExpanded(expanded);
    setTodayGoalsExpandedSignal(expanded);
  };

  const toggleTodayGoalsExpanded = (): void => {
    setTodayGoalsExpanded(!todayGoalsExpanded());
  };

  const setHistoryRangePreset = (nextPreset: DateRangePresetId): void => {
    setHistoryRangePresetSignal(nextPreset);
    PreferencesStorage.persistHistoryRange(
      nextPreset,
      historyCustomStartDay(),
      historyCustomEndDay()
    );
  };

  const setHistoryCustomRange = (startDay: number, endDay: number): void => {
    const s = Math.min(startDay, endDay);
    const e = Math.min(Math.max(startDay, endDay), todayDay());
    batch(() => {
      setHistoryCustomStartDaySignal(s);
      setHistoryCustomEndDaySignal(e);
      setHistoryRangePresetSignal('custom');
    });
    PreferencesStorage.persistHistoryRange('custom', s, e);
  };

  const setHistorySubTab = (nextTab: HistorySubTab): void => {
    PreferencesStorage.persistHistorySubTab(nextTab);
    setHistorySubTabSignal(nextTab);
  };

  const setHistoryHabitFilter = (
    nextFilter: 'all' | number[],
    habitCount: number = deps.getHabitCount?.() ?? 0
  ): void => {
    let normalized: 'all' | number[] = 'all';
    if (nextFilter !== 'all') {
      const deduped: number[] = [];
      for (const id of nextFilter) {
        if (Number.isInteger(id) && id > 0 && !deduped.includes(id)) {
          deduped.push(id);
        }
      }
      normalized = habitCount > 0 && deduped.length === habitCount ? 'all' : deduped;
    }
    PreferencesStorage.persistHistoryHabitFilter(normalized);
    setHistoryHabitFilterSignal(normalized);
  };

  const pruneHabitFilter = (habits: Habit[]): void => {
    const currentHabitFilter = historyHabitFilter();
    if (currentHabitFilter !== 'all' && currentHabitFilter.length > 0) {
      const validSet = new Set(habits.map((h) => h.id));
      const surviving = currentHabitFilter.filter((id) => validSet.has(id));
      if (surviving.length === 0) {
        setHistoryHabitFilter('all', habits.length);
      } else if (surviving.length !== currentHabitFilter.length) {
        setHistoryHabitFilter(surviving, habits.length);
      }
    }
  };

  const setTasksStatusFilter = (nextFilter: TaskStatusFilterSelection): void => {
    const normalized = TodayBoard.normalizeStatusFilterSelection(nextFilter);
    PreferencesStorage.persistTasksStatusFilter(normalized);
    setTasksStatusFilterSignal(normalized);
  };

  const setTasksSortMode = (nextSort: TaskSortMode): void => {
    PreferencesStorage.persistTasksSortMode(nextSort);
    setTasksSortModeSignal(nextSort);
  };

  const setAdvancedHeatmapMode = (mode: AdvancedHeatmapMode): void => {
    PreferencesStorage.persistAdvancedHeatmapMode(mode);
    setAdvancedHeatmapModeSignal(mode);
  };

  const setAdvancedNotesFilter = (filter: AdvancedNotesFilter): void => {
    PreferencesStorage.persistAdvancedNotesFilter(filter);
    setAdvancedNotesFilterSignal(filter);
  };

  return {
    activeTab,
    setActiveTab,
    todayDay,
    setTodayDay,
    timeZone,
    todayGoalsExpanded,
    historyRangePreset,
    historyCustomStartDay,
    historyCustomEndDay,
    historySubTab,
    historyHabitFilter,
    tasksStatusFilter,
    tasksSortMode,
    advancedHeatmapMode,
    advancedNotesFilter,
    applyTimeZoneValue,
    setTimeZone,
    toggleTodayGoalsExpanded,
    setTodayGoalsExpanded,
    setHistoryRangePreset,
    setHistoryCustomRange,
    setHistorySubTab,
    setHistoryHabitFilter,
    pruneHabitFilter,
    setTasksStatusFilter,
    setTasksSortMode,
    setAdvancedHeatmapMode,
    setAdvancedNotesFilter,
  };
}

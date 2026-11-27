import { HistorySubTab } from '../types/domain';
import { AdvancedHeatmapMode, AdvancedNotesFilter } from '../utils/advanced-analytics';
import { CivilCalendar } from '../utils/civil-calendar';
import { DATE_RANGE_PRESETS, DateRangePresetId } from '../utils/date-range';
import {
  DEFAULT_REMINDER_PREFERENCES,
  ReminderPlanner,
  ReminderPreferences,
} from '../utils/reminder-planner';
import {
  OPEN_TASK_BUCKETS,
  TaskSortMode,
  TaskStatusFilterSelection,
  TodayBoard,
} from '../utils/today-board';

export class PreferencesStorage {
  private static readonly TIMEZONE_STORAGE_KEY = 'habits.timezone';
  private static readonly TIMEZONE_UPDATED_AT_KEY = 'habits.timezoneUpdatedAt';
  private static readonly REMINDERS_EDITED_AT_KEY = 'habits.remindersEditedAt';
  private static readonly TODAY_GOALS_EXPANDED_KEY = 'habits.todayGoalsExpanded';
  private static readonly HISTORY_RANGE_STORAGE_KEY = 'habits.historyRange';
  private static readonly HISTORY_SUBTAB_STORAGE_KEY = 'habits.historySubTab';
  private static readonly HISTORY_HABIT_FILTER_KEY = 'habits.historyHabitFilter';
  private static readonly ADVANCED_HEATMAP_MODE_KEY = 'habits.advancedHeatmapMode';
  private static readonly ADVANCED_NOTES_FILTER_KEY = 'habits.advancedNotesFilter';
  private static readonly TASKS_STATUS_FILTER_KEY = 'habits.tasksStatusFilter';
  private static readonly TASKS_SORT_MODE_KEY = 'habits.tasksSortMode';
  private static readonly REMINDERS_STORAGE_KEY = 'habits.reminders';

  private static getItem(key: string): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  private static setItem(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {
      // ignore storage errors
    }
  }

  private static readStoredTimestamp(key: string): number {
    const raw = PreferencesStorage.getItem(key);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private static writeStoredTimestamp(key: string, ts: number): void {
    if (Number.isFinite(ts) && ts > 0) {
      PreferencesStorage.setItem(key, String(Math.trunc(ts)));
    }
  }

  public static readStoredTimeZone(): string {
    const saved = PreferencesStorage.getItem(PreferencesStorage.TIMEZONE_STORAGE_KEY);
    if (saved && CivilCalendar.isValidTimeZone(saved)) {
      return saved;
    }
    return 'UTC';
  }

  public static readStoredTimeZoneUpdatedAt(): number {
    return PreferencesStorage.readStoredTimestamp(PreferencesStorage.TIMEZONE_UPDATED_AT_KEY);
  }

  public static writeStoredTimeZoneUpdatedAt(ts: number): void {
    PreferencesStorage.writeStoredTimestamp(PreferencesStorage.TIMEZONE_UPDATED_AT_KEY, ts);
  }

  public static persistTimeZone(nextTz: string, updatedAt: number): string {
    const normalized = CivilCalendar.isValidTimeZone(nextTz) ? nextTz : 'UTC';
    PreferencesStorage.setItem(PreferencesStorage.TIMEZONE_STORAGE_KEY, normalized);
    PreferencesStorage.writeStoredTimestamp(PreferencesStorage.TIMEZONE_UPDATED_AT_KEY, updatedAt);
    return normalized;
  }

  public static readStoredRemindersEditedAt(): number {
    return PreferencesStorage.readStoredTimestamp(PreferencesStorage.REMINDERS_EDITED_AT_KEY);
  }

  public static writeStoredRemindersEditedAt(ts: number): void {
    PreferencesStorage.writeStoredTimestamp(PreferencesStorage.REMINDERS_EDITED_AT_KEY, ts);
  }

  public static readStoredTodayGoalsExpanded(): boolean {
    const saved = PreferencesStorage.getItem(PreferencesStorage.TODAY_GOALS_EXPANDED_KEY);
    if (saved === 'false') return false;
    if (saved === 'true') return true;
    return true;
  }

  public static persistTodayGoalsExpanded(expanded: boolean): void {
    PreferencesStorage.setItem(
      PreferencesStorage.TODAY_GOALS_EXPANDED_KEY,
      expanded ? 'true' : 'false'
    );
  }

  public static readStoredHistoryRange(defaultTodayDay: number): {
    preset: DateRangePresetId;
    customStartDay: number;
    customEndDay: number;
  } {
    const fallback = {
      preset: 'last_30' as DateRangePresetId,
      customStartDay: defaultTodayDay - 29,
      customEndDay: defaultTodayDay,
    };
    try {
      const raw = PreferencesStorage.getItem(PreferencesStorage.HISTORY_RANGE_STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as {
        preset?: unknown;
        customStartDay?: unknown;
        customEndDay?: unknown;
      };
      const isValidPreset = DATE_RANGE_PRESETS.some((p) => p.id === parsed.preset);
      const preset = isValidPreset ? (parsed.preset as DateRangePresetId) : fallback.preset;
      const customStartDay = Number.isInteger(parsed.customStartDay)
        ? (parsed.customStartDay as number)
        : fallback.customStartDay;
      const customEndDay = Number.isInteger(parsed.customEndDay)
        ? (parsed.customEndDay as number)
        : fallback.customEndDay;
      return {
        preset,
        customStartDay: Math.min(customStartDay, customEndDay),
        customEndDay: Math.max(customStartDay, customEndDay),
      };
    } catch {
      return fallback;
    }
  }

  public static persistHistoryRange(
    preset: DateRangePresetId,
    customStartDay: number,
    customEndDay: number
  ): void {
    PreferencesStorage.setItem(
      PreferencesStorage.HISTORY_RANGE_STORAGE_KEY,
      JSON.stringify({ preset, customStartDay, customEndDay })
    );
  }

  public static readStoredHistorySubTab(): HistorySubTab {
    const saved = PreferencesStorage.getItem(PreferencesStorage.HISTORY_SUBTAB_STORAGE_KEY);
    if (saved === 'charts' || saved === 'calendar' || saved === 'advanced') {
      return saved;
    }
    return 'calendar';
  }

  public static persistHistorySubTab(nextTab: HistorySubTab): void {
    PreferencesStorage.setItem(PreferencesStorage.HISTORY_SUBTAB_STORAGE_KEY, nextTab);
  }

  public static readStoredAdvancedHeatmapMode(): AdvancedHeatmapMode {
    const saved = PreferencesStorage.getItem(PreferencesStorage.ADVANCED_HEATMAP_MODE_KEY);
    if (saved === 'habits' || saved === 'tasks' || saved === 'combined') {
      return saved;
    }
    return 'combined';
  }

  public static persistAdvancedHeatmapMode(mode: AdvancedHeatmapMode): void {
    PreferencesStorage.setItem(PreferencesStorage.ADVANCED_HEATMAP_MODE_KEY, mode);
  }

  public static readStoredAdvancedNotesFilter(): AdvancedNotesFilter {
    const saved = PreferencesStorage.getItem(PreferencesStorage.ADVANCED_NOTES_FILTER_KEY);
    if (saved === 'all' || saved === 'missed' || saved === 'done') {
      return saved;
    }
    return 'all';
  }

  public static persistAdvancedNotesFilter(filter: AdvancedNotesFilter): void {
    PreferencesStorage.setItem(PreferencesStorage.ADVANCED_NOTES_FILTER_KEY, filter);
  }

  public static readStoredHistoryHabitFilter(): 'all' | number[] {
    try {
      const raw = PreferencesStorage.getItem(PreferencesStorage.HISTORY_HABIT_FILTER_KEY);
      if (!raw) return 'all';
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === 'all') return 'all';
      if (Array.isArray(parsed)) {
        const ids: number[] = [];
        for (const item of parsed) {
          if (
            typeof item === 'number' &&
            Number.isInteger(item) &&
            item > 0 &&
            !ids.includes(item)
          ) {
            ids.push(item);
          }
        }
        return ids;
      }
    } catch {
      // ignore storage errors
    }
    return 'all';
  }

  public static persistHistoryHabitFilter(filter: 'all' | number[]): void {
    PreferencesStorage.setItem(PreferencesStorage.HISTORY_HABIT_FILTER_KEY, JSON.stringify(filter));
  }

  public static readStoredTasksStatusFilter(): TaskStatusFilterSelection {
    try {
      const raw = PreferencesStorage.getItem(PreferencesStorage.TASKS_STATUS_FILTER_KEY);
      if (!raw) return [...OPEN_TASK_BUCKETS];
      return TodayBoard.normalizeStatusFilterSelection(JSON.parse(raw));
    } catch {
      return [...OPEN_TASK_BUCKETS];
    }
  }

  public static persistTasksStatusFilter(filter: TaskStatusFilterSelection): void {
    PreferencesStorage.setItem(PreferencesStorage.TASKS_STATUS_FILTER_KEY, JSON.stringify(filter));
  }

  public static readStoredTasksSortMode(): TaskSortMode {
    const saved = PreferencesStorage.getItem(PreferencesStorage.TASKS_SORT_MODE_KEY);
    if (
      saved === 'default' ||
      saved === 'due_asc' ||
      saved === 'due_desc' ||
      saved === 'newest' ||
      saved === 'title'
    ) {
      return saved;
    }
    return 'default';
  }

  public static persistTasksSortMode(sortMode: TaskSortMode): void {
    PreferencesStorage.setItem(PreferencesStorage.TASKS_SORT_MODE_KEY, sortMode);
  }

  public static readStoredReminderPrefs(): ReminderPreferences {
    try {
      const raw = PreferencesStorage.getItem(PreferencesStorage.REMINDERS_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_REMINDER_PREFERENCES };
      return ReminderPlanner.normalizePreferences(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_REMINDER_PREFERENCES };
    }
  }

  public static persistReminderPrefs(prefs: ReminderPreferences): void {
    PreferencesStorage.setItem(PreferencesStorage.REMINDERS_STORAGE_KEY, JSON.stringify(prefs));
  }
}

import { Accessor, Setter, createSignal } from 'solid-js';
import { SessionManager } from '../auth/session-manager';
import { HabitDatabase } from '../db/habit-database';
import { BackupService } from '../sync/backup-service';
import {
  CalendarReminderService,
  CalendarSyncPlan,
} from '../sync/calendar-reminder-service';
import {
  ConcurrentSyncError,
  DriveRevisionInspectResult,
  DriveRevisionMeta,
  DriveSyncService,
  SyncPreparationResult,
} from '../sync/drive-sync-service';
import {
  ActiveTab,
  DomainSnapshot,
  Habit,
  HistorySubTab,
  SessionMode,
  Task,
  TaskStatus,
} from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { DATE_RANGE_PRESETS, DateRangePresetId } from '../utils/date-range';
import {
  BadgePermissionState,
  DEFAULT_REMINDER_PREFERENCES,
  ReminderPlanner,
  ReminderPreferences,
  TodayPendingSummary,
} from '../utils/reminder-planner';
import {
  OPEN_TASK_BUCKETS,
  TaskSortMode,
  TaskStatusFilterSelection,
  TodayBoard,
} from '../utils/today-board';

export type TaskModalMode = 'create' | 'edit' | 'next';

export interface TaskDraftPrefill {
  title: string;
  note: string;
  dueDay: number | null;
  repeatable: boolean;
}

const EMPTY_SNAPSHOT: DomainSnapshot = {
  habits: [],
  checkins: [],
  notes: [],
  tasks: [],
};

export class TrackerStore {
  private readonly db = new HabitDatabase();
  private readonly session = new SessionManager();
  private readonly driveSync = new DriveSyncService();
  private readonly calendarSync = new CalendarReminderService();

  public readonly mode: Accessor<SessionMode | null>;
  private readonly setMode: Setter<SessionMode | null>;

  public readonly activeTab: Accessor<ActiveTab>;
  public readonly setActiveTab: Setter<ActiveTab>;

  public readonly snapshot: Accessor<DomainSnapshot>;
  private readonly setSnapshot: Setter<DomainSnapshot>;

  public readonly dbReady: Accessor<boolean>;
  private readonly setDbReady: Setter<boolean>;

  public readonly hasGoogleToken: Accessor<boolean>;
  private readonly setHasGoogleToken: Setter<boolean>;

  public readonly googleEmail: Accessor<string | null>;
  private readonly setGoogleEmail: Setter<string | null>;

  public readonly isSigningIn: Accessor<boolean>;
  private readonly setIsSigningIn: Setter<boolean>;

  public readonly authError: Accessor<string | null>;
  private readonly setAuthError: Setter<string | null>;

  public readonly syncBusy: Accessor<boolean>;
  private readonly setSyncBusy: Setter<boolean>;

  public readonly syncBanner: Accessor<{ kind: 'success' | 'error'; text: string } | null>;
  public readonly setSyncBanner: Setter<{ kind: 'success' | 'error'; text: string } | null>;

  public readonly pendingSync: Accessor<SyncPreparationResult | null>;
  private readonly setPendingSync: Setter<SyncPreparationResult | null>;

  public readonly habitModalOpen: Accessor<boolean>;
  private readonly setHabitModalOpen: Setter<boolean>;

  public readonly editingHabit: Accessor<Habit | null>;
  private readonly setEditingHabit: Setter<Habit | null>;

  public readonly taskModalOpen: Accessor<boolean>;
  private readonly setTaskModalOpen: Setter<boolean>;

  public readonly taskModalMode: Accessor<TaskModalMode>;
  private readonly setTaskModalMode: Setter<TaskModalMode>;

  public readonly taskDraftPrefill: Accessor<TaskDraftPrefill | null>;
  private readonly setTaskDraftPrefill: Setter<TaskDraftPrefill | null>;

  public readonly editingTask: Accessor<Task | null>;
  private readonly setEditingTask: Setter<Task | null>;

  public readonly accountModalOpen: Accessor<boolean>;
  public readonly setAccountModalOpen: Setter<boolean>;

  public readonly revisionsModalOpen: Accessor<boolean>;
  private readonly setRevisionsModalOpen: Setter<boolean>;

  public readonly revisionsLoading: Accessor<boolean>;
  private readonly setRevisionsLoading: Setter<boolean>;

  public readonly revisionsError: Accessor<string | null>;
  private readonly setRevisionsError: Setter<string | null>;

  public readonly revisionsFileId: Accessor<string | null>;
  private readonly setRevisionsFileId: Setter<string | null>;

  public readonly revisions: Accessor<DriveRevisionMeta[]>;
  private readonly setRevisions: Setter<DriveRevisionMeta[]>;

  public readonly inspectingRevisionId: Accessor<string | null>;
  private readonly setInspectingRevisionId: Setter<string | null>;

  public readonly inspectedRevision: Accessor<DriveRevisionInspectResult | null>;
  private readonly setInspectedRevision: Setter<DriveRevisionInspectResult | null>;

  public readonly restoringRevision: Accessor<boolean>;
  private readonly setRestoringRevision: Setter<boolean>;

  public readonly todayDay: Accessor<number>;
  private readonly setTodayDay: Setter<number>;

  public readonly timeZone: Accessor<string>;
  private readonly setTimeZoneSignal: Setter<string>;

  public readonly todayGoalsExpanded: Accessor<boolean>;
  private readonly setTodayGoalsExpandedSignal: Setter<boolean>;

  public readonly historyRangePreset: Accessor<DateRangePresetId>;
  private readonly setHistoryRangePresetSignal: Setter<DateRangePresetId>;

  public readonly historyCustomStartDay: Accessor<number>;
  private readonly setHistoryCustomStartDaySignal: Setter<number>;

  public readonly historyCustomEndDay: Accessor<number>;
  private readonly setHistoryCustomEndDaySignal: Setter<number>;

  public readonly historySubTab: Accessor<HistorySubTab>;
  private readonly setHistorySubTabSignal: Setter<HistorySubTab>;

  public readonly historyHabitFilter: Accessor<'all' | number[]>;
  private readonly setHistoryHabitFilterSignal: Setter<'all' | number[]>;

  public readonly tasksStatusFilter: Accessor<TaskStatusFilterSelection>;
  private readonly setTasksStatusFilterSignal: Setter<TaskStatusFilterSelection>;

  public readonly tasksSortMode: Accessor<TaskSortMode>;
  private readonly setTasksSortModeSignal: Setter<TaskSortMode>;

  public readonly reminderPrefs: Accessor<ReminderPreferences>;
  private readonly setReminderPrefsSignal: Setter<ReminderPreferences>;

  public readonly badgePermission: Accessor<BadgePermissionState>;
  private readonly setBadgePermission: Setter<BadgePermissionState>;

  public readonly remindersModalOpen: Accessor<boolean>;
  private readonly setRemindersModalOpen: Setter<boolean>;

  public readonly calendarBusy: Accessor<boolean>;
  private readonly setCalendarBusy: Setter<boolean>;

  public readonly calendarError: Accessor<string | null>;
  private readonly setCalendarError: Setter<string | null>;

  public readonly pendingCalendarPlan: Accessor<CalendarSyncPlan | null>;
  private readonly setPendingCalendarPlan: Setter<CalendarSyncPlan | null>;

  public readonly confirmDeleteCalendarOpen: Accessor<boolean>;
  private readonly setConfirmDeleteCalendarOpen: Setter<boolean>;

  private unsubscribeAuth: (() => void) | null = null;
  private midnightTimer: number | null = null;
  private tokenExpiryTimer: number | null = null;
  private visibilityListener: (() => void) | null = null;
  private static readonly TIMEZONE_STORAGE_KEY = 'habits.timezone';
  private static readonly TODAY_GOALS_EXPANDED_KEY = 'habits.todayGoalsExpanded';
  private static readonly HISTORY_RANGE_STORAGE_KEY = 'habits.historyRange';
  private static readonly HISTORY_SUBTAB_STORAGE_KEY = 'habits.historySubTab';
  private static readonly HISTORY_HABIT_FILTER_KEY = 'habits.historyHabitFilter';
  private static readonly TASKS_STATUS_FILTER_KEY = 'habits.tasksStatusFilter';
  private static readonly TASKS_SORT_MODE_KEY = 'habits.tasksSortMode';
  private static readonly REMINDERS_STORAGE_KEY = 'habits.reminders';

  private static readStoredTimeZone(): string {
    try {
      const saved =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(TrackerStore.TIMEZONE_STORAGE_KEY)
          : null;
      if (saved && CivilCalendar.isValidTimeZone(saved)) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'UTC';
  }

  private static readStoredTodayGoalsExpanded(): boolean {
    try {
      const saved =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(TrackerStore.TODAY_GOALS_EXPANDED_KEY)
          : null;
      if (saved === 'false') return false;
      if (saved === 'true') return true;
    } catch {
      // ignore storage errors
    }
    return true;
  }

  private static readStoredHistoryRange(defaultTodayDay: number): {
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
      const raw =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(TrackerStore.HISTORY_RANGE_STORAGE_KEY)
          : null;
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as {
        preset?: unknown;
        customStartDay?: unknown;
        customEndDay?: unknown;
      };
      const isValidPreset = DATE_RANGE_PRESETS.some((p) => p.id === parsed.preset);
      const preset = isValidPreset
        ? (parsed.preset as DateRangePresetId)
        : fallback.preset;
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

  private static readStoredHistorySubTab(): HistorySubTab {
    try {
      const saved =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(TrackerStore.HISTORY_SUBTAB_STORAGE_KEY)
          : null;
      if (saved === 'charts' || saved === 'calendar') {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'calendar';
  }

  private static readStoredHistoryHabitFilter(): 'all' | number[] {
    try {
      const raw =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(TrackerStore.HISTORY_HABIT_FILTER_KEY)
          : null;
      if (!raw) return 'all';
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === 'all') return 'all';
      if (Array.isArray(parsed)) {
        const ids: number[] = [];
        for (const item of parsed) {
          if (typeof item === 'number' && Number.isInteger(item) && item > 0 && !ids.includes(item)) {
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

  private static readStoredTasksStatusFilter(): TaskStatusFilterSelection {
    try {
      const raw =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(TrackerStore.TASKS_STATUS_FILTER_KEY)
          : null;
      if (!raw) return [...OPEN_TASK_BUCKETS];
      return TodayBoard.normalizeStatusFilterSelection(JSON.parse(raw));
    } catch {
      return [...OPEN_TASK_BUCKETS];
    }
  }

  private static readStoredTasksSortMode(): TaskSortMode {
    try {
      const saved =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(TrackerStore.TASKS_SORT_MODE_KEY)
          : null;
      if (
        saved === 'default' ||
        saved === 'due_asc' ||
        saved === 'due_desc' ||
        saved === 'newest' ||
        saved === 'title'
      ) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'default';
  }

  private static readStoredReminderPrefs(): ReminderPreferences {
    try {
      const raw =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(TrackerStore.REMINDERS_STORAGE_KEY)
          : null;
      if (!raw) return { ...DEFAULT_REMINDER_PREFERENCES };
      return ReminderPlanner.normalizePreferences(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_REMINDER_PREFERENCES };
    }
  }

  constructor() {
    [this.mode, this.setMode] = createSignal<SessionMode | null>(
      this.session.getRememberedMode()
    );
    [this.activeTab, this.setActiveTab] = createSignal<ActiveTab>('today');
    [this.snapshot, this.setSnapshot] = createSignal<DomainSnapshot>(EMPTY_SNAPSHOT);
    [this.dbReady, this.setDbReady] = createSignal(false);
    [this.hasGoogleToken, this.setHasGoogleToken] = createSignal(
      this.session.hasAccessToken()
    );
    [this.googleEmail, this.setGoogleEmail] = createSignal<string | null>(
      this.session.getAccountEmail()
    );
    [this.isSigningIn, this.setIsSigningIn] = createSignal(false);
    [this.authError, this.setAuthError] = createSignal<string | null>(null);
    [this.syncBusy, this.setSyncBusy] = createSignal(false);
    [this.syncBanner, this.setSyncBanner] = createSignal<{
      kind: 'success' | 'error';
      text: string;
    } | null>(null);
    [this.pendingSync, this.setPendingSync] = createSignal<SyncPreparationResult | null>(
      null
    );
    [this.habitModalOpen, this.setHabitModalOpen] = createSignal(false);
    [this.editingHabit, this.setEditingHabit] = createSignal<Habit | null>(null);
    [this.taskModalOpen, this.setTaskModalOpen] = createSignal(false);
    [this.taskModalMode, this.setTaskModalMode] = createSignal<TaskModalMode>('create');
    [this.taskDraftPrefill, this.setTaskDraftPrefill] =
      createSignal<TaskDraftPrefill | null>(null);
    [this.editingTask, this.setEditingTask] = createSignal<Task | null>(null);
    [this.accountModalOpen, this.setAccountModalOpen] = createSignal(false);
    [this.revisionsModalOpen, this.setRevisionsModalOpen] = createSignal(false);
    [this.revisionsLoading, this.setRevisionsLoading] = createSignal(false);
    [this.revisionsError, this.setRevisionsError] = createSignal<string | null>(null);
    [this.revisionsFileId, this.setRevisionsFileId] = createSignal<string | null>(null);
    [this.revisions, this.setRevisions] = createSignal<DriveRevisionMeta[]>([]);
    [this.inspectingRevisionId, this.setInspectingRevisionId] = createSignal<string | null>(null);
    [this.inspectedRevision, this.setInspectedRevision] =
      createSignal<DriveRevisionInspectResult | null>(null);
    [this.restoringRevision, this.setRestoringRevision] = createSignal(false);
    const initialTz = TrackerStore.readStoredTimeZone();
    [this.timeZone, this.setTimeZoneSignal] = createSignal(initialTz);
    const initialTodayDay = CivilCalendar.todayDayIndex(new Date(), initialTz);
    [this.todayDay, this.setTodayDay] = createSignal(initialTodayDay);
    [this.todayGoalsExpanded, this.setTodayGoalsExpandedSignal] = createSignal(
      TrackerStore.readStoredTodayGoalsExpanded()
    );
    const storedRange = TrackerStore.readStoredHistoryRange(initialTodayDay);
    [this.historyRangePreset, this.setHistoryRangePresetSignal] = createSignal(
      storedRange.preset
    );
    [this.historyCustomStartDay, this.setHistoryCustomStartDaySignal] = createSignal(
      storedRange.customStartDay
    );
    [this.historyCustomEndDay, this.setHistoryCustomEndDaySignal] = createSignal(
      storedRange.customEndDay
    );
    [this.historySubTab, this.setHistorySubTabSignal] = createSignal<HistorySubTab>(
      TrackerStore.readStoredHistorySubTab()
    );
    [this.historyHabitFilter, this.setHistoryHabitFilterSignal] = createSignal<
      'all' | number[]
    >(TrackerStore.readStoredHistoryHabitFilter());
    [this.tasksStatusFilter, this.setTasksStatusFilterSignal] =
      createSignal<TaskStatusFilterSelection>(TrackerStore.readStoredTasksStatusFilter());
    [this.tasksSortMode, this.setTasksSortModeSignal] = createSignal<TaskSortMode>(
      TrackerStore.readStoredTasksSortMode()
    );
    [this.reminderPrefs, this.setReminderPrefsSignal] = createSignal<ReminderPreferences>(
      TrackerStore.readStoredReminderPrefs()
    );
    [this.badgePermission, this.setBadgePermission] = createSignal<BadgePermissionState>(
      ReminderPlanner.getNotificationPermission()
    );
    [this.remindersModalOpen, this.setRemindersModalOpen] = createSignal(false);
    [this.calendarBusy, this.setCalendarBusy] = createSignal(false);
    [this.calendarError, this.setCalendarError] = createSignal<string | null>(null);
    [this.pendingCalendarPlan, this.setPendingCalendarPlan] =
      createSignal<CalendarSyncPlan | null>(null);
    [this.confirmDeleteCalendarOpen, this.setConfirmDeleteCalendarOpen] =
      createSignal(false);
  }

  private persistReminderPrefs(next: ReminderPreferences): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TrackerStore.REMINDERS_STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // ignore storage errors
    }
    this.setReminderPrefsSignal(next);
  }

  private refreshAppBadge(): void {
    const prefs = this.reminderPrefs();
    if (!prefs.badgeEnabled || !this.dbReady()) {
      void ReminderPlanner.syncAppBadge(null);
      return;
    }
    const summary = ReminderPlanner.getTodayPendingSummary(
      this.snapshot(),
      this.todayDay()
    );
    void ReminderPlanner.syncAppBadge(summary.totalPendingCount);
  }

  public getTodayPendingSummary(): TodayPendingSummary {
    return ReminderPlanner.getTodayPendingSummary(this.snapshot(), this.todayDay());
  }

  public isCalendarSyncNeeded(): boolean {
    const prefs = this.reminderPrefs();
    if (this.mode() !== 'google' || !prefs.calendarEnabled) {
      return false;
    }
    if (!prefs.calendarId || !prefs.lastSyncedSignature) {
      return true;
    }
    const currentSignature = ReminderPlanner.computeStateSignature(
      this.snapshot(),
      this.todayDay(),
      prefs,
      this.timeZone()
    );
    return currentSignature !== prefs.lastSyncedSignature;
  }

  public setBadgeEnabled(enabled: boolean): void {
    const next: ReminderPreferences = {
      ...this.reminderPrefs(),
      badgeEnabled: enabled,
    };
    this.persistReminderPrefs(next);
    this.refreshAppBadge();
    if (enabled && ReminderPlanner.getNotificationPermission() === 'default') {
      void this.requestBadgePermissionAndRefresh();
    }
  }

  public async requestBadgePermissionAndRefresh(): Promise<void> {
    const perm = await ReminderPlanner.requestBadgePermission();
    this.setBadgePermission(perm);
    if (perm === 'granted' && !this.reminderPrefs().badgeEnabled) {
      this.persistReminderPrefs({
        ...this.reminderPrefs(),
        badgeEnabled: true,
      });
    }
    this.refreshAppBadge();
  }

  public setCalendarEnabled(enabled: boolean): void {
    const next: ReminderPreferences = {
      ...this.reminderPrefs(),
      calendarEnabled: enabled,
    };
    this.persistReminderPrefs(next);
    this.setPendingCalendarPlan(null);
    this.setCalendarError(null);
  }

  public setReminderTime(time: string): void {
    const normalized = ReminderPlanner.normalizeTime(time);
    const next: ReminderPreferences = {
      ...this.reminderPrefs(),
      reminderTime: normalized,
    };
    this.persistReminderPrefs(next);
    this.setPendingCalendarPlan(null);
  }

  public setReminderHorizonDays(days: number): void {
    const normalized = ReminderPlanner.normalizeHorizonDays(days);
    const next: ReminderPreferences = {
      ...this.reminderPrefs(),
      horizonDays: normalized,
    };
    this.persistReminderPrefs(next);
    this.setPendingCalendarPlan(null);
  }

  public openRemindersModal(): void {
    this.setAccountModalOpen(false);
    this.setCalendarError(null);
    this.setPendingCalendarPlan(null);
    this.setConfirmDeleteCalendarOpen(false);
    this.setBadgePermission(ReminderPlanner.getNotificationPermission());
    this.setRemindersModalOpen(true);
  }

  public closeRemindersModal(): void {
    if (this.calendarBusy()) return;
    this.setRemindersModalOpen(false);
    this.setPendingCalendarPlan(null);
    this.setConfirmDeleteCalendarOpen(false);
    this.setCalendarError(null);
  }

  public setTimeZone(nextTz: string): void {
    const normalized = CivilCalendar.isValidTimeZone(nextTz) ? nextTz : 'UTC';
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TrackerStore.TIMEZONE_STORAGE_KEY, normalized);
      }
    } catch {
      // ignore storage errors
    }
    this.setTimeZoneSignal(normalized);
    this.setTodayDay(CivilCalendar.todayDayIndex(new Date(), normalized));
    this.refreshAppBadge();
  }

  public toggleTodayGoalsExpanded(): void {
    this.setTodayGoalsExpanded(!this.todayGoalsExpanded());
  }

  public setTodayGoalsExpanded(expanded: boolean): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          TrackerStore.TODAY_GOALS_EXPANDED_KEY,
          expanded ? 'true' : 'false'
        );
      }
    } catch {
      // ignore storage errors
    }
    this.setTodayGoalsExpandedSignal(expanded);
  }

  private persistHistoryRange(
    preset: DateRangePresetId,
    customStartDay: number,
    customEndDay: number
  ): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          TrackerStore.HISTORY_RANGE_STORAGE_KEY,
          JSON.stringify({ preset, customStartDay, customEndDay })
        );
      }
    } catch {
      // ignore storage errors
    }
  }

  public setHistoryRangePreset(nextPreset: DateRangePresetId): void {
    this.setHistoryRangePresetSignal(nextPreset);
    this.persistHistoryRange(
      nextPreset,
      this.historyCustomStartDay(),
      this.historyCustomEndDay()
    );
  }

  public setHistoryCustomRange(startDay: number, endDay: number): void {
    const s = Math.min(startDay, endDay);
    const e = Math.min(Math.max(startDay, endDay), this.todayDay());
    this.setHistoryCustomStartDaySignal(s);
    this.setHistoryCustomEndDaySignal(e);
    this.setHistoryRangePresetSignal('custom');
    this.persistHistoryRange('custom', s, e);
  }

  public setHistorySubTab(nextTab: HistorySubTab): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TrackerStore.HISTORY_SUBTAB_STORAGE_KEY, nextTab);
      }
    } catch {
      // ignore storage errors
    }
    this.setHistorySubTabSignal(nextTab);
  }

  public setHistoryHabitFilter(nextFilter: 'all' | number[]): void {
    let normalized: 'all' | number[] = 'all';
    if (nextFilter !== 'all') {
      const deduped: number[] = [];
      for (const id of nextFilter) {
        if (Number.isInteger(id) && id > 0 && !deduped.includes(id)) {
          deduped.push(id);
        }
      }
      const habitCount = this.snapshot().habits.length;
      normalized =
        habitCount > 0 && deduped.length === habitCount ? 'all' : deduped;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          TrackerStore.HISTORY_HABIT_FILTER_KEY,
          JSON.stringify(normalized)
        );
      }
    } catch {
      // ignore storage errors
    }
    this.setHistoryHabitFilterSignal(normalized);
  }

  public setTasksStatusFilter(nextFilter: TaskStatusFilterSelection): void {
    const normalized = TodayBoard.normalizeStatusFilterSelection(nextFilter);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          TrackerStore.TASKS_STATUS_FILTER_KEY,
          JSON.stringify(normalized)
        );
      }
    } catch {
      // ignore storage errors
    }
    this.setTasksStatusFilterSignal(normalized);
  }

  public setTasksSortMode(nextSort: TaskSortMode): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TrackerStore.TASKS_SORT_MODE_KEY, nextSort);
      }
    } catch {
      // ignore storage errors
    }
    this.setTasksSortModeSignal(nextSort);
  }

  public init(): void {
    void this.reloadFromDb().catch((err) => {
      this.setSyncBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to open local IndexedDB.',
      });
      this.setDbReady(true);
    });

    this.unsubscribeAuth = this.session.subscribeAuthChanges((state) => {
      this.setHasGoogleToken(state.hasToken);
      this.setGoogleEmail(state.email);
      if (state.hasToken) {
        this.scheduleTokenExpiryTimer();
      } else {
        this.clearTokenExpiryTimer();
      }
    });

    this.midnightTimer = window.setInterval(() => {
      const current = CivilCalendar.todayDayIndex(new Date(), this.timeZone());
      if (current !== this.todayDay()) {
        this.setTodayDay(current);
        this.refreshAppBadge();
      }
    }, 30_000);

    if (typeof document !== 'undefined') {
      this.visibilityListener = () => {
        if (document.visibilityState === 'visible') {
          const current = CivilCalendar.todayDayIndex(new Date(), this.timeZone());
          if (current !== this.todayDay()) {
            this.setTodayDay(current);
          }
          this.setBadgePermission(ReminderPlanner.getNotificationPermission());
          this.refreshAppBadge();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  private clearTokenExpiryTimer(): void {
    if (this.tokenExpiryTimer !== null) {
      window.clearTimeout(this.tokenExpiryTimer);
      this.tokenExpiryTimer = null;
    }
  }

  private scheduleTokenExpiryTimer(): void {
    this.clearTokenExpiryTimer();
    const expiresAt = this.session.getTokenExpiresAt();
    if (!expiresAt) return;
    const delayMs = Math.max(0, expiresAt - Date.now());
    this.tokenExpiryTimer = window.setTimeout(() => {
      this.tokenExpiryTimer = null;
      this.setHasGoogleToken(this.session.hasAccessToken());
    }, delayMs + 50);
  }

  private isAuthErrorMessage(msg: string): boolean {
    const lower = msg.toLowerCase();
    return (
      lower.includes('authorization') ||
      lower.includes('permission') ||
      lower.includes('expired') ||
      lower.includes('401') ||
      lower.includes('403')
    );
  }

  public dispose(): void {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = null;
    }
    if (this.midnightTimer !== null) {
      window.clearInterval(this.midnightTimer);
      this.midnightTimer = null;
    }
    if (this.visibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
    this.clearTokenExpiryTimer();
  }

  public async reloadFromDb(): Promise<void> {
    const data = await this.db.getAllSnapshot();
    this.setSnapshot(data);
    this.setDbReady(true);

    const currentHabitFilter = this.historyHabitFilter();
    if (currentHabitFilter !== 'all' && currentHabitFilter.length > 0) {
      const validSet = new Set(data.habits.map((h) => h.id));
      const surviving = currentHabitFilter.filter((id) => validSet.has(id));
      if (surviving.length === 0) {
        this.setHistoryHabitFilter('all');
      } else if (surviving.length !== currentHabitFilter.length) {
        this.setHistoryHabitFilter(surviving);
      }
    }

    this.refreshAppBadge();
  }

  public selectGuest(): void {
    this.clearTokenExpiryTimer();
    this.session.chooseGuest();
    this.driveSync.resetUploadCache();
    this.setAuthError(null);
    this.setHasGoogleToken(false);
    this.setGoogleEmail(null);
    this.setSyncBanner(null);
    this.setMode('guest');
  }

  public async selectGoogle(): Promise<void> {
    this.setIsSigningIn(true);
    this.setAuthError(null);
    try {
      await this.session.signInWithGoogle({
        interactiveAccountPicker: !this.session.getAccountEmail(),
      });
      this.setHasGoogleToken(this.session.hasAccessToken());
      this.setGoogleEmail(this.session.getAccountEmail());
      this.scheduleTokenExpiryTimer();
      this.setMode('google');
      this.setSyncBanner(null);
    } catch (err) {
      this.setAuthError(
        err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.'
      );
    } finally {
      this.setIsSigningIn(false);
    }
  }

  public async reconnectGoogle(): Promise<void> {
    this.setSyncBanner(null);
    try {
      await this.session.signInWithGoogle({ interactiveAccountPicker: false });
      this.setHasGoogleToken(this.session.hasAccessToken());
      this.setGoogleEmail(this.session.getAccountEmail());
      this.scheduleTokenExpiryTimer();
    } catch (err) {
      this.setSyncBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not reconnect Google account.',
      });
    }
  }

  public async switchToEntry(): Promise<void> {
    this.clearTokenExpiryTimer();
    await this.session.clearSessionAndReturnToEntry();
    this.driveSync.resetUploadCache();
    this.setHasGoogleToken(false);
    this.setGoogleEmail(null);
    this.setSyncBanner(null);
    this.setPendingSync(null);
    this.setPendingCalendarPlan(null);
    this.setConfirmDeleteCalendarOpen(false);
    this.setMode(null);
  }

  public async toggleCheckin(
    habitId: number,
    dayIndex: number,
    nextDone: boolean
  ): Promise<void> {
    await this.db.upsertCheckin(habitId, dayIndex, nextDone);
    await this.reloadFromDb();
  }

  public async saveNote(habitId: number, dayIndex: number, text: string): Promise<void> {
    await this.db.upsertNote(habitId, dayIndex, text);
    await this.reloadFromDb();
  }

  public openCreateHabit(): void {
    this.setEditingHabit(null);
    this.setHabitModalOpen(true);
  }

  public openEditHabit(habit: Habit): void {
    this.setEditingHabit(habit);
    this.setHabitModalOpen(true);
  }

  public closeHabitModal(): void {
    this.setHabitModalOpen(false);
  }

  public async saveHabit(data: {
    name: string;
    color: string;
    weekdays: number;
    weeklyTarget?: number | null;
    startDay: number;
  }): Promise<void> {
    const target = this.editingHabit();
    if (target) {
      await this.db.updateHabit(target.id, data);
    } else {
      await this.db.createHabit(data);
    }
    await this.reloadFromDb();
  }

  public async toggleArchiveHabit(habit: Habit): Promise<void> {
    await this.db.setHabitArchived(habit.id, habit.archivedAt === null);
    await this.reloadFromDb();
  }

  public openCreateTask(options?: { dueDay?: number | null }): void {
    this.setEditingTask(null);
    this.setTaskModalMode('create');
    this.setTaskDraftPrefill({
      title: '',
      note: '',
      dueDay: options?.dueDay !== undefined ? options.dueDay : this.todayDay(),
      repeatable: false,
    });
    this.setTaskModalOpen(true);
  }

  public openEditTask(task: Task): void {
    this.setEditingTask(task);
    this.setTaskModalMode('edit');
    this.setTaskDraftPrefill(null);
    this.setTaskModalOpen(true);
  }

  public closeTaskModal(): void {
    this.setTaskModalOpen(false);
    this.setTaskDraftPrefill(null);
  }

  public async saveTask(data: {
    title: string;
    note: string;
    dueDay: number | null;
    repeatable?: boolean;
    status?: TaskStatus;
  }): Promise<void> {
    const target = this.taskModalMode() === 'edit' ? this.editingTask() : null;
    if (target) {
      const nextStatus = data.status ?? TodayBoard.getStatus(target);
      const prevStatus = TodayBoard.getStatus(target);
      await this.db.updateTask(target.id, {
        title: data.title,
        note: data.note,
        dueDay: data.dueDay,
        repeatable: data.repeatable,
        status: nextStatus,
        completedDay:
          nextStatus === 'done'
            ? prevStatus !== 'done'
              ? this.todayDay()
              : target.completedDay
            : null,
      });
    } else {
      await this.db.createTask(data);
    }
    await this.reloadFromDb();
  }

  public async quickAddTask(
    title: string,
    dueDay: number | null,
    repeatable: boolean = false
  ): Promise<void> {
    await this.db.createTask({ title, note: '', dueDay, repeatable });
    await this.reloadFromDb();
  }

  public async scheduleTaskForDay(task: Task, dueDay: number | null): Promise<void> {
    await this.db.updateTask(task.id, { dueDay });
    await this.reloadFromDb();
  }

  public async toggleTaskDone(task: Task): Promise<void> {
    const nextDone = TodayBoard.getStatus(task) !== 'done';
    await this.db.updateTask(task.id, {
      status: nextDone ? 'done' : 'open',
      done: nextDone,
      completedDay: nextDone ? this.todayDay() : null,
    });
    await this.reloadFromDb();

    if (nextDone && task.repeatable) {
      this.setEditingTask(null);
      this.setTaskModalMode('next');
      this.setTaskDraftPrefill({
        title: task.title,
        note: task.note,
        dueDay: TodayBoard.suggestNextOccurrenceDueDay(task, this.todayDay()),
        repeatable: true,
      });
      this.setTaskModalOpen(true);
    }
  }

  public async deleteTask(taskId: number): Promise<void> {
    await this.db.deleteTask(taskId);
    await this.reloadFromDb();
  }

  public async exportBackup(): Promise<{ filename: string; bytes: Uint8Array }> {
    const currentSnapshot = await this.db.getAllSnapshot();
    const bytes = BackupService.exportBytes(currentSnapshot);
    const filename = BackupService.buildFilename(this.todayDay());
    this.setSyncBanner({
      kind: 'success',
      text: `Backup exported (${bytes.byteLength} bytes).`,
    });
    return { filename, bytes };
  }

  public async importBackup(fileBytes: Uint8Array): Promise<void> {
    const currentSnapshot = await this.db.getAllSnapshot();
    const { mergedSnapshot, importedCounts } = BackupService.importBytes(
      currentSnapshot,
      fileBytes
    );
    await this.db.replaceSnapshot(mergedSnapshot);
    await this.reloadFromDb();
    this.driveSync.resetUploadCache();
    this.setPendingSync(null);
    this.setSyncBanner({
      kind: 'success',
      text: `Backup merged (${importedCounts.habits} habits, ${importedCounts.tasks} tasks imported).`,
    });
  }

  public async startDriveSync(): Promise<void> {
    if (this.mode() !== 'google') return;

    if (!this.session.hasAccessToken()) {
      await this.reconnectGoogle();
      if (!this.session.hasAccessToken()) return;
    }

    this.setSyncBusy(true);
    this.setSyncBanner(null);

    try {
      const currentSnapshot = await this.db.getAllSnapshot();
      const result = await this.driveSync.prepareSync(
        this.mode(),
        this.session.getAccessToken(),
        currentSnapshot
      );

      if (result.localChanged) {
        await this.db.replaceSnapshot(result.mergedSnapshot);
        await this.reloadFromDb();
      }

      if (result.status === 'up-to-date') {
        void this.calendarSync.publishCalendarIdIfMissing(
          this.mode(),
          this.session.getAccessToken(),
          this.reminderPrefs().calendarId,
          this.timeZone()
        );
        this.setSyncBanner({
          kind: 'success',
          text: result.localChanged
            ? 'Downloaded and merged snapshot from Google Drive.'
            : 'Already up to date with Google Drive.',
        });
        return;
      }

      this.setPendingSync(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Drive sync failed.';
      if (this.isAuthErrorMessage(msg)) {
        this.session.clearAccessTokenOnly();
        this.setHasGoogleToken(false);
      }
      this.setSyncBanner({ kind: 'error', text: msg });
    } finally {
      this.setSyncBusy(false);
    }
  }

  public cancelPendingSync(): void {
    this.setPendingSync(null);
  }

  public async confirmUploadSync(): Promise<void> {
    const pending = this.pendingSync();
    if (!pending) return;

    this.setSyncBusy(true);
    this.setSyncBanner(null);
    try {
      await this.driveSync.confirmAndUpload(
        this.mode(),
        this.session.getAccessToken(),
        pending
      );
      void this.calendarSync.publishCalendarIdIfMissing(
        this.mode(),
        this.session.getAccessToken(),
        this.reminderPrefs().calendarId,
        this.timeZone()
      );
      this.setPendingSync(null);
      this.setSyncBanner({
        kind: 'success',
        text: 'Snapshot uploaded to Google Drive.',
      });
    } catch (err) {
      if (err instanceof ConcurrentSyncError) {
        try {
          const refreshedSnapshot = await this.db.getAllSnapshot();
          const rePrepared = await this.driveSync.prepareSync(
            this.mode(),
            this.session.getAccessToken(),
            refreshedSnapshot
          );
          if (rePrepared.localChanged) {
            await this.db.replaceSnapshot(rePrepared.mergedSnapshot);
            await this.reloadFromDb();
          }
          if (rePrepared.status === 'up-to-date') {
            this.setPendingSync(null);
            this.setSyncBanner({
              kind: 'success',
              text: 'Another device updated Drive first. Merged remote changes cleanly.',
            });
          } else {
            this.setPendingSync(rePrepared);
            this.setSyncBanner({
              kind: 'error',
              text: 'Another device updated Drive while you were reviewing. Changes were merged — confirm upload again.',
            });
          }
          return;
        } catch (retryErr) {
          this.setPendingSync(null);
          this.setSyncBanner({
            kind: 'error',
            text:
              retryErr instanceof Error
                ? retryErr.message
                : 'Google Drive sync failed after concurrent update.',
          });
          return;
        }
      }

      const msg = err instanceof Error ? err.message : 'Upload to Google Drive failed.';
      if (this.isAuthErrorMessage(msg)) {
        this.session.clearAccessTokenOnly();
        this.setHasGoogleToken(false);
      }
      this.setPendingSync(null);
      this.setSyncBanner({ kind: 'error', text: msg });
    } finally {
      this.setSyncBusy(false);
    }
  }

  public closeDriveRevisions(): void {
    this.setRevisionsModalOpen(false);
    this.setRevisionsError(null);
    this.setInspectedRevision(null);
    this.setInspectingRevisionId(null);
  }

  public async openDriveRevisions(): Promise<void> {
    if (this.mode() !== 'google') return;

    if (!this.session.hasAccessToken()) {
      await this.reconnectGoogle();
      if (!this.session.hasAccessToken()) return;
    }

    this.setAccountModalOpen(false);
    this.setRevisionsModalOpen(true);
    this.setRevisionsError(null);
    this.setInspectedRevision(null);
    this.setInspectingRevisionId(null);
    this.setRevisionsLoading(true);

    try {
      const result = await this.driveSync.listRevisions(
        this.mode(),
        this.session.getAccessToken()
      );
      this.setRevisionsFileId(result.fileId);
      this.setRevisions(result.revisions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load Drive version history.';
      if (this.isAuthErrorMessage(msg)) {
        this.session.clearAccessTokenOnly();
        this.setHasGoogleToken(false);
      }
      this.setRevisionsError(msg);
    } finally {
      this.setRevisionsLoading(false);
    }
  }

  public async inspectDriveRevision(revisionId: string): Promise<void> {
    const fileId = this.revisionsFileId();
    if (!fileId || this.mode() !== 'google') return;

    if (!this.session.hasAccessToken()) {
      await this.reconnectGoogle();
      if (!this.session.hasAccessToken()) return;
    }

    this.setInspectingRevisionId(revisionId);
    this.setRevisionsError(null);
    try {
      const inspected = await this.driveSync.inspectRevision(
        this.mode(),
        this.session.getAccessToken(),
        fileId,
        revisionId
      );
      this.setInspectedRevision(inspected);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to inspect Drive revision.';
      if (this.isAuthErrorMessage(msg)) {
        this.session.clearAccessTokenOnly();
        this.setHasGoogleToken(false);
      }
      this.setRevisionsError(msg);
      this.setInspectedRevision(null);
    } finally {
      this.setInspectingRevisionId(null);
    }
  }

  public async restoreDriveRevision(revisionId: string): Promise<void> {
    const fileId = this.revisionsFileId();
    if (!fileId || this.mode() !== 'google') return;

    if (!this.session.hasAccessToken()) {
      await this.reconnectGoogle();
      if (!this.session.hasAccessToken()) return;
    }

    this.setRestoringRevision(true);
    this.setRevisionsError(null);
    try {
      const localSnapshot = await this.db.getAllSnapshot();
      const result = await this.driveSync.restoreRevision(
        this.mode(),
        this.session.getAccessToken(),
        fileId,
        revisionId,
        localSnapshot
      );
      await this.db.replaceSnapshot(result.restoredSnapshot);
      await this.reloadFromDb();
      this.setPendingSync(null);
      this.closeDriveRevisions();
      this.setSyncBanner({
        kind: 'success',
        text: `Restored Drive version (${result.summary.habitsCount} habits, ${result.summary.tasksCount} tasks) and saved as latest.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to restore Drive revision.';
      if (this.isAuthErrorMessage(msg)) {
        this.session.clearAccessTokenOnly();
        this.setHasGoogleToken(false);
      }
      this.setRevisionsError(msg);
    } finally {
      this.setRestoringRevision(false);
    }
  }

  public async prepareCalendarSync(): Promise<void> {
    if (this.mode() !== 'google') return;

    if (!this.session.hasAccessToken()) {
      await this.reconnectGoogle();
      if (!this.session.hasAccessToken()) return;
    }

    this.setCalendarBusy(true);
    this.setCalendarError(null);
    this.setConfirmDeleteCalendarOpen(false);

    try {
      const prefs = this.reminderPrefs();
      const plan = await this.calendarSync.prepareSyncPlan(
        this.mode(),
        this.session.getAccessToken(),
        this.snapshot(),
        this.todayDay(),
        prefs,
        this.timeZone()
      );

      const hasMutations =
        plan.willCreateCalendar ||
        plan.willUpdateCalendarTz ||
        plan.duplicateCalendarIds.length > 0 ||
        plan.toCreate.length > 0 ||
        plan.toUpdate.length > 0 ||
        plan.toDelete.length > 0;

      if (!hasMutations && plan.calendarId) {
        void this.calendarSync.publishCalendarIdIfMissing(
          this.mode(),
          this.session.getAccessToken(),
          plan.calendarId,
          this.timeZone()
        );
        this.persistReminderPrefs({
          ...prefs,
          calendarId: plan.calendarId,
          calendarTimeZone: plan.timeZone,
          lastSyncedSignature: plan.targetSignature,
          lastSyncedAt: Date.now(),
        });
        this.setPendingCalendarPlan(null);
        this.setSyncBanner({
          kind: 'success',
          text: 'Google Calendar reminders are already up to date.',
        });
        return;
      }

      this.setPendingCalendarPlan(plan);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to prepare Google Calendar sync.';
      if (this.isAuthErrorMessage(msg)) {
        this.session.clearAccessTokenOnly();
        this.setHasGoogleToken(false);
      }
      this.setCalendarError(msg);
    } finally {
      this.setCalendarBusy(false);
    }
  }

  public cancelCalendarSync(): void {
    if (this.calendarBusy()) return;
    this.setPendingCalendarPlan(null);
  }

  public async confirmCalendarSync(): Promise<void> {
    const plan = this.pendingCalendarPlan();
    if (!plan || this.mode() !== 'google') return;

    if (!this.session.hasAccessToken()) {
      await this.reconnectGoogle();
      if (!this.session.hasAccessToken()) return;
    }

    this.setCalendarBusy(true);
    this.setCalendarError(null);
    try {
      const result = await this.calendarSync.applySyncPlan(
        this.mode(),
        this.session.getAccessToken(),
        plan
      );
      this.persistReminderPrefs({
        ...this.reminderPrefs(),
        calendarEnabled: true,
        calendarId: result.calendarId,
        calendarTimeZone: result.timeZone,
        lastSyncedSignature: result.targetSignature,
        lastSyncedAt: Date.now(),
      });
      this.setPendingCalendarPlan(null);
      const dupText =
        result.duplicatesRemoved > 0
          ? `, ${result.duplicatesRemoved} duplicate calendar${result.duplicatesRemoved === 1 ? '' : 's'} removed`
          : '';
      this.setSyncBanner({
        kind: 'success',
        text: `Google Calendar updated (${result.created} added, ${result.updated} updated, ${result.deleted} cleared${dupText}).`,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to update Google Calendar reminders.';
      if (this.isAuthErrorMessage(msg)) {
        this.session.clearAccessTokenOnly();
        this.setHasGoogleToken(false);
      }
      this.setCalendarError(msg);
    } finally {
      this.setCalendarBusy(false);
    }
  }

  public requestDeleteCalendar(): void {
    this.setPendingCalendarPlan(null);
    this.setCalendarError(null);
    this.setConfirmDeleteCalendarOpen(true);
  }

  public cancelDeleteCalendar(): void {
    if (this.calendarBusy()) return;
    this.setConfirmDeleteCalendarOpen(false);
  }

  public async confirmDeleteCalendar(): Promise<void> {
    const calId = this.reminderPrefs().calendarId;
    if (!calId || this.mode() !== 'google') {
      this.setConfirmDeleteCalendarOpen(false);
      return;
    }

    if (!this.session.hasAccessToken()) {
      await this.reconnectGoogle();
      if (!this.session.hasAccessToken()) return;
    }

    this.setCalendarBusy(true);
    this.setCalendarError(null);
    try {
      await this.calendarSync.deleteReminderCalendar(
        this.mode(),
        this.session.getAccessToken(),
        calId
      );
      this.persistReminderPrefs({
        ...this.reminderPrefs(),
        calendarEnabled: false,
        calendarId: null,
        calendarTimeZone: null,
        lastSyncedSignature: null,
        lastSyncedAt: null,
      });
      this.setConfirmDeleteCalendarOpen(false);
      this.setPendingCalendarPlan(null);
      this.setSyncBanner({
        kind: 'success',
        text: 'Habits Reminders calendar deleted from your Google Calendar.',
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to delete Google Calendar.';
      if (this.isAuthErrorMessage(msg)) {
        this.session.clearAccessTokenOnly();
        this.setHasGoogleToken(false);
      }
      this.setCalendarError(msg);
    } finally {
      this.setCalendarBusy(false);
    }
  }
}

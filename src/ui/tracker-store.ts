import { SessionManager } from '../auth/session-manager';
import { HabitDatabase } from '../db/habit-database';
import { CalendarReminderService } from '../sync/calendar-reminder-service';
import { DriveSyncService } from '../sync/drive-sync-service';
import { RemindersController } from './reminders-controller';
import { AuthSlice, createAuthSlice } from './store/auth-slice';
import { CalendarSyncSlice, createCalendarSyncSlice } from './store/calendar-sync-slice';
import { DomainSlice, createDomainSlice } from './store/domain-slice';
import { DriveSyncSlice, createDriveSyncSlice } from './store/drive-sync-slice';
import { FiltersSlice, createFiltersSlice } from './store/filters-slice';
import { StoreViewSelectors, createStoreViewSelectors } from './store/view-selectors';

export interface TrackerStoreDependencies {
  db?: HabitDatabase;
  session?: SessionManager;
  driveSync?: DriveSyncService;
  calendarSync?: CalendarReminderService;
}

/**
 * Thin compositional facade assembling granular domain sub-stores,
 * cross-domain triggers, lifecycle (`init`/`dispose`), and managed view selectors.
 */
export class TrackerStore {
  private readonly db: HabitDatabase;
  private readonly session: SessionManager;
  private readonly driveSync: DriveSyncService;
  private readonly calendarSync: CalendarReminderService;

  public readonly auth: AuthSlice;
  public readonly filters: FiltersSlice;
  public readonly domain: DomainSlice;
  public readonly reminders: RemindersController;
  public readonly calendar: CalendarSyncSlice;
  public readonly drive: DriveSyncSlice;
  public readonly views: StoreViewSelectors;

  constructor(deps: TrackerStoreDependencies = {}) {
    this.db = deps.db ?? new HabitDatabase();
    this.session = deps.session ?? new SessionManager();
    this.driveSync = deps.driveSync ?? new DriveSyncService();
    this.calendarSync = deps.calendarSync ?? new CalendarReminderService();

    this.auth = createAuthSlice({
      session: this.session,
      onResetSyncState: () => {
        this.drive.resetUploadCache();
        this.drive.setPendingSync(null);
        this.calendar.setPendingCalendarPlan(null);
        this.calendar.setConfirmDeleteCalendarOpen(false);
      },
      onClearSyncBanner: () => this.drive.setSyncBanner(null),
      onSyncErrorBanner: (text) => this.drive.setSyncBanner({ kind: 'error', text }),
    });

    this.filters = createFiltersSlice({
      onTimeZoneChanged: () => this.reminders.refreshAppBadge(),
      getHabitCount: () => this.domain.snapshot().habits.length,
    });

    this.domain = createDomainSlice({
      db: this.db,
      getTodayDay: this.filters.todayDay,
      onSnapshotReloaded: (data) => {
        this.filters.pruneHabitFilter(data.habits);
        this.reminders.refreshAppBadge();
      },
      onBackupImported: () => {
        this.drive.resetUploadCache();
        this.drive.setPendingSync(null);
      },
      onSyncSuccessBanner: (text) => this.drive.setSyncBanner({ kind: 'success', text }),
    });

    this.reminders = new RemindersController({
      db: this.db,
      getSnapshot: this.domain.snapshot,
      getDbReady: this.domain.dbReady,
      getTodayDay: this.filters.todayDay,
      setTodayDay: this.filters.setTodayDay,
      getTimeZone: this.filters.timeZone,
      reloadFromDb: () => this.domain.reloadFromDb(),
      onInvalidateCalendarPlan: () => this.calendar.setPendingCalendarPlan(null),
      onClearCalendarError: () => this.calendar.setCalendarError(null),
    });

    this.calendar = createCalendarSyncSlice({
      session: this.session,
      calendarSync: this.calendarSync,
      reminders: this.reminders,
      getMode: this.auth.mode,
      getSnapshot: this.domain.snapshot,
      getTodayDay: this.filters.todayDay,
      getTimeZone: this.filters.timeZone,
      applyTimeZoneValue: (nextTz, updatedAt) => this.filters.applyTimeZoneValue(nextTz, updatedAt),
      ensureGoogleToken: () => this.auth.ensureGoogleToken(),
      handleAuthError: (msg) => this.auth.handleAuthError(msg),
      closeAccountModal: () => this.auth.setAccountModalOpen(false),
      onSyncSuccessBanner: (text) => this.drive.setSyncBanner({ kind: 'success', text }),
    });

    this.drive = createDriveSyncSlice({
      db: this.db,
      session: this.session,
      driveSync: this.driveSync,
      getMode: this.auth.mode,
      ensureGoogleToken: () => this.auth.ensureGoogleToken(),
      handleAuthError: (msg) => this.auth.handleAuthError(msg),
      reloadFromDb: () => this.domain.reloadFromDb(),
      closeAccountModal: () => this.auth.setAccountModalOpen(false),
      syncRemoteCalendarMetaAfterDrive: () => this.calendar.syncRemoteCalendarMetaAfterDrive(),
    });

    this.views = createStoreViewSelectors({
      mode: this.auth.mode,
      dbReady: this.domain.dbReady,
      activeTab: this.filters.activeTab,
      snapshot: this.domain.snapshot,
      todayDay: this.filters.todayDay,
      timeZone: this.filters.timeZone,
      historySubTab: this.filters.historySubTab,
      historyHabitFilter: this.filters.historyHabitFilter,
      historyRangePreset: this.filters.historyRangePreset,
      historyCustomStartDay: this.filters.historyCustomStartDay,
      historyCustomEndDay: this.filters.historyCustomEndDay,
      tasksStatusFilter: this.filters.tasksStatusFilter,
      tasksSortMode: this.filters.tasksSortMode,
    });
  }

  public init(): void {
    void this.domain.reloadFromDb().catch((err) => {
      this.drive.setSyncBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to open local IndexedDB.',
      });
      this.domain.setDbReady(true);
    });

    this.auth.start();
    this.reminders.start();
  }

  public dispose(): void {
    this.auth.dispose();
    this.reminders.dispose();
    this.views.dispose();
  }
}

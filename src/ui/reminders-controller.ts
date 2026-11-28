import { Accessor, Setter, createSignal } from 'solid-js';
import { HabitDatabase } from '../db/habit-database';
import { DomainSnapshot, ReminderSlot } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import {
  BadgePermissionState,
  ReminderPlanner,
  ReminderPreferences,
  TodayPendingSummary,
} from '../utils/reminder-planner';
import { PreferencesStorage } from './preferences-store';

export interface RemindersControllerDependencies {
  db: HabitDatabase;
  getSnapshot: Accessor<DomainSnapshot>;
  getDbReady: Accessor<boolean>;
  getTodayDay: Accessor<number>;
  setTodayDay: Setter<number>;
  getTimeZone: Accessor<string>;
  reloadFromDb: () => Promise<void>;
  onInvalidateCalendarPlan?: () => void;
  onClearCalendarError?: () => void;
}

export class RemindersController {
  private readonly deps: RemindersControllerDependencies;

  public readonly reminderPrefs: Accessor<ReminderPreferences>;
  private readonly setReminderPrefsSignal: Setter<ReminderPreferences>;

  public readonly badgePermission: Accessor<BadgePermissionState>;
  private readonly setBadgePermission: Setter<BadgePermissionState>;

  private midnightTimer: number | null = null;
  private visibilityListener: (() => void) | null = null;

  constructor(deps: RemindersControllerDependencies) {
    this.deps = deps;
    /* eslint-disable solid/reactivity -- class fields initialized via createSignal destructuring */
    [this.reminderPrefs, this.setReminderPrefsSignal] = createSignal<ReminderPreferences>(
      PreferencesStorage.readStoredReminderPrefs()
    );
    [this.badgePermission, this.setBadgePermission] = createSignal<BadgePermissionState>(
      ReminderPlanner.getNotificationPermission()
    );
    /* eslint-enable solid/reactivity */
  }

  public persistPrefs(next: ReminderPreferences): void {
    PreferencesStorage.persistReminderPrefs(next);
    this.setReminderPrefsSignal(next);
  }

  public syncBadgePermission(): void {
    this.setBadgePermission(ReminderPlanner.getNotificationPermission());
  }

  public refreshAppBadge(): void {
    const prefs = this.reminderPrefs();
    if (!prefs.badgeEnabled || !this.deps.getDbReady()) {
      void ReminderPlanner.syncAppBadge(null);
      return;
    }
    const summary = ReminderPlanner.getTodayPendingSummary(
      this.deps.getSnapshot(),
      this.deps.getTodayDay()
    );
    void ReminderPlanner.syncAppBadge(summary.totalPendingCount);
  }

  public getTodayPendingSummary(): TodayPendingSummary {
    return ReminderPlanner.getTodayPendingSummary(this.deps.getSnapshot(), this.deps.getTodayDay());
  }

  public setBadgeEnabled(enabled: boolean): void {
    const next: ReminderPreferences = {
      ...this.reminderPrefs(),
      badgeEnabled: enabled,
    };
    this.persistPrefs(next);
    this.refreshAppBadge();
    if (enabled && ReminderPlanner.getNotificationPermission() === 'default') {
      void this.requestBadgePermissionAndRefresh();
    }
  }

  public async requestBadgePermissionAndRefresh(): Promise<void> {
    const perm = await ReminderPlanner.requestBadgePermission();
    this.setBadgePermission(perm);
    if (perm === 'granted' && !this.reminderPrefs().badgeEnabled) {
      this.persistPrefs({
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
    PreferencesStorage.writeStoredRemindersEditedAt(Date.now());
    this.persistPrefs(next);
    this.deps.onInvalidateCalendarPlan?.();
    this.deps.onClearCalendarError?.();
  }

  public activeReminderSlots(): ReminderSlot[] {
    return ReminderPlanner.getActiveSlots(this.deps.getSnapshot());
  }

  public async createReminderSlot(input: { label: string; time: string }): Promise<ReminderSlot> {
    const slot = await this.deps.db.createReminderSlot(input);
    await this.deps.reloadFromDb();
    this.deps.onInvalidateCalendarPlan?.();
    return slot;
  }

  public async updateReminderSlot(
    id: string,
    patch: { label?: string; time?: string }
  ): Promise<void> {
    await this.deps.db.updateReminderSlot(id, patch);
    await this.deps.reloadFromDb();
    this.deps.onInvalidateCalendarPlan?.();
  }

  public async deleteReminderSlot(id: string): Promise<void> {
    await this.deps.db.deleteReminderSlot(id);
    if (this.reminderPrefs().taskReminderSlotId === id) {
      this.setTaskReminderSlotId(null);
    }
    await this.deps.reloadFromDb();
    this.deps.onInvalidateCalendarPlan?.();
  }

  public setTaskReminderSlotId(slotId: string | null): void {
    const normalized = ReminderPlanner.normalizeTaskReminderSlotId(slotId);
    const next: ReminderPreferences = {
      ...this.reminderPrefs(),
      taskReminderSlotId: normalized,
    };
    PreferencesStorage.writeStoredRemindersEditedAt(Date.now());
    this.persistPrefs(next);
    this.deps.onInvalidateCalendarPlan?.();
  }

  public setReminderHorizonDays(days: number): void {
    const normalized = ReminderPlanner.normalizeHorizonDays(days);
    const next: ReminderPreferences = {
      ...this.reminderPrefs(),
      horizonDays: normalized,
    };
    PreferencesStorage.writeStoredRemindersEditedAt(Date.now());
    this.persistPrefs(next);
    this.deps.onInvalidateCalendarPlan?.();
  }

  public start(): void {
    this.dispose();

    if (typeof window !== 'undefined') {
      this.midnightTimer = window.setInterval(() => {
        const current = CivilCalendar.todayDayIndex(new Date(), this.deps.getTimeZone());
        if (current !== this.deps.getTodayDay()) {
          this.deps.setTodayDay(current);
          this.refreshAppBadge();
        }
      }, 30_000);
    }

    if (typeof document !== 'undefined') {
      this.visibilityListener = () => {
        if (document.visibilityState === 'visible') {
          const current = CivilCalendar.todayDayIndex(new Date(), this.deps.getTimeZone());
          if (current !== this.deps.getTodayDay()) {
            this.deps.setTodayDay(current);
          }
          this.syncBadgePermission();
          this.refreshAppBadge();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  public dispose(): void {
    if (this.midnightTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.midnightTimer);
      this.midnightTimer = null;
    }
    if (this.visibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
  }
}

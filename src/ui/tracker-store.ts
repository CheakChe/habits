import { Accessor, Setter, createSignal } from 'solid-js';
import { SessionManager } from '../auth/session-manager';
import { HabitDatabase } from '../db/habit-database';
import {
  ConcurrentSyncError,
  DriveSyncService,
  SyncPreparationResult,
} from '../sync/drive-sync-service';
import {
  ActiveTab,
  DomainSnapshot,
  Habit,
  SessionMode,
  Task,
} from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';

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

  public readonly editingTask: Accessor<Task | null>;
  private readonly setEditingTask: Setter<Task | null>;

  public readonly accountModalOpen: Accessor<boolean>;
  public readonly setAccountModalOpen: Setter<boolean>;

  public readonly todayDay: Accessor<number>;
  private readonly setTodayDay: Setter<number>;

  private unsubscribeAuth: (() => void) | null = null;
  private midnightTimer: number | null = null;

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
    [this.editingTask, this.setEditingTask] = createSignal<Task | null>(null);
    [this.accountModalOpen, this.setAccountModalOpen] = createSignal(false);
    [this.todayDay, this.setTodayDay] = createSignal(CivilCalendar.todayDayIndex());
  }

  public init(): void {
    void this.reloadFromDb().catch((err) => {
      this.setSyncBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to open local IndexedDB.',
      });
      this.setDbReady(true);
    });

    this.unsubscribeAuth = this.session.subscribeAuthChanges(() => {
      this.setHasGoogleToken(false);
    });

    this.midnightTimer = window.setInterval(() => {
      const current = CivilCalendar.todayDayIndex();
      if (current !== this.todayDay()) {
        this.setTodayDay(current);
      }
    }, 30_000);
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
  }

  public async reloadFromDb(): Promise<void> {
    const data = await this.db.getAllSnapshot();
    this.setSnapshot(data);
    this.setDbReady(true);
  }

  public selectGuest(): void {
    this.session.chooseGuest();
    this.driveSync.resetUploadCache();
    this.setAuthError(null);
    this.setHasGoogleToken(false);
    this.setSyncBanner(null);
    this.setMode('guest');
  }

  public async selectGoogle(): Promise<void> {
    this.setIsSigningIn(true);
    this.setAuthError(null);
    try {
      await this.session.signInWithGoogle();
      this.setHasGoogleToken(true);
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
      await this.session.signInWithGoogle();
      this.setHasGoogleToken(true);
    } catch (err) {
      this.setSyncBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not reconnect Google Drive.',
      });
    }
  }

  public async switchToEntry(): Promise<void> {
    await this.session.clearSessionAndReturnToEntry();
    this.driveSync.resetUploadCache();
    this.setHasGoogleToken(false);
    this.setSyncBanner(null);
    this.setPendingSync(null);
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

  public openCreateTask(): void {
    this.setEditingTask(null);
    this.setTaskModalOpen(true);
  }

  public openEditTask(task: Task): void {
    this.setEditingTask(task);
    this.setTaskModalOpen(true);
  }

  public closeTaskModal(): void {
    this.setTaskModalOpen(false);
  }

  public async saveTask(data: {
    title: string;
    note: string;
    dueDay: number | null;
  }): Promise<void> {
    const target = this.editingTask();
    if (target) {
      await this.db.updateTask(target.id, data);
    } else {
      await this.db.createTask(data);
    }
    await this.reloadFromDb();
  }

  public async quickAddTask(title: string, dueDay: number | null): Promise<void> {
    await this.db.createTask({ title, note: '', dueDay });
    await this.reloadFromDb();
  }

  public async toggleTaskDone(task: Task): Promise<void> {
    await this.db.updateTask(task.id, { done: !task.done });
    await this.reloadFromDb();
  }

  public async deleteTask(taskId: number): Promise<void> {
    await this.db.deleteTask(taskId);
    await this.reloadFromDb();
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
      if (msg.toLowerCase().includes('authorization')) {
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
      if (msg.toLowerCase().includes('authorization')) {
        this.session.clearAccessTokenOnly();
        this.setHasGoogleToken(false);
      }
      this.setPendingSync(null);
      this.setSyncBanner({ kind: 'error', text: msg });
    } finally {
      this.setSyncBusy(false);
    }
  }
}

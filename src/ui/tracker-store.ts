import { Accessor, Setter, createSignal } from 'solid-js';
import { SessionManager } from '../auth/session-manager';
import { HabitDatabase } from '../db/habit-database';
import { BackupService } from '../sync/backup-service';
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

  private unsubscribeAuth: (() => void) | null = null;
  private midnightTimer: number | null = null;
  private static readonly TIMEZONE_STORAGE_KEY = 'habits.timezone';

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
    [this.todayDay, this.setTodayDay] = createSignal(
      CivilCalendar.todayDayIndex(new Date(), initialTz)
    );
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
      const current = CivilCalendar.todayDayIndex(new Date(), this.timeZone());
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
    const nextDone = !task.done;
    await this.db.updateTask(task.id, {
      done: nextDone,
      completedDay: nextDone ? this.todayDay() : null,
    });
    await this.reloadFromDb();
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
      if (msg.toLowerCase().includes('authorization')) {
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
      if (msg.toLowerCase().includes('authorization')) {
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
      if (msg.toLowerCase().includes('authorization')) {
        this.session.clearAccessTokenOnly();
        this.setHasGoogleToken(false);
      }
      this.setRevisionsError(msg);
    } finally {
      this.setRestoringRevision(false);
    }
  }
}

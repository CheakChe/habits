import { Accessor, Setter, createSignal } from 'solid-js';
import { SessionManager } from '../../auth/session-manager';
import { CalendarReminderService, CalendarSyncPlan } from '../../sync/calendar-reminder-service';
import { DomainSnapshot, SessionMode } from '../../types/domain';
import { CivilCalendar } from '../../utils/civil-calendar';
import { ReminderPlanner } from '../../utils/reminder-planner';
import { PreferencesStorage } from '../preferences-store';
import { RemindersController } from '../reminders-controller';

export interface CalendarSyncSliceDeps {
  session: SessionManager;
  calendarSync: CalendarReminderService;
  reminders: RemindersController;
  getMode: Accessor<SessionMode | null>;
  getSnapshot: Accessor<DomainSnapshot>;
  getTodayDay: Accessor<number>;
  getTimeZone: Accessor<string>;
  applyTimeZoneValue: (nextTz: string, updatedAt: number) => void;
  ensureGoogleToken: () => Promise<boolean>;
  handleAuthError: (msg: string) => void;
  closeAccountModal: () => void;
  onSyncSuccessBanner: (text: string) => void;
}

export interface CalendarSyncSlice {
  remindersModalOpen: Accessor<boolean>;
  calendarBusy: Accessor<boolean>;
  calendarError: Accessor<string | null>;
  setCalendarError: Setter<string | null>;
  pendingCalendarPlan: Accessor<CalendarSyncPlan | null>;
  setPendingCalendarPlan: Setter<CalendarSyncPlan | null>;
  confirmDeleteCalendarOpen: Accessor<boolean>;
  setConfirmDeleteCalendarOpen: Setter<boolean>;
  isCalendarSyncNeeded: () => boolean;
  openRemindersModal: () => void;
  closeRemindersModal: () => void;
  syncRemoteCalendarMetaAfterDrive: () => Promise<void>;
  prepareCalendarSync: () => Promise<void>;
  cancelCalendarSync: () => void;
  confirmCalendarSync: () => Promise<void>;
  requestDeleteCalendar: () => void;
  cancelDeleteCalendar: () => void;
  confirmDeleteCalendar: () => Promise<void>;
}

export function createCalendarSyncSlice(deps: CalendarSyncSliceDeps): CalendarSyncSlice {
  const [remindersModalOpen, setRemindersModalOpen] = createSignal(false);
  const [calendarBusy, setCalendarBusy] = createSignal(false);
  const [calendarError, setCalendarError] = createSignal<string | null>(null);
  const [pendingCalendarPlan, setPendingCalendarPlan] = createSignal<CalendarSyncPlan | null>(null);
  const [confirmDeleteCalendarOpen, setConfirmDeleteCalendarOpen] = createSignal(false);

  const isCalendarSyncNeeded = (): boolean => {
    const prefs = deps.reminders.reminderPrefs();
    if (deps.getMode() !== 'google' || !prefs.calendarEnabled) {
      return false;
    }
    if (!prefs.calendarId || !prefs.lastSyncedSignature) {
      return true;
    }
    const currentSignature = ReminderPlanner.computeStateSignature(
      deps.getSnapshot(),
      deps.getTodayDay(),
      prefs,
      deps.getTimeZone()
    );
    return currentSignature !== prefs.lastSyncedSignature;
  };

  const openRemindersModal = (): void => {
    deps.closeAccountModal();
    setCalendarError(null);
    setPendingCalendarPlan(null);
    setConfirmDeleteCalendarOpen(false);
    deps.reminders.syncBadgePermission();
    setRemindersModalOpen(true);
  };

  const closeRemindersModal = (): void => {
    if (calendarBusy()) return;
    setRemindersModalOpen(false);
    setPendingCalendarPlan(null);
    setConfirmDeleteCalendarOpen(false);
    setCalendarError(null);
  };

  const applyPulledRemoteCalendarMeta = (syncedMeta: {
    calendarId: string | null;
    timeZone: string | null;
    timeZoneUpdatedAt?: number;
    taskReminderSlotId?: string | null;
    horizonDays?: number;
    calendarEnabled?: boolean;
    updatedAt?: number;
  }): void => {
    const current = deps.reminders.reminderPrefs();
    const isFreshDevice = !current.calendarId;
    const localEditedAt = Math.max(
      current.lastSyncedAt ?? 0,
      PreferencesStorage.readStoredRemindersEditedAt()
    );
    const remoteIsNewer =
      typeof syncedMeta.updatedAt === 'number' && syncedMeta.updatedAt > localEditedAt;
    const localTzUpdatedAt = PreferencesStorage.readStoredTimeZoneUpdatedAt();
    const remoteTzUpdatedAt = syncedMeta.timeZoneUpdatedAt ?? 0;

    if (
      syncedMeta.timeZone &&
      CivilCalendar.isValidTimeZone(syncedMeta.timeZone) &&
      (remoteTzUpdatedAt > localTzUpdatedAt ||
        (localTzUpdatedAt === 0 && syncedMeta.timeZone !== deps.getTimeZone()))
    ) {
      deps.applyTimeZoneValue(
        syncedMeta.timeZone,
        remoteTzUpdatedAt > 0 ? remoteTzUpdatedAt : (syncedMeta.updatedAt ?? Date.now())
      );
    }

    if (syncedMeta.calendarId && (isFreshDevice || remoteIsNewer)) {
      deps.reminders.persistPrefs({
        ...current,
        calendarId: syncedMeta.calendarId,
        calendarTimeZone: syncedMeta.timeZone ?? current.calendarTimeZone,
        taskReminderSlotId:
          syncedMeta.taskReminderSlotId !== undefined
            ? syncedMeta.taskReminderSlotId
            : current.taskReminderSlotId,
        horizonDays: syncedMeta.horizonDays ?? current.horizonDays,
        calendarEnabled: syncedMeta.calendarEnabled ?? current.calendarEnabled,
      });
    }
  };

  const syncRemoteCalendarMetaAfterDrive = async (): Promise<void> => {
    const localPrefs = deps.reminders.reminderPrefs();
    const syncedMeta = await deps.calendarSync.syncRemoteCalendarId(
      deps.getMode(),
      deps.session.getAccessToken(),
      localPrefs.calendarId,
      deps.getTimeZone(),
      {
        ...localPrefs,
        timeZoneUpdatedAt: PreferencesStorage.readStoredTimeZoneUpdatedAt(),
      }
    );
    if (syncedMeta) {
      applyPulledRemoteCalendarMeta(syncedMeta);
    }
  };

  const prepareCalendarSync = async (): Promise<void> => {
    if (deps.getMode() !== 'google') return;
    if (!(await deps.ensureGoogleToken())) return;

    setCalendarBusy(true);
    setCalendarError(null);
    setConfirmDeleteCalendarOpen(false);

    try {
      await syncRemoteCalendarMetaAfterDrive();

      const prefs = deps.reminders.reminderPrefs();
      const plan = await deps.calendarSync.prepareSyncPlan(
        deps.getMode(),
        deps.session.getAccessToken(),
        deps.getSnapshot(),
        deps.getTodayDay(),
        prefs,
        deps.getTimeZone()
      );

      const hasMutations =
        plan.willCreateCalendar ||
        plan.willUpdateCalendarTz ||
        plan.duplicateCalendarIds.length > 0 ||
        plan.toCreate.length > 0 ||
        plan.toUpdate.length > 0 ||
        plan.toDelete.length > 0;

      if (!hasMutations && plan.calendarId) {
        const tzUpdatedAt = PreferencesStorage.readStoredTimeZoneUpdatedAt() || Date.now();
        PreferencesStorage.writeStoredTimeZoneUpdatedAt(tzUpdatedAt);
        await deps.calendarSync.syncRemoteCalendarId(
          deps.getMode(),
          deps.session.getAccessToken(),
          plan.calendarId,
          deps.getTimeZone(),
          {
            ...prefs,
            timeZoneUpdatedAt: tzUpdatedAt,
          }
        );
        deps.reminders.persistPrefs({
          ...prefs,
          calendarId: plan.calendarId,
          calendarTimeZone: plan.timeZone,
          lastSyncedSignature: plan.targetSignature,
          lastSyncedAt: Date.now(),
        });
        setPendingCalendarPlan(null);
        deps.onSyncSuccessBanner('Google Calendar reminders are already up to date.');
        return;
      }

      setPendingCalendarPlan(plan);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to prepare Google Calendar sync.';
      deps.handleAuthError(msg);
      setCalendarError(msg);
    } finally {
      setCalendarBusy(false);
    }
  };

  const cancelCalendarSync = (): void => {
    if (calendarBusy()) return;
    setPendingCalendarPlan(null);
  };

  const confirmCalendarSync = async (): Promise<void> => {
    const plan = pendingCalendarPlan();
    if (!plan || deps.getMode() !== 'google') return;
    if (!(await deps.ensureGoogleToken())) return;

    setCalendarBusy(true);
    setCalendarError(null);
    try {
      const tzUpdatedAt = PreferencesStorage.readStoredTimeZoneUpdatedAt() || Date.now();
      PreferencesStorage.writeStoredTimeZoneUpdatedAt(tzUpdatedAt);
      const result = await deps.calendarSync.applySyncPlan(
        deps.getMode(),
        deps.session.getAccessToken(),
        plan,
        {
          ...deps.reminders.reminderPrefs(),
          timeZoneUpdatedAt: tzUpdatedAt,
        }
      );
      const now = Date.now();
      PreferencesStorage.writeStoredRemindersEditedAt(now);
      deps.reminders.persistPrefs({
        ...deps.reminders.reminderPrefs(),
        calendarEnabled: true,
        calendarId: result.calendarId,
        calendarTimeZone: result.timeZone,
        lastSyncedSignature: result.targetSignature,
        lastSyncedAt: now,
      });
      setPendingCalendarPlan(null);
      const dupText =
        result.duplicatesRemoved > 0
          ? `, ${result.duplicatesRemoved} duplicate calendar${result.duplicatesRemoved === 1 ? '' : 's'} removed`
          : '';
      deps.onSyncSuccessBanner(
        `Google Calendar updated (${result.created} added, ${result.updated} updated, ${result.deleted} cleared${dupText}).`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to update Google Calendar reminders.';
      deps.handleAuthError(msg);
      setCalendarError(msg);
    } finally {
      setCalendarBusy(false);
    }
  };

  const requestDeleteCalendar = (): void => {
    setPendingCalendarPlan(null);
    setCalendarError(null);
    setConfirmDeleteCalendarOpen(true);
  };

  const cancelDeleteCalendar = (): void => {
    if (calendarBusy()) return;
    setConfirmDeleteCalendarOpen(false);
  };

  const confirmDeleteCalendar = async (): Promise<void> => {
    const calId = deps.reminders.reminderPrefs().calendarId;
    if (!calId || deps.getMode() !== 'google') {
      setConfirmDeleteCalendarOpen(false);
      return;
    }
    if (!(await deps.ensureGoogleToken())) return;

    setCalendarBusy(true);
    setCalendarError(null);
    try {
      await deps.calendarSync.deleteReminderCalendar(
        deps.getMode(),
        deps.session.getAccessToken(),
        calId
      );
      deps.reminders.persistPrefs({
        ...deps.reminders.reminderPrefs(),
        calendarEnabled: false,
        calendarId: null,
        calendarTimeZone: null,
        lastSyncedSignature: null,
        lastSyncedAt: null,
      });
      setConfirmDeleteCalendarOpen(false);
      setPendingCalendarPlan(null);
      deps.onSyncSuccessBanner('Habits Reminders calendar deleted from your Google Calendar.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete Google Calendar.';
      deps.handleAuthError(msg);
      setCalendarError(msg);
    } finally {
      setCalendarBusy(false);
    }
  };

  return {
    remindersModalOpen,
    calendarBusy,
    calendarError,
    setCalendarError,
    pendingCalendarPlan,
    setPendingCalendarPlan,
    confirmDeleteCalendarOpen,
    setConfirmDeleteCalendarOpen,
    isCalendarSyncNeeded,
    openRemindersModal,
    closeRemindersModal,
    syncRemoteCalendarMetaAfterDrive,
    prepareCalendarSync,
    cancelCalendarSync,
    confirmCalendarSync,
    requestDeleteCalendar,
    cancelDeleteCalendar,
    confirmDeleteCalendar,
  };
}

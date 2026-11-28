import { Accessor, Setter, createSignal } from 'solid-js';
import { SessionManager } from '../../auth/session-manager';
import { HabitDatabase } from '../../db/habit-database';
import {
  ConcurrentSyncError,
  DriveRevisionInspectResult,
  DriveRevisionMeta,
  DriveSyncService,
  SyncPreparationResult,
} from '../../sync/drive-sync-service';
import { DomainSnapshot, SessionMode } from '../../types/domain';

export interface DriveSyncSliceDeps {
  db: HabitDatabase;
  session: SessionManager;
  driveSync: DriveSyncService;
  getMode: Accessor<SessionMode | null>;
  ensureGoogleToken: () => Promise<boolean>;
  handleAuthError: (msg: string) => void;
  reloadFromDb: () => Promise<void>;
  closeAccountModal: () => void;
  syncRemoteCalendarMetaAfterDrive: () => Promise<void>;
}

export interface DriveSyncSlice {
  syncBusy: Accessor<boolean>;
  syncBanner: Accessor<{ kind: 'success' | 'error'; text: string } | null>;
  setSyncBanner: Setter<{ kind: 'success' | 'error'; text: string } | null>;
  pendingSync: Accessor<SyncPreparationResult | null>;
  setPendingSync: Setter<SyncPreparationResult | null>;
  revisionsModalOpen: Accessor<boolean>;
  revisionsLoading: Accessor<boolean>;
  revisionsError: Accessor<string | null>;
  revisionsFileId: Accessor<string | null>;
  revisions: Accessor<DriveRevisionMeta[]>;
  inspectingRevisionId: Accessor<string | null>;
  inspectedRevision: Accessor<DriveRevisionInspectResult | null>;
  restoringRevision: Accessor<boolean>;
  resetUploadCache: () => void;
  startDriveSync: () => Promise<void>;
  cancelPendingSync: () => void;
  confirmUploadSync: () => Promise<void>;
  closeDriveRevisions: () => void;
  openDriveRevisions: () => Promise<void>;
  inspectDriveRevision: (revisionId: string) => Promise<void>;
  restoreDriveRevision: (revisionId: string) => Promise<void>;
}

export function createDriveSyncSlice(deps: DriveSyncSliceDeps): DriveSyncSlice {
  const [syncBusy, setSyncBusy] = createSignal(false);
  const [syncBanner, setSyncBanner] = createSignal<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [pendingSync, setPendingSync] = createSignal<SyncPreparationResult | null>(null);
  const [revisionsModalOpen, setRevisionsModalOpen] = createSignal(false);
  const [revisionsLoading, setRevisionsLoading] = createSignal(false);
  const [revisionsError, setRevisionsError] = createSignal<string | null>(null);
  const [revisionsFileId, setRevisionsFileId] = createSignal<string | null>(null);
  const [revisions, setRevisions] = createSignal<DriveRevisionMeta[]>([]);
  const [inspectingRevisionId, setInspectingRevisionId] = createSignal<string | null>(null);
  const [inspectedRevision, setInspectedRevision] = createSignal<DriveRevisionInspectResult | null>(
    null
  );
  const [restoringRevision, setRestoringRevision] = createSignal(false);

  const resetUploadCache = (): void => {
    deps.driveSync.resetUploadCache();
  };

  const applyMergedIfChanged = async (result: {
    localChanged: boolean;
    mergedSnapshot: DomainSnapshot;
  }): Promise<void> => {
    if (result.localChanged) {
      await deps.db.replaceSnapshot(result.mergedSnapshot);
      await deps.reloadFromDb();
    }
  };

  const startDriveSync = async (): Promise<void> => {
    if (deps.getMode() !== 'google') return;
    if (!(await deps.ensureGoogleToken())) return;

    setSyncBusy(true);
    setSyncBanner(null);

    try {
      const currentSnapshot = await deps.db.getAllSnapshot();
      const result = await deps.driveSync.prepareSync(
        deps.getMode(),
        deps.session.getAccessToken(),
        currentSnapshot
      );

      await applyMergedIfChanged(result);

      if (result.status === 'up-to-date') {
        await deps.syncRemoteCalendarMetaAfterDrive();
        setSyncBanner({
          kind: 'success',
          text: result.localChanged
            ? 'Downloaded and merged snapshot from Google Drive.'
            : 'Already up to date with Google Drive.',
        });
        return;
      }

      setPendingSync(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Drive sync failed.';
      deps.handleAuthError(msg);
      setSyncBanner({ kind: 'error', text: msg });
    } finally {
      setSyncBusy(false);
    }
  };

  const cancelPendingSync = (): void => {
    setPendingSync(null);
  };

  const confirmUploadSync = async (): Promise<void> => {
    const pending = pendingSync();
    if (!pending) return;

    setSyncBusy(true);
    setSyncBanner(null);
    try {
      await deps.driveSync.confirmAndUpload(deps.getMode(), deps.session.getAccessToken(), pending);
      await deps.syncRemoteCalendarMetaAfterDrive();
      setPendingSync(null);
      setSyncBanner({
        kind: 'success',
        text: 'Snapshot uploaded to Google Drive.',
      });
    } catch (err) {
      if (err instanceof ConcurrentSyncError) {
        try {
          const refreshedSnapshot = await deps.db.getAllSnapshot();
          const rePrepared = await deps.driveSync.prepareSync(
            deps.getMode(),
            deps.session.getAccessToken(),
            refreshedSnapshot
          );
          await applyMergedIfChanged(rePrepared);
          if (rePrepared.status === 'up-to-date') {
            setPendingSync(null);
            setSyncBanner({
              kind: 'success',
              text: 'Another device updated Drive first. Merged remote changes cleanly.',
            });
          } else {
            setPendingSync(rePrepared);
            setSyncBanner({
              kind: 'error',
              text: 'Another device updated Drive while you were reviewing. Changes were merged — confirm upload again.',
            });
          }
          return;
        } catch (retryErr) {
          setPendingSync(null);
          setSyncBanner({
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
      deps.handleAuthError(msg);
      setPendingSync(null);
      setSyncBanner({ kind: 'error', text: msg });
    } finally {
      setSyncBusy(false);
    }
  };

  const closeDriveRevisions = (): void => {
    setRevisionsModalOpen(false);
    setRevisionsError(null);
    setInspectedRevision(null);
    setInspectingRevisionId(null);
  };

  const openDriveRevisions = async (): Promise<void> => {
    if (deps.getMode() !== 'google') return;
    if (!(await deps.ensureGoogleToken())) return;

    deps.closeAccountModal();
    setRevisionsModalOpen(true);
    setRevisionsError(null);
    setInspectedRevision(null);
    setInspectingRevisionId(null);
    setRevisionsLoading(true);

    try {
      const result = await deps.driveSync.listRevisions(
        deps.getMode(),
        deps.session.getAccessToken()
      );
      setRevisionsFileId(result.fileId);
      setRevisions(result.revisions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load Drive version history.';
      deps.handleAuthError(msg);
      setRevisionsError(msg);
    } finally {
      setRevisionsLoading(false);
    }
  };

  const inspectDriveRevision = async (revisionId: string): Promise<void> => {
    const fileId = revisionsFileId();
    if (!fileId || deps.getMode() !== 'google') return;
    if (!(await deps.ensureGoogleToken())) return;

    setInspectingRevisionId(revisionId);
    setRevisionsError(null);
    try {
      const inspected = await deps.driveSync.inspectRevision(
        deps.getMode(),
        deps.session.getAccessToken(),
        fileId,
        revisionId
      );
      setInspectedRevision(inspected);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to inspect Drive revision.';
      deps.handleAuthError(msg);
      setRevisionsError(msg);
      setInspectedRevision(null);
    } finally {
      setInspectingRevisionId(null);
    }
  };

  const restoreDriveRevision = async (revisionId: string): Promise<void> => {
    const fileId = revisionsFileId();
    if (!fileId || deps.getMode() !== 'google') return;
    if (!(await deps.ensureGoogleToken())) return;

    setRestoringRevision(true);
    setRevisionsError(null);
    try {
      const localSnapshot = await deps.db.getAllSnapshot();
      const result = await deps.driveSync.restoreRevision(
        deps.getMode(),
        deps.session.getAccessToken(),
        fileId,
        revisionId,
        localSnapshot
      );
      await deps.db.replaceSnapshot(result.restoredSnapshot);
      await deps.reloadFromDb();
      setPendingSync(null);
      closeDriveRevisions();
      setSyncBanner({
        kind: 'success',
        text: `Restored Drive version (${result.summary.habitsCount} habits, ${result.summary.tasksCount} tasks) and saved as latest.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to restore Drive revision.';
      deps.handleAuthError(msg);
      setRevisionsError(msg);
    } finally {
      setRestoringRevision(false);
    }
  };

  return {
    syncBusy,
    syncBanner,
    setSyncBanner,
    pendingSync,
    setPendingSync,
    revisionsModalOpen,
    revisionsLoading,
    revisionsError,
    revisionsFileId,
    revisions,
    inspectingRevisionId,
    inspectedRevision,
    restoringRevision,
    resetUploadCache,
    startDriveSync,
    cancelPendingSync,
    confirmUploadSync,
    closeDriveRevisions,
    openDriveRevisions,
    inspectDriveRevision,
    restoreDriveRevision,
  };
}

import { DomainSnapshot, SessionMode } from '../types/domain';
import { Helpers, NonRetryableError } from '../utils/helpers';
import { SnapshotCodec } from './snapshot-codec';
import { SnapshotMerger } from './snapshot-merger';

const SNAPSHOT_FILENAME = 'habits-snapshot.bin';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
export const MAX_REVISIONS_TO_KEEP = 10;

export class ConcurrentSyncError extends NonRetryableError {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrentSyncError';
  }
}

interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime?: string;
  version?: string;
}

export interface DriveRevisionMeta {
  id: string;
  modifiedTime?: string;
  size?: number;
  keepForever?: boolean;
}

export interface SnapshotSummary {
  habitsCount: number;
  checkinsCount: number;
  notesCount: number;
  tasksCount: number;
  byteSize: number;
}

export interface SyncPreparationResult {
  status: 'up-to-date' | 'needs-upload-confirm';
  mergedSnapshot: DomainSnapshot;
  mergedBytes: Uint8Array;
  remoteFileId: string | null;
  remoteVersion: string | null;
  remoteModifiedTime: string | null;
  duplicateFileIds?: string[];
  localChanged: boolean;
  summary: SnapshotSummary;
}

export interface DriveRevisionListResult {
  fileId: string | null;
  revisions: DriveRevisionMeta[];
}

export interface DriveRevisionInspectResult {
  fileId: string;
  revisionId: string;
  snapshot: DomainSnapshot;
  bytes: Uint8Array;
  summary: SnapshotSummary;
}

export interface DriveRevisionRestoreResult {
  fileId: string;
  revisionId: string;
  restoredSnapshot: DomainSnapshot;
  restoredBytes: Uint8Array;
  summary: SnapshotSummary;
}

export class DriveSyncService {
  private lastSyncedBytes: Uint8Array | null = null;

  private ensureGoogleAccess(mode: SessionMode | null, accessToken: string | null): string {
    if (mode !== 'google') {
      throw new NonRetryableError('Sync is only available in Google Drive mode.');
    }
    if (!accessToken) {
      throw new NonRetryableError('Google Drive session expired. Please reconnect your account.');
    }
    return accessToken;
  }

  private async handleResponseError(res: Response): Promise<never> {
    if (res.status === 401 || res.status === 403) {
      throw new NonRetryableError('Google Drive authorization expired or insufficient permissions.');
    }
    if (res.status === 412) {
      throw new ConcurrentSyncError('Google Drive snapshot changed concurrently.');
    }
    if (res.status === 400 || res.status === 404) {
      throw new NonRetryableError(`Google Drive request failed (${res.status}).`);
    }
    throw new Error(`Google Drive temporary error (${res.status}).`);
  }

  private sortFilesNewestFirst(files: DriveFileMeta[]): DriveFileMeta[] {
    return [...files].sort((a, b) => {
      const ta = a.modifiedTime ? Date.parse(a.modifiedTime) : 0;
      const tb = b.modifiedTime ? Date.parse(b.modifiedTime) : 0;
      if (tb !== ta) return tb - ta;
      return a.id.localeCompare(b.id);
    });
  }

  private sortRevisionsNewestFirst(revisions: DriveRevisionMeta[]): DriveRevisionMeta[] {
    return [...revisions].sort((a, b) => {
      const ta = a.modifiedTime ? Date.parse(a.modifiedTime) : 0;
      const tb = b.modifiedTime ? Date.parse(b.modifiedTime) : 0;
      if (tb !== ta) return tb - ta;
      const na = Number(a.id);
      const nb = Number(b.id);
      if (Number.isFinite(na) && Number.isFinite(nb) && nb !== na) {
        return nb - na;
      }
      return b.id.localeCompare(a.id);
    });
  }

  private async findSnapshotFiles(token: string): Promise<DriveFileMeta[]> {
    const query = encodeURIComponent(`name='${SNAPSHOT_FILENAME}' and trashed=false`);
    const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime,version)&pageSize=50`;

    return Helpers.withRetry(async () => {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await this.handleResponseError(res);
      }
      const data = (await res.json()) as { files?: DriveFileMeta[] };
      return this.sortFilesNewestFirst(data.files ?? []);
    });
  }

  private async downloadSnapshotBytes(token: string, fileId: string): Promise<Uint8Array> {
    const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`;
    return Helpers.withRetry(async () => {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await this.handleResponseError(res);
      }
      const buffer = await res.arrayBuffer();
      return new Uint8Array(buffer);
    });
  }

  private async downloadRevisionBytes(
    token: string,
    fileId: string,
    revisionId: string
  ): Promise<Uint8Array> {
    const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/revisions/${encodeURIComponent(revisionId)}?alt=media`;
    return Helpers.withRetry(async () => {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await this.handleResponseError(res);
      }
      const buffer = await res.arrayBuffer();
      return new Uint8Array(buffer);
    });
  }

  private async fetchRevisionsForFile(
    token: string,
    fileId: string
  ): Promise<DriveRevisionMeta[]> {
    const collected: DriveRevisionMeta[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({
        fields: 'revisions(id,modifiedTime,size,keepForever),nextPageToken',
        pageSize: '100',
      });
      if (pageToken) {
        params.set('pageToken', pageToken);
      }
      const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/revisions?${params.toString()}`;

      const data = await Helpers.withRetry(async () => {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          await this.handleResponseError(res);
        }
        return (await res.json()) as {
          revisions?: Array<{
            id: string;
            modifiedTime?: string;
            size?: string | number;
            keepForever?: boolean;
          }>;
          nextPageToken?: string;
        };
      });

      for (const rev of data.revisions ?? []) {
        const parsedSize =
          typeof rev.size === 'number'
            ? rev.size
            : typeof rev.size === 'string' && rev.size !== ''
              ? Number(rev.size)
              : undefined;
        collected.push({
          id: rev.id,
          modifiedTime: rev.modifiedTime,
          size: Number.isFinite(parsedSize) ? parsedSize : undefined,
          keepForever: rev.keepForever,
        });
      }

      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }

    return this.sortRevisionsNewestFirst(collected);
  }

  private async deleteDriveFileBestEffort(token: string, fileId: string): Promise<void> {
    try {
      const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`;
      await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Best-effort duplicate cleanup should never abort a completed sync.
    }
  }

  private async pruneOldRevisionsBestEffort(
    token: string,
    fileId: string,
    keepCount: number = MAX_REVISIONS_TO_KEEP
  ): Promise<void> {
    try {
      const revisions = await this.fetchRevisionsForFile(token, fileId);
      if (revisions.length <= keepCount) return;

      // Never delete the newest `keepCount` revisions or pinned (`keepForever`) revisions.
      const toDelete = revisions
        .slice(keepCount)
        .filter((rev) => rev.keepForever !== true);

      for (const rev of toDelete) {
        const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/revisions/${encodeURIComponent(rev.id)}`;
        await fetch(url, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Best-effort revision pruning should never fail the completed upload.
    }
  }

  private async uploadMultipartSnapshot(
    token: string,
    remoteFileId: string | null,
    bytes: Uint8Array
  ): Promise<void> {
    const boundary = `habits_boundary_${Date.now().toString(36)}`;
    const metadata: Record<string, unknown> = remoteFileId
      ? { name: SNAPSHOT_FILENAME, mimeType: 'application/octet-stream' }
      : {
          name: SNAPSHOT_FILENAME,
          parents: ['appDataFolder'],
          mimeType: 'application/octet-stream',
        };

    const encoder = new TextEncoder();
    const headerPart = encoder.encode(
      `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`
    );
    const footerPart = encoder.encode(`\r\n--${boundary}--`);

    const body = new Uint8Array(
      headerPart.byteLength + bytes.byteLength + footerPart.byteLength
    );
    body.set(headerPart, 0);
    body.set(bytes, headerPart.byteLength);
    body.set(footerPart, headerPart.byteLength + bytes.byteLength);

    const url = remoteFileId
      ? `${DRIVE_UPLOAD_URL}/${encodeURIComponent(remoteFileId)}?uploadType=multipart`
      : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
    const method = remoteFileId ? 'PATCH' : 'POST';

    await Helpers.withRetry(async () => {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });
      if (!res.ok) {
        await this.handleResponseError(res);
      }
    });
  }

  private buildSummary(snapshot: DomainSnapshot, byteSize: number): SnapshotSummary {
    return {
      habitsCount: snapshot.habits.length,
      checkinsCount: snapshot.checkins.length,
      notesCount: snapshot.notes.length,
      tasksCount: snapshot.tasks.filter((t) => t.deletedAt === null).length,
      byteSize,
    };
  }

  public async prepareSync(
    mode: SessionMode | null,
    accessToken: string | null,
    localSnapshot: DomainSnapshot
  ): Promise<SyncPreparationResult> {
    const token = this.ensureGoogleAccess(mode, accessToken);
    const localBytes = SnapshotCodec.pack(localSnapshot);

    const remoteFiles = await this.findSnapshotFiles(token);

    if (remoteFiles.length === 0) {
      return {
        status: 'needs-upload-confirm',
        mergedSnapshot: localSnapshot,
        mergedBytes: localBytes,
        remoteFileId: null,
        remoteVersion: null,
        remoteModifiedTime: null,
        duplicateFileIds: [],
        localChanged: false,
        summary: this.buildSummary(localSnapshot, localBytes.byteLength),
      };
    }

    const decodedFiles: Array<{
      meta: DriveFileMeta;
      bytes: Uint8Array;
      snapshot: DomainSnapshot;
    }> = [];
    const emptyFileIds: string[] = [];

    for (const file of remoteFiles) {
      const remoteBytes = await this.downloadSnapshotBytes(token, file.id);
      if (remoteBytes.byteLength === 0) {
        emptyFileIds.push(file.id);
        continue;
      }
      try {
        const snapshot = SnapshotCodec.unpack(remoteBytes);
        decodedFiles.push({ meta: file, bytes: remoteBytes, snapshot });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Corrupt snapshot';
        throw new NonRetryableError(
          `Remote Drive snapshot could not be read (${message}). Local data was kept intact.`
        );
      }
    }

    if (decodedFiles.length === 0) {
      throw new NonRetryableError(
        'Remote Drive snapshot is empty. Local data was kept intact.'
      );
    }

    const primary = decodedFiles[0];
    const duplicateFileIds = [
      ...decodedFiles.slice(1).map((d) => d.meta.id),
      ...emptyFileIds,
    ];

    let mergedSnapshot = localSnapshot;
    for (const entry of decodedFiles) {
      mergedSnapshot = SnapshotMerger.merge(mergedSnapshot, entry.snapshot);
    }
    const mergedBytes = SnapshotCodec.pack(mergedSnapshot);

    const localChanged = !Helpers.bytesEqual(localBytes, mergedBytes);
    const remoteDiffers = !Helpers.bytesEqual(primary.bytes, mergedBytes);
    const hasDuplicates = duplicateFileIds.length > 0;
    const matchesLastUpload =
      this.lastSyncedBytes !== null && Helpers.bytesEqual(this.lastSyncedBytes, mergedBytes);

    if (!hasDuplicates && (!remoteDiffers || (matchesLastUpload && !localChanged))) {
      this.lastSyncedBytes = mergedBytes;
      return {
        status: 'up-to-date',
        mergedSnapshot,
        mergedBytes,
        remoteFileId: primary.meta.id,
        remoteVersion: primary.meta.version ?? null,
        remoteModifiedTime: primary.meta.modifiedTime ?? null,
        duplicateFileIds: [],
        localChanged,
        summary: this.buildSummary(mergedSnapshot, mergedBytes.byteLength),
      };
    }

    return {
      status: 'needs-upload-confirm',
      mergedSnapshot,
      mergedBytes,
      remoteFileId: primary.meta.id,
      remoteVersion: primary.meta.version ?? null,
      remoteModifiedTime: primary.meta.modifiedTime ?? null,
      duplicateFileIds,
      localChanged,
      summary: this.buildSummary(mergedSnapshot, mergedBytes.byteLength),
    };
  }

  public async confirmAndUpload(
    mode: SessionMode | null,
    accessToken: string | null,
    preparation: SyncPreparationResult
  ): Promise<void> {
    const token = this.ensureGoogleAccess(mode, accessToken);
    const {
      mergedBytes,
      remoteFileId,
      remoteVersion,
      remoteModifiedTime,
      duplicateFileIds = [],
    } = preparation;

    if (
      this.lastSyncedBytes &&
      Helpers.bytesEqual(this.lastSyncedBytes, mergedBytes) &&
      remoteFileId &&
      duplicateFileIds.length === 0
    ) {
      return;
    }

    // Optimistic concurrency check: verify remote file wasn't created, updated, or duplicated since prepareSync
    const latestFiles = await this.findSnapshotFiles(token);
    if (remoteFileId === null && latestFiles.length > 0) {
      throw new ConcurrentSyncError(
        'Another device created a Google Drive snapshot while you were reviewing.'
      );
    }
    if (remoteFileId !== null) {
      const latestPrimary = latestFiles.find((f) => f.id === remoteFileId);
      if (!latestPrimary) {
        throw new ConcurrentSyncError(
          'Remote Google Drive snapshot changed. Re-merging changes.'
        );
      }
      const versionChanged =
        remoteVersion !== null &&
        latestPrimary.version !== undefined &&
        latestPrimary.version !== remoteVersion;
      const timeChanged =
        remoteModifiedTime !== null &&
        latestPrimary.modifiedTime !== undefined &&
        latestPrimary.modifiedTime !== remoteModifiedTime;
      const knownDuplicates = new Set(duplicateFileIds);
      const unexpectedDuplicate = latestFiles.some(
        (f) => f.id !== remoteFileId && !knownDuplicates.has(f.id)
      );
      if (versionChanged || timeChanged || unexpectedDuplicate) {
        throw new ConcurrentSyncError(
          'Another device updated Google Drive while you were reviewing.'
        );
      }
    }

    await this.uploadMultipartSnapshot(token, remoteFileId, mergedBytes);
    this.lastSyncedBytes = mergedBytes;

    for (const dupId of duplicateFileIds) {
      await this.deleteDriveFileBestEffort(token, dupId);
    }

    if (remoteFileId !== null) {
      await this.pruneOldRevisionsBestEffort(token, remoteFileId, MAX_REVISIONS_TO_KEEP);
    }
  }

  public async listRevisions(
    mode: SessionMode | null,
    accessToken: string | null
  ): Promise<DriveRevisionListResult> {
    const token = this.ensureGoogleAccess(mode, accessToken);
    const remoteFiles = await this.findSnapshotFiles(token);
    if (remoteFiles.length === 0) {
      return { fileId: null, revisions: [] };
    }
    const primary = remoteFiles[0];
    const revisions = await this.fetchRevisionsForFile(token, primary.id);
    return { fileId: primary.id, revisions };
  }

  public async inspectRevision(
    mode: SessionMode | null,
    accessToken: string | null,
    fileId: string,
    revisionId: string
  ): Promise<DriveRevisionInspectResult> {
    const token = this.ensureGoogleAccess(mode, accessToken);
    const bytes = await this.downloadRevisionBytes(token, fileId, revisionId);
    if (bytes.byteLength === 0) {
      throw new NonRetryableError('Selected Drive revision is empty.');
    }

    let snapshot: DomainSnapshot;
    try {
      snapshot = SnapshotCodec.unpack(bytes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Corrupt revision';
      throw new NonRetryableError(`Selected Drive revision could not be read (${message}).`);
    }

    return {
      fileId,
      revisionId,
      snapshot,
      bytes,
      summary: this.buildSummary(snapshot, bytes.byteLength),
    };
  }

  public async restoreRevision(
    mode: SessionMode | null,
    accessToken: string | null,
    fileId: string,
    revisionId: string,
    localSnapshot: DomainSnapshot
  ): Promise<DriveRevisionRestoreResult> {
    const token = this.ensureGoogleAccess(mode, accessToken);
    const inspected = await this.inspectRevision(mode, accessToken, fileId, revisionId);

    const againstSnapshots: DomainSnapshot[] = [localSnapshot];
    try {
      const headBytes = await this.downloadSnapshotBytes(token, fileId);
      if (headBytes.byteLength > 0) {
        againstSnapshots.push(SnapshotCodec.unpack(headBytes));
      }
    } catch {
      // Current remote HEAD might be the corrupted file we are rolling back from.
    }

    const restoredSnapshot = SnapshotMerger.rebaseForRestore(
      inspected.snapshot,
      againstSnapshots
    );
    const restoredBytes = SnapshotCodec.pack(restoredSnapshot);

    await this.uploadMultipartSnapshot(token, fileId, restoredBytes);
    this.lastSyncedBytes = restoredBytes;
    await this.pruneOldRevisionsBestEffort(token, fileId, MAX_REVISIONS_TO_KEEP);

    return {
      fileId,
      revisionId,
      restoredSnapshot,
      restoredBytes,
      summary: this.buildSummary(restoredSnapshot, restoredBytes.byteLength),
    };
  }

  public resetUploadCache(): void {
    this.lastSyncedBytes = null;
  }
}

import { DomainSnapshot, SessionMode } from '../types/domain';
import { Helpers, NonRetryableError } from '../utils/helpers';
import { SnapshotCodec } from './snapshot-codec';
import { SnapshotMerger } from './snapshot-merger';

const SNAPSHOT_FILENAME = 'habits-snapshot.bin';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

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

export interface SyncPreparationResult {
  status: 'up-to-date' | 'needs-upload-confirm';
  mergedSnapshot: DomainSnapshot;
  mergedBytes: Uint8Array;
  remoteFileId: string | null;
  remoteVersion: string | null;
  remoteModifiedTime: string | null;
  localChanged: boolean;
  summary: {
    habitsCount: number;
    checkinsCount: number;
    notesCount: number;
    tasksCount: number;
    byteSize: number;
  };
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

  private async findSnapshotFile(token: string): Promise<DriveFileMeta | null> {
    const query = encodeURIComponent(`name='${SNAPSHOT_FILENAME}' and trashed=false`);
    const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime,version)&pageSize=1`;

    return Helpers.withRetry(async () => {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await this.handleResponseError(res);
      }
      const data = (await res.json()) as { files?: DriveFileMeta[] };
      return data.files && data.files.length > 0 ? data.files[0] : null;
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

  private buildSummary(snapshot: DomainSnapshot, byteSize: number) {
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

    const remoteFile = await this.findSnapshotFile(token);

    if (!remoteFile) {
      return {
        status: 'needs-upload-confirm',
        mergedSnapshot: localSnapshot,
        mergedBytes: localBytes,
        remoteFileId: null,
        remoteVersion: null,
        remoteModifiedTime: null,
        localChanged: false,
        summary: this.buildSummary(localSnapshot, localBytes.byteLength),
      };
    }

    const remoteBytes = await this.downloadSnapshotBytes(token, remoteFile.id);
    if (remoteBytes.byteLength === 0) {
      throw new NonRetryableError(
        'Remote Drive snapshot is empty. Local data was kept intact.'
      );
    }

    let remoteSnapshot: DomainSnapshot;
    try {
      remoteSnapshot = SnapshotCodec.unpack(remoteBytes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Corrupt snapshot';
      throw new NonRetryableError(
        `Remote Drive snapshot could not be read (${message}). Local data was kept intact.`
      );
    }

    const mergedSnapshot = SnapshotMerger.merge(localSnapshot, remoteSnapshot);
    const mergedBytes = SnapshotCodec.pack(mergedSnapshot);

    const localChanged = !Helpers.bytesEqual(localBytes, mergedBytes);
    const remoteDiffers = !Helpers.bytesEqual(remoteBytes, mergedBytes);
    const matchesLastUpload =
      this.lastSyncedBytes !== null && Helpers.bytesEqual(this.lastSyncedBytes, mergedBytes);

    if (!remoteDiffers || (matchesLastUpload && !localChanged)) {
      this.lastSyncedBytes = mergedBytes;
      return {
        status: 'up-to-date',
        mergedSnapshot,
        mergedBytes,
        remoteFileId: remoteFile.id,
        remoteVersion: remoteFile.version ?? null,
        remoteModifiedTime: remoteFile.modifiedTime ?? null,
        localChanged,
        summary: this.buildSummary(mergedSnapshot, mergedBytes.byteLength),
      };
    }

    return {
      status: 'needs-upload-confirm',
      mergedSnapshot,
      mergedBytes,
      remoteFileId: remoteFile.id,
      remoteVersion: remoteFile.version ?? null,
      remoteModifiedTime: remoteFile.modifiedTime ?? null,
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
    const { mergedBytes, remoteFileId, remoteVersion, remoteModifiedTime } = preparation;

    if (
      this.lastSyncedBytes &&
      Helpers.bytesEqual(this.lastSyncedBytes, mergedBytes) &&
      remoteFileId
    ) {
      return;
    }

    // Optimistic concurrency check: verify remote file wasn't created or updated since prepareSync
    const latestRemote = await this.findSnapshotFile(token);
    if (remoteFileId === null && latestRemote !== null) {
      throw new ConcurrentSyncError(
        'Another device created a Google Drive snapshot while you were reviewing.'
      );
    }
    if (remoteFileId !== null) {
      if (!latestRemote || latestRemote.id !== remoteFileId) {
        throw new ConcurrentSyncError(
          'Remote Google Drive snapshot changed. Re-merging changes.'
        );
      }
      const versionChanged =
        remoteVersion !== null &&
        latestRemote.version !== undefined &&
        latestRemote.version !== remoteVersion;
      const timeChanged =
        remoteModifiedTime !== null &&
        latestRemote.modifiedTime !== undefined &&
        latestRemote.modifiedTime !== remoteModifiedTime;
      if (versionChanged || timeChanged) {
        throw new ConcurrentSyncError(
          'Another device updated Google Drive while you were reviewing.'
        );
      }
    }

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
      headerPart.byteLength + mergedBytes.byteLength + footerPart.byteLength
    );
    body.set(headerPart, 0);
    body.set(mergedBytes, headerPart.byteLength);
    body.set(footerPart, headerPart.byteLength + mergedBytes.byteLength);

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

    this.lastSyncedBytes = mergedBytes;
  }

  public resetUploadCache(): void {
    this.lastSyncedBytes = null;
  }
}

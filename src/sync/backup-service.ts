import { DomainSnapshot } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { SnapshotCodec } from './snapshot-codec';
import { SnapshotMerger } from './snapshot-merger';

export interface BackupImportResult {
  mergedSnapshot: DomainSnapshot;
  importedCounts: {
    habits: number;
    checkins: number;
    notes: number;
    tasks: number;
  };
}

export class BackupService {
  public static buildFilename(todayDay: number): string {
    return `habits-backup-${CivilCalendar.toInputDateValue(todayDay)}.bin`;
  }

  public static exportBytes(snapshot: DomainSnapshot): Uint8Array {
    return SnapshotCodec.pack(snapshot);
  }

  public static importBytes(
    localSnapshot: DomainSnapshot,
    fileBytes: Uint8Array
  ): BackupImportResult {
    const importedSnapshot = SnapshotCodec.unpack(fileBytes);
    const mergedSnapshot = SnapshotMerger.merge(localSnapshot, importedSnapshot);
    return {
      mergedSnapshot,
      importedCounts: {
        habits: importedSnapshot.habits.length,
        checkins: importedSnapshot.checkins.length,
        notes: importedSnapshot.notes.length,
        tasks: importedSnapshot.tasks.filter((t) => t.deletedAt === null).length,
      },
    };
  }
}

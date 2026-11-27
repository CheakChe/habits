import { JSX, Show } from 'solid-js';
import { SyncPreparationResult } from '../../sync/drive-sync-service';
import { Helpers } from '../../utils/helpers';
import { CloudSyncIcon } from '../Icons';
import { ModalShell } from './ModalShell';

interface SyncConfirmModalProps {
  pending: SyncPreparationResult | null;
  uploading: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

export function SyncConfirmModal(props: SyncConfirmModalProps): JSX.Element {
  return (
    <Show when={props.pending}>
      {(pending) => (
        <ModalShell
          open={true}
          titleId="sync-confirm-title"
          busy={props.uploading}
          onClose={() => props.onCancel()}
        >
          <div class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-6">
            <div class="flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent-soft">
                <CloudSyncIcon class="h-5 w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <h2 id="sync-confirm-title" class="font-display text-lg font-semibold text-ink">
                  {pending().remoteFileId
                    ? 'Update Google Drive Snapshot?'
                    : 'Create Google Drive Snapshot?'}
                </h2>
                <p class="text-xs text-ink-subtle">
                  {pending().localChanged
                    ? 'Remote changes were merged into your local database. Confirm to upload the unified snapshot.'
                    : 'This will save your current snapshot to your private Google Drive app data folder.'}
                </p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 rounded-2xl border border-white/[0.08] bg-canvas p-4 text-xs">
              <div>
                <span class="block text-ink-subtle">Habits</span>
                <span class="font-mono text-base font-medium text-ink tabular-nums">
                  {pending().summary.habitsCount}
                </span>
              </div>
              <div>
                <span class="block text-ink-subtle">Check-ins</span>
                <span class="font-mono text-base font-medium text-ink tabular-nums">
                  {pending().summary.checkinsCount}
                </span>
              </div>
              <div>
                <span class="block text-ink-subtle">Day Notes</span>
                <span class="font-mono text-base font-medium text-ink tabular-nums">
                  {pending().summary.notesCount}
                </span>
              </div>
              <div>
                <span class="block text-ink-subtle">Tasks · Snapshot Size</span>
                <span
                  class="font-mono text-base font-medium text-ink tabular-nums"
                  title={
                    pending().summary.byteSize >= 1024
                      ? `${pending().summary.byteSize} B`
                      : undefined
                  }
                >
                  {pending().summary.tasksCount} ·{' '}
                  {Helpers.formatByteSize(pending().summary.byteSize)}
                </span>
              </div>
            </div>

            <Show when={(pending().duplicateFileIds?.length ?? 0) > 0}>
              <div class="rounded-xl border border-accent/25 bg-accent/10 px-3.5 py-2.5 text-xs text-accent-tint">
                Detected {pending().duplicateFileIds!.length} duplicate snapshot{' '}
                {pending().duplicateFileIds!.length === 1 ? 'file' : 'files'} in Google Drive. All
                records were merged and duplicates will be cleaned up after upload.
              </div>
            </Show>
          </div>

          <div class="flex shrink-0 items-center justify-end gap-3 border-t border-white/[0.06] bg-surface px-6 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6">
            <button
              type="button"
              onClick={() => props.onCancel()}
              disabled={props.uploading}
              class="h-10 cursor-pointer rounded-xl px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void props.onConfirm()}
              disabled={props.uploading}
              class="h-10 cursor-pointer rounded-xl bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {props.uploading
                ? 'Uploading...'
                : pending().remoteFileId
                  ? 'Update Snapshot'
                  : 'Upload Snapshot'}
            </button>
          </div>
        </ModalShell>
      )}
    </Show>
  );
}

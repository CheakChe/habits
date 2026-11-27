import { For, JSX, Show } from 'solid-js';
import {
  DriveRevisionInspectResult,
  DriveRevisionMeta,
  MAX_REVISIONS_TO_KEEP,
} from '../../sync/drive-sync-service';
import { Helpers } from '../../utils/helpers';
import { HistoryClockIcon, RestoreIcon } from '../Icons';
import { ModalHeader, ModalShell } from './ModalShell';

interface DriveRevisionsModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  revisions: DriveRevisionMeta[];
  inspectingRevisionId: string | null;
  inspectedRevision: DriveRevisionInspectResult | null;
  restoring: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onInspect: (revisionId: string) => Promise<void>;
  onRestore: (revisionId: string) => Promise<void>;
}

function formatRevisionTime(iso?: string): string {
  if (!iso) return 'Unknown date';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function DriveRevisionsModal(props: DriveRevisionsModalProps): JSX.Element {
  return (
    <ModalShell
      open={props.open}
      titleId="revisions-modal-title"
      busy={props.restoring}
      closeOnBackdrop={true}
      maxWidthClass="sm:max-w-lg"
      onClose={() => props.onClose()}
    >
      <ModalHeader
        titleId="revisions-modal-title"
        title="Drive Version History"
        subtitle={`Up to the latest ${MAX_REVISIONS_TO_KEEP} versions are kept automatically in Google Drive.`}
        icon={<HistoryClockIcon class="h-4 w-4" />}
        onClose={() => props.onClose()}
        closeDisabled={props.restoring}
        compactHorizontal={true}
      />

      <Show when={props.error}>
        {(msg) => (
          <div class="break-anywhere mx-5 mt-3 shrink-0 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs text-danger-soft sm:mx-6">
            {msg()}
          </div>
        )}
      </Show>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        <Show
          when={!props.loading}
          fallback={
            <div class="rounded-2xl border border-white/[0.08] bg-canvas p-8 text-center text-xs text-ink-subtle">
              Loading snapshot revisions from Google Drive...
            </div>
          }
        >
          <Show
            when={props.revisions.length > 0}
            fallback={
              <div class="space-y-2 rounded-2xl border border-white/[0.08] bg-canvas p-8 text-center">
                <p class="text-sm font-medium text-ink">No Drive versions yet</p>
                <p class="text-xs text-ink-subtle">
                  Run Sync Drive at least once to create your first cloud snapshot revision.
                </p>
              </div>
            }
          >
            <div class="space-y-2">
              <For each={props.revisions}>
                {(rev, index) => {
                  const isCurrent = () => index() === 0;
                  const isSelected = () => props.inspectedRevision?.revisionId === rev.id;
                  const isInspecting = () => props.inspectingRevisionId === rev.id;
                  return (
                    <div
                      class={`rounded-2xl border p-3.5 transition-colors ${
                        isSelected()
                          ? 'border-accent/45 bg-surface-info'
                          : 'border-white/[0.08] bg-canvas'
                      }`}
                    >
                      <div class="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap sm:items-center">
                        <div class="min-w-0 flex-1 space-y-0.5">
                          <div class="flex flex-wrap items-center gap-2">
                            <span class="text-xs font-medium text-ink">
                              {formatRevisionTime(rev.modifiedTime)}
                            </span>
                            <Show when={isCurrent()}>
                              <span class="shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-tint">
                                Current
                              </span>
                            </Show>
                            <Show when={rev.keepForever}>
                              <span class="shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-tint">
                                Pinned
                              </span>
                            </Show>
                          </div>
                          <p
                            class="break-anywhere font-mono text-[11px] text-ink-subtle tabular-nums"
                            title={
                              rev.size !== undefined &&
                              Number.isFinite(rev.size) &&
                              rev.size >= 1024
                                ? `Rev #${rev.id} · ${Helpers.formatByteSize(rev.size)} (${Math.round(rev.size)} B)`
                                : `Rev #${rev.id} · ${Helpers.formatByteSize(rev.size)}`
                            }
                          >
                            Rev #{rev.id} · {Helpers.formatByteSize(rev.size)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => void props.onInspect(rev.id)}
                          disabled={
                            isInspecting() || props.restoring || props.inspectingRevisionId !== null
                          }
                          class="h-8 shrink-0 cursor-pointer rounded-xl border border-white/[0.08] bg-surface px-3 text-xs font-medium whitespace-nowrap text-ink hover:bg-surface-elevated disabled:opacity-50"
                        >
                          {isInspecting() ? 'Loading...' : isSelected() ? 'Selected' : 'Inspect'}
                        </button>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={props.inspectedRevision}>
          {(inspected) => {
            const isLatest = () => props.revisions[0]?.id === inspected().revisionId;
            return (
              <div class="space-y-3 rounded-2xl border border-accent/30 bg-canvas p-4">
                <div class="flex items-start justify-between gap-3">
                  <span class="break-anywhere min-w-0 flex-1 text-xs font-medium text-ink">
                    Revision #{inspected().revisionId} Contents
                  </span>
                  <span
                    class="shrink-0 font-mono text-[11px] whitespace-nowrap text-ink-subtle tabular-nums"
                    title={
                      inspected().summary.byteSize >= 1024
                        ? `${inspected().summary.byteSize} B`
                        : undefined
                    }
                  >
                    {Helpers.formatByteSize(inspected().summary.byteSize)}
                  </span>
                </div>

                <div class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div class="min-w-0 rounded-xl bg-surface p-2.5">
                    <span class="block text-[11px] text-ink-subtle">Habits</span>
                    <span class="font-mono font-medium text-ink tabular-nums">
                      {inspected().summary.habitsCount}
                    </span>
                  </div>
                  <div class="min-w-0 rounded-xl bg-surface p-2.5">
                    <span class="block text-[11px] text-ink-subtle">Check-ins</span>
                    <span class="font-mono font-medium text-ink tabular-nums">
                      {inspected().summary.checkinsCount}
                    </span>
                  </div>
                  <div class="min-w-0 rounded-xl bg-surface p-2.5">
                    <span class="block text-[11px] text-ink-subtle">Notes</span>
                    <span class="font-mono font-medium text-ink tabular-nums">
                      {inspected().summary.notesCount}
                    </span>
                  </div>
                  <div class="min-w-0 rounded-xl bg-surface p-2.5">
                    <span class="block text-[11px] text-ink-subtle">Tasks</span>
                    <span class="font-mono font-medium text-ink tabular-nums">
                      {inspected().summary.tasksCount}
                    </span>
                  </div>
                </div>

                <p class="text-[11px] leading-relaxed text-ink-subtle">
                  {isLatest()
                    ? 'This is the current latest version on Google Drive. Restoring it overwrites your local IndexedDB with this snapshot.'
                    : 'Restoring replaces your local IndexedDB with this snapshot and saves it as a new latest version on Google Drive (your previous state remains in version history).'}
                </p>

                <div class="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void props.onRestore(inspected().revisionId)}
                    disabled={props.restoring}
                    class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                  >
                    <RestoreIcon class="h-3.5 w-3.5 shrink-0" />
                    <span>{props.restoring ? 'Restoring...' : 'Restore This Version'}</span>
                  </button>
                </div>
              </div>
            );
          }}
        </Show>
      </div>

      <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] bg-surface px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
        <button
          type="button"
          onClick={() => void props.onRefresh()}
          disabled={props.loading || props.restoring}
          class="h-9 cursor-pointer rounded-xl border border-white/[0.08] bg-surface-elevated px-3.5 text-xs font-medium text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => props.onClose()}
          disabled={props.restoring}
          class="h-9 cursor-pointer rounded-xl px-4 text-xs font-medium text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}

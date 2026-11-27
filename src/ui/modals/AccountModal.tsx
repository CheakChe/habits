import { JSX, Show, createEffect, createSignal } from 'solid-js';
import { SessionMode } from '../../types/domain';
import {
  BellIcon,
  DownloadIcon,
  DriveIcon,
  HistoryClockIcon,
  SwitchAccountIcon,
  UploadIcon,
} from '../Icons';
import { PWAInstallButton } from '../PwaControls';
import { ModalHeader, ModalShell } from './ModalShell';

interface AccountModalProps {
  open: boolean;
  mode: SessionMode;
  hasGoogleToken: boolean;
  googleEmail: string | null;
  onClose: () => void;
  onConnectGoogle: () => Promise<void>;
  onSwitchToEntry: () => Promise<void>;
  onExportBackup: () => Promise<{ filename: string; bytes: Uint8Array }>;
  onImportBackup: (bytes: Uint8Array) => Promise<void>;
  onOpenRevisions?: () => Promise<void>;
  onOpenReminders?: () => void;
}

export function AccountModal(props: AccountModalProps): JSX.Element {
  const [busy, setBusy] = createSignal(false);
  const [backupError, setBackupError] = createSignal<string | null>(null);
  let fileInputRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (props.open) {
      setBackupError(null);
    }
  });

  const handleConnect = async () => {
    setBusy(true);
    try {
      await props.onConnectGoogle();
      props.onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleSwitch = async () => {
    setBusy(true);
    try {
      await props.onSwitchToEntry();
      props.onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    setBackupError(null);
    try {
      const { filename, bytes } = await props.onExportBackup();
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      props.onClose();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to export backup.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setBusy(true);
    setBackupError(null);
    try {
      const buffer = await file.arrayBuffer();
      await props.onImportBackup(new Uint8Array(buffer));
      props.onClose();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Could not read backup file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={props.open}
      titleId="account-modal-title"
      busy={busy()}
      closeOnBackdrop={true}
      maxWidthClass="sm:max-w-sm"
      onClose={() => props.onClose()}
    >
      <ModalHeader
        titleId="account-modal-title"
        title="Workspace & Sync Mode"
        onClose={() => props.onClose()}
      />

      <div class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
        <div class="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-canvas p-4">
          <DriveIcon class="mt-0.5 h-5 w-5 shrink-0 text-accent-soft" />
          <div class="min-w-0 flex-1 space-y-1">
            <p class="text-sm font-medium text-ink">
              {props.mode === 'google' ? 'Google Drive & Calendar Mode' : 'Local Guest Mode'}
            </p>
            <Show when={props.mode === 'google' && props.googleEmail}>
              <p class="break-anywhere font-mono text-xs text-accent-soft">{props.googleEmail}</p>
            </Show>
            <p class="text-xs leading-relaxed text-ink-subtle">
              {props.mode === 'google'
                ? props.hasGoogleToken
                  ? 'Connected to Google Drive and Calendar. Local edits stay in IndexedDB until you sync.'
                  : 'Local IndexedDB is active. Reconnect Google whenever you want to sync Drive or Calendar reminders.'
                : 'All habits, check-ins, notes, and tasks are stored solely in your browser IndexedDB.'}
            </p>
          </div>
        </div>

        <div class="space-y-3 rounded-2xl border border-white/[0.08] bg-canvas p-4">
          <div class="space-y-0.5">
            <p class="text-xs font-medium text-ink">Local Backup (.bin)</p>
            <p class="text-[11px] text-ink-subtle">
              Export a snapshot file or safely merge an existing backup into this device.
            </p>
          </div>

          <Show when={backupError()}>
            {(msg) => (
              <div class="break-anywhere rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger-soft">
                {msg()}
              </div>
            )}
          </Show>

          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={busy()}
              class="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-surface px-3 text-xs font-medium whitespace-nowrap text-ink transition-colors hover:bg-surface-elevated disabled:opacity-50"
            >
              <DownloadIcon class="h-3.5 w-3.5 text-accent-soft" />
              <span>Export .bin</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef?.click()}
              disabled={busy()}
              class="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-surface px-3 text-xs font-medium whitespace-nowrap text-ink transition-colors hover:bg-surface-elevated disabled:opacity-50"
            >
              <UploadIcon class="h-3.5 w-3.5 text-accent-soft" />
              <span>Import .bin</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".bin,application/octet-stream"
              onChange={(e) => void handleFileChange(e)}
              class="hidden"
            />
          </div>
        </div>

        <div class="space-y-2.5">
          <Show when={props.mode === 'google' && !props.hasGoogleToken}>
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={busy()}
              class="h-11 w-full cursor-pointer rounded-xl bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {busy()
                ? 'Connecting...'
                : props.googleEmail
                  ? `Reconnect (${props.googleEmail})`
                  : 'Reconnect Google Account'}
            </button>
          </Show>
          <Show when={props.onOpenReminders}>
            <button
              type="button"
              onClick={() => props.onOpenReminders?.()}
              disabled={busy()}
              class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-surface-elevated text-sm font-medium text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              <BellIcon class="h-4 w-4 text-accent-soft" />
              <span>Reminders &amp; App Badge</span>
            </button>
          </Show>
          <Show when={props.mode === 'google' && props.onOpenRevisions}>
            <button
              type="button"
              onClick={() => void props.onOpenRevisions?.()}
              disabled={busy()}
              class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-surface-elevated text-sm font-medium text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              <HistoryClockIcon class="h-4 w-4 text-accent-soft" />
              <span>Drive Version History</span>
            </button>
          </Show>
          <PWAInstallButton variant="full" />
          <button
            type="button"
            onClick={() => void handleSwitch()}
            disabled={busy()}
            class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-surface-elevated text-sm font-medium text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            <SwitchAccountIcon class="h-4 w-4 text-ink-subtle" />
            <span>Switch Account or Mode</span>
          </button>
          <div class="pt-1 text-center">
            <a
              href="./privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-ink-subtle hover:text-ink hover:underline"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

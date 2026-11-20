import { For, JSX, Show, createEffect, createSignal } from 'solid-js';
import { SyncPreparationResult } from '../sync/drive-sync-service';
import { Habit, SessionMode, Task } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { DatePicker } from './CustomControls';
import { CloseIcon, CloudSyncIcon, DriveIcon, SwitchAccountIcon } from './Icons';
import { ALL_WEEKDAYS_MASK, DEFAULT_HABIT_COLOR, HABIT_COLORS } from './constants';

interface HabitModalProps {
  open: boolean;
  editingHabit: Habit | null;
  todayDay: number;
  onClose: () => void;
  onSave: (data: {
    name: string;
    color: string;
    weekdays: number;
    startDay: number;
  }) => Promise<void>;
}

export function HabitModal(props: HabitModalProps): JSX.Element {
  const [name, setName] = createSignal('');
  const [color, setColor] = createSignal(DEFAULT_HABIT_COLOR);
  const [weekdays, setWeekdays] = createSignal(ALL_WEEKDAYS_MASK);
  const [startDay, setStartDay] = createSignal<number>(props.todayDay);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    const habit = props.editingHabit;
    if (habit) {
      setName(habit.name);
      setColor(habit.color);
      setWeekdays(habit.weekdays);
      setStartDay(habit.startDay);
    } else {
      setName('');
      setColor(DEFAULT_HABIT_COLOR);
      setWeekdays(ALL_WEEKDAYS_MASK);
      setStartDay(props.todayDay);
    }
    setError(null);
  });

  const toggleWeekday = (bit: number) => {
    setWeekdays((prev) => prev ^ (1 << bit));
  };

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const trimmed = name().trim();
    if (!trimmed) {
      setError('Enter a habit name.');
      return;
    }
    if ((weekdays() & 0x7f) === 0) {
      setError('Select at least one scheduled day.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await props.onSave({
        name: trimmed,
        color: color(),
        weekdays: weekdays() & 0x7f,
        startDay: startDay(),
      });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save habit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="habit-modal-title"
      >
        <div class="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#14161B] border border-white/[0.08] p-6 space-y-5">
          <div class="flex items-center justify-between">
            <h2 id="habit-modal-title" class="font-display text-lg font-semibold text-[#F5F7FA]">
              {props.editingHabit ? 'Edit Habit' : 'New Habit'}
            </h2>
            <button
              type="button"
              onClick={() => props.onClose()}
              aria-label="Close modal"
              class="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <CloseIcon class="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} class="space-y-5">
            <Show when={error()}>
              {(msg) => (
                <div class="rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/25 px-3.5 py-2.5 text-xs text-[#FCA5A5]">
                  {msg()}
                </div>
              )}
            </Show>

            <div class="space-y-1.5">
              <label for="habit-name" class="block text-xs font-medium text-[#9AA1B1]">
                Name
              </label>
              <input
                id="habit-name"
                type="text"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="Morning run, Read 20 pages..."
                autofocus
                class="w-full h-11 rounded-xl bg-[#0A0B0E] border border-white/[0.1] px-3.5 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:outline-none focus:border-[#3B82F6]"
              />
            </div>

            <div class="space-y-2">
              <span class="block text-xs font-medium text-[#9AA1B1]">Accent color</span>
              <div class="flex items-center gap-2.5 flex-wrap">
                <For each={HABIT_COLORS}>
                  {(preset) => {
                    const selected = () =>
                      color().toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        type="button"
                        onClick={() => setColor(preset.hex)}
                        aria-label={preset.label}
                        aria-pressed={selected()}
                        class={`w-8 h-8 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                          selected()
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-[#14161B] scale-105'
                            : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{ 'background-color': preset.hex }}
                      />
                    );
                  }}
                </For>
              </div>
            </div>

            <div class="space-y-2">
              <span class="block text-xs font-medium text-[#9AA1B1]">Scheduled days</span>
              <div class="grid grid-cols-7 gap-1.5">
                <For each={[0, 1, 2, 3, 4, 5, 6]}>
                  {(bit) => {
                    const active = () => (weekdays() & (1 << bit)) !== 0;
                    return (
                      <button
                        type="button"
                        onClick={() => toggleWeekday(bit)}
                        aria-pressed={active()}
                        class={`min-h-[40px] rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                          active()
                            ? 'bg-[#3B82F6] text-white'
                            : 'bg-[#0A0B0E] border border-white/[0.08] text-[#8E95A5] hover:text-[#F5F7FA]'
                        }`}
                      >
                        {CivilCalendar.weekdayShortLabel(bit)}
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>

            <div class="space-y-1.5">
              <label for="habit-start" class="block text-xs font-medium text-[#9AA1B1]">
                Start date
              </label>
              <DatePicker
                id="habit-start"
                value={startDay()}
                todayDay={props.todayDay}
                onChange={(d) => {
                  if (d !== null) setStartDay(d);
                }}
                placement="top"
              />
            </div>

            <div class="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => props.onClose()}
                class="h-10 px-4 rounded-xl text-sm font-medium text-[#9AA1B1] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving()}
                class="h-10 px-5 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving() ? 'Saving...' : props.editingHabit ? 'Save Changes' : 'Create Habit'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
}

interface TaskModalProps {
  open: boolean;
  editingTask: Task | null;
  todayDay: number;
  onClose: () => void;
  onSave: (data: { title: string; note: string; dueDay: number | null }) => Promise<void>;
}

export function TaskModal(props: TaskModalProps): JSX.Element {
  const [title, setTitle] = createSignal('');
  const [note, setNote] = createSignal('');
  const [dueDay, setDueDay] = createSignal<number | null>(props.todayDay);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    const task = props.editingTask;
    if (task) {
      setTitle(task.title);
      setNote(task.note);
      setDueDay(task.dueDay);
    } else {
      setTitle('');
      setNote('');
      setDueDay(props.todayDay);
    }
    setError(null);
  });

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const trimmed = title().trim();
    if (!trimmed) {
      setError('Enter a task title.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await props.onSave({ title: trimmed, note: note().trim(), dueDay: dueDay() });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
      >
        <div class="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#14161B] border border-white/[0.08] p-6 space-y-5">
          <div class="flex items-center justify-between">
            <h2 id="task-modal-title" class="font-display text-lg font-semibold text-[#F5F7FA]">
              {props.editingTask ? 'Edit Task' : 'New Task'}
            </h2>
            <button
              type="button"
              onClick={() => props.onClose()}
              aria-label="Close modal"
              class="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <CloseIcon class="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} class="space-y-4">
            <Show when={error()}>
              {(msg) => (
                <div class="rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/25 px-3.5 py-2.5 text-xs text-[#FCA5A5]">
                  {msg()}
                </div>
              )}
            </Show>

            <div class="space-y-1.5">
              <label for="task-title" class="block text-xs font-medium text-[#9AA1B1]">
                Title
              </label>
              <input
                id="task-title"
                type="text"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder="Prepare weekly review..."
                autofocus
                class="w-full h-11 rounded-xl bg-[#0A0B0E] border border-white/[0.1] px-3.5 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:outline-none focus:border-[#3B82F6]"
              />
            </div>

            <div class="space-y-1.5">
              <label for="task-note" class="block text-xs font-medium text-[#9AA1B1]">
                Note (optional)
              </label>
              <textarea
                id="task-note"
                rows={3}
                value={note()}
                onInput={(e) => setNote(e.currentTarget.value)}
                placeholder="Additional details..."
                class="w-full rounded-xl bg-[#0A0B0E] border border-white/[0.1] p-3.5 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:outline-none focus:border-[#3B82F6] resize-none"
              />
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="task-due" class="text-xs font-medium text-[#9AA1B1]">
                  Due date
                </label>
                <div class="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setDueDay(props.todayDay)}
                    class="text-[#60A5FA] hover:underline cursor-pointer"
                  >
                    Today
                  </button>
                  <span aria-hidden="true" class="text-[#5B6270]">·</span>
                  <button
                    type="button"
                    onClick={() => setDueDay(props.todayDay + 1)}
                    class="text-[#9AA1B1] hover:text-[#F5F7FA] cursor-pointer"
                  >
                    Tomorrow
                  </button>
                  <span aria-hidden="true" class="text-[#5B6270]">·</span>
                  <button
                    type="button"
                    onClick={() => setDueDay(null)}
                    class="text-[#9AA1B1] hover:text-[#F5F7FA] cursor-pointer"
                  >
                    No date
                  </button>
                </div>
              </div>
              <DatePicker
                id="task-due"
                value={dueDay()}
                todayDay={props.todayDay}
                onChange={(d) => setDueDay(d)}
                allowClear={true}
                placeholder="No due date"
                placement="top"
              />
            </div>

            <div class="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => props.onClose()}
                class="h-10 px-4 rounded-xl text-sm font-medium text-[#9AA1B1] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving()}
                class="h-10 px-5 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving() ? 'Saving...' : props.editingTask ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
}

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
        <div
          class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sync-confirm-title"
        >
          <div class="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#14161B] border border-white/[0.08] p-6 space-y-5">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center text-[#60A5FA] shrink-0">
                <CloudSyncIcon class="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="sync-confirm-title"
                  class="font-display text-lg font-semibold text-[#F5F7FA]"
                >
                  {pending().remoteFileId
                    ? 'Update Google Drive Snapshot?'
                    : 'Create Google Drive Snapshot?'}
                </h2>
                <p class="text-xs text-[#8E95A5]">
                  {pending().localChanged
                    ? 'Remote changes were merged into your local database. Confirm to upload the unified snapshot.'
                    : 'This will save your current snapshot to your private Google Drive app data folder.'}
                </p>
              </div>
            </div>

            <div class="rounded-2xl bg-[#0A0B0E] border border-white/[0.08] p-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span class="text-[#8E95A5] block">Habits</span>
                <span class="text-base font-mono tabular-nums font-medium text-[#F5F7FA]">
                  {pending().summary.habitsCount}
                </span>
              </div>
              <div>
                <span class="text-[#8E95A5] block">Check-ins</span>
                <span class="text-base font-mono tabular-nums font-medium text-[#F5F7FA]">
                  {pending().summary.checkinsCount}
                </span>
              </div>
              <div>
                <span class="text-[#8E95A5] block">Day Notes</span>
                <span class="text-base font-mono tabular-nums font-medium text-[#F5F7FA]">
                  {pending().summary.notesCount}
                </span>
              </div>
              <div>
                <span class="text-[#8E95A5] block">Tasks · Snapshot Size</span>
                <span class="text-base font-mono tabular-nums font-medium text-[#F5F7FA]">
                  {pending().summary.tasksCount} · {pending().summary.byteSize} B
                </span>
              </div>
            </div>

            <div class="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => props.onCancel()}
                disabled={props.uploading}
                class="h-10 px-4 rounded-xl text-sm font-medium text-[#9AA1B1] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void props.onConfirm()}
                disabled={props.uploading}
                class="h-10 px-5 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {props.uploading
                  ? 'Uploading...'
                  : pending().remoteFileId
                    ? 'Update Snapshot'
                    : 'Upload Snapshot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}

interface AccountModalProps {
  open: boolean;
  mode: SessionMode;
  hasGoogleToken: boolean;
  onClose: () => void;
  onConnectGoogle: () => Promise<void>;
  onSwitchToEntry: () => Promise<void>;
}

export function AccountModal(props: AccountModalProps): JSX.Element {
  const [busy, setBusy] = createSignal(false);

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

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
      >
        <div class="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#14161B] border border-white/[0.08] p-6 space-y-5">
          <div class="flex items-center justify-between">
            <h2 id="account-modal-title" class="font-display text-lg font-semibold text-[#F5F7FA]">
              Workspace &amp; Sync Mode
            </h2>
            <button
              type="button"
              onClick={() => props.onClose()}
              aria-label="Close modal"
              class="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <CloseIcon class="w-4 h-4" />
            </button>
          </div>

          <div class="rounded-2xl bg-[#0A0B0E] border border-white/[0.08] p-4 flex items-start gap-3">
            <DriveIcon class="w-5 h-5 text-[#60A5FA] shrink-0 mt-0.5" />
            <div class="space-y-1">
              <p class="text-sm font-medium text-[#F5F7FA]">
                {props.mode === 'google' ? 'Google Drive Sync Mode' : 'Local Guest Mode'}
              </p>
              <p class="text-xs text-[#8E95A5] leading-relaxed">
                {props.mode === 'google'
                  ? props.hasGoogleToken
                    ? 'Connected to Google Drive app data storage. Local edits stay in IndexedDB until you sync.'
                    : 'Local IndexedDB is active. Reconnect Google Drive whenever you want to sync snapshots.'
                  : 'All habits, check-ins, notes, and tasks are stored solely in your browser IndexedDB.'}
              </p>
            </div>
          </div>

          <div class="space-y-2.5">
            <Show when={props.mode === 'google' && !props.hasGoogleToken}>
              <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={busy()}
                class="w-full h-11 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy() ? 'Connecting...' : 'Reconnect Google Drive'}
              </button>
            </Show>
            <button
              type="button"
              onClick={() => void handleSwitch()}
              disabled={busy()}
              class="w-full h-11 rounded-xl bg-[#1C1F26] hover:bg-[#252933] border border-white/[0.08] text-sm font-medium text-[#F5F7FA] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <SwitchAccountIcon class="w-4 h-4 text-[#8E95A5]" />
              <span>Switch Account or Mode</span>
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

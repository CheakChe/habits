import { For, JSX, Show, createEffect, createSignal } from 'solid-js';
import {
  DriveRevisionInspectResult,
  DriveRevisionMeta,
  MAX_REVISIONS_TO_KEEP,
  SyncPreparationResult,
} from '../sync/drive-sync-service';
import { Habit, SessionMode, Task } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import {
  HABIT_EMOJIS,
  HABIT_ICONS,
  HabitAppearance,
  HabitBadge as HabitBadgeType,
} from '../utils/habit-appearance';
import { DatePicker } from './CustomControls';
import { HabitBadge, HabitIconSvg } from './HabitBadge';
import {
  CheckIcon,
  CloseIcon,
  CloudSyncIcon,
  DownloadIcon,
  DriveIcon,
  HistoryClockIcon,
  RepeatIcon,
  RestoreIcon,
  SwitchAccountIcon,
  UploadIcon,
} from './Icons';
import { PWAInstallButton } from './PwaControls';
import { ALL_WEEKDAYS_MASK, DEFAULT_HABIT_COLOR, HABIT_COLORS } from './constants';
import { TaskDraftPrefill, TaskModalMode } from './tracker-store';

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
  const [accentColor, setAccentColor] = createSignal(DEFAULT_HABIT_COLOR);
  const [hexInput, setHexInput] = createSignal(DEFAULT_HABIT_COLOR);
  const [badge, setBadge] = createSignal<HabitBadgeType>({ kind: 'none' });
  const [badgeTab, setBadgeTab] = createSignal<'none' | 'icon' | 'emoji'>('none');
  const [weekdays, setWeekdays] = createSignal(ALL_WEEKDAYS_MASK);
  const [startDay, setStartDay] = createSignal<number>(props.todayDay);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    const habit = props.editingHabit;
    if (habit) {
      const parsed = HabitAppearance.parse(habit.color);
      setName(habit.name);
      setAccentColor(parsed.color);
      setHexInput(parsed.color);
      setBadge(parsed.badge);
      setBadgeTab(parsed.badge.kind);
      setWeekdays(habit.weekdays);
      setStartDay(habit.startDay);
    } else {
      setName('');
      setAccentColor(DEFAULT_HABIT_COLOR);
      setHexInput(DEFAULT_HABIT_COLOR);
      setBadge({ kind: 'none' });
      setBadgeTab('none');
      setWeekdays(ALL_WEEKDAYS_MASK);
      setStartDay(props.todayDay);
    }
    setError(null);
  });

  const applyColor = (hex: string) => {
    const normalized = HabitAppearance.normalizeHex(hex);
    if (!normalized) return;
    setAccentColor(normalized);
    setHexInput(normalized);
  };

  const handleHexInput = (raw: string) => {
    setHexInput(raw);
    const normalized = HabitAppearance.normalizeHex(raw);
    if (normalized) {
      setAccentColor(normalized);
    }
  };

  const handleHexBlur = () => {
    const normalized = HabitAppearance.normalizeHex(hexInput());
    if (normalized) {
      setAccentColor(normalized);
      setHexInput(normalized);
    } else {
      setHexInput(accentColor());
    }
  };

  const isHexInputValid = () => HabitAppearance.normalizeHex(hexInput()) !== null;
  const composedAppearance = () => HabitAppearance.format(accentColor(), badge());

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
    const normalizedHex = HabitAppearance.normalizeHex(hexInput());
    if (!normalizedHex) {
      setError('Enter a valid hex color (e.g. #3B82F6).');
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
        color: HabitAppearance.format(normalizedHex, badge()),
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
        <div class="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#14161B] border border-white/[0.08] p-6 space-y-5">
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

            <div class="space-y-3">
              <div class="flex items-center justify-between gap-2">
                <span class="block text-xs font-medium text-[#9AA1B1]">
                  Color &amp; Icon
                </span>
                <div class="flex items-center gap-2 text-xs text-[#C8CDD8] min-w-0">
                  <HabitBadge appearanceRaw={composedAppearance()} size="sm" />
                  <span class="truncate max-w-[140px]">
                    {name().trim() || 'Preview'}
                  </span>
                  <span
                    class="w-5 h-5 rounded-md inline-flex items-center justify-center shrink-0"
                    style={{
                      'background-color': accentColor(),
                      color: HabitAppearance.getContrastTextColor(accentColor()),
                    }}
                    aria-hidden="true"
                  >
                    <CheckIcon class="w-3 h-3" />
                  </span>
                </div>
              </div>

              {/* Preset swatches + native color picker + hex input */}
              <div class="flex items-center gap-2 flex-wrap">
                <For each={HABIT_COLORS}>
                  {(preset) => {
                    const selected = () =>
                      accentColor().toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        type="button"
                        onClick={() => applyColor(preset.hex)}
                        aria-label={preset.label}
                        aria-pressed={selected()}
                        class={`w-7 h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center shrink-0 ${
                          selected()
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-[#14161B] scale-105'
                            : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{ 'background-color': preset.hex }}
                      />
                    );
                  }}
                </For>

                <label
                  title="Pick custom color"
                  class="relative w-7 h-7 rounded-full cursor-pointer shrink-0 ring-1 ring-white/25 hover:ring-white/60 transition-all flex items-center justify-center overflow-hidden"
                  style={{
                    background:
                      'conic-gradient(from 0deg, #EF4444, #F59E0B, #22C55E, #14B8A6, #3B82F6, #A855F7, #F43F5E, #EF4444)',
                  }}
                >
                  <input
                    type="color"
                    aria-label="Custom color picker"
                    value={accentColor()}
                    onInput={(e) => applyColor(e.currentTarget.value)}
                    class="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                  <span
                    class="w-3.5 h-3.5 rounded-full border border-black/40 pointer-events-none"
                    style={{ 'background-color': accentColor() }}
                  />
                </label>

                <input
                  type="text"
                  value={hexInput()}
                  onInput={(e) => handleHexInput(e.currentTarget.value)}
                  onBlur={handleHexBlur}
                  maxlength={7}
                  spellcheck={false}
                  aria-label="Hex color code"
                  placeholder="#3B82F6"
                  class={`ml-auto w-24 h-8 rounded-lg bg-[#0A0B0E] border px-2.5 text-xs font-mono uppercase text-[#F5F7FA] focus:outline-none ${
                    isHexInputValid()
                      ? 'border-white/[0.1] focus:border-[#3B82F6]'
                      : 'border-[#EF4444]/60 focus:border-[#EF4444]'
                  }`}
                />
              </div>

              {/* Badge mode: Dot / Built-in Icons / Emoji */}
              <div class="rounded-2xl bg-[#0A0B0E] border border-white/[0.08] p-2.5 space-y-2.5">
                <div class="grid grid-cols-3 gap-1 p-0.5 rounded-xl bg-[#14161B]">
                  <button
                    type="button"
                    onClick={() => {
                      setBadgeTab('none');
                      setBadge({ kind: 'none' });
                    }}
                    class={`h-7 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      badgeTab() === 'none'
                        ? 'bg-[#1C1F26] text-[#F5F7FA]'
                        : 'text-[#8E95A5] hover:text-[#F5F7FA]'
                    }`}
                  >
                    Color Dot
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBadgeTab('icon');
                      if (badge().kind !== 'icon') {
                        setBadge({ kind: 'icon', id: HABIT_ICONS[0].id });
                      }
                    }}
                    class={`h-7 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      badgeTab() === 'icon'
                        ? 'bg-[#1C1F26] text-[#F5F7FA]'
                        : 'text-[#8E95A5] hover:text-[#F5F7FA]'
                    }`}
                  >
                    Icons
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBadgeTab('emoji');
                      if (badge().kind !== 'emoji') {
                        setBadge({ kind: 'emoji', value: HABIT_EMOJIS[0] });
                      }
                    }}
                    class={`h-7 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      badgeTab() === 'emoji'
                        ? 'bg-[#1C1F26] text-[#F5F7FA]'
                        : 'text-[#8E95A5] hover:text-[#F5F7FA]'
                    }`}
                  >
                    Emoji
                  </button>
                </div>

                <Show when={badgeTab() === 'icon'}>
                  <div class="grid grid-cols-8 gap-1.5">
                    <For each={HABIT_ICONS}>
                      {(opt) => {
                        const selected = () =>
                          badge().kind === 'icon' &&
                          (badge() as { kind: 'icon'; id: string }).id === opt.id;
                        return (
                          <button
                            type="button"
                            title={opt.label}
                            aria-label={`Icon ${opt.label}`}
                            aria-pressed={selected()}
                            onClick={() => setBadge({ kind: 'icon', id: opt.id })}
                            class={`h-9 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                              selected()
                                ? 'bg-[#1C1F26] border-[#3B82F6]'
                                : 'bg-[#14161B] border-white/[0.06] text-[#9AA1B1] hover:text-[#F5F7FA] hover:border-white/20'
                            }`}
                            style={selected() ? { color: accentColor() } : undefined}
                          >
                            <HabitIconSvg id={opt.id} class="w-4 h-4" />
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>

                <Show when={badgeTab() === 'emoji'}>
                  <div class="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
                    <For each={HABIT_EMOJIS}>
                      {(em) => {
                        const selected = () =>
                          badge().kind === 'emoji' &&
                          (badge() as { kind: 'emoji'; value: string }).value === em;
                        return (
                          <button
                            type="button"
                            aria-label={`Emoji ${em}`}
                            aria-pressed={selected()}
                            onClick={() => setBadge({ kind: 'emoji', value: em })}
                            class={`h-9 rounded-lg flex items-center justify-center text-base border transition-colors cursor-pointer ${
                              selected()
                                ? 'bg-[#1C1F26] border-[#3B82F6]'
                                : 'bg-[#14161B] border-white/[0.06] hover:border-white/20'
                            }`}
                          >
                            {em}
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>
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
  mode: TaskModalMode;
  editingTask: Task | null;
  prefill: TaskDraftPrefill | null;
  todayDay: number;
  onClose: () => void;
  onSave: (data: {
    title: string;
    note: string;
    dueDay: number | null;
    repeatable: boolean;
  }) => Promise<void>;
}

export function TaskModal(props: TaskModalProps): JSX.Element {
  const [title, setTitle] = createSignal('');
  const [note, setNote] = createSignal('');
  const [dueDay, setDueDay] = createSignal<number | null>(props.todayDay);
  const [repeatable, setRepeatable] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    const task = props.mode === 'edit' ? props.editingTask : null;
    if (task) {
      setTitle(task.title);
      setNote(task.note);
      setDueDay(task.dueDay);
      setRepeatable(task.repeatable);
    } else if (props.prefill) {
      setTitle(props.prefill.title);
      setNote(props.prefill.note);
      setDueDay(props.prefill.dueDay);
      setRepeatable(props.prefill.repeatable);
    } else {
      setTitle('');
      setNote('');
      setDueDay(props.todayDay);
      setRepeatable(false);
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
      await props.onSave({
        title: trimmed,
        note: note().trim(),
        dueDay: dueDay(),
        repeatable: repeatable(),
      });
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
              {props.mode === 'edit'
                ? 'Edit Task'
                : props.mode === 'next'
                  ? 'Schedule Next Occurrence'
                  : 'New Task'}
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

          <Show when={props.mode === 'next'}>
            <div class="rounded-xl bg-[#3B82F6]/10 border border-[#3B82F6]/25 px-3.5 py-2.5 text-xs text-[#93C5FD] flex items-center gap-2">
              <RepeatIcon class="w-4 h-4 shrink-0" />
              <span>
                Completed! Pre-filled the next occurrence below — pick a new date or skip.
              </span>
            </div>
          </Show>

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

            <label class="flex items-start gap-3 rounded-xl bg-[#0A0B0E] border border-white/[0.08] px-3.5 py-3 cursor-pointer hover:border-white/[0.15] transition-colors">
              <input
                type="checkbox"
                checked={repeatable()}
                onChange={(e) => setRepeatable(e.currentTarget.checked)}
                class="mt-0.5 w-4 h-4 rounded accent-[#3B82F6] cursor-pointer"
              />
              <div class="min-w-0 flex-1 space-y-0.5">
                <div class="flex items-center gap-1.5 text-xs font-medium text-[#F5F7FA]">
                  <RepeatIcon class="w-3.5 h-3.5 text-[#60A5FA]" />
                  <span>Repeatable task</span>
                </div>
                <p class="text-[11px] text-[#8E95A5]">
                  Open a pre-filled next occurrence when you complete this task.
                </p>
              </div>
            </label>

            <div class="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => props.onClose()}
                class="h-10 px-4 rounded-xl text-sm font-medium text-[#9AA1B1] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                {props.mode === 'next' ? 'Skip' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving()}
                class="h-10 px-5 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving()
                  ? 'Saving...'
                  : props.mode === 'edit'
                    ? 'Save Changes'
                    : props.mode === 'next'
                      ? 'Create Next Task'
                      : 'Create Task'}
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

            <Show when={(pending().duplicateFileIds?.length ?? 0) > 0}>
              <div class="rounded-xl bg-[#3B82F6]/10 border border-[#3B82F6]/25 px-3.5 py-2.5 text-xs text-[#93C5FD]">
                Detected {pending().duplicateFileIds!.length} duplicate snapshot{' '}
                {pending().duplicateFileIds!.length === 1 ? 'file' : 'files'} in Google Drive. All
                records were merged and duplicates will be cleaned up after upload.
              </div>
            </Show>

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
  onExportBackup: () => Promise<{ filename: string; bytes: Uint8Array }>;
  onImportBackup: (bytes: Uint8Array) => Promise<void>;
  onOpenRevisions?: () => Promise<void>;
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
      setBackupError(
        err instanceof Error ? err.message : 'Could not read backup file.'
      );
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

          <div class="rounded-2xl bg-[#0A0B0E] border border-white/[0.08] p-4 space-y-3">
            <div class="space-y-0.5">
              <p class="text-xs font-medium text-[#F5F7FA]">Local Backup (.bin)</p>
              <p class="text-[11px] text-[#8E95A5]">
                Export a snapshot file or safely merge an existing backup into this device.
              </p>
            </div>

            <Show when={backupError()}>
              {(msg) => (
                <div class="rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/25 px-3 py-2 text-xs text-[#FCA5A5]">
                  {msg()}
                </div>
              )}
            </Show>

            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={busy()}
                class="h-10 px-3 rounded-xl bg-[#14161B] hover:bg-[#1C1F26] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <DownloadIcon class="w-3.5 h-3.5 text-[#60A5FA]" />
                <span>Export .bin</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef?.click()}
                disabled={busy()}
                class="h-10 px-3 rounded-xl bg-[#14161B] hover:bg-[#1C1F26] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <UploadIcon class="w-3.5 h-3.5 text-[#22C55E]" />
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
                class="w-full h-11 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy() ? 'Connecting...' : 'Reconnect Google Drive'}
              </button>
            </Show>
            <Show when={props.mode === 'google' && props.onOpenRevisions}>
              <button
                type="button"
                onClick={() => void props.onOpenRevisions?.()}
                disabled={busy()}
                class="w-full h-11 rounded-xl bg-[#1C1F26] hover:bg-[#252933] border border-white/[0.08] text-sm font-medium text-[#F5F7FA] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <HistoryClockIcon class="w-4 h-4 text-[#60A5FA]" />
                <span>Drive Version History</span>
              </button>
            </Show>
            <PWAInstallButton variant="full" />
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

function formatByteSize(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function DriveRevisionsModal(props: DriveRevisionsModalProps): JSX.Element {
  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="revisions-modal-title"
      >
        <div class="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-[#14161B] border border-white/[0.08] p-6 space-y-5 max-h-[88vh] flex flex-col">
          <div class="flex items-center justify-between gap-3 shrink-0">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center text-[#60A5FA] shrink-0">
                <HistoryClockIcon class="w-4 h-4" />
              </div>
              <div>
                <h2
                  id="revisions-modal-title"
                  class="font-display text-lg font-semibold text-[#F5F7FA]"
                >
                  Drive Version History
                </h2>
                <p class="text-xs text-[#8E95A5]">
                  Up to the latest {MAX_REVISIONS_TO_KEEP} versions are kept automatically in Google Drive.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => props.onClose()}
              disabled={props.restoring}
              aria-label="Close modal"
              class="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
            >
              <CloseIcon class="w-4 h-4" />
            </button>
          </div>

          <Show when={props.error}>
            {(msg) => (
              <div class="rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/25 px-3.5 py-2.5 text-xs text-[#FCA5A5] shrink-0">
                {msg()}
              </div>
            )}
          </Show>

          <div class="overflow-y-auto space-y-3 pr-1 flex-1 min-h-0">
            <Show
              when={!props.loading}
              fallback={
                <div class="rounded-2xl bg-[#0A0B0E] border border-white/[0.08] p-8 text-center text-xs text-[#8E95A5]">
                  Loading snapshot revisions from Google Drive...
                </div>
              }
            >
              <Show
                when={props.revisions.length > 0}
                fallback={
                  <div class="rounded-2xl bg-[#0A0B0E] border border-white/[0.08] p-8 text-center space-y-2">
                    <p class="text-sm font-medium text-[#F5F7FA]">No Drive versions yet</p>
                    <p class="text-xs text-[#8E95A5]">
                      Run Sync Drive at least once to create your first cloud snapshot revision.
                    </p>
                  </div>
                }
              >
                <div class="space-y-2">
                  <For each={props.revisions}>
                    {(rev, index) => {
                      const isCurrent = () => index() === 0;
                      const isSelected = () =>
                        props.inspectedRevision?.revisionId === rev.id;
                      const isInspecting = () => props.inspectingRevisionId === rev.id;
                      return (
                        <div
                          class={`rounded-2xl border p-3.5 transition-colors ${
                            isSelected()
                              ? 'bg-[#182030] border-[#3B82F6]/45'
                              : 'bg-[#0A0B0E] border-white/[0.08]'
                          }`}
                        >
                          <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0 space-y-0.5">
                              <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-xs font-medium text-[#F5F7FA]">
                                  {formatRevisionTime(rev.modifiedTime)}
                                </span>
                                <Show when={isCurrent()}>
                                  <span class="px-1.5 py-0.5 rounded-md bg-[#22C55E]/15 text-[10px] font-medium text-[#86EFAC]">
                                    Current
                                  </span>
                                </Show>
                                <Show when={rev.keepForever}>
                                  <span class="px-1.5 py-0.5 rounded-md bg-[#3B82F6]/15 text-[10px] font-medium text-[#93C5FD]">
                                    Pinned
                                  </span>
                                </Show>
                              </div>
                              <p class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                                Rev #{rev.id} · {formatByteSize(rev.size)}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => void props.onInspect(rev.id)}
                              disabled={
                                isInspecting() ||
                                props.restoring ||
                                props.inspectingRevisionId !== null
                              }
                              class="h-8 px-3 rounded-xl bg-[#14161B] hover:bg-[#1C1F26] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                            >
                              {isInspecting()
                                ? 'Loading...'
                                : isSelected()
                                  ? 'Selected'
                                  : 'Inspect'}
                            </button>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </Show>
          </div>

          <Show when={props.inspectedRevision}>
            {(inspected) => {
              const isLatest = () => props.revisions[0]?.id === inspected().revisionId;
              return (
                <div class="rounded-2xl bg-[#0A0B0E] border border-[#3B82F6]/30 p-4 space-y-3 shrink-0">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-medium text-[#F5F7FA]">
                      Revision #{inspected().revisionId} Contents
                    </span>
                    <span class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                      {inspected().summary.byteSize} B
                    </span>
                  </div>

                  <div class="grid grid-cols-4 gap-2 text-xs">
                    <div class="rounded-xl bg-[#14161B] p-2.5">
                      <span class="text-[11px] text-[#8E95A5] block">Habits</span>
                      <span class="font-mono tabular-nums font-medium text-[#F5F7FA]">
                        {inspected().summary.habitsCount}
                      </span>
                    </div>
                    <div class="rounded-xl bg-[#14161B] p-2.5">
                      <span class="text-[11px] text-[#8E95A5] block">Check-ins</span>
                      <span class="font-mono tabular-nums font-medium text-[#F5F7FA]">
                        {inspected().summary.checkinsCount}
                      </span>
                    </div>
                    <div class="rounded-xl bg-[#14161B] p-2.5">
                      <span class="text-[11px] text-[#8E95A5] block">Notes</span>
                      <span class="font-mono tabular-nums font-medium text-[#F5F7FA]">
                        {inspected().summary.notesCount}
                      </span>
                    </div>
                    <div class="rounded-xl bg-[#14161B] p-2.5">
                      <span class="text-[11px] text-[#8E95A5] block">Tasks</span>
                      <span class="font-mono tabular-nums font-medium text-[#F5F7FA]">
                        {inspected().summary.tasksCount}
                      </span>
                    </div>
                  </div>

                  <p class="text-[11px] text-[#8E95A5] leading-relaxed">
                    {isLatest()
                      ? 'This is the current latest version on Google Drive. Restoring it overwrites your local IndexedDB with this snapshot.'
                      : 'Restoring replaces your local IndexedDB with this snapshot and saves it as a new latest version on Google Drive (your previous state remains in version history).'}
                  </p>

                  <div class="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void props.onRestore(inspected().revisionId)}
                      disabled={props.restoring}
                      class="h-9 px-4 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RestoreIcon class="w-3.5 h-3.5" />
                      <span>
                        {props.restoring ? 'Restoring...' : 'Restore This Version'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            }}
          </Show>

          <div class="flex items-center justify-between gap-3 pt-1 shrink-0">
            <button
              type="button"
              onClick={() => void props.onRefresh()}
              disabled={props.loading || props.restoring}
              class="h-9 px-3.5 rounded-xl bg-[#1C1F26] hover:bg-[#252933] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] transition-colors cursor-pointer disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => props.onClose()}
              disabled={props.restoring}
              class="h-9 px-4 rounded-xl text-xs font-medium text-[#9AA1B1] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

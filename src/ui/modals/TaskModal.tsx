import { For, JSX, Show, createEffect, createSignal, untrack } from 'solid-js';
import { ReminderSlot, Task, TaskStatus, normalizeReminderSlotIds } from '../../types/domain';
import { TodayBoard } from '../../utils/today-board';
import { ArchiveIcon, CheckIcon, CloseIcon, RepeatIcon } from '../Icons';
import { DatePicker } from '../controls/DatePicker';
import { TaskDraftPrefill, TaskModalMode } from '../tracker-store';
import { ModalHeader, ModalShell } from './ModalShell';
import { ReminderSlotSelector } from './ReminderSlotSelector';

interface TaskModalProps {
  open: boolean;
  mode: TaskModalMode;
  editingTask: Task | null;
  prefill: TaskDraftPrefill | null;
  reminderSlots?: ReminderSlot[];
  todayDay: number;
  onClose: () => void;
  onCreateReminderSlot?: (input: { label: string; time: string }) => Promise<ReminderSlot>;
  onSave: (data: {
    title: string;
    note: string;
    dueDay: number | null;
    repeatable: boolean;
    reminderSlotIds: string[];
    status?: TaskStatus;
  }) => Promise<void>;
}

const TASK_STATUS_OPTIONS: {
  value: TaskStatus;
  label: string;
  hint: string;
}[] = [
  {
    value: 'open',
    label: 'Open',
    hint: 'Active task — visible in Open, Today, or Overdue.',
  },
  {
    value: 'done',
    label: 'Done',
    hint: 'Completed — counted in Progress & Completed Tasks.',
  },
  {
    value: 'not_done',
    label: 'Not Done',
    hint: 'Needed to be done, but was missed or could not be completed.',
  },
  {
    value: 'archived',
    label: 'Archived',
    hint: 'No longer relevant or meaningful — hidden without counting as missed.',
  },
];

export function TaskModal(props: TaskModalProps): JSX.Element {
  const [title, setTitle] = createSignal('');
  const [note, setNote] = createSignal('');
  const [dueDay, setDueDay] = createSignal<number | null>(untrack(() => props.todayDay));
  const [repeatable, setRepeatable] = createSignal(false);
  const [selectedSlotIds, setSelectedSlotIds] = createSignal<string[]>([]);
  const [status, setStatus] = createSignal<TaskStatus>('open');
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  const availableSlots = () => props.reminderSlots ?? [];

  createEffect(() => {
    if (!props.open) return;
    const task = props.mode === 'edit' ? props.editingTask : null;
    const activeIds = new Set(untrack(() => availableSlots()).map((s) => s.id));
    if (task) {
      setTitle(task.title);
      setNote(task.note);
      setDueDay(task.dueDay);
      setRepeatable(task.repeatable);
      setSelectedSlotIds(
        normalizeReminderSlotIds(task.reminderSlotIds).filter((id) => activeIds.has(id))
      );
      setStatus(TodayBoard.getStatus(task));
    } else if (props.prefill) {
      setTitle(props.prefill.title);
      setNote(props.prefill.note);
      setDueDay(props.prefill.dueDay);
      setRepeatable(props.prefill.repeatable);
      setSelectedSlotIds(
        normalizeReminderSlotIds(props.prefill.reminderSlotIds).filter((id) => activeIds.has(id))
      );
      setStatus('open');
    } else {
      setTitle('');
      setNote('');
      setDueDay(props.todayDay);
      setRepeatable(false);
      setSelectedSlotIds([]);
      setStatus('open');
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
        reminderSlotIds: selectedSlotIds(),
        status: props.mode === 'edit' ? status() : 'open',
      });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={props.open}
      titleId="task-modal-title"
      busy={saving()}
      onClose={() => props.onClose()}
    >
      <ModalHeader
        titleId="task-modal-title"
        title={
          props.mode === 'edit'
            ? 'Edit Task'
            : props.mode === 'next'
              ? 'Schedule Next Occurrence'
              : 'New Task'
        }
        onClose={() => props.onClose()}
      />

      <form onSubmit={(e) => void handleSubmit(e)} class="flex min-h-0 flex-1 flex-col">
        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
          <Show when={props.mode === 'next'}>
            <div class="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/10 px-3.5 py-2.5 text-xs text-accent-tint">
              <RepeatIcon class="h-4 w-4 shrink-0" />
              <span>
                Completed! Pre-filled the next occurrence below — pick a new date or skip.
              </span>
            </div>
          </Show>

          <Show when={error()}>
            {(msg) => (
              <div class="rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs text-danger-soft">
                {msg()}
              </div>
            )}
          </Show>

          <div class="space-y-1.5">
            <label for="task-title" class="block text-xs font-medium text-ink-muted">
              Title
            </label>
            <input
              id="task-title"
              type="text"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              placeholder="Prepare weekly review..."
              autofocus
              class="h-11 w-full rounded-xl border border-white/[0.1] bg-canvas px-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
          </div>

          <div class="space-y-1.5">
            <label for="task-note" class="block text-xs font-medium text-ink-muted">
              Note (optional)
            </label>
            <textarea
              id="task-note"
              rows={3}
              value={note()}
              onInput={(e) => setNote(e.currentTarget.value)}
              placeholder="Additional details..."
              class="w-full resize-none rounded-xl border border-white/[0.1] bg-canvas p-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
          </div>

          <div class="space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <label for="task-due" class="text-xs font-medium text-ink-muted">
                Due date
              </label>
              <div class="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setDueDay(props.todayDay)}
                  class="cursor-pointer text-accent-soft hover:underline"
                >
                  Today
                </button>
                <span aria-hidden="true" class="text-ink-faint">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => setDueDay(props.todayDay + 1)}
                  class="cursor-pointer text-ink-muted hover:text-ink"
                >
                  Tomorrow
                </button>
                <span aria-hidden="true" class="text-ink-faint">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => setDueDay(null)}
                  class="cursor-pointer text-ink-muted hover:text-ink"
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

          <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-canvas px-3.5 py-3 transition-colors hover:border-white/[0.15]">
            <input
              type="checkbox"
              checked={repeatable()}
              onChange={(e) => setRepeatable(e.currentTarget.checked)}
              class="mt-0.5 h-4 w-4 cursor-pointer rounded accent-accent"
            />
            <div class="min-w-0 flex-1 space-y-0.5">
              <div class="flex items-center gap-1.5 text-xs font-medium text-ink">
                <RepeatIcon class="h-3.5 w-3.5 text-accent-soft" />
                <span>Repeatable task</span>
              </div>
              <p class="text-[11px] text-ink-subtle">
                Open a pre-filled next occurrence when you complete this task.
              </p>
            </div>
          </label>

          <Show when={availableSlots().length > 0 || props.onCreateReminderSlot}>
            <ReminderSlotSelector
              idPrefix="task"
              groupLabel="Task reminder slots"
              emptyText="No reminder slots created yet. Tasks follow the default task reminder slot unless a slot is assigned."
              unselectedHint="No specific slot assigned (uses default task slot if enabled)."
              open={props.open}
              reminderSlots={availableSlots()}
              selectedSlotIds={selectedSlotIds()}
              onChangeSelected={setSelectedSlotIds}
              onCreateReminderSlot={props.onCreateReminderSlot}
              onError={setError}
            />
          </Show>

          <Show when={props.mode === 'edit'}>
            <div class="space-y-2">
              <span class="block text-xs font-medium text-ink-muted">Status</span>
              <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <For each={TASK_STATUS_OPTIONS}>
                  {(opt) => {
                    const active = () => status() === opt.value;
                    const activeClass = () => {
                      if (!active()) {
                        return 'bg-canvas border-white/[0.08] text-ink-subtle hover:text-ink hover:border-white/20';
                      }
                      switch (opt.value) {
                        case 'done':
                          return 'bg-accent/15 border-accent/50 text-accent-tint';
                        case 'not_done':
                          return 'bg-danger/15 border-danger/50 text-danger-soft';
                        case 'archived':
                          return 'bg-surface-elevated border-white/25 text-ink';
                        case 'open':
                        default:
                          return 'bg-accent/15 border-accent/60 text-accent-tint';
                      }
                    };
                    return (
                      <button
                        type="button"
                        onClick={() => setStatus(opt.value)}
                        aria-pressed={active()}
                        class={`inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition-colors ${activeClass()}`}
                      >
                        <Show when={opt.value === 'done'}>
                          <CheckIcon class="h-3.5 w-3.5 shrink-0" />
                        </Show>
                        <Show when={opt.value === 'not_done'}>
                          <CloseIcon class="h-3.5 w-3.5 shrink-0" />
                        </Show>
                        <Show when={opt.value === 'archived'}>
                          <ArchiveIcon class="h-3.5 w-3.5 shrink-0" />
                        </Show>
                        <span class="truncate">{opt.label}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
              <p class="text-[11px] text-ink-subtle">
                {TASK_STATUS_OPTIONS.find((o) => o.value === status())?.hint}
              </p>
            </div>
          </Show>
        </div>

        <div class="flex shrink-0 items-center justify-end gap-3 border-t border-white/[0.06] bg-surface px-6 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6">
          <button
            type="button"
            onClick={() => props.onClose()}
            class="h-10 cursor-pointer rounded-xl px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            {props.mode === 'next' ? 'Skip' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={saving()}
            class="h-10 cursor-pointer rounded-xl bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
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
    </ModalShell>
  );
}

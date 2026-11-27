import { For, JSX, Show, createEffect, createSignal } from 'solid-js';
import {
  ReminderSlot,
  normalizeReminderSlotLabel,
  normalizeReminderSlotTime,
} from '../../types/domain';
import { ClockIcon, PlusIcon } from '../Icons';
import { TimePicker } from '../controls/TimePicker';

interface ReminderSlotSelectorProps {
  idPrefix: string;
  groupLabel: string;
  emptyText: string;
  unselectedHint: string;
  open: boolean;
  reminderSlots: ReminderSlot[];
  selectedSlotIds: string[];
  onChangeSelected: (next: string[]) => void;
  onCreateReminderSlot?: (input: { label: string; time: string }) => Promise<ReminderSlot>;
  onError: (msg: string | null) => void;
}

export function ReminderSlotSelector(props: ReminderSlotSelectorProps): JSX.Element {
  const [newSlotOpen, setNewSlotOpen] = createSignal(false);
  const [newSlotLabel, setNewSlotLabel] = createSignal('');
  const [newSlotTime, setNewSlotTime] = createSignal('09:00');
  const [creatingSlot, setCreatingSlot] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    setNewSlotOpen(false);
    setNewSlotLabel('');
    setNewSlotTime('09:00');
  });

  const toggleSlot = (slotId: string) => {
    const next = props.selectedSlotIds.includes(slotId)
      ? props.selectedSlotIds.filter((id) => id !== slotId)
      : [...props.selectedSlotIds, slotId];
    props.onChangeSelected(next);
  };

  const handleQuickCreateSlot = async () => {
    if (!props.onCreateReminderSlot) return;
    setCreatingSlot(true);
    props.onError(null);
    try {
      const created = await props.onCreateReminderSlot({
        label: normalizeReminderSlotLabel(newSlotLabel()),
        time: normalizeReminderSlotTime(newSlotTime()),
      });
      if (!props.selectedSlotIds.includes(created.id)) {
        props.onChangeSelected([...props.selectedSlotIds, created.id]);
      }
      setNewSlotLabel('');
      setNewSlotTime('09:00');
      setNewSlotOpen(false);
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Failed to create reminder slot.');
    } finally {
      setCreatingSlot(false);
    }
  };

  return (
    <div class="space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <span class="block text-xs font-medium text-ink-muted">Reminder slots</span>
        <Show when={props.onCreateReminderSlot}>
          <button
            type="button"
            onClick={() => setNewSlotOpen((prev) => !prev)}
            class="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-accent-soft hover:underline"
          >
            <PlusIcon class="h-3.5 w-3.5" />
            <span>{newSlotOpen() ? 'Close' : 'New slot'}</span>
          </button>
        </Show>
      </div>

      <Show when={props.reminderSlots.length > 0}>
        <div class="flex flex-wrap gap-2" role="group" aria-label={props.groupLabel}>
          <For each={props.reminderSlots}>
            {(slot) => {
              const selected = () => props.selectedSlotIds.includes(slot.id);
              return (
                <button
                  type="button"
                  onClick={() => toggleSlot(slot.id)}
                  aria-pressed={selected()}
                  class={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected()
                      ? 'border-accent/60 bg-accent/15 text-ink'
                      : 'border-white/[0.08] bg-canvas text-ink-muted hover:border-white/20 hover:text-ink'
                  }`}
                >
                  <ClockIcon
                    class={`h-3.5 w-3.5 shrink-0 ${
                      selected() ? 'text-accent-soft' : 'text-ink-subtle'
                    }`}
                  />
                  <span class="font-mono tabular-nums">{slot.time}</span>
                  <Show when={slot.label}>
                    <span class="text-ink-secondary">· {slot.label}</span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </Show>

      <Show when={newSlotOpen() && props.onCreateReminderSlot}>
        <div class="space-y-2.5 rounded-2xl border border-white/[0.08] bg-canvas p-3">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={newSlotLabel()}
              onInput={(e) => setNewSlotLabel(e.currentTarget.value)}
              maxlength={32}
              placeholder="Label (optional, e.g. Morning)"
              aria-label="New slot label"
              class="h-10 w-full rounded-xl border border-white/[0.1] bg-surface px-3 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
            <TimePicker
              id={`${props.idPrefix}-new-slot-time`}
              value={newSlotTime()}
              onChange={(val) => setNewSlotTime(val)}
              ariaLabel="New slot time"
            />
          </div>
          <div class="flex justify-end">
            <button
              type="button"
              onClick={() => void handleQuickCreateSlot()}
              disabled={creatingSlot()}
              class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              <PlusIcon class="h-3.5 w-3.5" />
              <span>{creatingSlot() ? 'Adding...' : 'Add & Select Slot'}</span>
            </button>
          </div>
        </div>
      </Show>

      <p class="text-[11px] text-ink-subtle">
        {props.reminderSlots.length === 0
          ? props.emptyText
          : props.selectedSlotIds.length === 0
            ? props.unselectedHint
            : `Assigned to ${props.selectedSlotIds.length} reminder ${props.selectedSlotIds.length === 1 ? 'slot' : 'slots'}.`}
      </p>
    </div>
  );
}

import { For, JSX, Show, createEffect, createSignal, untrack } from 'solid-js';
import { CalendarSyncPlan } from '../../sync/calendar-reminder-service';
import {
  DomainSnapshot,
  ReminderSlot,
  SessionMode,
  normalizeReminderSlotIds,
  normalizeReminderSlotLabel,
  normalizeReminderSlotTime,
} from '../../types/domain';
import {
  BadgePermissionState,
  ReminderPlanner,
  ReminderPreferences,
  TodayPendingSummary,
} from '../../utils/reminder-planner';
import { TodayBoard } from '../../utils/today-board';
import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from '../Icons';
import { Select, SelectOption } from '../controls/Select';
import { TimePicker } from '../controls/TimePicker';
import { ModalHeader, ModalShell } from './ModalShell';

interface RemindersModalProps {
  open: boolean;
  mode: SessionMode;
  hasGoogleToken: boolean;
  googleEmail: string | null;
  snapshot: DomainSnapshot;
  todayDay: number;
  reminderSlots: ReminderSlot[];
  prefs: ReminderPreferences;
  badgePermission: BadgePermissionState;
  pendingToday: TodayPendingSummary;
  trackerTimeZone: string;
  calendarSyncNeeded: boolean;
  busy: boolean;
  error: string | null;
  pendingPlan: CalendarSyncPlan | null;
  confirmDeleteOpen: boolean;
  onClose: () => void;
  onToggleBadge: (enabled: boolean) => void;
  onRequestBadgePermission: () => Promise<void>;
  onCreateSlot: (input: { label: string; time: string }) => Promise<ReminderSlot>;
  onUpdateSlot: (id: string, patch: { label?: string; time?: string }) => Promise<void>;
  onDeleteSlot: (id: string) => Promise<void>;
  onToggleCalendar: (enabled: boolean) => void;
  onChangeTaskSlot: (slotId: string | null) => void;
  onChangeHorizon: (days: number) => void;
  onPrepareCalendarSync: () => Promise<void>;
  onConfirmCalendarSync: () => Promise<void>;
  onCancelCalendarSync: () => void;
  onRequestDeleteCalendar: () => void;
  onConfirmDeleteCalendar: () => Promise<void>;
  onCancelDeleteCalendar: () => void;
}

const HORIZON_OPTIONS = [
  { days: 1, label: 'Today only' },
  { days: 3, label: '3 days' },
  { days: 7, label: '7 days' },
];

function ReminderSlotRow(props: {
  slot: ReminderSlot;
  habitCount: number;
  taskCount: number;
  isDefaultTaskSlot: boolean;
  isEditing: boolean;
  busy: boolean;
  onToggleEdit: (id: string) => void;
  onUpdateLabel: (id: string, label: string) => Promise<void>;
  onUpdateTime: (id: string, time: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}): JSX.Element {
  const [labelDraft, setLabelDraft] = createSignal(untrack(() => props.slot.label));

  createEffect(() => {
    setLabelDraft(props.slot.label);
  });

  const commitLabel = () => {
    const clean = normalizeReminderSlotLabel(labelDraft());
    setLabelDraft(clean);
    if (clean !== props.slot.label) {
      void props.onUpdateLabel(props.slot.id, clean);
    }
  };

  const usageSummary = () => {
    const h = props.habitCount;
    const t = props.taskCount;
    if (h > 0 && t > 0) return `${h}h · ${t}t`;
    if (h > 0) return `${h} ${h === 1 ? 'habit' : 'habits'}`;
    if (t > 0) return `${t} ${t === 1 ? 'task' : 'tasks'}`;
    if (props.isDefaultTaskSlot) return 'default';
    return 'unused';
  };

  return (
    <div class="transition-colors">
      <div class="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => props.onToggleEdit(props.slot.id)}
          aria-expanded={props.isEditing}
          aria-label={`Edit ${props.slot.label || props.slot.time} slot`}
          class="flex min-h-[36px] min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
        >
          <span class="shrink-0 font-mono text-xs font-medium text-ink tabular-nums">
            {props.slot.time}
          </span>
          <span
            class={`truncate text-xs ${props.slot.label ? 'text-ink-secondary' : 'text-ink-dim'}`}
          >
            {props.slot.label || 'No label'}
          </span>
        </button>

        <div class="flex shrink-0 items-center gap-1">
          <span class="mr-1 font-mono text-[11px] whitespace-nowrap text-ink-subtle tabular-nums">
            {usageSummary()}
          </span>
          <button
            type="button"
            onClick={() => props.onToggleEdit(props.slot.id)}
            disabled={props.busy}
            aria-label={
              props.isEditing
                ? `Done editing ${props.slot.label || props.slot.time} slot`
                : `Customize ${props.slot.label || props.slot.time} slot`
            }
            class={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
              props.isEditing
                ? 'bg-accent/15 text-accent-soft'
                : 'text-ink-subtle hover:bg-white/[0.06] hover:text-ink'
            }`}
          >
            <Show when={props.isEditing} fallback={<EditIcon class="h-3.5 w-3.5" />}>
              <CheckIcon class="h-3.5 w-3.5" />
            </Show>
          </button>
          <button
            type="button"
            onClick={() => void props.onDelete(props.slot.id)}
            disabled={props.busy}
            aria-label={`Delete ${props.slot.label || props.slot.time} slot`}
            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-danger/10 hover:text-danger-soft disabled:opacity-50"
          >
            <TrashIcon class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Show when={props.isEditing}>
        <div class="flex flex-wrap items-center gap-2 border-t border-white/[0.06] bg-surface-subtle px-3 py-2.5 sm:flex-nowrap">
          <div class="w-28 shrink-0">
            <TimePicker
              value={props.slot.time}
              onChange={(val) => void props.onUpdateTime(props.slot.id, val)}
              ariaLabel={`Time for ${props.slot.label || props.slot.time}`}
            />
          </div>
          <input
            type="text"
            value={labelDraft()}
            onInput={(e) => setLabelDraft(e.currentTarget.value)}
            onBlur={() => commitLabel()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
                props.onToggleEdit(props.slot.id);
              }
            }}
            maxlength={32}
            disabled={props.busy}
            placeholder="Slot label (optional)"
            aria-label={`Label for ${props.slot.time} slot`}
            class="h-10 min-w-[120px] flex-1 rounded-xl border border-white/[0.08] bg-surface px-3 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => {
              commitLabel();
              props.onToggleEdit(props.slot.id);
            }}
            disabled={props.busy}
            class="h-10 shrink-0 cursor-pointer rounded-xl border border-white/[0.08] bg-surface-elevated px-3 text-xs font-medium text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </Show>
    </div>
  );
}

export function RemindersModal(props: RemindersModalProps): JSX.Element {
  const [newSlotLabel, setNewSlotLabel] = createSignal('');
  const [newSlotTime, setNewSlotTime] = createSignal('09:00');
  const [slotBusy, setSlotBusy] = createSignal(false);
  const [slotError, setSlotError] = createSignal<string | null>(null);
  const [slotsExpanded, setSlotsExpanded] = createSignal(
    untrack(() => props.reminderSlots.length === 0)
  );
  const [editingSlotId, setEditingSlotId] = createSignal<string | null>(null);
  let wasOpen = false;

  const badgeSupported = ReminderPlanner.isAppBadgeSupported();
  const isStandalone = ReminderPlanner.isStandalonePwa();
  const resolvedTz = () => ReminderPlanner.resolveCalendarTimeZone(props.trackerTimeZone);

  const assignedHabitCount = (slotId: string): number => {
    let count = 0;
    for (const habit of props.snapshot.habits) {
      if (habit.archivedAt !== null) continue;
      if (normalizeReminderSlotIds(habit.reminderSlotIds).includes(slotId)) {
        count += 1;
      }
    }
    return count;
  };

  const assignedTaskCount = (slotId: string): number => {
    let count = 0;
    for (const task of props.snapshot.tasks) {
      if (task.deletedAt !== null || TodayBoard.getStatus(task) !== 'open') continue;
      if (normalizeReminderSlotIds(task.reminderSlotIds).includes(slotId)) {
        count += 1;
      }
    }
    return count;
  };

  const toggleEditingSlot = (id: string) => {
    setEditingSlotId((prev) => (prev === id ? null : id));
  };

  const todayDesiredEvents = () =>
    ReminderPlanner.buildDesiredEvents(
      props.snapshot,
      props.todayDay,
      { taskReminderSlotId: props.prefs.taskReminderSlotId, horizonDays: 1 },
      props.trackerTimeZone
    );

  const handleAddSlot = async (e: SubmitEvent) => {
    e.preventDefault();
    setSlotBusy(true);
    setSlotError(null);
    try {
      await props.onCreateSlot({
        label: normalizeReminderSlotLabel(newSlotLabel()),
        time: normalizeReminderSlotTime(newSlotTime()),
      });
      setNewSlotLabel('');
      setNewSlotTime('09:00');
    } catch (err) {
      setSlotError(err instanceof Error ? err.message : 'Failed to create reminder slot.');
    } finally {
      setSlotBusy(false);
    }
  };

  const handleUpdateSlotLabel = async (id: string, label: string) => {
    setSlotBusy(true);
    setSlotError(null);
    try {
      await props.onUpdateSlot(id, { label });
    } catch (err) {
      setSlotError(err instanceof Error ? err.message : 'Failed to update reminder slot.');
    } finally {
      setSlotBusy(false);
    }
  };

  const handleUpdateSlotTime = async (id: string, time: string) => {
    setSlotBusy(true);
    setSlotError(null);
    try {
      await props.onUpdateSlot(id, { time });
    } catch (err) {
      setSlotError(err instanceof Error ? err.message : 'Failed to update reminder slot.');
    } finally {
      setSlotBusy(false);
    }
  };

  const handleDeleteSlot = async (id: string) => {
    setSlotBusy(true);
    setSlotError(null);
    try {
      await props.onDeleteSlot(id);
      if (editingSlotId() === id) {
        setEditingSlotId(null);
      }
    } catch (err) {
      setSlotError(err instanceof Error ? err.message : 'Failed to delete reminder slot.');
    } finally {
      setSlotBusy(false);
    }
  };

  createEffect(() => {
    if (!props.open) {
      wasOpen = false;
      return;
    }
    if (!wasOpen) {
      wasOpen = true;
      setSlotsExpanded(untrack(() => props.reminderSlots.length === 0));
      setEditingSlotId(null);
    }
    setSlotError(null);
  });

  return (
    <ModalShell
      open={props.open}
      titleId="reminders-modal-title"
      busy={props.busy || slotBusy()}
      closeOnBackdrop={true}
      maxWidthClass="sm:max-w-lg"
      onClose={() => props.onClose()}
    >
      <ModalHeader
        titleId="reminders-modal-title"
        title="Reminders & App Badge"
        subtitle="Manage reminder slots for habits and tasks, icon badge counts, and Google Calendar pushes."
        icon={<BellIcon class="h-4 w-4" />}
        onClose={() => props.onClose()}
        closeDisabled={props.busy || slotBusy()}
        compactHorizontal={true}
      />

      <Show when={props.error || slotError()}>
        {(msg) => (
          <div class="break-anywhere mx-5 mt-3 shrink-0 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs text-danger-soft sm:mx-6">
            {msg()}
          </div>
        )}
      </Show>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        {/* App Icon Badge Section */}
        <section class="space-y-3 rounded-2xl border border-white/[0.08] bg-canvas p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1 space-y-1">
              <p class="text-sm font-medium text-ink">PWA Icon Badge</p>
              <p class="text-xs text-ink-subtle">
                Displays unfinished habits and open tasks due today/overdue directly on your
                installed app icon.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={props.prefs.badgeEnabled}
              onClick={() => props.onToggleBadge(!props.prefs.badgeEnabled)}
              class={`h-8 shrink-0 cursor-pointer rounded-xl border px-3 text-xs font-medium transition-colors ${
                props.prefs.badgeEnabled
                  ? 'border-accent/50 bg-accent/15 text-accent-tint'
                  : 'border-white/[0.08] bg-surface text-ink-subtle hover:text-ink'
              }`}
            >
              {props.prefs.badgeEnabled ? 'On' : 'Off'}
            </button>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-xs">
            <span class="text-ink-subtle">Current pending today:</span>
            <span class="font-mono font-medium text-ink tabular-nums">
              {props.pendingToday.totalPendingCount === 0
                ? '0 (All clear)'
                : `${props.pendingToday.totalPendingCount} (${props.pendingToday.unfinishedHabitsCount} habits · ${props.pendingToday.openTasksCount} tasks)`}
            </span>
          </div>

          <Show when={badgeSupported && props.badgePermission === 'default'}>
            <div class="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-accent/30 bg-surface p-3">
              <p class="min-w-0 flex-1 text-[11px] text-ink-secondary">
                On iPhone (iOS 16.4+), icon badges stay hidden until Notifications/Badges are
                allowed for this Home Screen app.
              </p>
              <button
                type="button"
                onClick={() => void props.onRequestBadgePermission()}
                class="h-8 shrink-0 cursor-pointer rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Allow Badge Permission
              </button>
            </div>
          </Show>

          <Show when={badgeSupported && props.badgePermission === 'granted'}>
            <p class="text-[11px] text-accent-soft">
              System badge permission granted. Icon count updates automatically on open &amp; edits.
            </p>
          </Show>

          <Show when={badgeSupported && props.badgePermission === 'denied'}>
            <p class="text-[11px] text-danger-soft">
              Notifications/Badges are blocked in system settings. Enable them in iPhone Settings →
              Notifications → Habits (or browser site settings) to display the icon counter.
            </p>
          </Show>

          <Show when={!badgeSupported || !isStandalone}>
            <p class="text-[11px] text-ink-subtle">
              {!badgeSupported
                ? 'This browser view does not expose App Badging. On iPhone/iOS 16.4+, tap Share → Add to Home Screen in Safari and launch Habits from the Home Screen icon.'
                : 'Tip for iPhone/mobile: to see the counter on your Home Screen icon, make sure you added Habits via Share → Add to Home Screen and launched it from that icon.'}
            </p>
          </Show>
        </section>

        {/* Dynamic Reminder Slots Section (Collapsible) */}
        <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-canvas">
          <button
            type="button"
            onClick={() => setSlotsExpanded((prev) => !prev)}
            aria-expanded={slotsExpanded()}
            class="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex items-center gap-2">
                <ClockIcon class="h-4 w-4 shrink-0 text-accent-soft" />
                <span class="text-sm font-medium text-ink">Reminder Slots</span>
              </div>
              <Show when={!slotsExpanded() && props.reminderSlots.length > 0}>
                <p class="truncate font-mono text-[11px] text-ink-subtle tabular-nums">
                  {props.reminderSlots
                    .map((s) => (s.label ? `${s.time} ${s.label}` : s.time))
                    .join(' · ')}
                </p>
              </Show>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span class="font-mono text-xs whitespace-nowrap text-ink-subtle tabular-nums">
                {props.reminderSlots.length} {props.reminderSlots.length === 1 ? 'slot' : 'slots'}
              </span>
              <ChevronDownIcon
                class={`h-4 w-4 text-ink-subtle transition-transform duration-150 ${
                  slotsExpanded() ? '' : '-rotate-90'
                }`}
              />
            </div>
          </button>

          <Show when={slotsExpanded()}>
            <div class="space-y-3 border-t border-white/[0.06] px-4 pt-3 pb-4">
              <p class="text-xs text-ink-subtle">
                Create reusable time slots and assign them when editing habits or tasks. Both have
                no reminders by default until a slot is assigned.
              </p>

              <Show
                when={props.reminderSlots.length > 0}
                fallback={
                  <div class="rounded-xl border border-white/[0.06] bg-surface p-3 text-xs text-ink-subtle">
                    No reminder slots yet. Add a time slot below and assign it to habits or tasks
                    you want reminders for.
                  </div>
                }
              >
                <div class="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-surface">
                  <For each={props.reminderSlots}>
                    {(slot) => (
                      <ReminderSlotRow
                        slot={slot}
                        habitCount={assignedHabitCount(slot.id)}
                        taskCount={assignedTaskCount(slot.id)}
                        isDefaultTaskSlot={props.prefs.taskReminderSlotId === slot.id}
                        isEditing={editingSlotId() === slot.id}
                        busy={props.busy || slotBusy()}
                        onToggleEdit={toggleEditingSlot}
                        onUpdateLabel={handleUpdateSlotLabel}
                        onUpdateTime={handleUpdateSlotTime}
                        onDelete={handleDeleteSlot}
                      />
                    )}
                  </For>
                </div>
              </Show>

              <form
                onSubmit={(e) => void handleAddSlot(e)}
                class="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3 sm:flex-nowrap"
              >
                <div class="w-28 shrink-0">
                  <TimePicker
                    id="new-reminder-slot-time"
                    value={newSlotTime()}
                    onChange={(val) => setNewSlotTime(val)}
                    ariaLabel="New reminder slot time"
                  />
                </div>
                <input
                  type="text"
                  value={newSlotLabel()}
                  onInput={(e) => setNewSlotLabel(e.currentTarget.value)}
                  maxlength={32}
                  placeholder="Label (e.g. Morning, Evening)"
                  aria-label="New reminder slot label"
                  class="h-10 min-w-[130px] flex-1 rounded-xl border border-white/[0.1] bg-surface px-3 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={props.busy || slotBusy()}
                  class="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  <PlusIcon class="h-3.5 w-3.5" />
                  <span>Add slot</span>
                </button>
              </form>
            </div>
          </Show>
        </section>

        {/* Google Calendar Smart Push Section */}
        <section class="space-y-4 rounded-2xl border border-white/[0.08] bg-canvas p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <CalendarIcon class="h-4 w-4 shrink-0 text-accent-soft" />
                <p class="text-sm font-medium text-ink">Google Calendar Smart Push</p>
              </div>
              <p class="text-xs text-ink-subtle">
                Creates a dedicated <strong class="text-ink-secondary">Habits Reminders</strong>{' '}
                secondary calendar (never touches your personal calendars) and clears completed
                slots automatically.
              </p>
            </div>
            <Show when={props.mode === 'google'}>
              <button
                type="button"
                role="switch"
                aria-checked={props.prefs.calendarEnabled}
                onClick={() => props.onToggleCalendar(!props.prefs.calendarEnabled)}
                disabled={props.busy}
                class={`h-8 shrink-0 cursor-pointer rounded-xl border px-3 text-xs font-medium transition-colors disabled:opacity-50 ${
                  props.prefs.calendarEnabled
                    ? 'border-accent/50 bg-accent/15 text-accent-tint'
                    : 'border-white/[0.08] bg-surface text-ink-subtle hover:text-ink'
                }`}
              >
                {props.prefs.calendarEnabled ? 'On' : 'Off'}
              </button>
            </Show>
          </div>

          <Show
            when={props.mode === 'google'}
            fallback={
              <div class="rounded-xl border border-white/[0.08] bg-surface p-3 text-xs text-ink-subtle">
                Calendar Push is available in Google Sign-In mode. Your reminder slots above are
                still saved locally and included in .bin backups.
              </div>
            }
          >
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="space-y-1.5">
                <label
                  for="task-reminder-slot-select"
                  class="block text-xs font-medium text-ink-muted"
                >
                  Default task reminder slot
                </label>
                <Select<string>
                  id="task-reminder-slot-select"
                  ariaLabel="Tasks reminder slot"
                  fullWidth={true}
                  portal={true}
                  value={
                    props.prefs.taskReminderSlotId &&
                    props.reminderSlots.some((s) => s.id === props.prefs.taskReminderSlotId)
                      ? props.prefs.taskReminderSlotId
                      : ''
                  }
                  options={[
                    { value: '', label: 'Off (only tasks with slots)' },
                    ...props.reminderSlots.map((slot): SelectOption<string> => ({
                      value: slot.id,
                      label: slot.label ? `${slot.time} · ${slot.label}` : slot.time,
                    })),
                  ]}
                  onChange={(val) => props.onChangeTaskSlot(val || null)}
                />
              </div>

              <div class="space-y-1.5">
                <span class="block text-xs font-medium text-ink-muted">Schedule window</span>
                <div class="grid grid-cols-3 gap-1.5">
                  <For each={HORIZON_OPTIONS}>
                    {(opt) => {
                      const active = () => props.prefs.horizonDays === opt.days;
                      return (
                        <button
                          type="button"
                          onClick={() => props.onChangeHorizon(opt.days)}
                          aria-pressed={active()}
                          class={`h-10 cursor-pointer rounded-xl border px-2 text-[11px] font-medium transition-colors ${
                            active()
                              ? 'border-accent/60 bg-accent/15 text-ink'
                              : 'border-white/[0.08] bg-surface text-ink-subtle hover:text-ink'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            </div>

            <p class="text-[11px] text-ink-subtle">
              Schedule window controls how many upcoming days of reminders are pre-created in
              Calendar for habits and tasks with assigned slots.
            </p>

            <div class="space-y-1.5 rounded-xl border border-white/[0.06] bg-surface p-3 text-xs">
              <div class="flex items-baseline justify-between gap-3">
                <span class="shrink-0 text-ink-subtle">Calendar timezone</span>
                <span class="break-anywhere text-right font-mono text-ink">{resolvedTz()}</span>
              </div>
              <div class="space-y-0.5">
                <div class="flex items-baseline justify-between gap-3">
                  <span class="shrink-0 text-ink-subtle">Today&apos;s reminders</span>
                  <span
                    class={`text-right font-mono tabular-nums ${
                      todayDesiredEvents().length === 0 ? 'text-accent-soft' : 'text-ink'
                    }`}
                  >
                    {todayDesiredEvents().length > 0
                      ? `${todayDesiredEvents().length} ${todayDesiredEvents().length === 1 ? 'slot' : 'slots'}`
                      : props.pendingToday.totalPendingCount === 0
                        ? 'Cleared (all done today)'
                        : 'None assigned'}
                  </span>
                </div>
                <Show when={todayDesiredEvents().length > 0}>
                  <p class="text-right font-mono text-[11px] text-ink-subtle tabular-nums">
                    {todayDesiredEvents()
                      .map((e) => e.slotTime)
                      .join(' · ')}
                  </p>
                </Show>
              </div>
              <div class="flex items-baseline justify-between gap-3">
                <span class="shrink-0 text-ink-subtle">Calendar status</span>
                <span
                  class={`text-right font-mono ${
                    props.calendarSyncNeeded
                      ? 'text-warning'
                      : props.prefs.calendarId
                        ? 'text-accent-soft'
                        : 'text-ink-subtle'
                  }`}
                >
                  {!props.prefs.calendarId
                    ? 'Not created yet'
                    : props.calendarSyncNeeded
                      ? 'Update needed'
                      : 'Synced'}
                </span>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void props.onPrepareCalendarSync()}
                disabled={props.busy}
                class="inline-flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                <CalendarIcon class="h-3.5 w-3.5 shrink-0" />
                <span class="break-anywhere">
                  {props.busy
                    ? 'Checking Calendar...'
                    : props.hasGoogleToken
                      ? 'Review & Sync Calendar'
                      : props.googleEmail
                        ? `Connect (${props.googleEmail}) & Review`
                        : 'Connect Google & Review'}
                </span>
              </button>

              <Show when={props.prefs.calendarId}>
                <button
                  type="button"
                  onClick={() => props.onRequestDeleteCalendar()}
                  disabled={props.busy}
                  class="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-white/[0.08] bg-surface px-3 text-xs font-medium text-danger-soft transition-colors hover:border-danger/40 hover:bg-danger/10 disabled:opacity-50"
                >
                  <TrashIcon class="h-3.5 w-3.5 shrink-0" />
                  <span>Delete Calendar</span>
                </button>
              </Show>
            </div>

            {/* Explicit User Confirmation Dialog for Calendar Updates */}
            <Show when={props.pendingPlan}>
              {(plan) => (
                <div class="space-y-3 rounded-xl border border-accent/45 bg-surface-info p-4">
                  <div class="space-y-1">
                    <p class="text-xs font-semibold text-ink">Confirm Google Calendar Changes</p>
                    <p class="text-xs leading-relaxed text-ink-secondary">
                      Review what will change inside your dedicated{' '}
                      <strong class="text-ink">Habits Reminders</strong> calendar:
                    </p>
                  </div>

                  <ul class="list-inside list-disc space-y-1 font-mono text-xs text-ink-secondary tabular-nums">
                    <Show when={plan().willCreateCalendar}>
                      <li>
                        Create secondary calendar &quot;Habits Reminders&quot; ({plan().timeZone})
                      </li>
                    </Show>
                    <Show when={!plan().willCreateCalendar && plan().calendarId}>
                      <li>
                        Reuse existing &quot;Habits Reminders&quot; calendar ({plan().timeZone})
                      </li>
                    </Show>
                    <Show when={plan().willUpdateCalendarTz}>
                      <li>Update calendar timezone to {plan().timeZone}</li>
                    </Show>
                    <Show when={plan().duplicateCalendarIds.length > 0}>
                      <li>
                        Remove {plan().duplicateCalendarIds.length} duplicate &quot;Habits
                        Reminders&quot; calendar(s)
                      </li>
                    </Show>
                    <Show when={plan().toCreate.length > 0}>
                      <li>Add {plan().toCreate.length} upcoming reminder event(s)</li>
                    </Show>
                    <Show when={plan().toUpdate.length > 0}>
                      <li>Update {plan().toUpdate.length} existing reminder event(s)</li>
                    </Show>
                    <Show when={plan().toDelete.length > 0}>
                      <li>
                        Remove {plan().toDelete.length} completed or past event(s)
                        {plan().todayCleared ? ' (clears today)' : ''}
                      </li>
                    </Show>
                  </ul>

                  <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => props.onCancelCalendarSync()}
                      disabled={props.busy}
                      class="h-9 cursor-pointer rounded-xl px-3.5 text-xs font-medium text-ink-secondary hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void props.onConfirmCalendarSync()}
                      disabled={props.busy}
                      class="h-9 cursor-pointer rounded-xl bg-accent px-4 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      {props.busy ? 'Updating...' : 'Confirm Calendar Update'}
                    </button>
                  </div>
                </div>
              )}
            </Show>

            {/* Explicit User Confirmation Dialog for Deleting Calendar */}
            <Show when={props.confirmDeleteOpen}>
              <div class="space-y-3 rounded-xl border border-danger/45 bg-surface-danger p-4">
                <div class="space-y-1">
                  <p class="text-xs font-semibold text-danger-soft">
                    Delete &quot;Habits Reminders&quot; Calendar?
                  </p>
                  <p class="text-xs leading-relaxed text-danger-tint">
                    This permanently deletes the secondary Habits Reminders calendar and all its
                    reminder events from your Google Calendar. Your personal calendars, habits, and
                    Google Drive backups will not be touched.
                  </p>
                </div>
                <div class="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => props.onCancelDeleteCalendar()}
                    disabled={props.busy}
                    class="h-9 cursor-pointer rounded-xl px-3.5 text-xs font-medium text-ink-secondary hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void props.onConfirmDeleteCalendar()}
                    disabled={props.busy}
                    class="h-9 cursor-pointer rounded-xl bg-danger px-4 text-xs font-medium text-white hover:bg-danger-hover disabled:opacity-50"
                  >
                    {props.busy ? 'Deleting...' : 'Delete Calendar'}
                  </button>
                </div>
              </div>
            </Show>
          </Show>
        </section>
      </div>

      <div class="flex shrink-0 justify-end border-t border-white/[0.06] bg-surface px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
        <button
          type="button"
          onClick={() => props.onClose()}
          disabled={props.busy || slotBusy()}
          class="h-9 cursor-pointer rounded-xl px-4 text-xs font-medium text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}

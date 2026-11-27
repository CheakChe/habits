import { For, JSX, Show, createEffect, createSignal, untrack } from 'solid-js';
import {
  Habit,
  ReminderSlot,
  ScheduleApplyScope,
  normalizeDailyTarget,
  normalizeHabitUnit,
  normalizeReminderSlotIds,
  normalizeWeeklyTarget,
} from '../../types/domain';
import { CivilCalendar } from '../../utils/civil-calendar';
import {
  HABIT_EMOJIS,
  HABIT_ICONS,
  HabitAppearance,
  HabitBadge as HabitBadgeType,
} from '../../utils/habit-appearance';
import { HabitSchedule } from '../../utils/habit-schedule';
import { HabitBadge, HabitIconSvg } from '../HabitBadge';
import { CheckIcon } from '../Icons';
import {
  ALL_WEEKDAYS_MASK,
  DEFAULT_HABIT_COLOR,
  HABIT_COLORS,
  WEEKDAYS_ONLY_MASK,
  WEEKENDS_MASK,
} from '../constants';
import { DatePicker } from '../controls/DatePicker';
import { ModalHeader, ModalShell } from './ModalShell';
import { ReminderSlotSelector } from './ReminderSlotSelector';

interface HabitModalProps {
  open: boolean;
  editingHabit: Habit | null;
  reminderSlots: ReminderSlot[];
  todayDay: number;
  onClose: () => void;
  onCreateReminderSlot: (input: { label: string; time: string }) => Promise<ReminderSlot>;
  onSave: (data: {
    name: string;
    color: string;
    weekdays: number;
    weeklyTarget: number | null;
    dailyTarget: number | null;
    unit: string | null;
    reminderSlotIds: string[];
    startDay: number;
    scheduleApplyScope?: ScheduleApplyScope;
    scheduleEffectiveFromDay?: number;
  }) => Promise<void>;
}

export function HabitModal(props: HabitModalProps): JSX.Element {
  const [name, setName] = createSignal('');
  const [accentColor, setAccentColor] = createSignal(DEFAULT_HABIT_COLOR);
  const [hexInput, setHexInput] = createSignal(DEFAULT_HABIT_COLOR);
  const [badge, setBadge] = createSignal<HabitBadgeType>({ kind: 'none' });
  const [badgeTab, setBadgeTab] = createSignal<'none' | 'icon' | 'emoji'>('none');
  const [goalMode, setGoalMode] = createSignal<'checkoff' | 'measured'>('checkoff');
  const [dailyTargetInput, setDailyTargetInput] = createSignal('15');
  const [unitInput, setUnitInput] = createSignal('');
  const [scheduleMode, setScheduleMode] = createSignal<'weekdays' | 'weekly_target'>('weekdays');
  const [weekdays, setWeekdays] = createSignal(ALL_WEEKDAYS_MASK);
  const [weeklyTarget, setWeeklyTarget] = createSignal(3);
  const [selectedSlotIds, setSelectedSlotIds] = createSignal<string[]>([]);
  const [startDay, setStartDay] = createSignal<number>(untrack(() => props.todayDay));
  const [applyScope, setApplyScope] = createSignal<ScheduleApplyScope>('from_day');
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    const habit = props.editingHabit;
    const activeIds = new Set(untrack(() => props.reminderSlots).map((s) => s.id));
    if (habit) {
      const parsed = HabitAppearance.parse(habit.color);
      const dt = normalizeDailyTarget(habit.dailyTarget);
      setName(habit.name);
      setAccentColor(parsed.color);
      setHexInput(parsed.color);
      setBadge(parsed.badge);
      setBadgeTab(parsed.badge.kind);
      setGoalMode(dt !== null ? 'measured' : 'checkoff');
      setDailyTargetInput(dt !== null ? HabitSchedule.formatNumericValue(dt) : '15');
      setUnitInput(habit.unit ?? '');
      setScheduleMode(habit.weeklyTarget !== null ? 'weekly_target' : 'weekdays');
      setWeekdays(habit.weekdays);
      setWeeklyTarget(habit.weeklyTarget ?? 3);
      setSelectedSlotIds(
        normalizeReminderSlotIds(habit.reminderSlotIds).filter((id) => activeIds.has(id))
      );
      setStartDay(habit.startDay);
    } else {
      setName('');
      setAccentColor(DEFAULT_HABIT_COLOR);
      setHexInput(DEFAULT_HABIT_COLOR);
      setBadge({ kind: 'none' });
      setBadgeTab('none');
      setGoalMode('checkoff');
      setDailyTargetInput('15');
      setUnitInput('');
      setScheduleMode('weekdays');
      setWeekdays(ALL_WEEKDAYS_MASK);
      setWeeklyTarget(3);
      setSelectedSlotIds([]);
      setStartDay(props.todayDay);
    }
    setApplyScope('from_day');
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

  const selectedWeekdaysCount = () => CivilCalendar.countScheduledDays(weekdays());

  const selectedWeekdaySummary = () => {
    const mask = weekdays() & 0x7f;
    if (mask === ALL_WEEKDAYS_MASK) return 'Mon–Sun';
    if (mask === WEEKDAYS_ONLY_MASK) return 'Mon–Fri';
    if (mask === WEEKENDS_MASK) return 'Sat–Sun';
    const labels: string[] = [];
    for (let bit = 0; bit < 7; bit++) {
      if ((mask & (1 << bit)) !== 0) {
        labels.push(CivilCalendar.weekdayShortLabel(bit));
      }
    }
    return labels.join(', ');
  };

  const toggleWeekday = (bit: number) => {
    setWeekdays((prev) => prev ^ (1 << bit));
  };

  const parsedDailyTarget = () => {
    if (goalMode() !== 'measured') return null;
    const raw = dailyTargetInput().trim().replace(',', '.');
    if (!raw) return null;
    return normalizeDailyTarget(Number(raw));
  };

  const hasExistingHistory = () =>
    Boolean(props.editingHabit?.scheduleHistory && props.editingHabit.scheduleHistory.length > 1);

  const scheduleChanged = () => {
    const habit = props.editingHabit;
    if (!habit) return false;
    const prevWt = normalizeWeeklyTarget(habit.weeklyTarget);
    const prevWd = HabitSchedule.normalizeWeekdays(habit.weekdays, prevWt);
    const prevDt = normalizeDailyTarget(habit.dailyTarget);
    const nextWt =
      scheduleMode() === 'weekly_target' ? normalizeWeeklyTarget(weeklyTarget()) : null;
    const nextWd = HabitSchedule.normalizeWeekdays(weekdays(), nextWt);
    const nextDt = parsedDailyTarget();
    return nextWd !== prevWd || nextWt !== prevWt || nextDt !== prevDt;
  };

  const showApplyScopeSelector = () =>
    Boolean(
      props.editingHabit &&
      scheduleChanged() &&
      (startDay() < props.todayDay || hasExistingHistory())
    );

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
    const nextDailyTarget = parsedDailyTarget();
    if (goalMode() === 'measured' && nextDailyTarget === null) {
      setError('Enter a positive daily target (e.g. 15).');
      return;
    }
    const maskedWeekdays = weekdays() & 0x7f;
    if (maskedWeekdays === 0) {
      setError(
        scheduleMode() === 'weekly_target'
          ? 'Select at least one allowed day.'
          : 'Select at least one scheduled day.'
      );
      return;
    }
    if (
      scheduleMode() === 'weekly_target' &&
      weeklyTarget() > CivilCalendar.countScheduledDays(maskedWeekdays)
    ) {
      setError('Weekly target cannot exceed the number of selected days.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isFlexible = scheduleMode() === 'weekly_target';
      const editing = props.editingHabit;
      const scopeNeeded = showApplyScopeSelector();
      const changed = scheduleChanged();
      const nextUnit =
        goalMode() === 'measured' ? normalizeHabitUnit(unitInput()) : (editing?.unit ?? null);
      const activeSlotIds = new Set(props.reminderSlots.map((s) => s.id));
      const cleanSlotIds = normalizeReminderSlotIds(selectedSlotIds()).filter((id) =>
        activeSlotIds.has(id)
      );
      await props.onSave({
        name: trimmed,
        color: HabitAppearance.format(normalizedHex, badge()),
        weekdays: maskedWeekdays,
        weeklyTarget: isFlexible ? weeklyTarget() : null,
        dailyTarget: nextDailyTarget,
        unit: nextUnit,
        reminderSlotIds: cleanSlotIds,
        startDay: startDay(),
        ...(editing && scopeNeeded
          ? {
              scheduleApplyScope: applyScope(),
              scheduleEffectiveFromDay: applyScope() === 'from_day' ? props.todayDay : undefined,
            }
          : editing && changed
            ? { scheduleApplyScope: 'all' }
            : {}),
      });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save habit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={props.open}
      titleId="habit-modal-title"
      busy={saving()}
      onClose={() => props.onClose()}
    >
      <ModalHeader
        titleId="habit-modal-title"
        title={props.editingHabit ? 'Edit Habit' : 'New Habit'}
        onClose={() => props.onClose()}
      />

      <form onSubmit={(e) => void handleSubmit(e)} class="flex min-h-0 flex-1 flex-col">
        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-4">
          <Show when={error()}>
            {(msg) => (
              <div class="rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs text-danger-soft">
                {msg()}
              </div>
            )}
          </Show>

          <div class="space-y-1.5">
            <label for="habit-name" class="block text-xs font-medium text-ink-muted">
              Name
            </label>
            <input
              id="habit-name"
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Morning run, Read 20 pages..."
              autofocus
              class="h-11 w-full rounded-xl border border-white/[0.1] bg-canvas px-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
          </div>

          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="block shrink-0 text-xs font-medium text-ink-muted">
                Color &amp; Icon
              </span>
              <div class="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs text-ink-secondary">
                <HabitBadge appearanceRaw={composedAppearance()} size="sm" />
                <span class="max-w-[200px] truncate" title={name().trim() || 'Preview'}>
                  {name().trim() || 'Preview'}
                </span>
                <span
                  class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                  style={{
                    'background-color': accentColor(),
                    color: HabitAppearance.getContrastTextColor(accentColor()),
                  }}
                  aria-hidden="true"
                >
                  <CheckIcon class="h-3 w-3" />
                </span>
              </div>
            </div>

            {/* Preset swatches + native color picker + hex input */}
            <div class="flex flex-wrap items-center gap-2">
              <For each={HABIT_COLORS}>
                {(preset) => {
                  const selected = () => accentColor().toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      type="button"
                      onClick={() => applyColor(preset.hex)}
                      aria-label={preset.label}
                      aria-pressed={selected()}
                      class={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform ${
                        selected()
                          ? 'scale-105 ring-2 ring-white ring-offset-2 ring-offset-surface'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ 'background-color': preset.hex }}
                    />
                  );
                }}
              </For>

              <label
                title="Pick custom color"
                class="relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-1 ring-white/25 transition-all hover:ring-white/60"
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
                  class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <span
                  class="pointer-events-none h-3.5 w-3.5 rounded-full border border-black/40"
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
                class={`ml-auto h-8 w-24 rounded-lg border bg-canvas px-2.5 font-mono text-xs text-ink uppercase focus:outline-none ${
                  isHexInputValid()
                    ? 'border-white/[0.1] focus:border-accent'
                    : 'border-danger/60 focus:border-danger'
                }`}
              />
            </div>

            {/* Badge mode: Dot / Built-in Icons / Emoji */}
            <div class="space-y-2.5 rounded-2xl border border-white/[0.08] bg-canvas p-2.5">
              <div class="grid grid-cols-3 gap-1 rounded-xl bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setBadgeTab('none');
                    setBadge({ kind: 'none' });
                  }}
                  class={`h-7 cursor-pointer rounded-lg text-xs font-medium transition-colors ${
                    badgeTab() === 'none'
                      ? 'bg-surface-elevated text-ink'
                      : 'text-ink-subtle hover:text-ink'
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
                  class={`h-7 cursor-pointer rounded-lg text-xs font-medium transition-colors ${
                    badgeTab() === 'icon'
                      ? 'bg-surface-elevated text-ink'
                      : 'text-ink-subtle hover:text-ink'
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
                  class={`h-7 cursor-pointer rounded-lg text-xs font-medium transition-colors ${
                    badgeTab() === 'emoji'
                      ? 'bg-surface-elevated text-ink'
                      : 'text-ink-subtle hover:text-ink'
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
                          class={`flex h-9 cursor-pointer items-center justify-center rounded-lg border transition-colors ${
                            selected()
                              ? 'border-accent bg-surface-elevated'
                              : 'border-white/[0.06] bg-surface text-ink-muted hover:border-white/20 hover:text-ink'
                          }`}
                          style={selected() ? { color: accentColor() } : undefined}
                        >
                          <HabitIconSvg id={opt.id} class="h-4 w-4" />
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>

              <Show when={badgeTab() === 'emoji'}>
                <div class="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
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
                          class={`flex h-9 cursor-pointer items-center justify-center rounded-lg border text-base transition-colors ${
                            selected()
                              ? 'border-accent bg-surface-elevated'
                              : 'border-white/[0.06] bg-surface hover:border-white/20'
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

          <div class="space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <span class="block text-xs font-medium text-ink-muted">Schedule</span>
              <div class="inline-flex items-center rounded-xl border border-white/[0.08] bg-canvas p-0.5">
                <button
                  type="button"
                  onClick={() => setScheduleMode('weekdays')}
                  aria-pressed={scheduleMode() === 'weekdays'}
                  class={`h-7 cursor-pointer rounded-lg px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    scheduleMode() === 'weekdays'
                      ? 'bg-surface-elevated text-ink'
                      : 'text-ink-subtle hover:text-ink'
                  }`}
                >
                  Specific days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScheduleMode('weekly_target');
                    if ((weekdays() & 0x7f) === 0) {
                      setWeekdays(ALL_WEEKDAYS_MASK);
                    }
                  }}
                  aria-pressed={scheduleMode() === 'weekly_target'}
                  class={`h-7 cursor-pointer rounded-lg px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    scheduleMode() === 'weekly_target'
                      ? 'bg-surface-elevated text-ink'
                      : 'text-ink-subtle hover:text-ink'
                  }`}
                >
                  Times per week
                </button>
              </div>
            </div>

            <Show
              when={scheduleMode() === 'weekdays'}
              fallback={
                <div class="space-y-3">
                  <div
                    class="grid grid-cols-7 gap-1.5"
                    role="group"
                    aria-label="Weekly target count"
                  >
                    <For each={[1, 2, 3, 4, 5, 6, 7]}>
                      {(count) => {
                        const active = () => weeklyTarget() === count;
                        return (
                          <button
                            type="button"
                            onClick={() => setWeeklyTarget(count)}
                            aria-pressed={active()}
                            aria-label={`${count} times per week`}
                            class={`min-h-[40px] cursor-pointer rounded-xl font-mono text-xs font-medium tabular-nums transition-colors ${
                              active()
                                ? 'bg-accent text-white'
                                : 'border border-white/[0.08] bg-canvas text-ink-subtle hover:text-ink'
                            }`}
                          >
                            {count}×
                          </button>
                        );
                      }}
                    </For>
                  </div>

                  <div class="space-y-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="text-xs font-medium text-ink-muted">Allowed days</span>
                      <div class="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setWeekdays(ALL_WEEKDAYS_MASK)}
                          class={`cursor-pointer ${
                            (weekdays() & 0x7f) === ALL_WEEKDAYS_MASK
                              ? 'text-accent-soft'
                              : 'text-ink-muted hover:text-ink'
                          }`}
                        >
                          All
                        </button>
                        <span aria-hidden="true" class="text-ink-faint">
                          ·
                        </span>
                        <button
                          type="button"
                          onClick={() => setWeekdays(WEEKDAYS_ONLY_MASK)}
                          class={`cursor-pointer ${
                            (weekdays() & 0x7f) === WEEKDAYS_ONLY_MASK
                              ? 'text-accent-soft'
                              : 'text-ink-muted hover:text-ink'
                          }`}
                        >
                          Mon–Fri
                        </button>
                        <span aria-hidden="true" class="text-ink-faint">
                          ·
                        </span>
                        <button
                          type="button"
                          onClick={() => setWeekdays(WEEKENDS_MASK)}
                          class={`cursor-pointer ${
                            (weekdays() & 0x7f) === WEEKENDS_MASK
                              ? 'text-accent-soft'
                              : 'text-ink-muted hover:text-ink'
                          }`}
                        >
                          Sat–Sun
                        </button>
                      </div>
                    </div>

                    <div
                      class="grid grid-cols-7 gap-1.5"
                      role="group"
                      aria-label="Allowed weekdays"
                    >
                      <For each={[0, 1, 2, 3, 4, 5, 6]}>
                        {(bit) => {
                          const active = () => (weekdays() & (1 << bit)) !== 0;
                          return (
                            <button
                              type="button"
                              onClick={() => toggleWeekday(bit)}
                              aria-pressed={active()}
                              class={`min-h-[40px] cursor-pointer rounded-xl text-xs font-medium transition-colors ${
                                active()
                                  ? 'bg-accent text-white'
                                  : 'border border-white/[0.08] bg-canvas text-ink-subtle hover:text-ink'
                              }`}
                            >
                              {CivilCalendar.weekdayShortLabel(bit)}
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </div>

                  <p
                    class={`text-[11px] ${
                      selectedWeekdaysCount() === 0 || weeklyTarget() > selectedWeekdaysCount()
                        ? 'text-danger-soft'
                        : 'text-ink-subtle'
                    }`}
                  >
                    {selectedWeekdaysCount() === 0
                      ? 'Select at least one allowed day of the week.'
                      : weeklyTarget() > selectedWeekdaysCount()
                        ? `Weekly target (${weeklyTarget()}×) exceeds the ${selectedWeekdaysCount()} selected ${
                            selectedWeekdaysCount() === 1 ? 'day' : 'days'
                          }.`
                        : (weekdays() & 0x7f) === ALL_WEEKDAYS_MASK
                          ? `Complete ${weeklyTarget()}× on any days each week (Mon–Sun). Once finished, it clears from Today until next week.`
                          : `Complete ${weeklyTarget()}× on ${selectedWeekdaySummary()} each week. Clears from Today on off-days and once finished.`}
                  </p>
                </div>
              }
            >
              <div class="grid grid-cols-7 gap-1.5">
                <For each={[0, 1, 2, 3, 4, 5, 6]}>
                  {(bit) => {
                    const active = () => (weekdays() & (1 << bit)) !== 0;
                    return (
                      <button
                        type="button"
                        onClick={() => toggleWeekday(bit)}
                        aria-pressed={active()}
                        class={`min-h-[40px] cursor-pointer rounded-xl text-xs font-medium transition-colors ${
                          active()
                            ? 'bg-accent text-white'
                            : 'border border-white/[0.08] bg-canvas text-ink-subtle hover:text-ink'
                        }`}
                      >
                        {CivilCalendar.weekdayShortLabel(bit)}
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>

            {/* Daily Goal: Check-off vs Measured */}
            <div class="space-y-2.5 pt-1">
              <div class="flex items-center justify-between gap-2">
                <span class="block text-xs font-medium text-ink-muted">Daily goal</span>
                <div class="inline-flex items-center rounded-xl border border-white/[0.08] bg-canvas p-0.5">
                  <button
                    type="button"
                    onClick={() => setGoalMode('checkoff')}
                    aria-pressed={goalMode() === 'checkoff'}
                    class={`h-7 cursor-pointer rounded-lg px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      goalMode() === 'checkoff'
                        ? 'bg-surface-elevated text-ink'
                        : 'text-ink-subtle hover:text-ink'
                    }`}
                  >
                    Check-off
                  </button>
                  <button
                    type="button"
                    onClick={() => setGoalMode('measured')}
                    aria-pressed={goalMode() === 'measured'}
                    class={`h-7 cursor-pointer rounded-lg px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      goalMode() === 'measured'
                        ? 'bg-surface-elevated text-ink'
                        : 'text-ink-subtle hover:text-ink'
                    }`}
                  >
                    Measured
                  </button>
                </div>
              </div>

              <Show when={goalMode() === 'measured'}>
                <div class="space-y-2.5 rounded-2xl border border-white/[0.08] bg-canvas p-3">
                  <div class="grid grid-cols-2 gap-2.5">
                    <div class="space-y-1">
                      <label
                        for="habit-daily-target"
                        class="block text-[11px] font-medium text-ink-muted"
                      >
                        Target
                      </label>
                      <input
                        id="habit-daily-target"
                        type="number"
                        inputmode="decimal"
                        min="0.01"
                        step="any"
                        value={dailyTargetInput()}
                        onInput={(e) => setDailyTargetInput(e.currentTarget.value)}
                        placeholder="15"
                        class="h-10 w-full rounded-xl border border-white/[0.1] bg-surface px-3 font-mono text-sm text-ink tabular-nums placeholder:text-ink-faint focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div class="space-y-1">
                      <label for="habit-unit" class="block text-[11px] font-medium text-ink-muted">
                        Unit (optional)
                      </label>
                      <input
                        id="habit-unit"
                        type="text"
                        maxlength={24}
                        value={unitInput()}
                        onInput={(e) => setUnitInput(e.currentTarget.value)}
                        placeholder="e.g. min, pages"
                        class="h-10 w-full rounded-xl border border-white/[0.1] bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                      />
                    </div>
                  </div>

                  <p class="text-[11px] text-ink-subtle">
                    Quick logging on Today & Progress: +1, +5, and manual input.
                  </p>
                </div>
              </Show>
            </div>

            <Show when={showApplyScopeSelector()}>
              <div class="space-y-2.5 rounded-2xl border border-white/[0.08] bg-canvas p-3">
                <span class="block text-xs font-medium text-ink-muted">Apply change</span>
                <div class="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Apply change">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={applyScope() === 'from_day'}
                    onClick={() => setApplyScope('from_day')}
                    class={`min-h-[40px] cursor-pointer rounded-xl px-3 text-xs font-medium transition-colors ${
                      applyScope() === 'from_day'
                        ? 'bg-accent text-white'
                        : 'border border-white/[0.08] bg-surface text-ink-subtle hover:text-ink'
                    }`}
                  >
                    From today
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={applyScope() === 'all'}
                    onClick={() => setApplyScope('all')}
                    class={`min-h-[40px] cursor-pointer rounded-xl px-3 text-xs font-medium transition-colors ${
                      applyScope() === 'all'
                        ? 'bg-accent text-white'
                        : 'border border-white/[0.08] bg-surface text-ink-subtle hover:text-ink'
                    }`}
                  >
                    Entire history
                  </button>
                </div>
                <p class="text-[11px] text-ink-subtle">
                  {applyScope() === 'from_day'
                    ? `Keeps past history intact before ${CivilCalendar.formatShortDate(props.todayDay)}.`
                    : `Replaces the schedule and target from ${CivilCalendar.formatShortDate(startDay())} and recalculates past stats.`}
                </p>
              </div>
            </Show>

            <Show when={!showApplyScopeSelector() && hasExistingHistory()}>
              {(() => {
                const history = props.editingHabit!.scheduleHistory!;
                const latest = history[history.length - 1];
                return (
                  <p class="text-[11px] text-ink-subtle">
                    Updated {CivilCalendar.formatShortDate(latest.fromDay)} ·{' '}
                    <span class="font-mono tabular-nums">{history.length}</span> periods preserved
                  </p>
                );
              })()}
            </Show>
          </div>

          <div class="space-y-1.5">
            <label for="habit-start" class="block text-xs font-medium text-ink-muted">
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

          {/* Explicit Reminder Slots Assignment */}
          <ReminderSlotSelector
            idPrefix="habit"
            groupLabel="Habit reminder slots"
            emptyText="No reminder slots created yet. Habits have no reminders by default unless a slot is assigned."
            unselectedHint="No reminder assigned (default). Select one or more slots to receive reminders."
            open={props.open}
            reminderSlots={props.reminderSlots}
            selectedSlotIds={selectedSlotIds()}
            onChangeSelected={setSelectedSlotIds}
            onCreateReminderSlot={props.onCreateReminderSlot}
            onError={setError}
          />
        </div>

        <div class="flex shrink-0 items-center justify-end gap-3 border-t border-white/[0.06] bg-surface px-6 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6">
          <button
            type="button"
            onClick={() => props.onClose()}
            class="h-10 cursor-pointer rounded-xl px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving()}
            class="h-10 cursor-pointer rounded-xl bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saving() ? 'Saving...' : props.editingHabit ? 'Save Changes' : 'Create Habit'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

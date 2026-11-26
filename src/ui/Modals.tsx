import { For, JSX, Show, createEffect, createSignal, onCleanup, untrack } from 'solid-js';
import { Portal } from 'solid-js/web';
import { CalendarSyncPlan } from '../sync/calendar-reminder-service';
import {
  DriveRevisionInspectResult,
  DriveRevisionMeta,
  MAX_REVISIONS_TO_KEEP,
  SyncPreparationResult,
} from '../sync/drive-sync-service';
import {
  DomainSnapshot,
  Habit,
  ReminderSlot,
  ScheduleApplyScope,
  SessionMode,
  Task,
  TaskStatus,
  normalizeDailyTarget,
  normalizeHabitUnit,
  normalizeReminderSlotIds,
  normalizeReminderSlotLabel,
  normalizeReminderSlotTime,
  normalizeWeeklyTarget,
} from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { HabitSchedule } from '../utils/habit-schedule';
import { Helpers } from '../utils/helpers';
import {
  BadgePermissionState,
  ReminderPlanner,
  ReminderPreferences,
  TodayPendingSummary,
} from '../utils/reminder-planner';
import { TodayBoard } from '../utils/today-board';
import {
  HABIT_EMOJIS,
  HABIT_ICONS,
  HabitAppearance,
  HabitBadge as HabitBadgeType,
} from '../utils/habit-appearance';
import { CustomSelect, CustomTimePicker, DatePicker, SelectOption } from './CustomControls';
import { HabitBadge, HabitIconSvg } from './HabitBadge';
import {
  ArchiveIcon,
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  CloudSyncIcon,
  DownloadIcon,
  DriveIcon,
  EditIcon,
  HistoryClockIcon,
  PlusIcon,
  RepeatIcon,
  RestoreIcon,
  SwitchAccountIcon,
  TrashIcon,
  UploadIcon,
} from './Icons';
import { PWAInstallButton } from './PwaControls';
import {
  ALL_WEEKDAYS_MASK,
  DEFAULT_HABIT_COLOR,
  HABIT_COLORS,
  WEEKDAYS_ONLY_MASK,
  WEEKENDS_MASK,
} from './constants';
import { useBodyScrollLock } from './scroll-lock';
import { TaskDraftPrefill, TaskModalMode } from './tracker-store';

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
            ? { scheduleApplyScope: 'all' as ScheduleApplyScope }
            : {}),
      });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save habit.');
    } finally {
      setSaving(false);
    }
  };

  useBodyScrollLock(() => props.open);

  createEffect(() => {
    if (!props.open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !saving()) {
        props.onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-end justify-center overscroll-none bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="habit-modal-title"
        >
          <div class="max-h-modal flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-[#14161B] sm:max-w-md sm:rounded-3xl">
            <div class="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-6 pt-5 pb-3 sm:pt-6">
              <h2 id="habit-modal-title" class="font-display text-lg font-semibold text-[#F5F7FA]">
                {props.editingHabit ? 'Edit Habit' : 'New Habit'}
              </h2>
              <button
                type="button"
                onClick={() => props.onClose()}
                aria-label="Close modal"
                class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-full text-[#8E95A5] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
              >
                <CloseIcon class="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} class="flex min-h-0 flex-1 flex-col">
              <div class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-4">
                <Show when={error()}>
                  {(msg) => (
                    <div class="rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/10 px-3.5 py-2.5 text-xs text-[#FCA5A5]">
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
                    class="h-11 w-full rounded-xl border border-white/[0.1] bg-[#0A0B0E] px-3.5 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>

                <div class="space-y-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="block shrink-0 text-xs font-medium text-[#9AA1B1]">
                      Color &amp; Icon
                    </span>
                    <div class="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs text-[#C8CDD8]">
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
                        const selected = () =>
                          accentColor().toLowerCase() === preset.hex.toLowerCase();
                        return (
                          <button
                            type="button"
                            onClick={() => applyColor(preset.hex)}
                            aria-label={preset.label}
                            aria-pressed={selected()}
                            class={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform ${
                              selected()
                                ? 'scale-105 ring-2 ring-white ring-offset-2 ring-offset-[#14161B]'
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
                      class={`ml-auto h-8 w-24 rounded-lg border bg-[#0A0B0E] px-2.5 font-mono text-xs text-[#F5F7FA] uppercase focus:outline-none ${
                        isHexInputValid()
                          ? 'border-white/[0.1] focus:border-[#3B82F6]'
                          : 'border-[#EF4444]/60 focus:border-[#EF4444]'
                      }`}
                    />
                  </div>

                  {/* Badge mode: Dot / Built-in Icons / Emoji */}
                  <div class="space-y-2.5 rounded-2xl border border-white/[0.08] bg-[#0A0B0E] p-2.5">
                    <div class="grid grid-cols-3 gap-1 rounded-xl bg-[#14161B] p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setBadgeTab('none');
                          setBadge({ kind: 'none' });
                        }}
                        class={`h-7 cursor-pointer rounded-lg text-xs font-medium transition-colors ${
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
                        class={`h-7 cursor-pointer rounded-lg text-xs font-medium transition-colors ${
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
                        class={`h-7 cursor-pointer rounded-lg text-xs font-medium transition-colors ${
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
                                class={`flex h-9 cursor-pointer items-center justify-center rounded-lg border transition-colors ${
                                  selected()
                                    ? 'border-[#3B82F6] bg-[#1C1F26]'
                                    : 'border-white/[0.06] bg-[#14161B] text-[#9AA1B1] hover:border-white/20 hover:text-[#F5F7FA]'
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
                                    ? 'border-[#3B82F6] bg-[#1C1F26]'
                                    : 'border-white/[0.06] bg-[#14161B] hover:border-white/20'
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
                    <span class="block text-xs font-medium text-[#9AA1B1]">Schedule</span>
                    <div class="inline-flex items-center rounded-xl border border-white/[0.08] bg-[#0A0B0E] p-0.5">
                      <button
                        type="button"
                        onClick={() => setScheduleMode('weekdays')}
                        aria-pressed={scheduleMode() === 'weekdays'}
                        class={`h-7 cursor-pointer rounded-lg px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                          scheduleMode() === 'weekdays'
                            ? 'bg-[#1C1F26] text-[#F5F7FA]'
                            : 'text-[#8E95A5] hover:text-[#F5F7FA]'
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
                            ? 'bg-[#1C1F26] text-[#F5F7FA]'
                            : 'text-[#8E95A5] hover:text-[#F5F7FA]'
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
                                      ? 'bg-[#3B82F6] text-white'
                                      : 'border border-white/[0.08] bg-[#0A0B0E] text-[#8E95A5] hover:text-[#F5F7FA]'
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
                            <span class="text-xs font-medium text-[#9AA1B1]">Allowed days</span>
                            <div class="flex items-center gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => setWeekdays(ALL_WEEKDAYS_MASK)}
                                class={`cursor-pointer ${
                                  (weekdays() & 0x7f) === ALL_WEEKDAYS_MASK
                                    ? 'text-[#60A5FA]'
                                    : 'text-[#9AA1B1] hover:text-[#F5F7FA]'
                                }`}
                              >
                                All
                              </button>
                              <span aria-hidden="true" class="text-[#5B6270]">
                                ·
                              </span>
                              <button
                                type="button"
                                onClick={() => setWeekdays(WEEKDAYS_ONLY_MASK)}
                                class={`cursor-pointer ${
                                  (weekdays() & 0x7f) === WEEKDAYS_ONLY_MASK
                                    ? 'text-[#60A5FA]'
                                    : 'text-[#9AA1B1] hover:text-[#F5F7FA]'
                                }`}
                              >
                                Mon–Fri
                              </button>
                              <span aria-hidden="true" class="text-[#5B6270]">
                                ·
                              </span>
                              <button
                                type="button"
                                onClick={() => setWeekdays(WEEKENDS_MASK)}
                                class={`cursor-pointer ${
                                  (weekdays() & 0x7f) === WEEKENDS_MASK
                                    ? 'text-[#60A5FA]'
                                    : 'text-[#9AA1B1] hover:text-[#F5F7FA]'
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
                                        ? 'bg-[#3B82F6] text-white'
                                        : 'border border-white/[0.08] bg-[#0A0B0E] text-[#8E95A5] hover:text-[#F5F7FA]'
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
                            selectedWeekdaysCount() === 0 ||
                            weeklyTarget() > selectedWeekdaysCount()
                              ? 'text-[#FCA5A5]'
                              : 'text-[#8E95A5]'
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
                                  ? 'bg-[#3B82F6] text-white'
                                  : 'border border-white/[0.08] bg-[#0A0B0E] text-[#8E95A5] hover:text-[#F5F7FA]'
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
                      <span class="block text-xs font-medium text-[#9AA1B1]">Daily goal</span>
                      <div class="inline-flex items-center rounded-xl border border-white/[0.08] bg-[#0A0B0E] p-0.5">
                        <button
                          type="button"
                          onClick={() => setGoalMode('checkoff')}
                          aria-pressed={goalMode() === 'checkoff'}
                          class={`h-7 cursor-pointer rounded-lg px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                            goalMode() === 'checkoff'
                              ? 'bg-[#1C1F26] text-[#F5F7FA]'
                              : 'text-[#8E95A5] hover:text-[#F5F7FA]'
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
                              ? 'bg-[#1C1F26] text-[#F5F7FA]'
                              : 'text-[#8E95A5] hover:text-[#F5F7FA]'
                          }`}
                        >
                          Measured
                        </button>
                      </div>
                    </div>

                    <Show when={goalMode() === 'measured'}>
                      <div class="space-y-2.5 rounded-2xl border border-white/[0.08] bg-[#0A0B0E] p-3">
                        <div class="grid grid-cols-2 gap-2.5">
                          <div class="space-y-1">
                            <label
                              for="habit-daily-target"
                              class="block text-[11px] font-medium text-[#9AA1B1]"
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
                              class="h-10 w-full rounded-xl border border-white/[0.1] bg-[#14161B] px-3 font-mono text-sm text-[#F5F7FA] tabular-nums placeholder:text-[#5B6270] focus:border-[#3B82F6] focus:outline-none"
                            />
                          </div>
                          <div class="space-y-1">
                            <label
                              for="habit-unit"
                              class="block text-[11px] font-medium text-[#9AA1B1]"
                            >
                              Unit (optional)
                            </label>
                            <input
                              id="habit-unit"
                              type="text"
                              maxlength={24}
                              value={unitInput()}
                              onInput={(e) => setUnitInput(e.currentTarget.value)}
                              placeholder="e.g. min, pages"
                              class="h-10 w-full rounded-xl border border-white/[0.1] bg-[#14161B] px-3 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:border-[#3B82F6] focus:outline-none"
                            />
                          </div>
                        </div>

                        <p class="text-[11px] text-[#8E95A5]">
                          Quick logging on Today & Progress: +1, +5, and manual input.
                        </p>
                      </div>
                    </Show>
                  </div>

                  <Show when={showApplyScopeSelector()}>
                    <div class="space-y-2.5 rounded-2xl border border-white/[0.08] bg-[#0A0B0E] p-3">
                      <span class="block text-xs font-medium text-[#9AA1B1]">Apply change</span>
                      <div
                        class="grid grid-cols-2 gap-1.5"
                        role="radiogroup"
                        aria-label="Apply change"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={applyScope() === 'from_day'}
                          onClick={() => setApplyScope('from_day')}
                          class={`min-h-[40px] cursor-pointer rounded-xl px-3 text-xs font-medium transition-colors ${
                            applyScope() === 'from_day'
                              ? 'bg-[#3B82F6] text-white'
                              : 'border border-white/[0.08] bg-[#14161B] text-[#8E95A5] hover:text-[#F5F7FA]'
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
                              ? 'bg-[#3B82F6] text-white'
                              : 'border border-white/[0.08] bg-[#14161B] text-[#8E95A5] hover:text-[#F5F7FA]'
                          }`}
                        >
                          Entire history
                        </button>
                      </div>
                      <p class="text-[11px] text-[#8E95A5]">
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
                        <p class="text-[11px] text-[#8E95A5]">
                          Updated {CivilCalendar.formatShortDate(latest.fromDay)} ·{' '}
                          <span class="font-mono tabular-nums">{history.length}</span> periods
                          preserved
                        </p>
                      );
                    })()}
                  </Show>
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

              <div class="flex shrink-0 items-center justify-end gap-3 border-t border-white/[0.06] bg-[#14161B] px-6 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6">
                <button
                  type="button"
                  onClick={() => props.onClose()}
                  class="h-10 cursor-pointer rounded-xl px-4 text-sm font-medium text-[#9AA1B1] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving()}
                  class="h-10 cursor-pointer rounded-xl bg-[#3B82F6] px-5 text-sm font-medium text-white transition-colors hover:bg-[#2563EB] disabled:opacity-50"
                >
                  {saving() ? 'Saving...' : props.editingHabit ? 'Save Changes' : 'Create Habit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

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

function ReminderSlotSelector(props: ReminderSlotSelectorProps): JSX.Element {
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
        <span class="block text-xs font-medium text-[#9AA1B1]">Reminder slots</span>
        <Show when={props.onCreateReminderSlot}>
          <button
            type="button"
            onClick={() => setNewSlotOpen((prev) => !prev)}
            class="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[#60A5FA] hover:underline"
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
                      ? 'border-[#3B82F6]/60 bg-[#3B82F6]/15 text-[#F5F7FA]'
                      : 'border-white/[0.08] bg-[#0A0B0E] text-[#9AA1B1] hover:border-white/20 hover:text-[#F5F7FA]'
                  }`}
                >
                  <ClockIcon
                    class={`h-3.5 w-3.5 shrink-0 ${
                      selected() ? 'text-[#60A5FA]' : 'text-[#8E95A5]'
                    }`}
                  />
                  <span class="font-mono tabular-nums">{slot.time}</span>
                  <Show when={slot.label}>
                    <span class="text-[#C8CDD8]">· {slot.label}</span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </Show>

      <Show when={newSlotOpen() && props.onCreateReminderSlot}>
        <div class="space-y-2.5 rounded-2xl border border-white/[0.08] bg-[#0A0B0E] p-3">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={newSlotLabel()}
              onInput={(e) => setNewSlotLabel(e.currentTarget.value)}
              maxlength={32}
              placeholder="Label (optional, e.g. Morning)"
              aria-label="New slot label"
              class="h-10 w-full rounded-xl border border-white/[0.1] bg-[#14161B] px-3 text-xs text-[#F5F7FA] placeholder:text-[#5B6270] focus:border-[#3B82F6] focus:outline-none"
            />
            <CustomTimePicker
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
              class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl bg-[#3B82F6] px-3 text-xs font-medium text-white transition-colors hover:bg-[#2563EB] disabled:opacity-50"
            >
              <PlusIcon class="h-3.5 w-3.5" />
              <span>{creatingSlot() ? 'Adding...' : 'Add & Select Slot'}</span>
            </button>
          </div>
        </div>
      </Show>

      <p class="text-[11px] text-[#8E95A5]">
        {props.reminderSlots.length === 0
          ? props.emptyText
          : props.selectedSlotIds.length === 0
            ? props.unselectedHint
            : `Assigned to ${props.selectedSlotIds.length} reminder ${props.selectedSlotIds.length === 1 ? 'slot' : 'slots'}.`}
      </p>
    </div>
  );
}

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

  useBodyScrollLock(() => props.open);

  createEffect(() => {
    if (!props.open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !saving()) {
        props.onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-end justify-center overscroll-none bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-modal-title"
        >
          <div class="max-h-modal flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-[#14161B] sm:max-w-md sm:rounded-3xl">
            <div class="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-6 pt-5 pb-3 sm:pt-6">
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
                class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-full text-[#8E95A5] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
              >
                <CloseIcon class="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} class="flex min-h-0 flex-1 flex-col">
              <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
                <Show when={props.mode === 'next'}>
                  <div class="flex items-center gap-2 rounded-xl border border-[#3B82F6]/25 bg-[#3B82F6]/10 px-3.5 py-2.5 text-xs text-[#93C5FD]">
                    <RepeatIcon class="h-4 w-4 shrink-0" />
                    <span>
                      Completed! Pre-filled the next occurrence below — pick a new date or skip.
                    </span>
                  </div>
                </Show>

                <Show when={error()}>
                  {(msg) => (
                    <div class="rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/10 px-3.5 py-2.5 text-xs text-[#FCA5A5]">
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
                    class="h-11 w-full rounded-xl border border-white/[0.1] bg-[#0A0B0E] px-3.5 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:border-[#3B82F6] focus:outline-none"
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
                    class="w-full resize-none rounded-xl border border-white/[0.1] bg-[#0A0B0E] p-3.5 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>

                <div class="space-y-2">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <label for="task-due" class="text-xs font-medium text-[#9AA1B1]">
                      Due date
                    </label>
                    <div class="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setDueDay(props.todayDay)}
                        class="cursor-pointer text-[#60A5FA] hover:underline"
                      >
                        Today
                      </button>
                      <span aria-hidden="true" class="text-[#5B6270]">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => setDueDay(props.todayDay + 1)}
                        class="cursor-pointer text-[#9AA1B1] hover:text-[#F5F7FA]"
                      >
                        Tomorrow
                      </button>
                      <span aria-hidden="true" class="text-[#5B6270]">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => setDueDay(null)}
                        class="cursor-pointer text-[#9AA1B1] hover:text-[#F5F7FA]"
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

                <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-[#0A0B0E] px-3.5 py-3 transition-colors hover:border-white/[0.15]">
                  <input
                    type="checkbox"
                    checked={repeatable()}
                    onChange={(e) => setRepeatable(e.currentTarget.checked)}
                    class="mt-0.5 h-4 w-4 cursor-pointer rounded accent-[#3B82F6]"
                  />
                  <div class="min-w-0 flex-1 space-y-0.5">
                    <div class="flex items-center gap-1.5 text-xs font-medium text-[#F5F7FA]">
                      <RepeatIcon class="h-3.5 w-3.5 text-[#60A5FA]" />
                      <span>Repeatable task</span>
                    </div>
                    <p class="text-[11px] text-[#8E95A5]">
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
                    <span class="block text-xs font-medium text-[#9AA1B1]">Status</span>
                    <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <For each={TASK_STATUS_OPTIONS}>
                        {(opt) => {
                          const active = () => status() === opt.value;
                          const activeClass = () => {
                            if (!active()) {
                              return 'bg-[#0A0B0E] border-white/[0.08] text-[#8E95A5] hover:text-[#F5F7FA] hover:border-white/20';
                            }
                            switch (opt.value) {
                              case 'done':
                                return 'bg-[#3B82F6]/15 border-[#3B82F6]/50 text-[#93C5FD]';
                              case 'not_done':
                                return 'bg-[#EF4444]/15 border-[#EF4444]/50 text-[#FCA5A5]';
                              case 'archived':
                                return 'bg-[#1C1F26] border-white/25 text-[#F5F7FA]';
                              case 'open':
                              default:
                                return 'bg-[#3B82F6]/15 border-[#3B82F6]/60 text-[#93C5FD]';
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
                    <p class="text-[11px] text-[#8E95A5]">
                      {TASK_STATUS_OPTIONS.find((o) => o.value === status())?.hint}
                    </p>
                  </div>
                </Show>
              </div>

              <div class="flex shrink-0 items-center justify-end gap-3 border-t border-white/[0.06] bg-[#14161B] px-6 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6">
                <button
                  type="button"
                  onClick={() => props.onClose()}
                  class="h-10 cursor-pointer rounded-xl px-4 text-sm font-medium text-[#9AA1B1] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
                >
                  {props.mode === 'next' ? 'Skip' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving()}
                  class="h-10 cursor-pointer rounded-xl bg-[#3B82F6] px-5 text-sm font-medium text-white transition-colors hover:bg-[#2563EB] disabled:opacity-50"
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
      </Portal>
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
  useBodyScrollLock(() => Boolean(props.pending));

  createEffect(() => {
    if (!props.pending) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !props.uploading) {
        props.onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <Show when={props.pending}>
      {(pending) => (
        <Portal>
          <div
            class="fixed inset-0 z-50 flex items-end justify-center overscroll-none bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-confirm-title"
          >
            <div class="max-h-modal flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-[#14161B] sm:max-w-md sm:rounded-3xl">
              <div class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-6">
                <div class="flex items-start gap-3">
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#3B82F6]/30 bg-[#3B82F6]/15 text-[#60A5FA]">
                    <CloudSyncIcon class="h-5 w-5" />
                  </div>
                  <div class="min-w-0 flex-1">
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

                <div class="grid grid-cols-2 gap-3 rounded-2xl border border-white/[0.08] bg-[#0A0B0E] p-4 text-xs">
                  <div>
                    <span class="block text-[#8E95A5]">Habits</span>
                    <span class="font-mono text-base font-medium text-[#F5F7FA] tabular-nums">
                      {pending().summary.habitsCount}
                    </span>
                  </div>
                  <div>
                    <span class="block text-[#8E95A5]">Check-ins</span>
                    <span class="font-mono text-base font-medium text-[#F5F7FA] tabular-nums">
                      {pending().summary.checkinsCount}
                    </span>
                  </div>
                  <div>
                    <span class="block text-[#8E95A5]">Day Notes</span>
                    <span class="font-mono text-base font-medium text-[#F5F7FA] tabular-nums">
                      {pending().summary.notesCount}
                    </span>
                  </div>
                  <div>
                    <span class="block text-[#8E95A5]">Tasks · Snapshot Size</span>
                    <span
                      class="font-mono text-base font-medium text-[#F5F7FA] tabular-nums"
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
                  <div class="rounded-xl border border-[#3B82F6]/25 bg-[#3B82F6]/10 px-3.5 py-2.5 text-xs text-[#93C5FD]">
                    Detected {pending().duplicateFileIds!.length} duplicate snapshot{' '}
                    {pending().duplicateFileIds!.length === 1 ? 'file' : 'files'} in Google Drive.
                    All records were merged and duplicates will be cleaned up after upload.
                  </div>
                </Show>
              </div>

              <div class="flex shrink-0 items-center justify-end gap-3 border-t border-white/[0.06] bg-[#14161B] px-6 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6">
                <button
                  type="button"
                  onClick={() => props.onCancel()}
                  disabled={props.uploading}
                  class="h-10 cursor-pointer rounded-xl px-4 text-sm font-medium text-[#9AA1B1] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void props.onConfirm()}
                  disabled={props.uploading}
                  class="h-10 cursor-pointer rounded-xl bg-[#3B82F6] px-5 text-sm font-medium text-white transition-colors hover:bg-[#2563EB] disabled:opacity-50"
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
        </Portal>
      )}
    </Show>
  );
}

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

  useBodyScrollLock(() => props.open);

  createEffect(() => {
    if (!props.open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !busy()) {
        props.onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-end justify-center overscroll-none bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy()) {
              props.onClose();
            }
          }}
        >
          <div class="max-h-modal flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-[#14161B] sm:max-w-sm sm:rounded-3xl">
            <div class="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-6 pt-5 pb-3 sm:pt-6">
              <h2
                id="account-modal-title"
                class="min-w-0 font-display text-lg font-semibold text-[#F5F7FA]"
              >
                Workspace &amp; Sync Mode
              </h2>
              <button
                type="button"
                onClick={() => props.onClose()}
                aria-label="Close modal"
                class="flex min-h-[40px] min-w-[40px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8E95A5] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
              >
                <CloseIcon class="h-4 w-4" />
              </button>
            </div>

            <div class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
              <div class="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-[#0A0B0E] p-4">
                <DriveIcon class="mt-0.5 h-5 w-5 shrink-0 text-[#60A5FA]" />
                <div class="min-w-0 flex-1 space-y-1">
                  <p class="text-sm font-medium text-[#F5F7FA]">
                    {props.mode === 'google' ? 'Google Drive & Calendar Mode' : 'Local Guest Mode'}
                  </p>
                  <Show when={props.mode === 'google' && props.googleEmail}>
                    <p class="break-anywhere font-mono text-xs text-[#60A5FA]">
                      {props.googleEmail}
                    </p>
                  </Show>
                  <p class="text-xs leading-relaxed text-[#8E95A5]">
                    {props.mode === 'google'
                      ? props.hasGoogleToken
                        ? 'Connected to Google Drive and Calendar. Local edits stay in IndexedDB until you sync.'
                        : 'Local IndexedDB is active. Reconnect Google whenever you want to sync Drive or Calendar reminders.'
                      : 'All habits, check-ins, notes, and tasks are stored solely in your browser IndexedDB.'}
                  </p>
                </div>
              </div>

              <div class="space-y-3 rounded-2xl border border-white/[0.08] bg-[#0A0B0E] p-4">
                <div class="space-y-0.5">
                  <p class="text-xs font-medium text-[#F5F7FA]">Local Backup (.bin)</p>
                  <p class="text-[11px] text-[#8E95A5]">
                    Export a snapshot file or safely merge an existing backup into this device.
                  </p>
                </div>

                <Show when={backupError()}>
                  {(msg) => (
                    <div class="break-anywhere rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#FCA5A5]">
                      {msg()}
                    </div>
                  )}
                </Show>

                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleExport()}
                    disabled={busy()}
                    class="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#14161B] px-3 text-xs font-medium whitespace-nowrap text-[#F5F7FA] transition-colors hover:bg-[#1C1F26] disabled:opacity-50"
                  >
                    <DownloadIcon class="h-3.5 w-3.5 text-[#60A5FA]" />
                    <span>Export .bin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef?.click()}
                    disabled={busy()}
                    class="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#14161B] px-3 text-xs font-medium whitespace-nowrap text-[#F5F7FA] transition-colors hover:bg-[#1C1F26] disabled:opacity-50"
                  >
                    <UploadIcon class="h-3.5 w-3.5 text-[#60A5FA]" />
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
                    class="h-11 w-full cursor-pointer rounded-xl bg-[#3B82F6] text-sm font-medium text-white transition-colors hover:bg-[#2563EB] disabled:opacity-50"
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
                    class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#1C1F26] text-sm font-medium text-[#F5F7FA] transition-colors hover:bg-[#252933] disabled:opacity-50"
                  >
                    <BellIcon class="h-4 w-4 text-[#60A5FA]" />
                    <span>Reminders &amp; App Badge</span>
                  </button>
                </Show>
                <Show when={props.mode === 'google' && props.onOpenRevisions}>
                  <button
                    type="button"
                    onClick={() => void props.onOpenRevisions?.()}
                    disabled={busy()}
                    class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#1C1F26] text-sm font-medium text-[#F5F7FA] transition-colors hover:bg-[#252933] disabled:opacity-50"
                  >
                    <HistoryClockIcon class="h-4 w-4 text-[#60A5FA]" />
                    <span>Drive Version History</span>
                  </button>
                </Show>
                <PWAInstallButton variant="full" />
                <button
                  type="button"
                  onClick={() => void handleSwitch()}
                  disabled={busy()}
                  class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#1C1F26] text-sm font-medium text-[#F5F7FA] transition-colors hover:bg-[#252933] disabled:opacity-50"
                >
                  <SwitchAccountIcon class="h-4 w-4 text-[#8E95A5]" />
                  <span>Switch Account or Mode</span>
                </button>
                <div class="pt-1 text-center">
                  <a
                    href="./privacy.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs text-[#8E95A5] hover:text-[#F5F7FA] hover:underline"
                  >
                    Privacy Policy
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Portal>
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

export function DriveRevisionsModal(props: DriveRevisionsModalProps): JSX.Element {
  useBodyScrollLock(() => props.open);

  createEffect(() => {
    if (!props.open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !props.restoring) {
        props.onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-end justify-center overscroll-none bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revisions-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !props.restoring) {
              props.onClose();
            }
          }}
        >
          <div class="max-h-modal flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-[#14161B] sm:max-w-lg sm:rounded-3xl">
            <div class="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
              <div class="flex min-w-0 flex-1 items-start gap-3">
                <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#3B82F6]/30 bg-[#3B82F6]/15 text-[#60A5FA]">
                  <HistoryClockIcon class="h-4 w-4" />
                </div>
                <div class="min-w-0 flex-1 space-y-0.5">
                  <h2
                    id="revisions-modal-title"
                    class="font-display text-lg font-semibold text-[#F5F7FA]"
                  >
                    Drive Version History
                  </h2>
                  <p class="text-xs text-[#8E95A5]">
                    Up to the latest {MAX_REVISIONS_TO_KEEP} versions are kept automatically in
                    Google Drive.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => props.onClose()}
                disabled={props.restoring}
                aria-label="Close modal"
                class="flex min-h-[40px] min-w-[40px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8E95A5] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA] disabled:opacity-50"
              >
                <CloseIcon class="h-4 w-4" />
              </button>
            </div>

            <Show when={props.error}>
              {(msg) => (
                <div class="break-anywhere mx-5 mt-3 shrink-0 rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/10 px-3.5 py-2.5 text-xs text-[#FCA5A5] sm:mx-6">
                  {msg()}
                </div>
              )}
            </Show>

            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
              <Show
                when={!props.loading}
                fallback={
                  <div class="rounded-2xl border border-white/[0.08] bg-[#0A0B0E] p-8 text-center text-xs text-[#8E95A5]">
                    Loading snapshot revisions from Google Drive...
                  </div>
                }
              >
                <Show
                  when={props.revisions.length > 0}
                  fallback={
                    <div class="space-y-2 rounded-2xl border border-white/[0.08] bg-[#0A0B0E] p-8 text-center">
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
                        const isSelected = () => props.inspectedRevision?.revisionId === rev.id;
                        const isInspecting = () => props.inspectingRevisionId === rev.id;
                        return (
                          <div
                            class={`rounded-2xl border p-3.5 transition-colors ${
                              isSelected()
                                ? 'border-[#3B82F6]/45 bg-[#182030]'
                                : 'border-white/[0.08] bg-[#0A0B0E]'
                            }`}
                          >
                            <div class="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap sm:items-center">
                              <div class="min-w-0 flex-1 space-y-0.5">
                                <div class="flex flex-wrap items-center gap-2">
                                  <span class="text-xs font-medium text-[#F5F7FA]">
                                    {formatRevisionTime(rev.modifiedTime)}
                                  </span>
                                  <Show when={isCurrent()}>
                                    <span class="shrink-0 rounded-md bg-[#3B82F6]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#93C5FD]">
                                      Current
                                    </span>
                                  </Show>
                                  <Show when={rev.keepForever}>
                                    <span class="shrink-0 rounded-md bg-[#3B82F6]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#93C5FD]">
                                      Pinned
                                    </span>
                                  </Show>
                                </div>
                                <p
                                  class="break-anywhere font-mono text-[11px] text-[#8E95A5] tabular-nums"
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
                                  isInspecting() ||
                                  props.restoring ||
                                  props.inspectingRevisionId !== null
                                }
                                class="h-8 shrink-0 cursor-pointer rounded-xl border border-white/[0.08] bg-[#14161B] px-3 text-xs font-medium whitespace-nowrap text-[#F5F7FA] hover:bg-[#1C1F26] disabled:opacity-50"
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

              <Show when={props.inspectedRevision}>
                {(inspected) => {
                  const isLatest = () => props.revisions[0]?.id === inspected().revisionId;
                  return (
                    <div class="space-y-3 rounded-2xl border border-[#3B82F6]/30 bg-[#0A0B0E] p-4">
                      <div class="flex items-start justify-between gap-3">
                        <span class="break-anywhere min-w-0 flex-1 text-xs font-medium text-[#F5F7FA]">
                          Revision #{inspected().revisionId} Contents
                        </span>
                        <span
                          class="shrink-0 font-mono text-[11px] whitespace-nowrap text-[#8E95A5] tabular-nums"
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
                        <div class="min-w-0 rounded-xl bg-[#14161B] p-2.5">
                          <span class="block text-[11px] text-[#8E95A5]">Habits</span>
                          <span class="font-mono font-medium text-[#F5F7FA] tabular-nums">
                            {inspected().summary.habitsCount}
                          </span>
                        </div>
                        <div class="min-w-0 rounded-xl bg-[#14161B] p-2.5">
                          <span class="block text-[11px] text-[#8E95A5]">Check-ins</span>
                          <span class="font-mono font-medium text-[#F5F7FA] tabular-nums">
                            {inspected().summary.checkinsCount}
                          </span>
                        </div>
                        <div class="min-w-0 rounded-xl bg-[#14161B] p-2.5">
                          <span class="block text-[11px] text-[#8E95A5]">Notes</span>
                          <span class="font-mono font-medium text-[#F5F7FA] tabular-nums">
                            {inspected().summary.notesCount}
                          </span>
                        </div>
                        <div class="min-w-0 rounded-xl bg-[#14161B] p-2.5">
                          <span class="block text-[11px] text-[#8E95A5]">Tasks</span>
                          <span class="font-mono font-medium text-[#F5F7FA] tabular-nums">
                            {inspected().summary.tasksCount}
                          </span>
                        </div>
                      </div>

                      <p class="text-[11px] leading-relaxed text-[#8E95A5]">
                        {isLatest()
                          ? 'This is the current latest version on Google Drive. Restoring it overwrites your local IndexedDB with this snapshot.'
                          : 'Restoring replaces your local IndexedDB with this snapshot and saves it as a new latest version on Google Drive (your previous state remains in version history).'}
                      </p>

                      <div class="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void props.onRestore(inspected().revisionId)}
                          disabled={props.restoring}
                          class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-[#3B82F6] px-4 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-[#2563EB] disabled:opacity-50"
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

            <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] bg-[#14161B] px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
              <button
                type="button"
                onClick={() => void props.onRefresh()}
                disabled={props.loading || props.restoring}
                class="h-9 cursor-pointer rounded-xl border border-white/[0.08] bg-[#1C1F26] px-3.5 text-xs font-medium text-[#F5F7FA] transition-colors hover:bg-[#252933] disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => props.onClose()}
                disabled={props.restoring}
                class="h-9 cursor-pointer rounded-xl px-4 text-xs font-medium text-[#9AA1B1] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA] disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

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
          <span class="shrink-0 font-mono text-xs font-medium text-[#F5F7FA] tabular-nums">
            {props.slot.time}
          </span>
          <span
            class={`truncate text-xs ${props.slot.label ? 'text-[#C8CDD8]' : 'text-[#6B7280]'}`}
          >
            {props.slot.label || 'No label'}
          </span>
        </button>

        <div class="flex shrink-0 items-center gap-1">
          <span class="mr-1 font-mono text-[11px] whitespace-nowrap text-[#8E95A5] tabular-nums">
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
                ? 'bg-[#3B82F6]/15 text-[#60A5FA]'
                : 'text-[#8E95A5] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
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
            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#8E95A5] transition-colors hover:bg-[#EF4444]/10 hover:text-[#FCA5A5] disabled:opacity-50"
          >
            <TrashIcon class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Show when={props.isEditing}>
        <div class="flex flex-wrap items-center gap-2 border-t border-white/[0.06] bg-[#0D0F14] px-3 py-2.5 sm:flex-nowrap">
          <div class="w-28 shrink-0">
            <CustomTimePicker
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
            class="h-10 min-w-[120px] flex-1 rounded-xl border border-white/[0.08] bg-[#14161B] px-3 text-xs text-[#F5F7FA] placeholder:text-[#5B6270] focus:border-[#3B82F6] focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => {
              commitLabel();
              props.onToggleEdit(props.slot.id);
            }}
            disabled={props.busy}
            class="h-10 shrink-0 cursor-pointer rounded-xl border border-white/[0.08] bg-[#1C1F26] px-3 text-xs font-medium text-[#F5F7FA] transition-colors hover:bg-[#252933] disabled:opacity-50"
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

  useBodyScrollLock(() => props.open);

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !props.busy && !slotBusy()) {
        props.onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-end justify-center overscroll-none bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reminders-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !props.busy && !slotBusy()) {
              props.onClose();
            }
          }}
        >
          <div class="max-h-modal flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-[#14161B] sm:max-w-lg sm:rounded-3xl">
            <div class="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
              <div class="flex min-w-0 flex-1 items-start gap-3">
                <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#3B82F6]/30 bg-[#3B82F6]/15 text-[#60A5FA]">
                  <BellIcon class="h-4 w-4" />
                </div>
                <div class="min-w-0 flex-1 space-y-0.5">
                  <h2
                    id="reminders-modal-title"
                    class="font-display text-lg font-semibold text-[#F5F7FA]"
                  >
                    Reminders &amp; App Badge
                  </h2>
                  <p class="text-xs text-[#8E95A5]">
                    Manage reminder slots for habits and tasks, icon badge counts, and Google
                    Calendar pushes.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => props.onClose()}
                disabled={props.busy || slotBusy()}
                aria-label="Close modal"
                class="flex min-h-[40px] min-w-[40px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8E95A5] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA] disabled:opacity-50"
              >
                <CloseIcon class="h-4 w-4" />
              </button>
            </div>

            <Show when={props.error || slotError()}>
              {(msg) => (
                <div class="break-anywhere mx-5 mt-3 shrink-0 rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/10 px-3.5 py-2.5 text-xs text-[#FCA5A5] sm:mx-6">
                  {msg()}
                </div>
              )}
            </Show>

            <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
              {/* App Icon Badge Section */}
              <section class="space-y-3 rounded-2xl border border-white/[0.08] bg-[#0A0B0E] p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1 space-y-1">
                    <p class="text-sm font-medium text-[#F5F7FA]">PWA Icon Badge</p>
                    <p class="text-xs text-[#8E95A5]">
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
                        ? 'border-[#3B82F6]/50 bg-[#3B82F6]/15 text-[#93C5FD]'
                        : 'border-white/[0.08] bg-[#14161B] text-[#8E95A5] hover:text-[#F5F7FA]'
                    }`}
                  >
                    {props.prefs.badgeEnabled ? 'On' : 'Off'}
                  </button>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-xs">
                  <span class="text-[#8E95A5]">Current pending today:</span>
                  <span class="font-mono font-medium text-[#F5F7FA] tabular-nums">
                    {props.pendingToday.totalPendingCount === 0
                      ? '0 (All clear)'
                      : `${props.pendingToday.totalPendingCount} (${props.pendingToday.unfinishedHabitsCount} habits · ${props.pendingToday.openTasksCount} tasks)`}
                  </span>
                </div>

                <Show when={badgeSupported && props.badgePermission === 'default'}>
                  <div class="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#3B82F6]/30 bg-[#14161B] p-3">
                    <p class="min-w-0 flex-1 text-[11px] text-[#C8CDD8]">
                      On iPhone (iOS 16.4+), icon badges stay hidden until Notifications/Badges are
                      allowed for this Home Screen app.
                    </p>
                    <button
                      type="button"
                      onClick={() => void props.onRequestBadgePermission()}
                      class="h-8 shrink-0 cursor-pointer rounded-lg bg-[#3B82F6] px-3 text-xs font-medium text-white transition-colors hover:bg-[#2563EB]"
                    >
                      Allow Badge Permission
                    </button>
                  </div>
                </Show>

                <Show when={badgeSupported && props.badgePermission === 'granted'}>
                  <p class="text-[11px] text-[#60A5FA]">
                    System badge permission granted. Icon count updates automatically on open &amp;
                    edits.
                  </p>
                </Show>

                <Show when={badgeSupported && props.badgePermission === 'denied'}>
                  <p class="text-[11px] text-[#FCA5A5]">
                    Notifications/Badges are blocked in system settings. Enable them in iPhone
                    Settings → Notifications → Habits (or browser site settings) to display the icon
                    counter.
                  </p>
                </Show>

                <Show when={!badgeSupported || !isStandalone}>
                  <p class="text-[11px] text-[#8E95A5]">
                    {!badgeSupported
                      ? 'This browser view does not expose App Badging. On iPhone/iOS 16.4+, tap Share → Add to Home Screen in Safari and launch Habits from the Home Screen icon.'
                      : 'Tip for iPhone/mobile: to see the counter on your Home Screen icon, make sure you added Habits via Share → Add to Home Screen and launched it from that icon.'}
                  </p>
                </Show>
              </section>

              {/* Dynamic Reminder Slots Section (Collapsible) */}
              <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0B0E]">
                <button
                  type="button"
                  onClick={() => setSlotsExpanded((prev) => !prev)}
                  aria-expanded={slotsExpanded()}
                  class="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex items-center gap-2">
                      <ClockIcon class="h-4 w-4 shrink-0 text-[#60A5FA]" />
                      <span class="text-sm font-medium text-[#F5F7FA]">Reminder Slots</span>
                    </div>
                    <Show when={!slotsExpanded() && props.reminderSlots.length > 0}>
                      <p class="truncate font-mono text-[11px] text-[#8E95A5] tabular-nums">
                        {props.reminderSlots
                          .map((s) => (s.label ? `${s.time} ${s.label}` : s.time))
                          .join(' · ')}
                      </p>
                    </Show>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <span class="font-mono text-xs whitespace-nowrap text-[#8E95A5] tabular-nums">
                      {props.reminderSlots.length}{' '}
                      {props.reminderSlots.length === 1 ? 'slot' : 'slots'}
                    </span>
                    <ChevronDownIcon
                      class={`h-4 w-4 text-[#8E95A5] transition-transform duration-150 ${
                        slotsExpanded() ? '' : '-rotate-90'
                      }`}
                    />
                  </div>
                </button>

                <Show when={slotsExpanded()}>
                  <div class="space-y-3 border-t border-white/[0.06] px-4 pt-3 pb-4">
                    <p class="text-xs text-[#8E95A5]">
                      Create reusable time slots and assign them when editing habits or tasks. Both
                      have no reminders by default until a slot is assigned.
                    </p>

                    <Show
                      when={props.reminderSlots.length > 0}
                      fallback={
                        <div class="rounded-xl border border-white/[0.06] bg-[#14161B] p-3 text-xs text-[#8E95A5]">
                          No reminder slots yet. Add a time slot below and assign it to habits or
                          tasks you want reminders for.
                        </div>
                      }
                    >
                      <div class="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-[#14161B]">
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
                        <CustomTimePicker
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
                        class="h-10 min-w-[130px] flex-1 rounded-xl border border-white/[0.1] bg-[#14161B] px-3 text-xs text-[#F5F7FA] placeholder:text-[#5B6270] focus:border-[#3B82F6] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={props.busy || slotBusy()}
                        class="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#3B82F6] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[#2563EB] disabled:opacity-50"
                      >
                        <PlusIcon class="h-3.5 w-3.5" />
                        <span>Add slot</span>
                      </button>
                    </form>
                  </div>
                </Show>
              </section>

              {/* Google Calendar Smart Push Section */}
              <section class="space-y-4 rounded-2xl border border-white/[0.08] bg-[#0A0B0E] p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <CalendarIcon class="h-4 w-4 shrink-0 text-[#60A5FA]" />
                      <p class="text-sm font-medium text-[#F5F7FA]">Google Calendar Smart Push</p>
                    </div>
                    <p class="text-xs text-[#8E95A5]">
                      Creates a dedicated <strong class="text-[#C8CDD8]">Habits Reminders</strong>{' '}
                      secondary calendar (never touches your personal calendars) and clears
                      completed slots automatically.
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
                          ? 'border-[#3B82F6]/50 bg-[#3B82F6]/15 text-[#93C5FD]'
                          : 'border-white/[0.08] bg-[#14161B] text-[#8E95A5] hover:text-[#F5F7FA]'
                      }`}
                    >
                      {props.prefs.calendarEnabled ? 'On' : 'Off'}
                    </button>
                  </Show>
                </div>

                <Show
                  when={props.mode === 'google'}
                  fallback={
                    <div class="rounded-xl border border-white/[0.08] bg-[#14161B] p-3 text-xs text-[#8E95A5]">
                      Calendar Push is available in Google Sign-In mode. Your reminder slots above
                      are still saved locally and included in .bin backups.
                    </div>
                  }
                >
                  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div class="space-y-1.5">
                      <label
                        for="task-reminder-slot-select"
                        class="block text-xs font-medium text-[#9AA1B1]"
                      >
                        Default task reminder slot
                      </label>
                      <CustomSelect<string>
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
                      <span class="block text-xs font-medium text-[#9AA1B1]">Schedule window</span>
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
                                    ? 'border-[#3B82F6]/60 bg-[#3B82F6]/15 text-[#F5F7FA]'
                                    : 'border-white/[0.08] bg-[#14161B] text-[#8E95A5] hover:text-[#F5F7FA]'
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

                  <p class="text-[11px] text-[#8E95A5]">
                    Schedule window controls how many upcoming days of reminders are pre-created in
                    Calendar for habits and tasks with assigned slots.
                  </p>

                  <div class="space-y-1.5 rounded-xl border border-white/[0.06] bg-[#14161B] p-3 text-xs">
                    <div class="flex items-baseline justify-between gap-3">
                      <span class="shrink-0 text-[#8E95A5]">Calendar timezone</span>
                      <span class="break-anywhere text-right font-mono text-[#F5F7FA]">
                        {resolvedTz()}
                      </span>
                    </div>
                    <div class="space-y-0.5">
                      <div class="flex items-baseline justify-between gap-3">
                        <span class="shrink-0 text-[#8E95A5]">Today&apos;s reminders</span>
                        <span
                          class={`text-right font-mono tabular-nums ${
                            todayDesiredEvents().length === 0 ? 'text-[#60A5FA]' : 'text-[#F5F7FA]'
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
                        <p class="text-right font-mono text-[11px] text-[#8E95A5] tabular-nums">
                          {todayDesiredEvents()
                            .map((e) => e.slotTime)
                            .join(' · ')}
                        </p>
                      </Show>
                    </div>
                    <div class="flex items-baseline justify-between gap-3">
                      <span class="shrink-0 text-[#8E95A5]">Calendar status</span>
                      <span
                        class={`text-right font-mono ${
                          props.calendarSyncNeeded
                            ? 'text-[#F59E0B]'
                            : props.prefs.calendarId
                              ? 'text-[#60A5FA]'
                              : 'text-[#8E95A5]'
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
                      class="inline-flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#3B82F6] px-4 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-[#2563EB] disabled:opacity-50"
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
                        class="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#14161B] px-3 text-xs font-medium text-[#FCA5A5] transition-colors hover:border-[#EF4444]/40 hover:bg-[#EF4444]/10 disabled:opacity-50"
                      >
                        <TrashIcon class="h-3.5 w-3.5 shrink-0" />
                        <span>Delete Calendar</span>
                      </button>
                    </Show>
                  </div>

                  {/* Explicit User Confirmation Dialog for Calendar Updates */}
                  <Show when={props.pendingPlan}>
                    {(plan) => (
                      <div class="space-y-3 rounded-xl border border-[#3B82F6]/45 bg-[#182030] p-4">
                        <div class="space-y-1">
                          <p class="text-xs font-semibold text-[#F5F7FA]">
                            Confirm Google Calendar Changes
                          </p>
                          <p class="text-xs leading-relaxed text-[#C8CDD8]">
                            Review what will change inside your dedicated{' '}
                            <strong class="text-[#F5F7FA]">Habits Reminders</strong> calendar:
                          </p>
                        </div>

                        <ul class="list-inside list-disc space-y-1 font-mono text-xs text-[#C8CDD8] tabular-nums">
                          <Show when={plan().willCreateCalendar}>
                            <li>
                              Create secondary calendar &quot;Habits Reminders&quot; (
                              {plan().timeZone})
                            </li>
                          </Show>
                          <Show when={!plan().willCreateCalendar && plan().calendarId}>
                            <li>
                              Reuse existing &quot;Habits Reminders&quot; calendar (
                              {plan().timeZone})
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
                            class="h-9 cursor-pointer rounded-xl px-3.5 text-xs font-medium text-[#C8CDD8] hover:bg-white/[0.06] hover:text-[#F5F7FA] disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void props.onConfirmCalendarSync()}
                            disabled={props.busy}
                            class="h-9 cursor-pointer rounded-xl bg-[#3B82F6] px-4 text-xs font-medium text-white hover:bg-[#2563EB] disabled:opacity-50"
                          >
                            {props.busy ? 'Updating...' : 'Confirm Calendar Update'}
                          </button>
                        </div>
                      </div>
                    )}
                  </Show>

                  {/* Explicit User Confirmation Dialog for Deleting Calendar */}
                  <Show when={props.confirmDeleteOpen}>
                    <div class="space-y-3 rounded-xl border border-[#EF4444]/45 bg-[#2A1417] p-4">
                      <div class="space-y-1">
                        <p class="text-xs font-semibold text-[#FCA5A5]">
                          Delete &quot;Habits Reminders&quot; Calendar?
                        </p>
                        <p class="text-xs leading-relaxed text-[#E5C5C8]">
                          This permanently deletes the secondary Habits Reminders calendar and all
                          its reminder events from your Google Calendar. Your personal calendars,
                          habits, and Google Drive backups will not be touched.
                        </p>
                      </div>
                      <div class="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => props.onCancelDeleteCalendar()}
                          disabled={props.busy}
                          class="h-9 cursor-pointer rounded-xl px-3.5 text-xs font-medium text-[#C8CDD8] hover:bg-white/[0.06] hover:text-[#F5F7FA] disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void props.onConfirmDeleteCalendar()}
                          disabled={props.busy}
                          class="h-9 cursor-pointer rounded-xl bg-[#EF4444] px-4 text-xs font-medium text-white hover:bg-[#DC2626] disabled:opacity-50"
                        >
                          {props.busy ? 'Deleting...' : 'Delete Calendar'}
                        </button>
                      </div>
                    </div>
                  </Show>
                </Show>
              </section>
            </div>

            <div class="flex shrink-0 justify-end border-t border-white/[0.06] bg-[#14161B] px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
              <button
                type="button"
                onClick={() => props.onClose()}
                disabled={props.busy || slotBusy()}
                class="h-9 cursor-pointer rounded-xl px-4 text-xs font-medium text-[#9AA1B1] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA] disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

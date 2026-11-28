import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot, Habit, ReminderSlot } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { HabitSchedule } from '../utils/habit-schedule';
import { StreakCalculator } from '../utils/streak-calculator';
import { HabitsViewData, createHabitsDataSelector } from './board-selectors';
import { HabitBadge } from './HabitBadge';
import { ArchiveIcon, ClockIcon, EditIcon, PlusIcon, RestoreIcon } from './Icons';
import { ALL_WEEKDAYS_MASK } from './constants';

interface HabitsViewProps {
  snapshot: DomainSnapshot;
  todayDay: number;
  habitsData?: HabitsViewData | null;
  onCreateHabit: () => void;
  onEditHabit: (habit: Habit) => void;
  onToggleArchive: (habit: Habit) => Promise<void>;
}

export function HabitsView(props: HabitsViewProps): JSX.Element {
  const [filter, setFilter] = createSignal<'active' | 'archived'>('active');

  const localHabitsData = createHabitsDataSelector({
    isActive: () => props.habitsData === undefined,
    snapshot: () => props.snapshot,
    todayDay: () => props.todayDay,
  });

  const habitsData = createMemo(() =>
    props.habitsData !== undefined && props.habitsData !== null
      ? props.habitsData
      : localHabitsData()!
  );

  const filtered = createMemo(() =>
    props.snapshot.habits.filter((h) =>
      filter() === 'active' ? h.archivedAt === null : h.archivedAt !== null
    )
  );

  const activeCount = () => habitsData().activeCount;
  const archivedCount = () => habitsData().archivedCount;
  const activeSlotMap = () => habitsData().activeSlotMap;

  return (
    <div class="space-y-6">
      <div class="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end">
        <div class="space-y-1">
          <h1 class="font-display text-3xl font-semibold tracking-tight text-ink">Habits</h1>
          <p class="text-sm text-ink-subtle">
            <span class="font-mono tabular-nums">{activeCount()}</span> active
            <span aria-hidden="true"> · </span>
            <span class="font-mono tabular-nums">{archivedCount()}</span> archived
          </p>
        </div>

        <div class="flex max-w-full flex-wrap items-center gap-2.5 self-start sm:gap-3 sm:self-auto">
          <div class="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-surface p-1">
            <button
              type="button"
              onClick={() => setFilter('active')}
              class={`h-8 shrink-0 cursor-pointer rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                filter() === 'active'
                  ? 'bg-surface-elevated text-ink'
                  : 'text-ink-subtle hover:text-ink'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setFilter('archived')}
              class={`h-8 shrink-0 cursor-pointer rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                filter() === 'archived'
                  ? 'bg-surface-elevated text-ink'
                  : 'text-ink-subtle hover:text-ink'
              }`}
            >
              Archived
            </button>
          </div>

          <button
            type="button"
            onClick={() => props.onCreateHabit()}
            class="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-accent-hover"
          >
            <PlusIcon class="h-4 w-4" />
            <span>New Habit</span>
          </button>
        </div>
      </div>

      <Show
        when={filtered().length > 0}
        fallback={
          <div class="space-y-4 rounded-2xl border border-white/[0.08] bg-surface px-6 py-14 text-center">
            <p class="text-sm text-ink-subtle">
              {filter() === 'active'
                ? 'No active habits yet. Create your first routine to start tracking.'
                : 'No archived habits. Archiving hides a habit from Today while preserving all historical check-ins.'}
            </p>
            <Show when={filter() === 'active'}>
              <button
                type="button"
                onClick={() => props.onCreateHabit()}
                class="h-10 cursor-pointer rounded-xl bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Create Habit
              </button>
            </Show>
          </div>
        }
      >
        <div class="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface">
          <ul class="divide-y divide-white/[0.06]">
            <For each={filtered()}>
              {(habit) => {
                const habitMetrics = () => habitsData().habitMetricsMap.get(habit.id)!;
                const metrics = () => habitMetrics().metrics;
                const weekly = () => habitMetrics().weekly;
                const milestone = () => StreakCalculator.getMilestone(metrics().currentStreak);
                const exactMilestone = () =>
                  StreakCalculator.isExactMilestone(metrics().currentStreak);

                const streakToneClass = () => {
                  const m = milestone();
                  if (m === 100) return 'text-milestone-gold';
                  if (m === 30) return 'text-accent-tint';
                  if (m === 7) return 'text-accent-soft';
                  return '';
                };

                const streakUnitShort = () => (metrics().streakUnit === 'weeks' ? 'w' : 'd');
                const streakUnitLong = () => (metrics().streakUnit === 'weeks' ? 'week' : 'day');
                const activeSchedule = () => habitMetrics().activeSchedule;
                const latestScheduleChangeDay = () =>
                  habit.scheduleHistory && habit.scheduleHistory.length > 1
                    ? habit.scheduleHistory[habit.scheduleHistory.length - 1].fromDay
                    : null;
                const assignedSlots = createMemo(() =>
                  (habit.reminderSlotIds ?? [])
                    .map((id) => activeSlotMap().get(id))
                    .filter((s): s is ReminderSlot => Boolean(s))
                    .sort((a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label))
                );

                return (
                  <li
                    class={`flex flex-col justify-between gap-4 px-4 py-4 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:px-6 ${
                      exactMilestone() ? 'bg-white/[0.015]' : ''
                    }`}
                  >
                    <div class="min-w-0 flex-1 space-y-2">
                      <div class="flex items-start justify-between gap-3">
                        <div class="flex min-w-0 flex-1 items-start gap-3">
                          <HabitBadge appearanceRaw={habit.color} size="md" />
                          <h2
                            class="line-clamp-2 text-base font-medium break-words text-ink"
                            title={habit.name}
                          >
                            {habit.name}
                          </h2>
                        </div>
                        <span class="shrink-0 pt-0.5 font-mono text-xs font-medium whitespace-nowrap text-ink-secondary tabular-nums">
                          {Math.round(metrics().completionRate * 100)}%{' '}
                          <span class="font-normal text-ink-subtle">(30d)</span>
                        </span>
                      </div>

                      <div class="space-y-1 text-xs text-ink-subtle">
                        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono tabular-nums">
                          <span
                            class={`whitespace-nowrap ${streakToneClass()}`}
                            title={
                              milestone()
                                ? `${milestone()}-${streakUnitLong()} streak milestone`
                                : undefined
                            }
                          >
                            {metrics().currentStreak}
                            {streakUnitShort()} current · {metrics().longestStreak}
                            {streakUnitShort()} best
                            <Show when={exactMilestone()}>
                              <span>
                                {' '}
                                · {metrics().currentStreak}
                                {streakUnitShort()} milestone
                              </span>
                            </Show>
                          </span>
                          <Show when={habit.archivedAt === null && weekly().scheduledDays > 0}>
                            <span
                              class={`whitespace-nowrap ${
                                weekly().isComplete ? 'text-accent-soft' : ''
                              }`}
                            >
                              {weekly().isComplete
                                ? `Week complete (${weekly().completedDays}/${weekly().scheduledDays})`
                                : `${weekly().completedDays}/${weekly().scheduledDays} this week`}
                            </span>
                          </Show>
                        </div>

                        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          <span class="whitespace-nowrap">
                            Started {CivilCalendar.formatShortDate(habit.startDay)}
                          </span>
                          <Show when={activeSchedule().dailyTarget !== null}>
                            <span class="font-mono whitespace-nowrap text-ink-secondary tabular-nums">
                              Goal {HabitSchedule.formatNumericValue(activeSchedule().dailyTarget!)}
                              {habit.unit ? ` ${habit.unit}` : ''}/day
                            </span>
                          </Show>
                          <Show when={latestScheduleChangeDay() !== null}>
                            <span class="whitespace-nowrap">
                              Updated {CivilCalendar.formatShortDate(latestScheduleChangeDay()!)}
                            </span>
                          </Show>
                        </div>
                      </div>

                      <Show
                        when={activeSchedule().weeklyTarget !== null || assignedSlots().length > 0}
                      >
                        <div class="flex flex-wrap items-center gap-1.5">
                          <Show when={activeSchedule().weeklyTarget !== null}>
                            <span
                              class="inline-flex items-center rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-ink-secondary tabular-nums"
                              aria-label="Flexible weekly schedule"
                            >
                              {activeSchedule().weeklyTarget}× / week
                            </span>
                          </Show>
                          <For each={assignedSlots()}>
                            {(slot) => (
                              <span class="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent-tint tabular-nums">
                                <ClockIcon class="h-3 w-3 shrink-0 text-accent-soft" />
                                <span>
                                  {slot.time}
                                  {slot.label ? ` ${slot.label}` : ''}
                                </span>
                              </span>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>

                    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 sm:flex-nowrap sm:justify-end sm:gap-4">
                      <Show
                        when={
                          activeSchedule().weeklyTarget === null ||
                          (activeSchedule().weekdays & ALL_WEEKDAYS_MASK) !== ALL_WEEKDAYS_MASK
                        }
                        fallback={
                          <span class="font-mono text-xs whitespace-nowrap text-ink-subtle">
                            Any day
                          </span>
                        }
                      >
                        <div
                          class="flex items-center gap-1"
                          aria-label={
                            activeSchedule().weeklyTarget !== null
                              ? 'Allowed weekdays'
                              : 'Scheduled weekdays'
                          }
                        >
                          <For each={[0, 1, 2, 3, 4, 5, 6]}>
                            {(bit) => {
                              const active = (activeSchedule().weekdays & (1 << bit)) !== 0;
                              return (
                                <span
                                  class={`flex h-6 w-6 items-center justify-center rounded-md font-mono text-[11px] ${
                                    active ? 'bg-white/[0.1] text-ink' : 'text-ink-dead'
                                  }`}
                                >
                                  {CivilCalendar.weekdayShortLabel(bit).slice(0, 1)}
                                </span>
                              );
                            }}
                          </For>
                        </div>
                      </Show>

                      <div class="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => props.onEditHabit(habit)}
                          aria-label={`Edit ${habit.name}`}
                          class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl text-ink-subtle transition-colors hover:bg-white/[0.06] hover:text-ink"
                        >
                          <EditIcon class="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void props.onToggleArchive(habit)}
                          aria-label={
                            habit.archivedAt !== null
                              ? `Restore ${habit.name}`
                              : `Archive ${habit.name}`
                          }
                          class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl text-ink-subtle transition-colors hover:bg-white/[0.06] hover:text-ink"
                        >
                          <Show
                            when={habit.archivedAt !== null}
                            fallback={<ArchiveIcon class="h-4 w-4" />}
                          >
                            <RestoreIcon class="h-4 w-4" />
                          </Show>
                        </button>
                      </div>
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}

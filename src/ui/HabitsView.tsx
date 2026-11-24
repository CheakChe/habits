import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot, Habit } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { HabitSchedule } from '../utils/habit-schedule';
import { StreakCalculator } from '../utils/streak-calculator';
import { HabitBadge } from './HabitBadge';
import { ArchiveIcon, EditIcon, PlusIcon, RestoreIcon } from './Icons';
import { ALL_WEEKDAYS_MASK } from './constants';

interface HabitsViewProps {
  snapshot: DomainSnapshot;
  todayDay: number;
  onCreateHabit: () => void;
  onEditHabit: (habit: Habit) => void;
  onToggleArchive: (habit: Habit) => Promise<void>;
}

export function HabitsView(props: HabitsViewProps): JSX.Element {
  const [filter, setFilter] = createSignal<'active' | 'archived'>('active');

  const filtered = createMemo(() =>
    props.snapshot.habits.filter((h) =>
      filter() === 'active' ? h.archivedAt === null : h.archivedAt !== null
    )
  );

  const activeCount = createMemo(
    () => props.snapshot.habits.filter((h) => h.archivedAt === null).length
  );

  const archivedCount = createMemo(() => props.snapshot.habits.length - activeCount());

  return (
    <div class="space-y-6">
      <div class="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end">
        <div class="space-y-1">
          <h1 class="font-display text-3xl font-semibold tracking-tight text-[#F5F7FA]">Habits</h1>
          <p class="text-sm text-[#8E95A5]">
            <span class="font-mono tabular-nums">{activeCount()}</span> active
            <span aria-hidden="true"> · </span>
            <span class="font-mono tabular-nums">{archivedCount()}</span> archived
          </p>
        </div>

        <div class="flex max-w-full flex-wrap items-center gap-2.5 self-start sm:gap-3 sm:self-auto">
          <div class="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-[#14161B] p-1">
            <button
              type="button"
              onClick={() => setFilter('active')}
              class={`h-8 shrink-0 cursor-pointer rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                filter() === 'active'
                  ? 'bg-[#1C1F26] text-[#F5F7FA]'
                  : 'text-[#8E95A5] hover:text-[#F5F7FA]'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setFilter('archived')}
              class={`h-8 shrink-0 cursor-pointer rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                filter() === 'archived'
                  ? 'bg-[#1C1F26] text-[#F5F7FA]'
                  : 'text-[#8E95A5] hover:text-[#F5F7FA]'
              }`}
            >
              Archived
            </button>
          </div>

          <button
            type="button"
            onClick={() => props.onCreateHabit()}
            class="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-[#3B82F6] px-4 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#2563EB]"
          >
            <PlusIcon class="h-4 w-4" />
            <span>New Habit</span>
          </button>
        </div>
      </div>

      <Show
        when={filtered().length > 0}
        fallback={
          <div class="space-y-4 rounded-2xl border border-white/[0.08] bg-[#14161B] px-6 py-14 text-center">
            <p class="text-sm text-[#8E95A5]">
              {filter() === 'active'
                ? 'No active habits yet. Create your first routine to start tracking.'
                : 'No archived habits. Archiving hides a habit from Today while preserving all historical check-ins.'}
            </p>
            <Show when={filter() === 'active'}>
              <button
                type="button"
                onClick={() => props.onCreateHabit()}
                class="h-10 cursor-pointer rounded-xl bg-[#3B82F6] px-5 text-sm font-medium text-white transition-colors hover:bg-[#2563EB]"
              >
                Create Habit
              </button>
            </Show>
          </div>
        }
      >
        <div class="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#14161B]">
          <ul class="divide-y divide-white/[0.06]">
            <For each={filtered()}>
              {(habit) => {
                const metrics = createMemo(() =>
                  StreakCalculator.calculate(
                    habit,
                    props.snapshot.checkins,
                    props.todayDay - 29,
                    props.todayDay,
                    true
                  )
                );
                const weekly = createMemo(() =>
                  StreakCalculator.calculateWeeklyProgress(
                    habit,
                    props.snapshot.checkins,
                    props.todayDay
                  )
                );
                const milestone = () => StreakCalculator.getMilestone(metrics().currentStreak);
                const exactMilestone = () =>
                  StreakCalculator.isExactMilestone(metrics().currentStreak);

                const streakToneClass = () => {
                  const m = milestone();
                  if (m === 100) return 'text-[#FBBF24]';
                  if (m === 30) return 'text-[#93C5FD]';
                  if (m === 7) return 'text-[#60A5FA]';
                  return '';
                };

                const streakUnitShort = () => (metrics().streakUnit === 'weeks' ? 'w' : 'd');
                const streakUnitLong = () => (metrics().streakUnit === 'weeks' ? 'week' : 'day');
                const activeSchedule = createMemo(() =>
                  HabitSchedule.getAtDay(habit, props.todayDay)
                );
                const latestScheduleChangeDay = () =>
                  habit.scheduleHistory && habit.scheduleHistory.length > 1
                    ? habit.scheduleHistory[habit.scheduleHistory.length - 1].fromDay
                    : null;

                return (
                  <li
                    class={`flex flex-col justify-between gap-4 px-4 py-4 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:px-6 ${
                      exactMilestone() ? 'bg-white/[0.015]' : ''
                    }`}
                  >
                    <div class="min-w-0 space-y-2">
                      <div class="flex items-start gap-3">
                        <HabitBadge appearanceRaw={habit.color} size="md" />
                        <h2
                          class="line-clamp-2 text-base font-medium break-words text-[#F5F7FA]"
                          title={habit.name}
                        >
                          {habit.name}
                        </h2>
                      </div>

                      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#8E95A5]">
                        <span>Started {CivilCalendar.formatShortDate(habit.startDay)}</span>
                        <Show when={activeSchedule().dailyTarget !== null}>
                          <span aria-hidden="true">·</span>
                          <span class="font-mono text-[#C8CDD8] tabular-nums">
                            Goal {HabitSchedule.formatNumericValue(activeSchedule().dailyTarget!)}
                            {habit.unit ? ` ${habit.unit}` : ''}/day
                          </span>
                        </Show>
                        <Show when={latestScheduleChangeDay() !== null}>
                          <span aria-hidden="true">·</span>
                          <span>
                            Updated {CivilCalendar.formatShortDate(latestScheduleChangeDay()!)}
                          </span>
                        </Show>
                        <span aria-hidden="true">·</span>
                        <span
                          class={`font-mono tabular-nums ${streakToneClass()}`}
                          title={
                            milestone()
                              ? `${milestone()}-${streakUnitLong()} streak milestone`
                              : undefined
                          }
                        >
                          {metrics().currentStreak}
                          {streakUnitShort()} current
                          <Show when={exactMilestone()}>
                            <span>
                              {' '}
                              · {metrics().currentStreak}
                              {streakUnitShort()} milestone
                            </span>
                          </Show>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span class="font-mono tabular-nums">
                          {metrics().longestStreak}
                          {streakUnitShort()} best
                        </span>
                        <Show when={habit.archivedAt === null && weekly().scheduledDays > 0}>
                          <span aria-hidden="true">·</span>
                          <span
                            class={`font-mono tabular-nums ${
                              weekly().isComplete ? 'text-[#60A5FA]' : ''
                            }`}
                          >
                            {weekly().isComplete
                              ? `Week complete (${weekly().completedDays}/${weekly().scheduledDays})`
                              : `${weekly().completedDays}/${weekly().scheduledDays} this week`}
                          </span>
                        </Show>
                        <span aria-hidden="true">·</span>
                        <span class="font-mono tabular-nums">
                          {Math.round(metrics().completionRate * 100)}% (30d)
                        </span>
                      </div>
                    </div>

                    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 sm:flex-nowrap sm:justify-end sm:gap-4">
                      <Show
                        when={activeSchedule().weeklyTarget === null}
                        fallback={
                          <div
                            class="flex flex-wrap items-center gap-2.5"
                            aria-label="Flexible weekly schedule"
                          >
                            <span class="font-mono text-xs whitespace-nowrap text-[#C8CDD8] tabular-nums">
                              {activeSchedule().weeklyTarget}× / week
                            </span>
                            <Show
                              when={
                                (activeSchedule().weekdays & ALL_WEEKDAYS_MASK) !==
                                ALL_WEEKDAYS_MASK
                              }
                            >
                              <div class="flex items-center gap-1" aria-label="Allowed weekdays">
                                <For each={[0, 1, 2, 3, 4, 5, 6]}>
                                  {(bit) => {
                                    const active = (activeSchedule().weekdays & (1 << bit)) !== 0;
                                    return (
                                      <span
                                        class={`flex h-6 w-6 items-center justify-center rounded-md font-mono text-[11px] ${
                                          active
                                            ? 'bg-white/[0.1] text-[#F5F7FA]'
                                            : 'text-[#4B5563]'
                                        }`}
                                      >
                                        {CivilCalendar.weekdayShortLabel(bit).slice(0, 1)}
                                      </span>
                                    );
                                  }}
                                </For>
                              </div>
                            </Show>
                          </div>
                        }
                      >
                        <div class="flex items-center gap-1" aria-label="Scheduled weekdays">
                          <For each={[0, 1, 2, 3, 4, 5, 6]}>
                            {(bit) => {
                              const active = (activeSchedule().weekdays & (1 << bit)) !== 0;
                              return (
                                <span
                                  class={`flex h-6 w-6 items-center justify-center rounded-md font-mono text-[11px] ${
                                    active ? 'bg-white/[0.1] text-[#F5F7FA]' : 'text-[#4B5563]'
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
                          class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl text-[#8E95A5] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
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
                          class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl text-[#8E95A5] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
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

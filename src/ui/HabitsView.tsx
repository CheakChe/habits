import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot, Habit } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { StreakCalculator } from '../utils/streak-calculator';
import { ArchiveIcon, EditIcon, PlusIcon, RestoreIcon } from './Icons';

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

  const archivedCount = createMemo(
    () => props.snapshot.habits.length - activeCount()
  );

  return (
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div class="space-y-1">
          <h1 class="font-display text-3xl font-semibold tracking-tight text-[#F5F7FA]">
            Habits
          </h1>
          <p class="text-sm text-[#8E95A5]">
            <span class="font-mono tabular-nums">{activeCount()}</span> active
            <span aria-hidden="true"> · </span>
            <span class="font-mono tabular-nums">{archivedCount()}</span> archived
          </p>
        </div>

        <div class="flex items-center gap-3 self-start sm:self-auto">
          <div class="flex items-center gap-1 p-1 bg-[#14161B] border border-white/[0.08] rounded-xl">
            <button
              type="button"
              onClick={() => setFilter('active')}
              class={`h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
              class={`h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
            class="h-10 px-4 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PlusIcon class="w-4 h-4" />
            <span>New Habit</span>
          </button>
        </div>
      </div>

      <Show
        when={filtered().length > 0}
        fallback={
          <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] px-6 py-14 text-center space-y-4">
            <p class="text-sm text-[#8E95A5]">
              {filter() === 'active'
                ? 'No active habits yet. Create your first routine to start tracking.'
                : 'No archived habits. Archiving hides a habit from Today while preserving all historical check-ins.'}
            </p>
            <Show when={filter() === 'active'}>
              <button
                type="button"
                onClick={() => props.onCreateHabit()}
                class="h-10 px-5 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white transition-colors cursor-pointer"
              >
                Create Habit
              </button>
            </Show>
          </div>
        }
      >
        <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
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

                return (
                  <li class="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                    <div class="space-y-2 min-w-0">
                      <div class="flex items-center gap-3">
                        <span
                          class="w-3 h-3 rounded-full shrink-0"
                          style={{ 'background-color': habit.color }}
                          aria-hidden="true"
                        />
                        <h2 class="text-base font-medium text-[#F5F7FA] truncate">
                          {habit.name}
                        </h2>
                      </div>

                      <div class="flex flex-wrap items-center gap-3 text-xs text-[#8E95A5]">
                        <span>Started {CivilCalendar.formatShortDate(habit.startDay)}</span>
                        <span aria-hidden="true">·</span>
                        <span class="font-mono tabular-nums">
                          {metrics().currentStreak}d current
                        </span>
                        <span aria-hidden="true">·</span>
                        <span class="font-mono tabular-nums">
                          {metrics().longestStreak}d best
                        </span>
                        <span aria-hidden="true">·</span>
                        <span class="font-mono tabular-nums">
                          {Math.round(metrics().completionRate * 100)}% (30d)
                        </span>
                      </div>
                    </div>

                    <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <div
                        class="flex items-center gap-1"
                        aria-label="Scheduled weekdays"
                      >
                        <For each={[0, 1, 2, 3, 4, 5, 6]}>
                          {(bit) => {
                            const active = (habit.weekdays & (1 << bit)) !== 0;
                            return (
                              <span
                                class={`w-6 h-6 rounded-md text-[11px] font-mono flex items-center justify-center ${
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

                      <div class="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => props.onEditHabit(habit)}
                          aria-label={`Edit ${habit.name}`}
                          class="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <EditIcon class="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void props.onToggleArchive(habit)}
                          aria-label={
                            habit.archivedAt !== null
                              ? `Restore ${habit.name}`
                              : `Archive ${habit.name}`
                          }
                          class="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <Show
                            when={habit.archivedAt !== null}
                            fallback={<ArchiveIcon class="w-4 h-4" />}
                          >
                            <RestoreIcon class="w-4 h-4" />
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

import { For, JSX, Show } from 'solid-js';
import { Habit } from '../../types/domain';
import { HabitRowTrendInfo } from '../../utils/charts-analytics';
import { DateRangeResolver } from '../../utils/date-range';
import { HabitAppearance } from '../../utils/habit-appearance';
import { HabitSchedule } from '../../utils/habit-schedule';
import { HabitPeriodSummary } from '../../utils/streak-calculator';
import { HabitBadge } from '../HabitBadge';

interface HabitBreakdownListProps {
  habitFilter: 'all' | number[];
  targetHabits: Habit[];
  habitBreakdown: HabitPeriodSummary[];
  habitTrends: Map<number, HabitRowTrendInfo>;
  rangeLabel: string;
  effectiveRangeStart: number;
  effectiveRangeEnd: number;
  onSelectHabitFilter: (filter: 'all' | number[]) => void;
}

export function HabitBreakdownList(props: HabitBreakdownListProps): JSX.Element {
  return (
    <Show
      when={
        props.habitBreakdown.length > 0 &&
        (props.habitFilter === 'all' || props.targetHabits.length > 1)
      }
    >
      <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface">
        <div class="flex items-center justify-between gap-4 border-b border-white/[0.06] px-4 py-4 sm:px-6">
          <div>
            <h2 class="font-display text-base font-semibold text-ink">Habit Breakdown</h2>
            <p class="text-xs text-ink-subtle">
              {props.rangeLabel} ·{' '}
              <span class="font-mono tabular-nums">
                {DateRangeResolver.formatRangeLabel(
                  props.effectiveRangeStart,
                  props.effectiveRangeEnd
                )}
              </span>
            </p>
          </div>
          <span class="font-mono text-xs text-ink-subtle tabular-nums">
            {props.habitBreakdown.length} {props.habitBreakdown.length === 1 ? 'habit' : 'habits'}
          </span>
        </div>

        <ul class="divide-y divide-white/[0.06]">
          <For each={props.habitBreakdown}>
            {(row) => {
              const pct = () => Math.round(row.completionRate * 100);
              const trendDelta = () => props.habitTrends.get(row.habit.id)?.deltaPct ?? null;
              const bonusCount = () => props.habitTrends.get(row.habit.id)?.bonusCount ?? 0;
              const streakUnit = () => (row.streakUnit === 'weeks' ? 'w' : 'd');
              return (
                <li>
                  <button
                    type="button"
                    onClick={() => props.onSelectHabitFilter([row.habit.id])}
                    class="flex w-full cursor-pointer flex-col gap-2.5 px-4 py-4 text-left transition-colors hover:bg-white/[0.02] sm:px-6"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex min-w-0 flex-1 items-start gap-2.5">
                        <HabitBadge appearanceRaw={row.habit.color} size="sm" />
                        <span
                          class="line-clamp-2 text-sm font-medium break-words text-ink"
                          title={row.habit.name}
                        >
                          {row.habit.name}
                        </span>
                        <Show when={row.habit.archivedAt !== null}>
                          <span class="shrink-0 text-[11px] text-ink-dim">(Archived)</span>
                        </Show>
                      </div>

                      <div class="flex shrink-0 items-baseline gap-2.5 font-mono tabular-nums">
                        <Show when={trendDelta() !== null}>
                          <span
                            class={`text-xs ${
                              trendDelta()! > 0
                                ? 'text-accent-soft'
                                : trendDelta()! < 0
                                  ? 'text-danger-soft'
                                  : 'text-ink-subtle'
                            }`}
                            title="Second half vs first half of period"
                          >
                            {trendDelta()! > 0
                              ? `↗ +${trendDelta()}%`
                              : trendDelta()! < 0
                                ? `↘ ${trendDelta()}%`
                                : '→ 0%'}
                          </span>
                        </Show>
                        <span class="text-sm font-semibold text-ink">{pct()}%</span>
                      </div>
                    </div>

                    <div class="h-1.5 w-full overflow-hidden rounded-full border border-white/[0.06] bg-canvas">
                      <div
                        class="h-full rounded-full transition-all"
                        style={{
                          width: `${pct()}%`,
                          'background-color': HabitAppearance.getColor(row.habit.color),
                        }}
                      />
                    </div>

                    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-xs text-ink-subtle tabular-nums">
                      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span class="whitespace-nowrap">
                          {row.completedDays} done · {row.missedDays} missed
                        </span>
                        <Show when={row.totalValue !== undefined}>
                          <span class="whitespace-nowrap text-ink-secondary">
                            {HabitSchedule.formatNumericValue(row.totalValue!)}
                            {row.unit ? ` ${row.unit}` : ''} total
                          </span>
                        </Show>
                        <Show when={row.habit.weeklyTarget !== null}>
                          <span class="whitespace-nowrap">{row.habit.weeklyTarget}×/wk</span>
                        </Show>
                        <Show when={bonusCount() > 0}>
                          <span class="whitespace-nowrap text-accent-soft">
                            +{bonusCount()} bonus
                          </span>
                        </Show>
                      </div>

                      <span class="whitespace-nowrap text-ink-muted">
                        {row.currentStreak}
                        {streakUnit()} current · {row.longestStreak}
                        {streakUnit()} best
                      </span>
                    </div>
                  </button>
                </li>
              );
            }}
          </For>
        </ul>
      </section>
    </Show>
  );
}

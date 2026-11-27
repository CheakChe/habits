import { For, JSX, Show, createMemo } from 'solid-js';
import { AdvancedAnalyticsReport } from '../../../utils/advanced-analytics';
import { CivilCalendar } from '../../../utils/civil-calendar';
import { DateRangeResolver } from '../../../utils/date-range';
import { HabitSchedule } from '../../../utils/habit-schedule';
import { HabitBadge } from '../../HabitBadge';

interface ResilienceSectionProps {
  report: AdvancedAnalyticsReport;
  effectiveRangeStart: number;
  effectiveRangeEnd: number;
  rangeLabel: string;
  onSelectHabitFilter: (filter: 'all' | number[]) => void;
}

function matrixCellTone(
  rate: number | null,
  isFlexible: boolean,
  doneCount: number,
  isOffSchedule: boolean
): string {
  if (isFlexible) {
    if (isOffSchedule) {
      if (doneCount === 0) {
        return 'bg-transparent text-ink-dead border-dashed border-white/[0.06]';
      }
      return 'bg-accent/15 text-accent-tint border-dashed border-accent/45';
    }
    if (doneCount === 0) return 'bg-canvas text-ink-subtle border-white/[0.08]';
    return 'bg-accent/20 text-accent-tint border-accent/35';
  }
  if (rate === null) return 'bg-canvas text-ink-dead border-white/[0.05]';
  if (rate >= 0.9) return 'bg-accent/25 text-accent-pale border-accent/45';
  if (rate >= 0.65) return 'bg-accent/12 text-accent-tint border-accent/25';
  if (rate >= 0.4) return 'bg-warning/15 text-warning-soft border-warning/30';
  return 'bg-danger/15 text-danger-soft border-danger/30';
}

export function ResilienceSection(props: ResilienceSectionProps): JSX.Element {
  const peakLoggingWindow = createMemo(() => {
    const buckets = props.report.loggingDiscipline.timeOfDayBuckets;
    const total = props.report.loggingDiscipline.totalDoneCheckins;
    if (total === 0) return null;
    return buckets.reduce((best, cur) => (cur.count > best.count ? cur : best), buckets[0]);
  });

  const maxFlexWeekdayCount = createMemo(() => {
    const flex = props.report.flexibleInsight;
    if (!flex) return 1;
    return Math.max(1, ...flex.weekdayDistribution.map((d) => d.count));
  });

  return (
    <div class="space-y-5">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="font-display text-lg font-semibold text-ink">Habit Resilience &amp; Behavior</h2>
        <span class="font-mono text-xs text-ink-subtle tabular-nums">
          {props.rangeLabel} ·{' '}
          {DateRangeResolver.formatRangeLabel(props.effectiveRangeStart, props.effectiveRangeEnd)}
        </span>
      </div>

      {/* 4 Summary Tiles */}
      <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-5">
          <span class="text-xs text-ink-subtle">Bounce-Back Rate</span>
          <p class="font-display font-mono text-xl font-semibold text-ink tabular-nums sm:text-2xl">
            {props.report.bounceBack.bounceBackRate !== null
              ? `${Math.round(props.report.bounceBack.bounceBackRate * 100)}%`
              : '—'}
          </p>
          <span class="block font-mono text-[11px] text-ink-subtle tabular-nums">
            {props.report.bounceBack.totalMissesEvaluated > 0
              ? `${props.report.bounceBack.recoveredMisses} recovered · ${props.report.bounceBack.chainedMisses} chained`
              : 'No prior misses to evaluate'}
          </span>
        </div>

        <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-5">
          <span class="text-xs text-ink-subtle">Retroactive Check-ins</span>
          <p class="font-display font-mono text-xl font-semibold text-ink tabular-nums sm:text-2xl">
            {props.report.loggingDiscipline.retroactiveRate !== null
              ? `${Math.round(props.report.loggingDiscipline.retroactiveRate * 100)}%`
              : '—'}
          </p>
          <span class="block font-mono text-[11px] text-ink-subtle tabular-nums">
            {props.report.loggingDiscipline.sameDayCount} same-day ·{' '}
            {props.report.loggingDiscipline.retroactiveCount} logged later
          </span>
        </div>

        <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-5">
          <span class="text-xs text-ink-subtle">Peak Logging Time</span>
          <p class="truncate font-display text-xl font-semibold text-ink sm:text-2xl">
            {peakLoggingWindow() ? peakLoggingWindow()!.label : '—'}
          </p>
          <span class="block font-mono text-[11px] text-ink-subtle tabular-nums">
            {peakLoggingWindow()
              ? `${peakLoggingWindow()!.hoursLabel} · ${Math.round(peakLoggingWindow()!.share * 100)}% of check-ins`
              : 'No completed check-ins'}
          </span>
        </div>

        <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-5">
          <span class="text-xs text-ink-subtle">Cooling / At-Risk</span>
          <p
            class={`font-display font-mono text-xl font-semibold tabular-nums sm:text-2xl ${
              props.report.atRiskHabits.length > 0 ? 'text-warning' : 'text-ink'
            }`}
          >
            {props.report.atRiskHabits.length}
          </p>
          <span class="block font-mono text-[11px] text-ink-subtle tabular-nums">
            {props.report.atRiskHabits.length > 0
              ? 'Drop ≥15% or 2+ missed'
              : 'All active habits steady'}
          </span>
        </div>
      </div>

      {/* At-Risk Habits + Logging Time-of-Day */}
      <div class="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        <section class="space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6 lg:col-span-6">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="font-display text-base font-semibold text-ink">
                At-Risk &amp; Cooling Habits
              </h3>
              <p class="text-xs text-ink-subtle">
                Recent drop ≥15% vs baseline or 2+ consecutive misses
              </p>
            </div>
          </div>

          <Show
            when={props.report.atRiskHabits.length > 0}
            fallback={
              <div class="py-8 text-center">
                <p class="text-sm text-ink-subtle">
                  No active habits show a sharp drop or streak risk in this period.
                </p>
              </div>
            }
          >
            <ul class="divide-y divide-white/[0.06]">
              <For each={props.report.atRiskHabits}>
                {(item) => (
                  <li>
                    <button
                      type="button"
                      onClick={() => props.onSelectHabitFilter([item.habit.id])}
                      class="-mx-2 flex w-full cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-2 py-3 text-left transition-colors hover:bg-white/[0.02] sm:flex-nowrap"
                    >
                      <div class="flex min-w-0 flex-1 items-center gap-2.5">
                        <HabitBadge appearanceRaw={item.habit.color} size="xs" />
                        <span class="truncate text-sm font-medium text-ink">{item.habit.name}</span>
                      </div>
                      <div class="shrink-0 space-x-2 text-right font-mono text-xs tabular-nums">
                        <Show when={item.dropPct !== null && item.dropPct <= -15}>
                          <span class="text-danger-soft">
                            {item.dropPct}% vs base ({Math.round(item.recentRate * 100)}%)
                          </span>
                        </Show>
                        <Show when={item.consecutiveMisses >= 2}>
                          <span class="text-warning">{item.consecutiveMisses} missed in a row</span>
                        </Show>
                      </div>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>

        <section class="space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6 lg:col-span-6">
          <div>
            <h3 class="font-display text-base font-semibold text-ink">Check-in Time of Day</h3>
            <p class="text-xs text-ink-subtle">
              Based on latest check-in update time in your selected timezone
            </p>
          </div>

          <Show
            when={props.report.loggingDiscipline.totalDoneCheckins > 0}
            fallback={
              <div class="py-8 text-center">
                <p class="text-sm text-ink-subtle">No completed check-ins in this period.</p>
              </div>
            }
          >
            <div class="space-y-3 pt-1">
              <For each={props.report.loggingDiscipline.timeOfDayBuckets}>
                {(b) => {
                  const pct = () => Math.round(b.share * 100);
                  return (
                    <div class="space-y-1">
                      <div class="flex items-center justify-between text-xs">
                        <span class="text-ink-secondary">
                          {b.label} <span class="font-mono text-ink-dim">({b.hoursLabel})</span>
                        </span>
                        <span class="font-mono text-ink tabular-nums">
                          {b.count} <span class="text-ink-subtle">({pct()}%)</span>
                        </span>
                      </div>
                      <div class="h-2 overflow-hidden rounded-full border border-white/[0.06] bg-canvas">
                        <div
                          class="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${Math.max(b.count > 0 ? 3 : 0, pct())}%` }}
                        />
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </section>
      </div>

      {/* Habit x Weekday Matrix */}
      <Show when={props.report.habitWeekdayMatrix.length > 0}>
        <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-4 sm:px-6">
            <div>
              <h3 class="font-display text-base font-semibold text-ink">Habit × Weekday Matrix</h3>
              <p class="text-xs text-ink-subtle">
                Completion rate by weekday (flexible habits show check-in counts)
              </p>
            </div>
          </div>

          {/* Mobile stacked 7-day matrix (zero horizontal overflow) */}
          <div class="sm:hidden">
            <div class="grid grid-cols-7 gap-1 border-b border-white/[0.06] px-4 py-2 text-center font-mono text-[10px] text-ink-subtle">
              <For each={[0, 1, 2, 3, 4, 5, 6]}>
                {(bit) => <span>{CivilCalendar.weekdayShortLabel(bit)}</span>}
              </For>
            </div>
            <ul class="divide-y divide-white/[0.05]">
              <For each={props.report.habitWeekdayMatrix}>
                {(row) => (
                  <li class="space-y-2 px-4 py-3">
                    <div class="flex min-w-0 items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => props.onSelectHabitFilter([row.habit.id])}
                        class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden text-left hover:underline"
                      >
                        <HabitBadge appearanceRaw={row.habit.color} size="xs" />
                        <span class="min-w-0 truncate text-xs font-medium text-ink">
                          {row.habit.name}
                        </span>
                        <Show when={row.isFlexible}>
                          <span class="shrink-0 font-mono text-[10px] text-ink-dim">flex</span>
                        </Show>
                      </button>
                      <span class="shrink-0 font-mono text-xs font-medium text-ink tabular-nums">
                        {Math.round(row.overallRate * 100)}%
                      </span>
                    </div>
                    <div class="grid grid-cols-7 gap-1">
                      <For each={row.cells}>
                        {(cell) => (
                          <div
                            class={`flex h-7 items-center justify-center rounded-md border font-mono text-[10px] tabular-nums ${matrixCellTone(
                              cell.rate,
                              row.isFlexible,
                              cell.doneCount,
                              cell.isOffSchedule
                            )}`}
                            title={
                              row.isFlexible
                                ? cell.isOffSchedule
                                  ? `Off-schedule day · ${cell.doneCount} ${cell.doneCount === 1 ? 'completion' : 'completions'}`
                                  : `${cell.doneCount} ${cell.doneCount === 1 ? 'completion' : 'completions'}`
                                : cell.rate !== null
                                  ? `${cell.doneCount}/${cell.scheduledCount} (${Math.round(cell.rate * 100)}%)`
                                  : 'Unscheduled'
                            }
                          >
                            {row.isFlexible
                              ? cell.doneCount > 0
                                ? `${cell.doneCount}×`
                                : '·'
                              : cell.rate !== null
                                ? `${Math.round(cell.rate * 100)}%`
                                : '·'}
                          </div>
                        )}
                      </For>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </div>

          {/* Tablet / Desktop table */}
          <div class="hidden overflow-x-auto sm:block">
            <table class="w-full table-fixed border-collapse text-left">
              <thead>
                <tr class="border-b border-white/[0.06] font-mono text-[11px] text-ink-subtle">
                  <th class="w-auto py-3 pr-3 pl-6 font-medium">Habit</th>
                  <For each={[0, 1, 2, 3, 4, 5, 6]}>
                    {(bit) => (
                      <th class="w-11 px-1 py-3 text-center font-medium md:w-14">
                        {CivilCalendar.weekdayShortLabel(bit)}
                      </th>
                    )}
                  </For>
                  <th class="w-14 py-3 pr-6 pl-2 text-right font-medium md:w-16">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/[0.05]">
                <For each={props.report.habitWeekdayMatrix}>
                  {(row) => (
                    <tr class="transition-colors hover:bg-white/[0.02]">
                      <td class="overflow-hidden py-2.5 pr-3 pl-6">
                        <button
                          type="button"
                          onClick={() => props.onSelectHabitFilter([row.habit.id])}
                          class="flex w-full max-w-full min-w-0 cursor-pointer items-center gap-2 overflow-hidden text-left hover:underline"
                          title={row.habit.name}
                        >
                          <HabitBadge appearanceRaw={row.habit.color} size="xs" />
                          <span class="min-w-0 truncate text-xs font-medium text-ink">
                            {row.habit.name}
                          </span>
                          <Show when={row.isFlexible}>
                            <span class="shrink-0 font-mono text-[10px] text-ink-dim">flex</span>
                          </Show>
                        </button>
                      </td>
                      <For each={row.cells}>
                        {(cell) => (
                          <td class="px-1 py-2 text-center">
                            <div
                              class={`flex h-8 items-center justify-center rounded-lg border font-mono text-[11px] tabular-nums ${matrixCellTone(
                                cell.rate,
                                row.isFlexible,
                                cell.doneCount,
                                cell.isOffSchedule
                              )}`}
                              title={
                                row.isFlexible
                                  ? cell.isOffSchedule
                                    ? `Off-schedule day · ${cell.doneCount} ${cell.doneCount === 1 ? 'completion' : 'completions'}`
                                    : `${cell.doneCount} ${cell.doneCount === 1 ? 'completion' : 'completions'}`
                                  : cell.rate !== null
                                    ? `${cell.doneCount}/${cell.scheduledCount} (${Math.round(cell.rate * 100)}%)`
                                    : 'Unscheduled'
                              }
                            >
                              {row.isFlexible
                                ? cell.doneCount > 0
                                  ? `${cell.doneCount}×`
                                  : '·'
                                : cell.rate !== null
                                  ? `${Math.round(cell.rate * 100)}%`
                                  : '·'}
                            </div>
                          </td>
                        )}
                      </For>
                      <td class="py-2.5 pr-6 pl-2 text-right font-mono text-xs font-medium text-ink tabular-nums">
                        {Math.round(row.overallRate * 100)}%
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>
      </Show>

      {/* Flexible Deep Dive & Measured Intensity (Conditional) */}
      <Show
        when={props.report.flexibleInsight !== null || props.report.measuredIntensity.length > 0}
      >
        <div class="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
          <Show when={props.report.flexibleInsight}>
            {(flex) => (
              <section
                class={`${
                  props.report.measuredIntensity.length > 0 ? 'lg:col-span-6' : 'lg:col-span-12'
                } space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6`}
              >
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 class="font-display text-base font-semibold text-ink">
                      Flexible Habits Deep Dive
                    </h3>
                    <p class="text-xs text-ink-subtle">
                      Weekly target mastery &amp; day-of-week distribution
                    </p>
                  </div>
                  <div class="font-mono text-xs text-ink-secondary tabular-nums">
                    {flex().perfectWeeks}/{flex().totalWeeks} perfect weeks
                    <Show when={flex().bonusCheckins > 0}>
                      <span class="text-accent-soft"> · +{flex().bonusCheckins} bonus</span>
                    </Show>
                  </div>
                </div>

                <div class="grid h-28 grid-cols-7 items-end gap-1 pt-2 sm:gap-2">
                  <For each={flex().weekdayDistribution}>
                    {(d) => {
                      const hPct = () =>
                        d.count === 0
                          ? 0
                          : Math.max(12, Math.round((d.count / maxFlexWeekdayCount()) * 100));
                      return (
                        <div class="flex h-full flex-col items-center justify-end gap-1.5">
                          <span class="h-4 shrink-0 font-mono text-[11px] leading-4 text-ink-subtle tabular-nums">
                            {d.count > 0 ? d.count : ''}
                          </span>
                          <div class="flex w-full flex-1 items-end">
                            <Show
                              when={d.count > 0}
                              fallback={<div class="h-[3px] w-full rounded-t-md bg-white/[0.06]" />}
                            >
                              <div
                                class="w-full rounded-t-md bg-accent"
                                style={{ height: `${hPct()}%` }}
                                title={`${d.label}: ${d.count} check-ins (${Math.round(d.share * 100)}%)`}
                              />
                            </Show>
                          </div>
                          <span class="h-4 shrink-0 font-mono text-[11px] leading-4 text-ink-subtle">
                            {d.label}
                          </span>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </section>
            )}
          </Show>

          <Show when={props.report.measuredIntensity.length > 0}>
            <section
              class={`${
                props.report.flexibleInsight !== null ? 'lg:col-span-6' : 'lg:col-span-12'
              } space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6`}
            >
              <div>
                <h3 class="font-display text-base font-semibold text-ink">
                  Measured Target Intensity
                </h3>
                <p class="text-xs text-ink-subtle">
                  Partial vs Exact vs Overachieved logged days &amp; personal bests
                </p>
              </div>

              <ul class="space-y-4">
                <For each={props.report.measuredIntensity}>
                  {(item) => {
                    const total = () => Math.max(1, item.totalLoggedDays);
                    const pPct = () => (item.partialDays / total()) * 100;
                    const ePct = () => (item.exactDays / total()) * 100;
                    const oPct = () => (item.overachievedDays / total()) * 100;
                    const u = () => (item.unit ? ` ${item.unit}` : '');
                    return (
                      <li class="space-y-1.5">
                        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div class="flex min-w-0 items-center gap-2">
                            <HabitBadge appearanceRaw={item.habit.color} size="xs" />
                            <span class="truncate font-medium text-ink">{item.habit.name}</span>
                          </div>
                          <span class="font-mono text-ink-subtle tabular-nums">
                            Best:{' '}
                            <span class="text-ink">
                              {HabitSchedule.formatNumericValue(item.bestDayValue)}
                              {u()}
                            </span>
                            {item.bestDayIndex !== null
                              ? ` (${CivilCalendar.formatShortDate(item.bestDayIndex)})`
                              : ''}
                          </span>
                        </div>

                        <Show
                          when={item.totalLoggedDays > 0}
                          fallback={
                            <div class="h-2 rounded-full border border-white/[0.06] bg-canvas" />
                          }
                        >
                          <div class="flex h-2.5 overflow-hidden rounded-full border border-white/[0.06] bg-canvas">
                            <Show when={item.partialDays > 0}>
                              <div
                                class="h-full bg-warning"
                                style={{ width: `${pPct()}%` }}
                                title={`Partial: ${item.partialDays}d`}
                              />
                            </Show>
                            <Show when={item.exactDays > 0}>
                              <div
                                class="h-full bg-accent"
                                style={{ width: `${ePct()}%` }}
                                title={`Exact target: ${item.exactDays}d`}
                              />
                            </Show>
                            <Show when={item.overachievedDays > 0}>
                              <div
                                class="h-full bg-accent-soft"
                                style={{ width: `${oPct()}%` }}
                                title={`Overachieved: ${item.overachievedDays}d`}
                              />
                            </Show>
                          </div>
                        </Show>

                        <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-ink-subtle tabular-nums">
                          <span class="text-warning-soft">
                            {item.partialDays} partial
                            {item.avgPartialPct !== null ? ` (avg ${item.avgPartialPct}%)` : ''}
                          </span>
                          <span class="text-accent-tint">{item.exactDays} exact</span>
                          <span class="text-accent-soft">{item.overachievedDays} over</span>
                        </div>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </section>
          </Show>
        </div>
      </Show>

      {/* Schedule Change Before / After Impact */}
      <Show when={props.report.scheduleImpacts.length > 0}>
        <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface">
          <div class="border-b border-white/[0.06] px-4 py-4 sm:px-6">
            <h3 class="font-display text-base font-semibold text-ink">Schedule Change Impact</h3>
            <p class="text-xs text-ink-subtle">
              Before vs After comparison around versioned schedule updates
            </p>
          </div>
          <ul class="divide-y divide-white/[0.06]">
            <For each={props.report.scheduleImpacts}>
              {(imp) => (
                <li class="flex flex-col justify-between gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:px-6">
                  <div class="min-w-0 space-y-0.5">
                    <div class="flex min-w-0 items-center gap-2">
                      <HabitBadge appearanceRaw={imp.habit.color} size="xs" />
                      <span class="min-w-0 truncate text-sm font-medium text-ink">
                        {imp.habit.name}
                      </span>
                      <span class="shrink-0 font-mono text-[11px] text-ink-dim">
                        from {CivilCalendar.formatShortDateWithYear(imp.changeDay)}
                      </span>
                    </div>
                    <p class="font-mono text-xs text-ink-subtle">
                      {imp.beforeLabel} → <span class="text-ink-secondary">{imp.afterLabel}</span>
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                    <span class="text-ink-subtle">
                      {imp.beforeRate !== null ? `${Math.round(imp.beforeRate * 100)}%` : '—'}
                      {' → '}
                      <span class="text-ink">
                        {imp.afterRate !== null ? `${Math.round(imp.afterRate * 100)}%` : '—'}
                      </span>
                    </span>
                    <Show when={imp.deltaPct !== null}>
                      <span
                        class={
                          imp.deltaPct! > 0
                            ? 'text-accent-soft'
                            : imp.deltaPct! < 0
                              ? 'text-danger-soft'
                              : 'text-ink-subtle'
                        }
                      >
                        {imp.deltaPct! > 0 ? `+${imp.deltaPct}%` : `${imp.deltaPct}%`}
                      </span>
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </div>
  );
}

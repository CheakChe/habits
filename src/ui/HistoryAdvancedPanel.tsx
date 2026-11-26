import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import {
  AdvancedAnalyticsReport,
  AdvancedHeatmapMode,
  AdvancedNotesFilter,
  BacklogFlowBucket,
  WorkloadForecastDay,
} from '../utils/advanced-analytics';
import { CivilCalendar } from '../utils/civil-calendar';
import { DateRangeResolver, DayCellTone } from '../utils/date-range';
import { HabitSchedule } from '../utils/habit-schedule';
import { HabitBadge } from './HabitBadge';
import { CalendarIcon } from './Icons';

interface HistoryAdvancedPanelProps {
  report: AdvancedAnalyticsReport;
  effectiveRangeStart: number;
  effectiveRangeEnd: number;
  rangeLabel: string;
  selectedDay: number;
  heatmapMode: AdvancedHeatmapMode;
  notesFilter: AdvancedNotesFilter;
  onChangeHeatmapMode: (mode: AdvancedHeatmapMode) => void;
  onChangeNotesFilter: (filter: AdvancedNotesFilter) => void;
  onSelectDay: (dayIndex: number) => void;
  onInspectDayInCalendar: (dayIndex: number) => void;
  onSelectHabitFilter: (filter: 'all' | number[]) => void;
}

function heatmapSquareClass(tone: DayCellTone): string {
  switch (tone) {
    case 'complete':
      return 'bg-[#3B82F6]';
    case 'missed-slight':
      return 'bg-[#581C24]';
    case 'missed-moderate':
      return 'bg-[#881B22]';
    case 'missed-heavy':
      return 'bg-[#B91C1C]';
    case 'missed-all':
      return 'bg-[#EF4444]';
    case 'today-open':
      return 'bg-[#3B181E] border border-[#EF4444]/40';
    case 'unscheduled':
    case 'future':
    default:
      return 'bg-[#0D1016] border border-white/[0.06]';
  }
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
        return 'bg-transparent text-[#4B5563] border-dashed border-white/[0.06]';
      }
      return 'bg-[#3B82F6]/15 text-[#93C5FD] border-dashed border-[#3B82F6]/45';
    }
    if (doneCount === 0) return 'bg-[#0A0B0E] text-[#8E95A5] border-white/[0.08]';
    return 'bg-[#3B82F6]/20 text-[#93C5FD] border-[#3B82F6]/35';
  }
  if (rate === null) return 'bg-[#0A0B0E] text-[#4B5563] border-white/[0.05]';
  if (rate >= 0.9) return 'bg-[#3B82F6]/25 text-[#DBEAFE] border-[#3B82F6]/45';
  if (rate >= 0.65) return 'bg-[#3B82F6]/12 text-[#93C5FD] border-[#3B82F6]/25';
  if (rate >= 0.4) return 'bg-[#F59E0B]/15 text-[#FCD34D] border-[#F59E0B]/30';
  return 'bg-[#EF4444]/15 text-[#FCA5A5] border-[#EF4444]/30';
}

export function HistoryAdvancedPanel(props: HistoryAdvancedPanelProps): JSX.Element {
  const [hoveredFlowBucket, setHoveredFlowBucket] = createSignal<BacklogFlowBucket | null>(null);
  const [hoveredForecastDay, setHoveredForecastDay] = createSignal<WorkloadForecastDay | null>(
    null
  );
  const [hoveredHeatDay, setHoveredHeatDay] = createSignal<{
    dayIndex: number;
    habitsDone: number;
    habitsScheduled: number;
    tasksDone: number;
    tasksNotDone: number;
    tasksDueOpen: number;
  } | null>(null);
  const [selectedKeyword, setSelectedKeyword] = createSignal<string | null>(null);

  const peakLoggingWindow = createMemo(() => {
    const buckets = props.report.loggingDiscipline.timeOfDayBuckets;
    const total = props.report.loggingDiscipline.totalDoneCheckins;
    if (total === 0) return null;
    return buckets.reduce((best, cur) => (cur.count > best.count ? cur : best), buckets[0]);
  });

  const maxFlowValue = createMemo(() =>
    Math.max(
      1,
      ...props.report.backlogFlowBuckets.map((b) => Math.max(b.createdCount, b.closedCount))
    )
  );

  const maxForecastLoad = createMemo(() =>
    Math.max(1, ...props.report.workloadForecast.map((d) => d.totalLoad))
  );

  const maxFlexWeekdayCount = createMemo(() => {
    const flex = props.report.flexibleInsight;
    if (!flex) return 1;
    return Math.max(1, ...flex.weekdayDistribution.map((d) => d.count));
  });

  const filteredNotes = createMemo(() => {
    const kw = selectedKeyword();
    return props.report.notesInsights.entries.filter((entry) => {
      if (props.notesFilter === 'missed' && entry.status !== 'missed') return false;
      if (props.notesFilter === 'done' && entry.status !== 'done') return false;
      if (kw && !entry.text.toLowerCase().includes(kw)) return false;
      return true;
    });
  });

  return (
    <div class="space-y-8">
      {/* SECTION 1: Habit Resilience & Execution Patterns */}
      <div class="space-y-5">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="font-display text-lg font-semibold text-[#F5F7FA]">
            Habit Resilience &amp; Behavior
          </h2>
          <span class="font-mono text-xs text-[#8E95A5] tabular-nums">
            {props.rangeLabel} ·{' '}
            {DateRangeResolver.formatRangeLabel(props.effectiveRangeStart, props.effectiveRangeEnd)}
          </span>
        </div>

        {/* 4 Summary Tiles */}
        <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-5">
            <span class="text-xs text-[#8E95A5]">Bounce-Back Rate</span>
            <p class="font-display font-mono text-xl font-semibold text-[#F5F7FA] tabular-nums sm:text-2xl">
              {props.report.bounceBack.bounceBackRate !== null
                ? `${Math.round(props.report.bounceBack.bounceBackRate * 100)}%`
                : '—'}
            </p>
            <span class="block font-mono text-[11px] text-[#8E95A5] tabular-nums">
              {props.report.bounceBack.totalMissesEvaluated > 0
                ? `${props.report.bounceBack.recoveredMisses} recovered · ${props.report.bounceBack.chainedMisses} chained`
                : 'No prior misses to evaluate'}
            </span>
          </div>

          <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-5">
            <span class="text-xs text-[#8E95A5]">Retroactive Check-ins</span>
            <p class="font-display font-mono text-xl font-semibold text-[#F5F7FA] tabular-nums sm:text-2xl">
              {props.report.loggingDiscipline.retroactiveRate !== null
                ? `${Math.round(props.report.loggingDiscipline.retroactiveRate * 100)}%`
                : '—'}
            </p>
            <span class="block font-mono text-[11px] text-[#8E95A5] tabular-nums">
              {props.report.loggingDiscipline.sameDayCount} same-day ·{' '}
              {props.report.loggingDiscipline.retroactiveCount} logged later
            </span>
          </div>

          <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-5">
            <span class="text-xs text-[#8E95A5]">Peak Logging Time</span>
            <p class="truncate font-display text-xl font-semibold text-[#F5F7FA] sm:text-2xl">
              {peakLoggingWindow() ? peakLoggingWindow()!.label : '—'}
            </p>
            <span class="block font-mono text-[11px] text-[#8E95A5] tabular-nums">
              {peakLoggingWindow()
                ? `${peakLoggingWindow()!.hoursLabel} · ${Math.round(peakLoggingWindow()!.share * 100)}% of check-ins`
                : 'No completed check-ins'}
            </span>
          </div>

          <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-5">
            <span class="text-xs text-[#8E95A5]">Cooling / At-Risk</span>
            <p
              class={`font-display font-mono text-xl font-semibold tabular-nums sm:text-2xl ${
                props.report.atRiskHabits.length > 0 ? 'text-[#F59E0B]' : 'text-[#F5F7FA]'
              }`}
            >
              {props.report.atRiskHabits.length}
            </p>
            <span class="block font-mono text-[11px] text-[#8E95A5] tabular-nums">
              {props.report.atRiskHabits.length > 0
                ? 'Drop ≥15% or 2+ missed'
                : 'All active habits steady'}
            </span>
          </div>
        </div>

        {/* At-Risk Habits + Logging Time-of-Day */}
        <div class="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
          <section class="space-y-4 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-6 lg:col-span-6">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                  At-Risk &amp; Cooling Habits
                </h3>
                <p class="text-xs text-[#8E95A5]">
                  Recent drop ≥15% vs baseline or 2+ consecutive misses
                </p>
              </div>
            </div>

            <Show
              when={props.report.atRiskHabits.length > 0}
              fallback={
                <div class="py-8 text-center">
                  <p class="text-sm text-[#8E95A5]">
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
                          <span class="truncate text-sm font-medium text-[#F5F7FA]">
                            {item.habit.name}
                          </span>
                        </div>
                        <div class="shrink-0 space-x-2 text-right font-mono text-xs tabular-nums">
                          <Show when={item.dropPct !== null && item.dropPct <= -15}>
                            <span class="text-[#FCA5A5]">
                              {item.dropPct}% vs base ({Math.round(item.recentRate * 100)}%)
                            </span>
                          </Show>
                          <Show when={item.consecutiveMisses >= 2}>
                            <span class="text-[#F59E0B]">
                              {item.consecutiveMisses} missed in a row
                            </span>
                          </Show>
                        </div>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>

          <section class="space-y-4 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-6 lg:col-span-6">
            <div>
              <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                Check-in Time of Day
              </h3>
              <p class="text-xs text-[#8E95A5]">
                Based on latest check-in update time in your selected timezone
              </p>
            </div>

            <Show
              when={props.report.loggingDiscipline.totalDoneCheckins > 0}
              fallback={
                <div class="py-8 text-center">
                  <p class="text-sm text-[#8E95A5]">No completed check-ins in this period.</p>
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
                          <span class="text-[#C8CDD8]">
                            {b.label} <span class="font-mono text-[#6B7280]">({b.hoursLabel})</span>
                          </span>
                          <span class="font-mono text-[#F5F7FA] tabular-nums">
                            {b.count} <span class="text-[#8E95A5]">({pct()}%)</span>
                          </span>
                        </div>
                        <div class="h-2 overflow-hidden rounded-full border border-white/[0.06] bg-[#0A0B0E]">
                          <div
                            class="h-full rounded-full bg-[#3B82F6] transition-all"
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
          <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#14161B]">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-4 sm:px-6">
              <div>
                <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                  Habit × Weekday Matrix
                </h3>
                <p class="text-xs text-[#8E95A5]">
                  Completion rate by weekday (flexible habits show check-in counts)
                </p>
              </div>
            </div>

            {/* Mobile stacked 7-day matrix (zero horizontal overflow) */}
            <div class="sm:hidden">
              <div class="grid grid-cols-7 gap-1 border-b border-white/[0.06] px-4 py-2 text-center font-mono text-[10px] text-[#8E95A5]">
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
                          <span class="min-w-0 truncate text-xs font-medium text-[#F5F7FA]">
                            {row.habit.name}
                          </span>
                          <Show when={row.isFlexible}>
                            <span class="shrink-0 font-mono text-[10px] text-[#6B7280]">flex</span>
                          </Show>
                        </button>
                        <span class="shrink-0 font-mono text-xs font-medium text-[#F5F7FA] tabular-nums">
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
                  <tr class="border-b border-white/[0.06] font-mono text-[11px] text-[#8E95A5]">
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
                            <span class="min-w-0 truncate text-xs font-medium text-[#F5F7FA]">
                              {row.habit.name}
                            </span>
                            <Show when={row.isFlexible}>
                              <span class="shrink-0 font-mono text-[10px] text-[#6B7280]">
                                flex
                              </span>
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
                        <td class="py-2.5 pr-6 pl-2 text-right font-mono text-xs font-medium text-[#F5F7FA] tabular-nums">
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
                  } space-y-4 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-6`}
                >
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                        Flexible Habits Deep Dive
                      </h3>
                      <p class="text-xs text-[#8E95A5]">
                        Weekly target mastery &amp; day-of-week distribution
                      </p>
                    </div>
                    <div class="font-mono text-xs text-[#C8CDD8] tabular-nums">
                      {flex().perfectWeeks}/{flex().totalWeeks} perfect weeks
                      <Show when={flex().bonusCheckins > 0}>
                        <span class="text-[#60A5FA]"> · +{flex().bonusCheckins} bonus</span>
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
                            <span class="h-4 shrink-0 font-mono text-[11px] leading-4 text-[#8E95A5] tabular-nums">
                              {d.count > 0 ? d.count : ''}
                            </span>
                            <div class="flex w-full flex-1 items-end">
                              <Show
                                when={d.count > 0}
                                fallback={
                                  <div class="h-[3px] w-full rounded-t-md bg-white/[0.06]" />
                                }
                              >
                                <div
                                  class="w-full rounded-t-md bg-[#3B82F6]"
                                  style={{ height: `${hPct()}%` }}
                                  title={`${d.label}: ${d.count} check-ins (${Math.round(d.share * 100)}%)`}
                                />
                              </Show>
                            </div>
                            <span class="h-4 shrink-0 font-mono text-[11px] leading-4 text-[#8E95A5]">
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
                } space-y-4 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-6`}
              >
                <div>
                  <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                    Measured Target Intensity
                  </h3>
                  <p class="text-xs text-[#8E95A5]">
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
                              <span class="truncate font-medium text-[#F5F7FA]">
                                {item.habit.name}
                              </span>
                            </div>
                            <span class="font-mono text-[#8E95A5] tabular-nums">
                              Best:{' '}
                              <span class="text-[#F5F7FA]">
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
                              <div class="h-2 rounded-full border border-white/[0.06] bg-[#0A0B0E]" />
                            }
                          >
                            <div class="flex h-2.5 overflow-hidden rounded-full border border-white/[0.06] bg-[#0A0B0E]">
                              <Show when={item.partialDays > 0}>
                                <div
                                  class="h-full bg-[#F59E0B]"
                                  style={{ width: `${pPct()}%` }}
                                  title={`Partial: ${item.partialDays}d`}
                                />
                              </Show>
                              <Show when={item.exactDays > 0}>
                                <div
                                  class="h-full bg-[#3B82F6]"
                                  style={{ width: `${ePct()}%` }}
                                  title={`Exact target: ${item.exactDays}d`}
                                />
                              </Show>
                              <Show when={item.overachievedDays > 0}>
                                <div
                                  class="h-full bg-[#60A5FA]"
                                  style={{ width: `${oPct()}%` }}
                                  title={`Overachieved: ${item.overachievedDays}d`}
                                />
                              </Show>
                            </div>
                          </Show>

                          <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-[#8E95A5] tabular-nums">
                            <span class="text-[#FCD34D]">
                              {item.partialDays} partial
                              {item.avgPartialPct !== null ? ` (avg ${item.avgPartialPct}%)` : ''}
                            </span>
                            <span class="text-[#93C5FD]">{item.exactDays} exact</span>
                            <span class="text-[#60A5FA]">{item.overachievedDays} over</span>
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
          <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#14161B]">
            <div class="border-b border-white/[0.06] px-4 py-4 sm:px-6">
              <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                Schedule Change Impact
              </h3>
              <p class="text-xs text-[#8E95A5]">
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
                        <span class="min-w-0 truncate text-sm font-medium text-[#F5F7FA]">
                          {imp.habit.name}
                        </span>
                        <span class="shrink-0 font-mono text-[11px] text-[#6B7280]">
                          from {CivilCalendar.formatShortDateWithYear(imp.changeDay)}
                        </span>
                      </div>
                      <p class="font-mono text-xs text-[#8E95A5]">
                        {imp.beforeLabel} → <span class="text-[#C8CDD8]">{imp.afterLabel}</span>
                      </p>
                    </div>
                    <div class="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                      <span class="text-[#8E95A5]">
                        {imp.beforeRate !== null ? `${Math.round(imp.beforeRate * 100)}%` : '—'}
                        {' → '}
                        <span class="text-[#F5F7FA]">
                          {imp.afterRate !== null ? `${Math.round(imp.afterRate * 100)}%` : '—'}
                        </span>
                      </span>
                      <Show when={imp.deltaPct !== null}>
                        <span
                          class={
                            imp.deltaPct! > 0
                              ? 'text-[#60A5FA]'
                              : imp.deltaPct! < 0
                                ? 'text-[#FCA5A5]'
                                : 'text-[#8E95A5]'
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

      {/* SECTION 2: Task Velocity, Backlog Flow & Workload Forecast */}
      <div class="space-y-5">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="font-display text-lg font-semibold text-[#F5F7FA]">
            Task Velocity, Backlog Flow &amp; Forecast
          </h2>
          <span class="font-mono text-xs text-[#8E95A5] tabular-nums">
            Net backlog delta:{' '}
            <span
              class={
                props.report.taskVelocity.netBacklogDelta <= 0 ? 'text-[#60A5FA]' : 'text-[#F59E0B]'
              }
            >
              {props.report.taskVelocity.netBacklogDelta > 0
                ? `+${props.report.taskVelocity.netBacklogDelta}`
                : props.report.taskVelocity.netBacklogDelta}
            </span>{' '}
            ({props.report.taskVelocity.totalCreatedInRange} created ·{' '}
            {props.report.taskVelocity.totalClosedInRange} closed)
          </span>
        </div>

        <div class="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
          {/* Backlog Flow Chart */}
          <section class="flex flex-col justify-between space-y-4 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-6 lg:col-span-7">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                  Backlog Flow (Created vs Closed)
                </h3>
                <p class="font-mono text-xs text-[#8E95A5] tabular-nums">
                  <Show
                    when={hoveredFlowBucket()}
                    fallback={<span>Intake vs closure balance across {props.rangeLabel}</span>}
                  >
                    {(b) => (
                      <span class="text-[#F5F7FA]">
                        {b().label} · +{b().createdCount} created · -{b().closedCount} closed (net{' '}
                        {b().netFlow > 0 ? `+${b().netFlow}` : b().netFlow})
                      </span>
                    )}
                  </Show>
                </p>
              </div>
              <div class="flex items-center gap-3 text-[11px] text-[#8E95A5]">
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2.5 w-2.5 rounded-[2px] bg-[#8E95A5]" />
                  <span>Created</span>
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2.5 w-2.5 rounded-[2px] bg-[#3B82F6]" />
                  <span>Closed</span>
                </span>
              </div>
            </div>

            <div class="flex h-36 items-end gap-1 pt-3 sm:gap-2">
              <For each={props.report.backlogFlowBuckets}>
                {(b) => {
                  const createdH = () =>
                    b.createdCount === 0
                      ? 3
                      : Math.max(10, Math.round((b.createdCount / maxFlowValue()) * 100));
                  const closedH = () =>
                    b.closedCount === 0
                      ? 3
                      : Math.max(10, Math.round((b.closedCount / maxFlowValue()) * 100));
                  return (
                    <div
                      class="flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end gap-1.5"
                      onMouseEnter={() => setHoveredFlowBucket(b)}
                      onMouseLeave={() => setHoveredFlowBucket(null)}
                    >
                      <div class="flex w-full flex-1 items-end justify-center gap-1 px-0.5">
                        <div
                          class={`flex-1 rounded-t-sm transition-opacity ${
                            b.createdCount > 0 ? 'bg-[#8E95A5]/70' : 'bg-white/[0.06]'
                          }`}
                          style={{ height: `${createdH()}%` }}
                        />
                        <div
                          class={`flex-1 rounded-t-sm transition-opacity ${
                            b.closedCount > 0 ? 'bg-[#3B82F6]' : 'bg-white/[0.06]'
                          }`}
                          style={{ height: `${closedH()}%` }}
                        />
                      </div>
                      <span class="h-4 max-w-full shrink-0 truncate font-mono text-[11px] leading-4 text-[#8E95A5] tabular-nums">
                        {b.shortLabel}
                      </span>
                    </div>
                  );
                }}
              </For>
            </div>
          </section>

          {/* Velocity & Open Backlog Aging */}
          <section class="flex flex-col justify-between space-y-4 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-6 lg:col-span-5">
            <div>
              <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                Latency &amp; Backlog Aging
              </h3>
              <p class="text-xs text-[#8E95A5]">
                Turnaround speed &amp; currently aging open backlog
              </p>
            </div>

            <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <span class="block text-[11px] text-[#8E95A5]">Late Delay</span>
                <span class="font-mono text-sm font-medium text-[#F5F7FA] tabular-nums">
                  {props.report.taskVelocity.avgLateDays !== null
                    ? `${props.report.taskVelocity.avgLateDays}d avg`
                    : '—'}
                </span>
                <Show when={props.report.taskVelocity.lateTasksCount > 0}>
                  <span class="block font-mono text-[11px] text-[#8E95A5] tabular-nums">
                    med {props.report.taskVelocity.medianLateDays}d · max{' '}
                    {props.report.taskVelocity.maxLateDays}d
                  </span>
                </Show>
              </div>

              <div>
                <span class="block text-[11px] text-[#8E95A5]">Finished Early</span>
                <span class="font-mono text-sm font-medium text-[#F5F7FA] tabular-nums">
                  {props.report.taskVelocity.earlyTasksCount} tasks
                </span>
                <Show when={props.report.taskVelocity.avgDaysEarly !== null}>
                  <span class="block font-mono text-[11px] text-[#60A5FA] tabular-nums">
                    {props.report.taskVelocity.avgDaysEarly}d early avg
                  </span>
                </Show>
              </div>

              <div>
                <span class="block text-[11px] text-[#8E95A5]">Dated Cycle Time</span>
                <span class="font-mono text-sm font-medium text-[#F5F7FA] tabular-nums">
                  {props.report.taskVelocity.datedCycleTimeAvgDays !== null
                    ? `${props.report.taskVelocity.datedCycleTimeAvgDays}d avg`
                    : '—'}
                </span>
                <span class="block font-mono text-[11px] text-[#8E95A5] tabular-nums">
                  {props.report.taskVelocity.datedCycleCount} closed
                </span>
              </div>

              <div>
                <span class="block text-[11px] text-[#8E95A5]">Goals Cycle Time</span>
                <span class="font-mono text-sm font-medium text-[#F5F7FA] tabular-nums">
                  {props.report.taskVelocity.goalsCycleTimeAvgDays !== null
                    ? `${props.report.taskVelocity.goalsCycleTimeAvgDays}d avg`
                    : '—'}
                </span>
                <span class="block font-mono text-[11px] text-[#8E95A5] tabular-nums">
                  {props.report.taskVelocity.goalsCycleCount} closed
                </span>
              </div>
            </div>

            <div class="space-y-1.5 border-t border-white/[0.06] pt-3 font-mono text-[11px] tabular-nums">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[#8E95A5]">Open Overdue:</span>
                <span
                  class={
                    props.report.taskVelocity.openOverdueCount > 0
                      ? 'text-[#FCA5A5]'
                      : 'text-[#C8CDD8]'
                  }
                >
                  {props.report.taskVelocity.openOverdueCount}
                  {props.report.taskVelocity.avgOverdueAgeDays !== null
                    ? ` (avg ${props.report.taskVelocity.avgOverdueAgeDays}d · max ${props.report.taskVelocity.maxOverdueAgeDays}d)`
                    : ''}
                </span>
              </div>
              <Show when={props.report.taskVelocity.oldestOverdueTitle}>
                <p class="truncate text-[#6B7280]">
                  Oldest overdue: {props.report.taskVelocity.oldestOverdueTitle}
                </p>
              </Show>
              <div class="flex items-center justify-between gap-2">
                <span class="text-[#8E95A5]">Open Goals:</span>
                <span class="text-[#C8CDD8]">
                  {props.report.taskVelocity.openGoalsCount}
                  {props.report.taskVelocity.avgGoalAgeDays !== null
                    ? ` (avg ${props.report.taskVelocity.avgGoalAgeDays}d)`
                    : ''}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* 7-Day Workload Forecast + Repeatable Tasks */}
        <div class="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
          <section
            class={`${
              props.report.repeatableTasks.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'
            } flex flex-col justify-between space-y-4 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-6`}
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                  7-Day Workload Forecast
                </h3>
                <p class="font-mono text-xs text-[#8E95A5] tabular-nums">
                  <Show
                    when={hoveredForecastDay()}
                    fallback={
                      <span>
                        Upcoming scheduled habits &amp; tasks
                        {props.report.overdueBacklogCount > 0
                          ? ` · ${props.report.overdueBacklogCount} overdue carry-in`
                          : ''}
                      </span>
                    }
                  >
                    {(d) => (
                      <span class="text-[#F5F7FA]">
                        {d().weekdayLabel} {d().label} · {d().fixedHabitsCount} fixed ·{' '}
                        {d().flexHabitsPendingCount} flex pending · {d().tasksDueCount} tasks due
                      </span>
                    )}
                  </Show>
                </p>
              </div>

              <div class="flex items-center gap-3 text-[11px] text-[#8E95A5]">
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2.5 w-2.5 rounded-[2px] bg-[#3B82F6]" />
                  <span>Fixed</span>
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2.5 w-2.5 rounded-[2px] bg-[#60A5FA]" />
                  <span>Flex</span>
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2.5 w-2.5 rounded-[2px] bg-[#F59E0B]" />
                  <span>Tasks</span>
                </span>
              </div>
            </div>

            <div class="grid h-36 grid-cols-7 items-end gap-1 pt-3 sm:gap-2">
              <For each={props.report.workloadForecast}>
                {(d) => {
                  const totalH = () =>
                    d.totalLoad === 0
                      ? 0
                      : Math.max(12, Math.round((d.totalLoad / maxForecastLoad()) * 100));
                  const fixedShare = () =>
                    d.totalLoad === 0 ? 0 : (d.fixedHabitsCount / d.totalLoad) * 100;
                  const flexShare = () =>
                    d.totalLoad === 0 ? 0 : (d.flexHabitsPendingCount / d.totalLoad) * 100;
                  const tasksShare = () =>
                    d.totalLoad === 0 ? 0 : (d.tasksDueCount / d.totalLoad) * 100;
                  return (
                    <div
                      class="flex h-full cursor-pointer flex-col items-center justify-end gap-1.5"
                      onMouseEnter={() => setHoveredForecastDay(d)}
                      onMouseLeave={() => setHoveredForecastDay(null)}
                    >
                      <span class="h-4 shrink-0 font-mono text-[11px] leading-4 text-[#8E95A5] tabular-nums">
                        {d.totalLoad > 0 ? d.totalLoad : ''}
                      </span>
                      <div class="flex w-full flex-1 items-end">
                        <Show
                          when={d.totalLoad > 0}
                          fallback={<div class="h-[3px] w-full rounded-t-md bg-white/[0.06]" />}
                        >
                          <div
                            class="flex w-full flex-col justify-end overflow-hidden rounded-t-md"
                            style={{ height: `${totalH()}%` }}
                          >
                            <Show when={d.tasksDueCount > 0}>
                              <div
                                class="w-full bg-[#F59E0B]"
                                style={{ height: `${tasksShare()}%` }}
                              />
                            </Show>
                            <Show when={d.flexHabitsPendingCount > 0}>
                              <div
                                class="w-full bg-[#60A5FA]"
                                style={{ height: `${flexShare()}%` }}
                              />
                            </Show>
                            <Show when={d.fixedHabitsCount > 0}>
                              <div
                                class="w-full bg-[#3B82F6]"
                                style={{ height: `${fixedShare()}%` }}
                              />
                            </Show>
                          </div>
                        </Show>
                      </div>
                      <span class="h-4 shrink-0 font-mono text-[11px] leading-4 text-[#8E95A5] tabular-nums">
                        {d.weekdayLabel}
                      </span>
                    </div>
                  );
                }}
              </For>
            </div>
          </section>

          <Show when={props.report.repeatableTasks.length > 0}>
            <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#14161B] lg:col-span-5">
              <div class="border-b border-white/[0.06] px-4 py-4 sm:px-6">
                <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                  Repeatable Tasks
                </h3>
                <p class="text-xs text-[#8E95A5]">Completion cadence grouped by task title</p>
              </div>
              <ul class="max-h-64 divide-y divide-white/[0.06] overflow-y-auto">
                <For each={props.report.repeatableTasks}>
                  {(rt) => (
                    <li class="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                      <div class="min-w-0">
                        <p class="truncate text-xs font-medium text-[#F5F7FA]" title={rt.title}>
                          {rt.title}
                        </p>
                        <p class="font-mono text-[11px] text-[#8E95A5] tabular-nums">
                          {rt.doneCount} done · {rt.notDoneCount} not done
                          {rt.openCount > 0 ? ` · ${rt.openCount} open` : ''}
                        </p>
                      </div>
                      <div class="shrink-0 text-right font-mono text-[11px] text-[#8E95A5] tabular-nums">
                        <span class="block text-[#C8CDD8]">
                          {rt.avgGapDays !== null ? `every ${rt.avgGapDays}d` : '—'}
                        </span>
                        <Show when={rt.lastDoneDay !== null}>
                          <span>{CivilCalendar.formatShortDate(rt.lastDoneDay!)}</span>
                        </Show>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>
        </div>
      </div>

      {/* SECTION 3: Cross-Domain Load & Multi-Mode Heatmap */}
      <div class="space-y-5">
        <h2 class="font-display text-lg font-semibold text-[#F5F7FA]">
          Cross-Domain Load &amp; Multi-Mode Heatmap
        </h2>

        <div class="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
          <For each={props.report.crossDomainLoad}>
            {(bucket) => (
              <div class="space-y-1.5 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-5">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-medium text-[#C8CDD8]">{bucket.label}</span>
                  <span class="font-mono text-[11px] text-[#6B7280] tabular-nums">
                    {bucket.taskCountLabel}
                  </span>
                </div>
                <p class="font-display font-mono text-xl font-semibold text-[#F5F7FA] tabular-nums sm:text-2xl">
                  {bucket.habitRate !== null ? `${Math.round(bucket.habitRate * 100)}%` : '—'}
                </p>
                <span class="block font-mono text-[11px] text-[#8E95A5] tabular-nums">
                  {bucket.daysCount} {bucket.daysCount === 1 ? 'day' : 'days'} ·{' '}
                  {bucket.perfectDaysCount} perfect habits
                </span>
              </div>
            )}
          </For>
        </div>

        <section class="space-y-5 rounded-2xl border border-white/[0.08] bg-[#14161B] p-4 sm:p-6">
          <div class="flex flex-wrap items-start justify-between gap-3 sm:items-center">
            <div>
              <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                Multi-Mode Activity Heatmap
              </h3>
              <p class="font-mono text-xs text-[#8E95A5] tabular-nums">
                {props.report.multiHeatmap.totalHabitDone} habit check-ins ·{' '}
                {props.report.multiHeatmap.totalTaskDone} tasks done
                {props.report.multiHeatmap.isCapped ? ' · last 2 years shown' : ''}
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <div class="inline-flex items-center rounded-xl border border-white/[0.08] bg-[#0A0B0E] p-0.5">
                <For
                  each={
                    [
                      { id: 'combined', label: 'Combined' },
                      { id: 'habits', label: 'Habits' },
                      { id: 'tasks', label: 'Tasks' },
                    ] as const
                  }
                >
                  {(opt) => (
                    <button
                      type="button"
                      onClick={() => props.onChangeHeatmapMode(opt.id)}
                      class={`shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                        props.heatmapMode === opt.id
                          ? 'bg-[#1C1F26] text-[#F5F7FA]'
                          : 'text-[#8E95A5] hover:text-[#F5F7FA]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )}
                </For>
              </div>

              <button
                type="button"
                onClick={() => props.onInspectDayInCalendar(props.selectedDay)}
                class="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0A0B0E] px-3 text-xs font-medium whitespace-nowrap text-[#C8CDD8] transition-colors hover:bg-[#1C1F26] hover:text-[#F5F7FA]"
              >
                <CalendarIcon class="h-3.5 w-3.5 text-[#60A5FA]" />
                <span>Inspect {CivilCalendar.formatShortDate(props.selectedDay)}</span>
              </button>
            </div>
          </div>

          <div class="overflow-x-auto pb-1">
            <div class="inline-flex items-start gap-2.5 py-1 pr-2 pl-0.5">
              <div class="flex shrink-0 flex-col gap-[4px] pt-[20px] text-[11px] leading-[18px] text-[#6B7280] select-none">
                <span class="flex h-[18px] items-center">Mon</span>
                <span class="h-[18px]" aria-hidden="true" />
                <span class="flex h-[18px] items-center">Wed</span>
                <span class="h-[18px]" aria-hidden="true" />
                <span class="flex h-[18px] items-center">Fri</span>
                <span class="h-[18px]" aria-hidden="true" />
                <span class="h-[18px]" aria-hidden="true" />
              </div>

              <div class="flex flex-col gap-1.5">
                <div class="flex h-[14px] gap-[4px] text-[11px] leading-[14px] text-[#8E95A5] select-none">
                  <For each={props.report.multiHeatmap.weeks}>
                    {(week) => (
                      <div class="w-[18px] shrink-0 overflow-visible whitespace-nowrap">
                        {week.monthLabel}
                      </div>
                    )}
                  </For>
                </div>

                <div class="flex gap-[4px]">
                  <For each={props.report.multiHeatmap.weeks}>
                    {(week) => (
                      <div class="flex shrink-0 flex-col gap-[4px]">
                        <For each={week.days}>
                          {(cell) => {
                            const tone = () =>
                              props.heatmapMode === 'habits'
                                ? cell.habitTone
                                : props.heatmapMode === 'tasks'
                                  ? cell.taskTone
                                  : cell.combinedTone;
                            return (
                              <Show
                                when={cell.inRange}
                                fallback={
                                  <div class="h-[18px] w-[18px] rounded-[4px] bg-transparent" />
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => props.onSelectDay(cell.dayIndex)}
                                  onMouseEnter={() => setHoveredHeatDay(cell)}
                                  onMouseLeave={() => setHoveredHeatDay(null)}
                                  title={`${CivilCalendar.formatShortDate(cell.dayIndex)}: ${cell.habitsDone}/${cell.habitsScheduled} habits · ${cell.tasksDone} tasks done`}
                                  class={`h-[18px] w-[18px] cursor-pointer rounded-[4px] transition-transform duration-100 hover:scale-115 ${heatmapSquareClass(
                                    tone()
                                  )} ${
                                    cell.dayIndex === props.selectedDay
                                      ? 'ring-2 ring-white ring-offset-1 ring-offset-[#14161B]'
                                      : ''
                                  }`}
                                />
                              </Show>
                            );
                          }}
                        </For>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-xs text-[#8E95A5]">
            <Show
              when={hoveredHeatDay()}
              fallback={
                <span class="font-mono tabular-nums">
                  Selected: {CivilCalendar.formatShortDate(props.selectedDay)}
                </span>
              }
            >
              {(d) => (
                <span class="font-mono text-[#F5F7FA] tabular-nums">
                  {CivilCalendar.formatShortDate(d().dayIndex)} · Habits {d().habitsDone}/
                  {d().habitsScheduled} · Tasks {d().tasksDone} done
                  {d().tasksNotDone > 0 ? `, ${d().tasksNotDone} not done` : ''}
                  {d().tasksDueOpen > 0 ? `, ${d().tasksDueOpen} open` : ''}
                </span>
              )}
            </Show>
          </div>
        </section>
      </div>

      {/* SECTION 4: Habit Notes & Reflections */}
      <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#14161B]">
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-4 sm:items-center sm:px-6">
          <div>
            <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
              Habit Notes &amp; Reflections
            </h2>
            <p class="font-mono text-xs text-[#8E95A5] tabular-nums">
              {props.report.notesInsights.totalNotes} notes ·{' '}
              {props.report.notesInsights.notesOnDoneDays} on done days ·{' '}
              {props.report.notesInsights.notesOnMissedDays} on missed days
            </p>
          </div>

          <div class="inline-flex items-center rounded-xl border border-white/[0.08] bg-[#0A0B0E] p-0.5">
            <For
              each={
                [
                  { id: 'all', label: 'All' },
                  { id: 'missed', label: 'Missed days' },
                  { id: 'done', label: 'Done days' },
                ] as const
              }
            >
              {(opt) => (
                <button
                  type="button"
                  onClick={() => props.onChangeNotesFilter(opt.id)}
                  class={`shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    props.notesFilter === opt.id
                      ? 'bg-[#1C1F26] text-[#F5F7FA]'
                      : 'text-[#8E95A5] hover:text-[#F5F7FA]'
                  }`}
                >
                  {opt.label}
                </button>
              )}
            </For>
          </div>
        </div>

        <Show when={props.report.notesInsights.topKeywords.length > 0}>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-white/[0.06] px-4 py-3 text-xs sm:px-6">
            <span class="text-[#6B7280]">Top terms:</span>
            <For each={props.report.notesInsights.topKeywords}>
              {(kw) => (
                <button
                  type="button"
                  onClick={() => setSelectedKeyword((prev) => (prev === kw.word ? null : kw.word))}
                  class={`cursor-pointer font-mono tabular-nums transition-colors ${
                    selectedKeyword() === kw.word
                      ? 'text-[#60A5FA] underline'
                      : 'text-[#C8CDD8] hover:text-[#F5F7FA]'
                  }`}
                >
                  {kw.word} ({kw.count})
                </button>
              )}
            </For>
            <Show when={selectedKeyword()}>
              <button
                type="button"
                onClick={() => setSelectedKeyword(null)}
                class="ml-auto cursor-pointer text-[11px] text-[#8E95A5] underline hover:text-[#F5F7FA]"
              >
                Clear term
              </button>
            </Show>
          </div>
        </Show>

        <Show
          when={filteredNotes().length > 0}
          fallback={
            <div class="px-4 py-10 text-center sm:px-6">
              <p class="text-sm text-[#8E95A5]">
                {props.report.notesInsights.totalNotes === 0
                  ? 'No habit notes recorded in this period.'
                  : 'No notes match the current filter.'}
              </p>
            </div>
          }
        >
          <ul class="max-h-96 divide-y divide-white/[0.06] overflow-y-auto">
            <For each={filteredNotes()}>
              {(entry) => (
                <li>
                  <button
                    type="button"
                    onClick={() => props.onInspectDayInCalendar(entry.dayIndex)}
                    class="flex w-full cursor-pointer items-start justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02] sm:px-6"
                  >
                    <div class="min-w-0 flex-1 space-y-1">
                      <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <HabitBadge appearanceRaw={entry.habitColor} size="xs" />
                        <span class="font-medium text-[#F5F7FA]">{entry.habitName}</span>
                        <span class="text-[#6B7280]">·</span>
                        <span class="font-mono text-[#8E95A5]">
                          {CivilCalendar.formatShortDateWithYear(entry.dayIndex)}
                        </span>
                        <span class="text-[#6B7280]">·</span>
                        <span
                          class={`font-mono ${
                            entry.status === 'done'
                              ? 'text-[#60A5FA]'
                              : entry.status === 'missed'
                                ? 'text-[#FCA5A5]'
                                : 'text-[#8E95A5]'
                          }`}
                        >
                          {entry.status === 'done'
                            ? 'Done'
                            : entry.status === 'missed'
                              ? 'Missed'
                              : 'Rest day'}
                        </span>
                      </div>
                      <p class="text-xs break-words text-[#C8CDD8]">{entry.text}</p>
                    </div>
                    <span class="shrink-0 text-[11px] text-[#60A5FA]">Inspect</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}

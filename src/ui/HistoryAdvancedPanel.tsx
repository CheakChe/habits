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
import { HabitAppearance } from '../utils/habit-appearance';
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
  const [hoveredForecastDay, setHoveredForecastDay] = createSignal<WorkloadForecastDay | null>(null);
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
      ...props.report.backlogFlowBuckets.map((b) =>
        Math.max(b.createdCount, b.closedCount)
      )
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
          <span class="text-xs font-mono tabular-nums text-[#8E95A5]">
            {props.rangeLabel} ·{' '}
            {DateRangeResolver.formatRangeLabel(
              props.effectiveRangeStart,
              props.effectiveRangeEnd
            )}
          </span>
        </div>

        {/* 4 Summary Tiles */}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-5 space-y-1 min-w-0">
            <span class="text-xs text-[#8E95A5]">Bounce-Back Rate</span>
            <p class="text-xl sm:text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
              {props.report.bounceBack.bounceBackRate !== null
                ? `${Math.round(props.report.bounceBack.bounceBackRate * 100)}%`
                : '—'}
            </p>
            <span class="text-[11px] font-mono tabular-nums text-[#8E95A5] block">
              {props.report.bounceBack.totalMissesEvaluated > 0
                ? `${props.report.bounceBack.recoveredMisses} recovered · ${props.report.bounceBack.chainedMisses} chained`
                : 'No prior misses to evaluate'}
            </span>
          </div>

          <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-5 space-y-1 min-w-0">
            <span class="text-xs text-[#8E95A5]">Retroactive Check-ins</span>
            <p class="text-xl sm:text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
              {props.report.loggingDiscipline.retroactiveRate !== null
                ? `${Math.round(props.report.loggingDiscipline.retroactiveRate * 100)}%`
                : '—'}
            </p>
            <span class="text-[11px] font-mono tabular-nums text-[#8E95A5] block">
              {props.report.loggingDiscipline.sameDayCount} same-day ·{' '}
              {props.report.loggingDiscipline.retroactiveCount} logged later
            </span>
          </div>

          <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-5 space-y-1 min-w-0">
            <span class="text-xs text-[#8E95A5]">Peak Logging Time</span>
            <p class="text-xl sm:text-2xl font-display font-semibold text-[#F5F7FA] truncate">
              {peakLoggingWindow() ? peakLoggingWindow()!.label : '—'}
            </p>
            <span class="text-[11px] font-mono tabular-nums text-[#8E95A5] block">
              {peakLoggingWindow()
                ? `${peakLoggingWindow()!.hoursLabel} · ${Math.round(peakLoggingWindow()!.share * 100)}% of check-ins`
                : 'No completed check-ins'}
            </span>
          </div>

          <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-5 space-y-1 min-w-0">
            <span class="text-xs text-[#8E95A5]">Cooling / At-Risk</span>
            <p
              class={`text-xl sm:text-2xl font-display font-semibold font-mono tabular-nums ${
                props.report.atRiskHabits.length > 0 ? 'text-[#F59E0B]' : 'text-[#F5F7FA]'
              }`}
            >
              {props.report.atRiskHabits.length}
            </p>
            <span class="text-[11px] font-mono tabular-nums text-[#8E95A5] block">
              {props.report.atRiskHabits.length > 0
                ? 'Drop ≥15% or 2+ missed'
                : 'All active habits steady'}
            </span>
          </div>
        </div>

        {/* At-Risk Habits + Logging Time-of-Day */}
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <section class="lg:col-span-6 rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-6 space-y-4">
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
                        class="w-full py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-1 text-left hover:bg-white/[0.02] rounded-lg px-2 -mx-2 transition-colors cursor-pointer"
                      >
                        <div class="flex items-center gap-2.5 min-w-0 flex-1">
                          <HabitBadge appearanceRaw={item.habit.color} size="xs" />
                          <span class="text-sm font-medium text-[#F5F7FA] truncate">
                            {item.habit.name}
                          </span>
                        </div>
                        <div class="text-xs font-mono tabular-nums shrink-0 text-right space-x-2">
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

          <section class="lg:col-span-6 rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-6 space-y-4">
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
                  <p class="text-sm text-[#8E95A5]">
                    No completed check-ins in this period.
                  </p>
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
                            {b.label}{' '}
                            <span class="font-mono text-[#6B7280]">({b.hoursLabel})</span>
                          </span>
                          <span class="font-mono tabular-nums text-[#F5F7FA]">
                            {b.count}{' '}
                            <span class="text-[#8E95A5]">({pct()}%)</span>
                          </span>
                        </div>
                        <div class="h-2 rounded-full bg-[#0A0B0E] border border-white/[0.06] overflow-hidden">
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
          <section class="rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
            <div class="px-4 sm:px-6 py-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
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
              <div class="grid grid-cols-7 gap-1 px-4 py-2 border-b border-white/[0.06] text-[10px] font-mono text-[#8E95A5] text-center">
                <For each={[0, 1, 2, 3, 4, 5, 6]}>
                  {(bit) => <span>{CivilCalendar.weekdayShortLabel(bit)}</span>}
                </For>
              </div>
              <ul class="divide-y divide-white/[0.05]">
                <For each={props.report.habitWeekdayMatrix}>
                  {(row) => (
                    <li class="px-4 py-3 space-y-2">
                      <div class="flex items-center justify-between gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => props.onSelectHabitFilter([row.habit.id])}
                          class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden text-left hover:underline cursor-pointer"
                        >
                          <HabitBadge appearanceRaw={row.habit.color} size="xs" />
                          <span class="text-xs font-medium text-[#F5F7FA] truncate min-w-0">
                            {row.habit.name}
                          </span>
                          <Show when={row.isFlexible}>
                            <span class="text-[10px] font-mono text-[#6B7280] shrink-0">
                              flex
                            </span>
                          </Show>
                        </button>
                        <span class="text-xs font-mono tabular-nums font-medium text-[#F5F7FA] shrink-0">
                          {Math.round(row.overallRate * 100)}%
                        </span>
                      </div>
                      <div class="grid grid-cols-7 gap-1">
                        <For each={row.cells}>
                          {(cell) => (
                            <div
                              class={`h-7 rounded-md border flex items-center justify-center text-[10px] font-mono tabular-nums ${matrixCellTone(
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
            <div class="hidden sm:block overflow-x-auto">
              <table class="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr class="border-b border-white/[0.06] text-[11px] font-mono text-[#8E95A5]">
                    <th class="py-3 pl-6 pr-3 font-medium w-auto">Habit</th>
                    <For each={[0, 1, 2, 3, 4, 5, 6]}>
                      {(bit) => (
                        <th class="py-3 px-1 text-center font-medium w-11 md:w-14">
                          {CivilCalendar.weekdayShortLabel(bit)}
                        </th>
                      )}
                    </For>
                    <th class="py-3 pl-2 pr-6 text-right font-medium w-14 md:w-16">Total</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/[0.05]">
                  <For each={props.report.habitWeekdayMatrix}>
                    {(row) => (
                      <tr class="hover:bg-white/[0.02] transition-colors">
                        <td class="py-2.5 pl-6 pr-3 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => props.onSelectHabitFilter([row.habit.id])}
                            class="w-full max-w-full flex items-center gap-2 min-w-0 overflow-hidden text-left hover:underline cursor-pointer"
                            title={row.habit.name}
                          >
                            <HabitBadge appearanceRaw={row.habit.color} size="xs" />
                            <span class="text-xs font-medium text-[#F5F7FA] truncate min-w-0">
                              {row.habit.name}
                            </span>
                            <Show when={row.isFlexible}>
                              <span class="text-[10px] font-mono text-[#6B7280] shrink-0">
                                flex
                              </span>
                            </Show>
                          </button>
                        </td>
                        <For each={row.cells}>
                          {(cell) => (
                            <td class="py-2 px-1 text-center">
                              <div
                                class={`h-8 rounded-lg border flex items-center justify-center text-[11px] font-mono tabular-nums ${matrixCellTone(
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
                        <td class="py-2.5 pl-2 pr-6 text-right text-xs font-mono tabular-nums font-medium text-[#F5F7FA]">
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
          when={
            props.report.flexibleInsight !== null ||
            props.report.measuredIntensity.length > 0
          }
        >
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <Show when={props.report.flexibleInsight}>
              {(flex) => (
                <section
                  class={`${
                    props.report.measuredIntensity.length > 0
                      ? 'lg:col-span-6'
                      : 'lg:col-span-12'
                  } rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-6 space-y-4`}
                >
                  <div class="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                        Flexible Habits Deep Dive
                      </h3>
                      <p class="text-xs text-[#8E95A5]">
                        Weekly target mastery &amp; day-of-week distribution
                      </p>
                    </div>
                    <div class="text-xs font-mono tabular-nums text-[#C8CDD8]">
                      {flex().perfectWeeks}/{flex().totalWeeks} perfect weeks
                      <Show when={flex().bonusCheckins > 0}>
                        <span class="text-[#60A5FA]">
                          {' '}
                          · +{flex().bonusCheckins} bonus
                        </span>
                      </Show>
                    </div>
                  </div>

                  <div class="grid grid-cols-7 gap-1 sm:gap-2 h-28 pt-2 items-end">
                    <For each={flex().weekdayDistribution}>
                      {(d) => {
                        const hPct = () =>
                          d.count === 0
                            ? 0
                            : Math.max(12, Math.round((d.count / maxFlexWeekdayCount()) * 100));
                        return (
                          <div class="h-full flex flex-col items-center justify-end gap-1.5">
                            <span class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                              {d.count > 0 ? d.count : ''}
                            </span>
                            <div class="w-full flex-1 flex items-end">
                              <Show
                                when={d.count > 0}
                                fallback={
                                  <div class="w-full h-[3px] rounded-t-md bg-white/[0.06]" />
                                }
                              >
                                <div
                                  class="w-full rounded-t-md bg-[#3B82F6]"
                                  style={{ height: `${hPct()}%` }}
                                  title={`${d.label}: ${d.count} check-ins (${Math.round(d.share * 100)}%)`}
                                />
                              </Show>
                            </div>
                            <span class="text-[11px] font-mono text-[#8E95A5]">
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
                  props.report.flexibleInsight !== null
                    ? 'lg:col-span-6'
                    : 'lg:col-span-12'
                } rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-6 space-y-4`}
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
                            <div class="flex items-center gap-2 min-w-0">
                              <HabitBadge appearanceRaw={item.habit.color} size="xs" />
                              <span class="font-medium text-[#F5F7FA] truncate">
                                {item.habit.name}
                              </span>
                            </div>
                            <span class="font-mono tabular-nums text-[#8E95A5]">
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
                              <div class="h-2 rounded-full bg-[#0A0B0E] border border-white/[0.06]" />
                            }
                          >
                            <div class="h-2.5 rounded-full bg-[#0A0B0E] border border-white/[0.06] overflow-hidden flex">
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

                          <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono tabular-nums text-[#8E95A5]">
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
          <section class="rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
            <div class="px-4 sm:px-6 py-4 border-b border-white/[0.06]">
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
                  <li class="px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div class="min-w-0 space-y-0.5">
                      <div class="flex items-center gap-2 min-w-0">
                        <HabitBadge appearanceRaw={imp.habit.color} size="xs" />
                        <span class="text-sm font-medium text-[#F5F7FA] truncate min-w-0">
                          {imp.habit.name}
                        </span>
                        <span class="text-[11px] font-mono text-[#6B7280] shrink-0">
                          from {CivilCalendar.formatShortDateWithYear(imp.changeDay)}
                        </span>
                      </div>
                      <p class="text-xs font-mono text-[#8E95A5]">
                        {imp.beforeLabel} → <span class="text-[#C8CDD8]">{imp.afterLabel}</span>
                      </p>
                    </div>
                    <div class="flex items-center gap-3 text-xs font-mono tabular-nums shrink-0">
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
          <span class="text-xs font-mono tabular-nums text-[#8E95A5]">
            Net backlog delta:{' '}
            <span
              class={
                props.report.taskVelocity.netBacklogDelta <= 0
                  ? 'text-[#60A5FA]'
                  : 'text-[#F59E0B]'
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

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Backlog Flow Chart */}
          <section class="lg:col-span-7 rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-6 flex flex-col justify-between space-y-4">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                  Backlog Flow (Created vs Closed)
                </h3>
                <p class="text-xs text-[#8E95A5] font-mono tabular-nums">
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
                  <span class="w-2.5 h-2.5 rounded-[2px] bg-[#8E95A5]" />
                  <span>Created</span>
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-[2px] bg-[#3B82F6]" />
                  <span>Closed</span>
                </span>
              </div>
            </div>

            <div class="flex items-end gap-1 sm:gap-2 h-36 pt-3">
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
                      class="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1.5 cursor-pointer"
                      onMouseEnter={() => setHoveredFlowBucket(b)}
                      onMouseLeave={() => setHoveredFlowBucket(null)}
                    >
                      <div class="w-full flex-1 flex items-end justify-center gap-1 px-0.5">
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
                      <span class="text-[10px] font-mono tabular-nums text-[#6B7280] truncate max-w-full">
                        {b.shortLabel}
                      </span>
                    </div>
                  );
                }}
              </For>
            </div>
          </section>

          {/* Velocity & Open Backlog Aging */}
          <section class="lg:col-span-5 rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-6 flex flex-col justify-between space-y-4">
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
                <span class="text-[#8E95A5] block text-[11px]">Late Delay</span>
                <span class="font-mono tabular-nums text-[#F5F7FA] text-sm font-medium">
                  {props.report.taskVelocity.avgLateDays !== null
                    ? `${props.report.taskVelocity.avgLateDays}d avg`
                    : '—'}
                </span>
                <Show when={props.report.taskVelocity.lateTasksCount > 0}>
                  <span class="block text-[11px] font-mono tabular-nums text-[#8E95A5]">
                    med {props.report.taskVelocity.medianLateDays}d · max{' '}
                    {props.report.taskVelocity.maxLateDays}d
                  </span>
                </Show>
              </div>

              <div>
                <span class="text-[#8E95A5] block text-[11px]">Finished Early</span>
                <span class="font-mono tabular-nums text-[#F5F7FA] text-sm font-medium">
                  {props.report.taskVelocity.earlyTasksCount} tasks
                </span>
                <Show when={props.report.taskVelocity.avgDaysEarly !== null}>
                  <span class="block text-[11px] font-mono tabular-nums text-[#60A5FA]">
                    {props.report.taskVelocity.avgDaysEarly}d early avg
                  </span>
                </Show>
              </div>

              <div>
                <span class="text-[#8E95A5] block text-[11px]">Dated Cycle Time</span>
                <span class="font-mono tabular-nums text-[#F5F7FA] text-sm font-medium">
                  {props.report.taskVelocity.datedCycleTimeAvgDays !== null
                    ? `${props.report.taskVelocity.datedCycleTimeAvgDays}d avg`
                    : '—'}
                </span>
                <span class="block text-[11px] font-mono tabular-nums text-[#8E95A5]">
                  {props.report.taskVelocity.datedCycleCount} closed
                </span>
              </div>

              <div>
                <span class="text-[#8E95A5] block text-[11px]">Goals Cycle Time</span>
                <span class="font-mono tabular-nums text-[#F5F7FA] text-sm font-medium">
                  {props.report.taskVelocity.goalsCycleTimeAvgDays !== null
                    ? `${props.report.taskVelocity.goalsCycleTimeAvgDays}d avg`
                    : '—'}
                </span>
                <span class="block text-[11px] font-mono tabular-nums text-[#8E95A5]">
                  {props.report.taskVelocity.goalsCycleCount} closed
                </span>
              </div>
            </div>

            <div class="pt-3 border-t border-white/[0.06] space-y-1.5 text-[11px] font-mono tabular-nums">
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
                <p class="text-[#6B7280] truncate">
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
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <section
            class={`${
              props.report.repeatableTasks.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'
            } rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-6 flex flex-col justify-between space-y-4`}
          >
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                  7-Day Workload Forecast
                </h3>
                <p class="text-xs text-[#8E95A5] font-mono tabular-nums">
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
                  <span class="w-2.5 h-2.5 rounded-[2px] bg-[#3B82F6]" />
                  <span>Fixed</span>
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-[2px] bg-[#60A5FA]" />
                  <span>Flex</span>
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-[2px] bg-[#F59E0B]" />
                  <span>Tasks</span>
                </span>
              </div>
            </div>

            <div class="grid grid-cols-7 gap-1 sm:gap-2 h-36 pt-3 items-end">
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
                      class="h-full flex flex-col items-center justify-end gap-1.5 cursor-pointer"
                      onMouseEnter={() => setHoveredForecastDay(d)}
                      onMouseLeave={() => setHoveredForecastDay(null)}
                    >
                      <span class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                        {d.totalLoad > 0 ? d.totalLoad : ''}
                      </span>
                      <div class="w-full flex-1 flex items-end">
                        <Show
                          when={d.totalLoad > 0}
                          fallback={
                            <div class="w-full h-[3px] rounded-t-md bg-white/[0.06]" />
                          }
                        >
                          <div
                            class="w-full rounded-t-md overflow-hidden flex flex-col justify-end"
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
                      <span class="text-[10px] font-mono tabular-nums text-[#8E95A5]">
                        {d.weekdayLabel}
                      </span>
                    </div>
                  );
                }}
              </For>
            </div>
          </section>

          <Show when={props.report.repeatableTasks.length > 0}>
            <section class="lg:col-span-5 rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
              <div class="px-4 sm:px-6 py-4 border-b border-white/[0.06]">
                <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                  Repeatable Tasks
                </h3>
                <p class="text-xs text-[#8E95A5]">
                  Completion cadence grouped by task title
                </p>
              </div>
              <ul class="divide-y divide-white/[0.06] max-h-64 overflow-y-auto">
                <For each={props.report.repeatableTasks}>
                  {(rt) => (
                    <li class="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-xs font-medium text-[#F5F7FA] truncate" title={rt.title}>
                          {rt.title}
                        </p>
                        <p class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                          {rt.doneCount} done · {rt.notDoneCount} not done
                          {rt.openCount > 0 ? ` · ${rt.openCount} open` : ''}
                        </p>
                      </div>
                      <div class="text-right text-[11px] font-mono tabular-nums text-[#8E95A5] shrink-0">
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

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          <For each={props.report.crossDomainLoad}>
            {(bucket) => (
              <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-5 space-y-1.5">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-medium text-[#C8CDD8]">{bucket.label}</span>
                  <span class="text-[11px] font-mono tabular-nums text-[#6B7280]">
                    {bucket.taskCountLabel}
                  </span>
                </div>
                <p class="text-xl sm:text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
                  {bucket.habitRate !== null
                    ? `${Math.round(bucket.habitRate * 100)}%`
                    : '—'}
                </p>
                <span class="text-[11px] font-mono tabular-nums text-[#8E95A5] block">
                  {bucket.daysCount} {bucket.daysCount === 1 ? 'day' : 'days'} ·{' '}
                  {bucket.perfectDaysCount} perfect habits
                </span>
              </div>
            )}
          </For>
        </div>

        <section class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-4 sm:p-6 space-y-5">
          <div class="flex flex-wrap items-start sm:items-center justify-between gap-3">
            <div>
              <h3 class="font-display text-base font-semibold text-[#F5F7FA]">
                Multi-Mode Activity Heatmap
              </h3>
              <p class="text-xs text-[#8E95A5] font-mono tabular-nums">
                {props.report.multiHeatmap.totalHabitDone} habit check-ins ·{' '}
                {props.report.multiHeatmap.totalTaskDone} tasks done
                {props.report.multiHeatmap.isCapped ? ' · last 2 years shown' : ''}
              </p>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <div class="inline-flex items-center p-0.5 rounded-xl bg-[#0A0B0E] border border-white/[0.08]">
                <For
                  each={[
                    { id: 'combined', label: 'Combined' },
                    { id: 'habits', label: 'Habits' },
                    { id: 'tasks', label: 'Tasks' },
                  ] as const}
                >
                  {(opt) => (
                    <button
                      type="button"
                      onClick={() => props.onChangeHeatmapMode(opt.id)}
                      class={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                class="h-9 px-3 rounded-xl bg-[#0A0B0E] hover:bg-[#1C1F26] border border-white/[0.08] text-xs font-medium text-[#C8CDD8] hover:text-[#F5F7FA] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CalendarIcon class="w-3.5 h-3.5 text-[#60A5FA]" />
                <span>Inspect {CivilCalendar.formatShortDate(props.selectedDay)}</span>
              </button>
            </div>
          </div>

          <div class="overflow-x-auto pb-1">
            <div class="inline-flex gap-2.5 items-start py-1 pl-0.5 pr-2">
              <div class="flex flex-col gap-[4px] pt-[20px] text-[11px] leading-[18px] text-[#6B7280] select-none shrink-0">
                <span class="h-[18px] flex items-center">Mon</span>
                <span class="h-[18px]" aria-hidden="true" />
                <span class="h-[18px] flex items-center">Wed</span>
                <span class="h-[18px]" aria-hidden="true" />
                <span class="h-[18px] flex items-center">Fri</span>
                <span class="h-[18px]" aria-hidden="true" />
                <span class="h-[18px]" aria-hidden="true" />
              </div>

              <div class="flex flex-col gap-1.5">
                <div class="flex gap-[4px] h-[14px] text-[10px] leading-[14px] text-[#8E95A5] select-none">
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
                      <div class="flex flex-col gap-[4px] shrink-0">
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
                                  <div class="w-[18px] h-[18px] rounded-[4px] bg-transparent" />
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => props.onSelectDay(cell.dayIndex)}
                                  onMouseEnter={() => setHoveredHeatDay(cell)}
                                  onMouseLeave={() => setHoveredHeatDay(null)}
                                  title={`${CivilCalendar.formatShortDate(cell.dayIndex)}: ${cell.habitsDone}/${cell.habitsScheduled} habits · ${cell.tasksDone} tasks done`}
                                  class={`w-[18px] h-[18px] rounded-[4px] transition-transform duration-100 hover:scale-115 cursor-pointer ${heatmapSquareClass(
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

          <div class="flex items-center justify-between flex-wrap gap-2 text-[11px] text-[#8E95A5] pt-1 border-t border-white/[0.06]">
            <Show
              when={hoveredHeatDay()}
              fallback={
                <span class="font-mono tabular-nums">
                  Selected: {CivilCalendar.formatShortDate(props.selectedDay)}
                </span>
              }
            >
              {(d) => (
                <span class="font-mono tabular-nums text-[#F5F7FA]">
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
      <section class="rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
        <div class="px-4 sm:px-6 py-4 border-b border-white/[0.06] flex flex-wrap items-start sm:items-center justify-between gap-3">
          <div>
            <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
              Habit Notes &amp; Reflections
            </h2>
            <p class="text-xs font-mono tabular-nums text-[#8E95A5]">
              {props.report.notesInsights.totalNotes} notes ·{' '}
              {props.report.notesInsights.notesOnDoneDays} on done days ·{' '}
              {props.report.notesInsights.notesOnMissedDays} on missed days
            </p>
          </div>

          <div class="inline-flex items-center p-0.5 rounded-xl bg-[#0A0B0E] border border-white/[0.08]">
            <For
              each={[
                { id: 'all', label: 'All' },
                { id: 'missed', label: 'Missed days' },
                { id: 'done', label: 'Done days' },
              ] as const}
            >
              {(opt) => (
                <button
                  type="button"
                  onClick={() => props.onChangeNotesFilter(opt.id)}
                  class={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
          <div class="px-4 sm:px-6 py-3 border-b border-white/[0.06] flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span class="text-[#6B7280]">Top terms:</span>
            <For each={props.report.notesInsights.topKeywords}>
              {(kw) => (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedKeyword((prev) => (prev === kw.word ? null : kw.word))
                  }
                  class={`font-mono tabular-nums transition-colors cursor-pointer ${
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
                class="text-[11px] text-[#8E95A5] hover:text-[#F5F7FA] underline cursor-pointer ml-auto"
              >
                Clear term
              </button>
            </Show>
          </div>
        </Show>

        <Show
          when={filteredNotes().length > 0}
          fallback={
            <div class="px-4 sm:px-6 py-10 text-center">
              <p class="text-sm text-[#8E95A5]">
                {props.report.notesInsights.totalNotes === 0
                  ? 'No habit notes recorded in this period.'
                  : 'No notes match the current filter.'}
              </p>
            </div>
          }
        >
          <ul class="divide-y divide-white/[0.06] max-h-96 overflow-y-auto">
            <For each={filteredNotes()}>
              {(entry) => (
                <li>
                  <button
                    type="button"
                    onClick={() => props.onInspectDayInCalendar(entry.dayIndex)}
                    class="w-full text-left px-4 sm:px-6 py-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer flex items-start justify-between gap-4"
                  >
                    <div class="min-w-0 space-y-1 flex-1">
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
                      <p class="text-xs text-[#C8CDD8] break-words">{entry.text}</p>
                    </div>
                    <span class="text-[11px] text-[#60A5FA] shrink-0">Inspect</span>
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

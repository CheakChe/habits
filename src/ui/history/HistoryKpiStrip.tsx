import { JSX, Show } from 'solid-js';
import { PerfectDaysSummary } from '../../utils/charts-analytics';
import { TaskRangeSummary } from '../../utils/task-analytics';
import { AnalyticsSummaryView, PeriodComparisonView } from './types';

interface HistoryKpiStripProps {
  targetHabitsCount: number;
  analyticsSummary: AnalyticsSummaryView;
  perfectDays: PerfectDaysSummary;
  prevComparison: PeriodComparisonView | null;
  taskSummary: TaskRangeSummary;
}

export function HistoryKpiStrip(props: HistoryKpiStripProps): JSX.Element {
  return (
    <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-5">
        <span class="text-xs text-ink-subtle">
          {props.targetHabitsCount === 1 ? 'Current Streak' : 'Best Current Streak'}
        </span>
        <p class="font-display font-mono text-xl font-semibold text-ink tabular-nums sm:text-2xl">
          {props.analyticsSummary.currentStreak}
          {props.analyticsSummary.currentStreakUnit === 'weeks' ? 'w' : 'd'}
        </p>
        <Show when={props.perfectDays.longestPerfectStreak > 0}>
          <span class="block font-mono text-[11px] text-ink-subtle tabular-nums">
            {props.perfectDays.currentPerfectStreak}d perfect streak
          </span>
        </Show>
      </div>

      <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-5">
        <span class="text-xs text-ink-subtle">Longest Streak</span>
        <p class="font-display font-mono text-xl font-semibold text-ink tabular-nums sm:text-2xl">
          {props.analyticsSummary.longestStreak}
          {props.analyticsSummary.longestStreakUnit === 'weeks' ? 'w' : 'd'}
        </p>
        <Show when={props.perfectDays.scheduledDaysWithHabits > 0}>
          <span class="block font-mono text-[11px] text-ink-subtle tabular-nums">
            {props.perfectDays.perfectDays}/{props.perfectDays.scheduledDaysWithHabits} perfect days
            ({Math.round((props.perfectDays.perfectRate ?? 0) * 100)}%)
          </span>
        </Show>
      </div>

      <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-5">
        <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <span class="text-xs text-ink-subtle">Habit Completion</span>
          <Show when={props.prevComparison && props.prevComparison.habitRateDeltaPct !== null}>
            {(() => {
              const delta = props.prevComparison!.habitRateDeltaPct!;
              return (
                <span
                  title={`Compared to ${props.prevComparison!.prevLabel}`}
                  class={`font-mono text-[11px] tabular-nums ${
                    delta > 0
                      ? 'text-accent-soft'
                      : delta < 0
                        ? 'text-danger-soft'
                        : 'text-ink-subtle'
                  }`}
                >
                  {delta > 0 ? `+${delta}%` : `${delta}%`} vs prev
                </span>
              );
            })()}
          </Show>
        </div>
        <p class="font-display font-mono text-xl font-semibold text-ink tabular-nums sm:text-2xl">
          {Math.round(props.analyticsSummary.completionRate * 100)}%
        </p>
        <span class="block font-mono text-[11px] text-ink-subtle tabular-nums">
          {props.analyticsSummary.completedScheduledDays} done ·{' '}
          {props.analyticsSummary.missedScheduledDays} missed
        </span>
      </div>

      <div class="min-w-0 space-y-1 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-5">
        <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <span class="text-xs text-ink-subtle">Tasks Done</span>
          <Show when={props.prevComparison && props.prevComparison.taskDoneDelta !== null}>
            {(() => {
              const delta = props.prevComparison!.taskDoneDelta!;
              return (
                <span
                  title={`Compared to ${props.prevComparison!.prevLabel}`}
                  class={`font-mono text-[11px] tabular-nums ${
                    delta > 0
                      ? 'text-accent-soft'
                      : delta < 0
                        ? 'text-danger-soft'
                        : 'text-ink-subtle'
                  }`}
                >
                  {delta > 0 ? `+${delta}` : `${delta}`} vs prev
                </span>
              );
            })()}
          </Show>
        </div>
        <p class="font-display font-mono text-xl font-semibold text-ink tabular-nums sm:text-2xl">
          {props.taskSummary.doneCount}
          <Show when={props.taskSummary.completionRate !== null}>
            <span class="text-sm font-normal text-ink-subtle">
              {' '}
              · {Math.round(props.taskSummary.completionRate! * 100)}%
            </span>
          </Show>
        </p>
        <span class="block truncate font-mono text-[11px] text-ink-subtle tabular-nums">
          {props.taskSummary.doneCount} done · {props.taskSummary.notDoneCount} not done
          <Show when={props.taskSummary.archivedCount > 0}>
            {' '}
            · {props.taskSummary.archivedCount} arch
          </Show>
        </span>
      </div>
    </div>
  );
}

import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import {
  AdvancedAnalyticsReport,
  BacklogFlowBucket,
  WorkloadForecastDay,
} from '../../../utils/advanced-analytics';
import { CivilCalendar } from '../../../utils/civil-calendar';

interface TaskVelocityForecastSectionProps {
  report: AdvancedAnalyticsReport;
  rangeLabel: string;
}

export function TaskVelocityForecastSection(props: TaskVelocityForecastSectionProps): JSX.Element {
  const [hoveredFlowBucket, setHoveredFlowBucket] = createSignal<BacklogFlowBucket | null>(null);
  const [hoveredForecastDay, setHoveredForecastDay] = createSignal<WorkloadForecastDay | null>(
    null
  );

  const maxFlowValue = createMemo(() =>
    Math.max(
      1,
      ...props.report.backlogFlowBuckets.map((b) => Math.max(b.createdCount, b.closedCount))
    )
  );

  const maxForecastLoad = createMemo(() =>
    Math.max(1, ...props.report.workloadForecast.map((d) => d.totalLoad))
  );

  return (
    <div class="space-y-5">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="font-display text-lg font-semibold text-ink">
          Task Velocity, Backlog Flow &amp; Forecast
        </h2>
        <span class="font-mono text-xs text-ink-subtle tabular-nums">
          Net backlog delta:{' '}
          <span
            class={
              props.report.taskVelocity.netBacklogDelta <= 0 ? 'text-accent-soft' : 'text-warning'
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
        <section class="flex flex-col justify-between space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6 lg:col-span-7">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="font-display text-base font-semibold text-ink">
                Backlog Flow (Created vs Closed)
              </h3>
              <p class="font-mono text-xs text-ink-subtle tabular-nums">
                <Show
                  when={hoveredFlowBucket()}
                  fallback={<span>Intake vs closure balance across {props.rangeLabel}</span>}
                >
                  {(b) => (
                    <span class="text-ink">
                      {b().label} · +{b().createdCount} created · -{b().closedCount} closed (net{' '}
                      {b().netFlow > 0 ? `+${b().netFlow}` : b().netFlow})
                    </span>
                  )}
                </Show>
              </p>
            </div>
            <div class="flex items-center gap-3 text-[11px] text-ink-subtle">
              <span class="inline-flex items-center gap-1.5">
                <span class="h-2.5 w-2.5 rounded-[2px] bg-ink-subtle" />
                <span>Created</span>
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span class="h-2.5 w-2.5 rounded-[2px] bg-accent" />
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
                          b.createdCount > 0 ? 'bg-ink-subtle/70' : 'bg-white/[0.06]'
                        }`}
                        style={{ height: `${createdH()}%` }}
                      />
                      <div
                        class={`flex-1 rounded-t-sm transition-opacity ${
                          b.closedCount > 0 ? 'bg-accent' : 'bg-white/[0.06]'
                        }`}
                        style={{ height: `${closedH()}%` }}
                      />
                    </div>
                    <span class="h-4 max-w-full shrink-0 truncate font-mono text-[11px] leading-4 text-ink-subtle tabular-nums">
                      {b.shortLabel}
                    </span>
                  </div>
                );
              }}
            </For>
          </div>
        </section>

        {/* Velocity & Open Backlog Aging */}
        <section class="flex flex-col justify-between space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6 lg:col-span-5">
          <div>
            <h3 class="font-display text-base font-semibold text-ink">
              Latency &amp; Backlog Aging
            </h3>
            <p class="text-xs text-ink-subtle">
              Turnaround speed &amp; currently aging open backlog
            </p>
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div>
              <span class="block text-[11px] text-ink-subtle">Late Delay</span>
              <span class="font-mono text-sm font-medium text-ink tabular-nums">
                {props.report.taskVelocity.avgLateDays !== null
                  ? `${props.report.taskVelocity.avgLateDays}d avg`
                  : '—'}
              </span>
              <Show when={props.report.taskVelocity.lateTasksCount > 0}>
                <span class="block font-mono text-[11px] text-ink-subtle tabular-nums">
                  med {props.report.taskVelocity.medianLateDays}d · max{' '}
                  {props.report.taskVelocity.maxLateDays}d
                </span>
              </Show>
            </div>

            <div>
              <span class="block text-[11px] text-ink-subtle">Finished Early</span>
              <span class="font-mono text-sm font-medium text-ink tabular-nums">
                {props.report.taskVelocity.earlyTasksCount} tasks
              </span>
              <Show when={props.report.taskVelocity.avgDaysEarly !== null}>
                <span class="block font-mono text-[11px] text-accent-soft tabular-nums">
                  {props.report.taskVelocity.avgDaysEarly}d early avg
                </span>
              </Show>
            </div>

            <div>
              <span class="block text-[11px] text-ink-subtle">Dated Cycle Time</span>
              <span class="font-mono text-sm font-medium text-ink tabular-nums">
                {props.report.taskVelocity.datedCycleTimeAvgDays !== null
                  ? `${props.report.taskVelocity.datedCycleTimeAvgDays}d avg`
                  : '—'}
              </span>
              <span class="block font-mono text-[11px] text-ink-subtle tabular-nums">
                {props.report.taskVelocity.datedCycleCount} closed
              </span>
            </div>

            <div>
              <span class="block text-[11px] text-ink-subtle">Goals Cycle Time</span>
              <span class="font-mono text-sm font-medium text-ink tabular-nums">
                {props.report.taskVelocity.goalsCycleTimeAvgDays !== null
                  ? `${props.report.taskVelocity.goalsCycleTimeAvgDays}d avg`
                  : '—'}
              </span>
              <span class="block font-mono text-[11px] text-ink-subtle tabular-nums">
                {props.report.taskVelocity.goalsCycleCount} closed
              </span>
            </div>
          </div>

          <div class="space-y-1.5 border-t border-white/[0.06] pt-3 font-mono text-[11px] tabular-nums">
            <div class="flex items-center justify-between gap-2">
              <span class="text-ink-subtle">Open Overdue:</span>
              <span
                class={
                  props.report.taskVelocity.openOverdueCount > 0
                    ? 'text-danger-soft'
                    : 'text-ink-secondary'
                }
              >
                {props.report.taskVelocity.openOverdueCount}
                {props.report.taskVelocity.avgOverdueAgeDays !== null
                  ? ` (avg ${props.report.taskVelocity.avgOverdueAgeDays}d · max ${props.report.taskVelocity.maxOverdueAgeDays}d)`
                  : ''}
              </span>
            </div>
            <Show when={props.report.taskVelocity.oldestOverdueTitle}>
              <p class="truncate text-ink-dim">
                Oldest overdue: {props.report.taskVelocity.oldestOverdueTitle}
              </p>
            </Show>
            <div class="flex items-center justify-between gap-2">
              <span class="text-ink-subtle">Open Goals:</span>
              <span class="text-ink-secondary">
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
          } flex flex-col justify-between space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6`}
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="font-display text-base font-semibold text-ink">7-Day Workload Forecast</h3>
              <p class="font-mono text-xs text-ink-subtle tabular-nums">
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
                    <span class="text-ink">
                      {d().weekdayLabel} {d().label} · {d().fixedHabitsCount} fixed ·{' '}
                      {d().flexHabitsPendingCount} flex pending · {d().tasksDueCount} tasks due
                    </span>
                  )}
                </Show>
              </p>
            </div>

            <div class="flex items-center gap-3 text-[11px] text-ink-subtle">
              <span class="inline-flex items-center gap-1.5">
                <span class="h-2.5 w-2.5 rounded-[2px] bg-accent" />
                <span>Fixed</span>
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span class="h-2.5 w-2.5 rounded-[2px] bg-accent-soft" />
                <span>Flex</span>
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span class="h-2.5 w-2.5 rounded-[2px] bg-warning" />
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
                    <span class="h-4 shrink-0 font-mono text-[11px] leading-4 text-ink-subtle tabular-nums">
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
                            <div class="w-full bg-warning" style={{ height: `${tasksShare()}%` }} />
                          </Show>
                          <Show when={d.flexHabitsPendingCount > 0}>
                            <div
                              class="w-full bg-accent-soft"
                              style={{ height: `${flexShare()}%` }}
                            />
                          </Show>
                          <Show when={d.fixedHabitsCount > 0}>
                            <div class="w-full bg-accent" style={{ height: `${fixedShare()}%` }} />
                          </Show>
                        </div>
                      </Show>
                    </div>
                    <span class="h-4 shrink-0 font-mono text-[11px] leading-4 text-ink-subtle tabular-nums">
                      {d.weekdayLabel}
                    </span>
                  </div>
                );
              }}
            </For>
          </div>
        </section>

        <Show when={props.report.repeatableTasks.length > 0}>
          <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface lg:col-span-5">
            <div class="border-b border-white/[0.06] px-4 py-4 sm:px-6">
              <h3 class="font-display text-base font-semibold text-ink">Repeatable Tasks</h3>
              <p class="text-xs text-ink-subtle">Completion cadence grouped by task title</p>
            </div>
            <ul class="max-h-64 divide-y divide-white/[0.06] overflow-y-auto">
              <For each={props.report.repeatableTasks}>
                {(rt) => (
                  <li class="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    <div class="min-w-0">
                      <p class="truncate text-xs font-medium text-ink" title={rt.title}>
                        {rt.title}
                      </p>
                      <p class="font-mono text-[11px] text-ink-subtle tabular-nums">
                        {rt.doneCount} done · {rt.notDoneCount} not done
                        {rt.openCount > 0 ? ` · ${rt.openCount} open` : ''}
                      </p>
                    </div>
                    <div class="shrink-0 text-right font-mono text-[11px] text-ink-subtle tabular-nums">
                      <span class="block text-ink-secondary">
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
  );
}

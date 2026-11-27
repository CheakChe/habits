import { For, JSX, Show, createSignal } from 'solid-js';
import { AdvancedAnalyticsReport, AdvancedHeatmapMode } from '../../../utils/advanced-analytics';
import { CivilCalendar } from '../../../utils/civil-calendar';
import { CalendarIcon } from '../../Icons';
import { heatmapSquareClass } from '../heatmap-styles';

interface CrossDomainHeatmapSectionProps {
  report: AdvancedAnalyticsReport;
  selectedDay: number;
  heatmapMode: AdvancedHeatmapMode;
  onChangeHeatmapMode: (mode: AdvancedHeatmapMode) => void;
  onSelectDay: (dayIndex: number) => void;
  onInspectDayInCalendar: (dayIndex: number) => void;
}

export function CrossDomainHeatmapSection(props: CrossDomainHeatmapSectionProps): JSX.Element {
  const [hoveredHeatDay, setHoveredHeatDay] = createSignal<{
    dayIndex: number;
    habitsDone: number;
    habitsScheduled: number;
    tasksDone: number;
    tasksNotDone: number;
    tasksDueOpen: number;
  } | null>(null);

  return (
    <div class="space-y-5">
      <h2 class="font-display text-lg font-semibold text-ink">
        Cross-Domain Load &amp; Multi-Mode Heatmap
      </h2>

      <div class="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
        <For each={props.report.crossDomainLoad}>
          {(bucket) => (
            <div class="space-y-1.5 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-5">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-ink-secondary">{bucket.label}</span>
                <span class="font-mono text-[11px] text-ink-dim tabular-nums">
                  {bucket.taskCountLabel}
                </span>
              </div>
              <p class="font-display font-mono text-xl font-semibold text-ink tabular-nums sm:text-2xl">
                {bucket.habitRate !== null ? `${Math.round(bucket.habitRate * 100)}%` : '—'}
              </p>
              <span class="block font-mono text-[11px] text-ink-subtle tabular-nums">
                {bucket.daysCount} {bucket.daysCount === 1 ? 'day' : 'days'} ·{' '}
                {bucket.perfectDaysCount} perfect habits
              </span>
            </div>
          )}
        </For>
      </div>

      <section class="space-y-5 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3 sm:items-center">
          <div>
            <h3 class="font-display text-base font-semibold text-ink">
              Multi-Mode Activity Heatmap
            </h3>
            <p class="font-mono text-xs text-ink-subtle tabular-nums">
              {props.report.multiHeatmap.totalHabitDone} habit check-ins ·{' '}
              {props.report.multiHeatmap.totalTaskDone} tasks done
              {props.report.multiHeatmap.isCapped ? ' · last 2 years shown' : ''}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <div class="inline-flex items-center rounded-xl border border-white/[0.08] bg-canvas p-0.5">
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
                        ? 'bg-surface-elevated text-ink'
                        : 'text-ink-subtle hover:text-ink'
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
              class="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-canvas px-3 text-xs font-medium whitespace-nowrap text-ink-secondary transition-colors hover:bg-surface-elevated hover:text-ink"
            >
              <CalendarIcon class="h-3.5 w-3.5 text-accent-soft" />
              <span>Inspect {CivilCalendar.formatShortDate(props.selectedDay)}</span>
            </button>
          </div>
        </div>

        <div class="overflow-x-auto pb-1">
          <div class="inline-flex items-start gap-2.5 py-1 pr-2 pl-0.5">
            <div class="flex shrink-0 flex-col gap-[4px] pt-[20px] text-[11px] leading-[18px] text-ink-dim select-none">
              <span class="flex h-[18px] items-center">Mon</span>
              <span class="h-[18px]" aria-hidden="true" />
              <span class="flex h-[18px] items-center">Wed</span>
              <span class="h-[18px]" aria-hidden="true" />
              <span class="flex h-[18px] items-center">Fri</span>
              <span class="h-[18px]" aria-hidden="true" />
              <span class="h-[18px]" aria-hidden="true" />
            </div>

            <div class="flex flex-col gap-1.5">
              <div class="flex h-[14px] gap-[4px] text-[11px] leading-[14px] text-ink-subtle select-none">
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
                                    ? 'ring-2 ring-white ring-offset-1 ring-offset-surface'
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

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-xs text-ink-subtle">
          <Show
            when={hoveredHeatDay()}
            fallback={
              <span class="font-mono tabular-nums">
                Selected: {CivilCalendar.formatShortDate(props.selectedDay)}
              </span>
            }
          >
            {(d) => (
              <span class="font-mono text-ink tabular-nums">
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
  );
}

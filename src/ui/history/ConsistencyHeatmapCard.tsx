import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { Habit, HabitNote } from '../../types/domain';
import { CivilCalendar } from '../../utils/civil-calendar';
import { DateRangeResolver } from '../../utils/date-range';
import { CalendarIcon } from '../Icons';
import { heatmapSquareClass } from './heatmap-styles';
import { HeatmapDataView, HeatmapDayCell } from './types';

interface ConsistencyHeatmapCardProps {
  targetHabits: Habit[];
  notes: HabitNote[];
  heatmapData: HeatmapDataView;
  selectedDay: number;
  onSelectDay: (dayIndex: number) => void;
  onInspectDayInCalendar: (dayIndex: number) => void;
}

export function ConsistencyHeatmapCard(props: ConsistencyHeatmapCardProps): JSX.Element {
  const [hoveredCell, setHoveredCell] = createSignal<{
    dayIndex: number;
    done: number;
    scheduled: number;
  } | null>(null);

  const dayNotesMap = createMemo(() => {
    const allowed = new Set(props.targetHabits.map((h) => h.id));
    const map = new Map<number, string[]>();
    for (const note of props.notes) {
      if (!allowed.has(note.habitId)) continue;
      const trimmed = note.text.trim();
      if (!trimmed) continue;
      if (
        note.dayIndex < props.heatmapData.clampedStart ||
        note.dayIndex > props.heatmapData.effectiveEnd
      ) {
        continue;
      }
      let list = map.get(note.dayIndex);
      if (!list) {
        list = [];
        map.set(note.dayIndex, list);
      }
      list.push(trimmed);
    }
    return map;
  });

  const heatmapCellMap = createMemo(() => {
    const map = new Map<number, HeatmapDayCell>();
    for (const week of props.heatmapData.weeks) {
      for (const cell of week.days) {
        if (cell.inRange) {
          map.set(cell.dayIndex, cell);
        }
      }
    }
    return map;
  });

  const activeHeatmapCell = createMemo(() => {
    const hovered = hoveredCell();
    if (hovered) {
      return {
        dayIndex: hovered.dayIndex,
        done: hovered.done,
        scheduled: hovered.scheduled,
        isHovered: true,
      };
    }
    const selected = heatmapCellMap().get(props.selectedDay);
    return {
      dayIndex: props.selectedDay,
      done: selected?.done ?? null,
      scheduled: selected?.scheduled ?? null,
      isHovered: false,
    };
  });

  const activeHeatmapDayNotes = createMemo(() => {
    const day = hoveredCell()?.dayIndex ?? props.selectedDay;
    return dayNotesMap().get(day) ?? [];
  });

  return (
    <section class="space-y-5 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3 sm:items-center">
        <div>
          <h2 class="font-display text-base font-semibold text-ink">Consistency Heatmap</h2>
          <p class="text-xs text-ink-subtle">
            <span class="font-mono text-ink-secondary tabular-nums">
              {props.heatmapData.totalDone}
            </span>{' '}
            check-ins ·{' '}
            <span class="font-mono tabular-nums">
              {DateRangeResolver.formatRangeLabel(
                props.heatmapData.clampedStart,
                props.heatmapData.effectiveEnd
              )}
            </span>
            {props.heatmapData.isCapped ? ' (last 2 years shown)' : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={() => props.onInspectDayInCalendar(props.selectedDay)}
          class="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-canvas px-3 text-xs font-medium whitespace-nowrap text-ink-secondary transition-colors hover:bg-surface-elevated hover:text-ink"
        >
          <CalendarIcon class="h-3.5 w-3.5 text-accent-soft" />
          <span>Inspect {CivilCalendar.formatShortDate(props.selectedDay)} in Calendar</span>
        </button>
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
              <For each={props.heatmapData.weeks}>
                {(week) => (
                  <div class="w-[18px] shrink-0 overflow-visible whitespace-nowrap">
                    {week.monthLabel}
                  </div>
                )}
              </For>
            </div>

            <div class="flex gap-[4px]">
              <For each={props.heatmapData.weeks}>
                {(week) => (
                  <div class="flex shrink-0 flex-col gap-[4px]">
                    <For each={week.days}>
                      {(cell) => (
                        <Show
                          when={cell.inRange}
                          fallback={<div class="h-[18px] w-[18px] rounded-[4px] bg-transparent" />}
                        >
                          <button
                            type="button"
                            onClick={() => props.onSelectDay(cell.dayIndex)}
                            onMouseEnter={() =>
                              setHoveredCell({
                                dayIndex: cell.dayIndex,
                                done: cell.done,
                                scheduled: cell.scheduled,
                              })
                            }
                            onMouseLeave={() => setHoveredCell(null)}
                            onFocus={() =>
                              setHoveredCell({
                                dayIndex: cell.dayIndex,
                                done: cell.done,
                                scheduled: cell.scheduled,
                              })
                            }
                            onBlur={() => setHoveredCell(null)}
                            title={`${CivilCalendar.formatShortDate(cell.dayIndex)}: ${cell.done}/${cell.scheduled} scheduled`}
                            aria-label={`${CivilCalendar.formatShortDate(cell.dayIndex)}: ${cell.done} of ${cell.scheduled} completed`}
                            class={`h-[18px] w-[18px] cursor-pointer rounded-[4px] transition-transform duration-100 hover:scale-115 ${heatmapSquareClass(
                              cell.tone
                            )} ${
                              cell.dayIndex === props.selectedDay
                                ? 'ring-2 ring-white ring-offset-1 ring-offset-surface'
                                : ''
                            }`}
                          />
                        </Show>
                      )}
                    </For>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-3 border-t border-white/[0.06] pt-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-xs tabular-nums">
            <Show when={!activeHeatmapCell().isHovered}>
              <span class="text-ink-subtle">Selected</span>
            </Show>
            <span
              class={
                activeHeatmapCell().isHovered
                  ? 'font-medium text-accent-tint'
                  : 'font-medium text-ink'
              }
            >
              {CivilCalendar.formatShortDate(activeHeatmapCell().dayIndex)}
            </span>
            <Show
              when={activeHeatmapCell().done !== null && activeHeatmapCell().scheduled !== null}
            >
              <span aria-hidden="true" class="text-ink-dim">
                ·
              </span>
              <span class="text-ink-secondary">
                {activeHeatmapCell().scheduled === 0 && activeHeatmapCell().done === 0
                  ? 'Rest day'
                  : `${activeHeatmapCell().done}/${activeHeatmapCell().scheduled} completed`}
              </span>
            </Show>
          </div>

          <Show when={activeHeatmapDayNotes().length > 0}>
            <p class="line-clamp-2 text-xs leading-relaxed break-words text-ink-subtle">
              <span class="font-mono tabular-nums">
                {activeHeatmapDayNotes().length}{' '}
                {activeHeatmapDayNotes().length === 1 ? 'note' : 'notes'}:
              </span>{' '}
              <span
                class={activeHeatmapCell().isHovered ? 'text-accent-tint' : 'text-ink-secondary'}
              >
                “{activeHeatmapDayNotes()[0]}”
              </span>
              <Show when={activeHeatmapDayNotes().length > 1}>
                <span class="text-ink-dim"> (+{activeHeatmapDayNotes().length - 1} more)</span>
              </Show>
            </p>
          </Show>
        </div>

        <div
          class="flex shrink-0 items-center gap-1.5 self-start text-[11px] text-ink-subtle sm:self-center"
          title="Rest = unscheduled · Red = unclosed severity · Blue = 100% done"
        >
          <span>Rest</span>
          <span class="h-[14px] w-[14px] rounded-[3px] border border-white/[0.06] bg-surface-heat" />
          <span class="ml-1 font-mono tabular-nums">0%</span>
          <span class="h-[14px] w-[14px] rounded-[3px] bg-danger" />
          <span class="h-[14px] w-[14px] rounded-[3px] bg-heat-3" />
          <span class="h-[14px] w-[14px] rounded-[3px] bg-heat-2" />
          <span class="h-[14px] w-[14px] rounded-[3px] bg-heat-1" />
          <span>Done</span>
          <span class="h-[14px] w-[14px] rounded-[3px] bg-accent" />
        </div>
      </div>
    </section>
  );
}

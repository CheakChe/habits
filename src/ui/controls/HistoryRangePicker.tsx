import {
  For,
  JSX,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { CivilCalendar } from '../../utils/civil-calendar';
import {
  DATE_RANGE_PRESETS,
  DateRangePresetId,
  DateRangeResolver,
  ResolvedDateRange,
} from '../../utils/date-range';
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  GlobeIcon,
  SearchIcon,
} from '../Icons';
import { useBodyScrollLock } from '../scroll-lock';
import { usePopoverDismiss } from './use-popover-dismiss';

interface HistoryRangePickerProps {
  preset: DateRangePresetId;
  customStartDay: number;
  customEndDay: number;
  resolvedRange: ResolvedDateRange;
  todayDay: number;
  timeZone: string;
  onSelectPreset: (preset: DateRangePresetId) => void;
  onSelectCustomRange: (startDay: number, endDay: number) => void;
  onChangeTimeZone: (timeZone: string) => void;
}

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function HistoryRangePicker(props: HistoryRangePickerProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const initialDate = untrack(() =>
    CivilCalendar.toLocalDate(Math.min(props.resolvedRange.endDay, props.todayDay))
  );
  const [viewYear, setViewYear] = createSignal(initialDate.year);
  const [viewMonth, setViewMonth] = createSignal(initialDate.month);
  const [draftStartDay, setDraftStartDay] = createSignal<number | null>(null);
  const [editingEdge, setEditingEdge] = createSignal<'start' | 'end' | null>(null);
  const [hoverDay, setHoverDay] = createSignal<number | null>(null);
  const [ymPickerOpen, setYmPickerOpen] = createSignal(false);
  const [tzExpanded, setTzExpanded] = createSignal(false);
  const [tzQuery, setTzQuery] = createSignal('');
  const [clockNow, setClockNow] = createSignal(new Date());
  const [popoverMode, setPopoverMode] = createSignal<'modal' | 'popover'>('modal');
  const [popoverStyle, setPopoverStyle] = createSignal<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ top: 16, left: 16, width: 660, maxHeight: 560 });
  let containerRef: HTMLDivElement | undefined;
  let popoverRef: HTMLDivElement | undefined;

  const closePicker = () => {
    setOpen(false);
    setTzExpanded(false);
    setYmPickerOpen(false);
    setEditingEdge(null);
    setDraftStartDay(null);
    setHoverDay(null);
  };

  useBodyScrollLock(() => open() && popoverMode() === 'modal');

  const updatePopoverLayout = () => {
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    if (!containerRef || vw < 700) {
      setPopoverMode('modal');
      return;
    }
    const rect = containerRef.getBoundingClientRect();
    const width = Math.min(660, vw - 32);
    const fitsRight = rect.right >= width + 16;
    const fitsLeft = vw - rect.left >= width + 16;
    if (!fitsRight && !fitsLeft) {
      setPopoverMode('modal');
      return;
    }
    const left = fitsRight
      ? rect.right - width
      : Math.max(16, Math.min(rect.left, vw - width - 16));
    const spaceBelow = vh - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    let top: number;
    let maxHeight: number;
    if (spaceBelow >= 360 || spaceBelow >= spaceAbove) {
      top = Math.max(16, rect.bottom + 8);
      maxHeight = Math.max(240, vh - top - 16);
    } else {
      maxHeight = Math.max(240, Math.min(600, spaceAbove - 8));
      top = Math.max(16, rect.top - maxHeight - 8);
    }
    setPopoverMode('popover');
    setPopoverStyle({ top, left, width, maxHeight });
  };

  const allTimeZones = createMemo(() => CivilCalendar.getAvailableTimeZones());
  const deviceTimeZone = createMemo(() => CivilCalendar.getDeviceTimeZone());

  const filteredTimeZones = createMemo(() => {
    const q = tzQuery().trim().toLowerCase();
    const list = allTimeZones();
    if (!q) return list.slice(0, 80);
    return list.filter((tz) => tz.toLowerCase().includes(q)).slice(0, 80);
  });

  createEffect(() => {
    if (!open()) return;
    const anchorDay = Math.min(props.resolvedRange.endDay, props.todayDay);
    const target = CivilCalendar.toLocalDate(anchorDay);
    setViewYear(target.year);
    setViewMonth(target.month);
    setDraftStartDay(null);
    setEditingEdge(null);
    setHoverDay(null);
    setYmPickerOpen(false);
    setClockNow(new Date());

    updatePopoverLayout();
    const rafId = window.requestAnimationFrame(() => updatePopoverLayout());
    const timer = window.setInterval(() => setClockNow(new Date()), 30_000);

    onCleanup(() => {
      window.cancelAnimationFrame(rafId);
      window.clearInterval(timer);
    });
  });

  usePopoverDismiss({
    open,
    getContainer: () => containerRef,
    getPopover: () => popoverRef,
    onDismiss: closePicker,
    onEscape: () => {
      if (ymPickerOpen()) {
        setYmPickerOpen(false);
      } else if (editingEdge() !== null) {
        setEditingEdge(null);
        setHoverDay(null);
      } else if (draftStartDay() !== null) {
        setDraftStartDay(null);
        setHoverDay(null);
      } else {
        closePicker();
      }
    },
    onReposition: () => updatePopoverLayout(),
    listenVisualViewport: true,
  });

  const monthGrid = createMemo(() => CivilCalendar.getMonthDays(viewYear(), viewMonth()));

  const goPrevMonth = () => {
    if (viewMonth() === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth() === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const baseRange = createMemo(() => ({
    startDay:
      props.preset === 'custom'
        ? Math.min(props.customStartDay, props.todayDay)
        : props.resolvedRange.startDay,
    endDay:
      props.preset === 'custom'
        ? Math.min(props.customEndDay, props.todayDay)
        : Math.min(props.resolvedRange.endDay, props.todayDay),
  }));

  const activeVisualRange = createMemo(() => {
    const draft = draftStartDay();
    if (draft !== null) {
      const hover = hoverDay() ?? draft;
      return {
        startDay: Math.min(draft, hover),
        endDay: Math.max(draft, hover),
      };
    }
    const base = baseRange();
    const edge = editingEdge();
    const hover = hoverDay();
    if (edge === 'start' && hover !== null) {
      return {
        startDay: Math.min(hover, base.endDay),
        endDay: Math.max(hover, base.endDay),
      };
    }
    if (edge === 'end' && hover !== null) {
      return {
        startDay: Math.min(base.startDay, hover),
        endDay: Math.max(base.startDay, hover),
      };
    }
    return base;
  });

  const tzChipLabel = createMemo(() => {
    const tz = props.timeZone;
    if (tz === 'UTC') return 'UTC';
    if (tz === 'local') return 'Local';
    const tail = tz.split('/').pop() ?? tz;
    return tail.replace(/_/g, ' ');
  });

  const todayLocal = createMemo(() => CivilCalendar.toLocalDate(props.todayDay));
  const selectableYears = createMemo(() => {
    const maxYear = todayLocal().year;
    const minYear = Math.min(viewYear(), maxYear - 7);
    const years: number[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      years.push(y);
    }
    return years;
  });

  const focusEdge = (edge: 'start' | 'end') => {
    setDraftStartDay(null);
    setHoverDay(null);
    setYmPickerOpen(false);
    if (editingEdge() === edge) {
      setEditingEdge(null);
      return;
    }
    setEditingEdge(edge);
    const base = baseRange();
    const targetDay = edge === 'start' ? base.startDay : base.endDay;
    const target = CivilCalendar.toLocalDate(targetDay);
    setViewYear(target.year);
    setViewMonth(target.month);
  };

  const handleDayClick = (dayIndex: number) => {
    const edge = editingEdge();
    if (edge === 'start') {
      const end = baseRange().endDay;
      props.onSelectCustomRange(Math.min(dayIndex, end), Math.max(dayIndex, end));
      setEditingEdge(null);
      setHoverDay(null);
      return;
    }
    if (edge === 'end') {
      const start = baseRange().startDay;
      props.onSelectCustomRange(Math.min(start, dayIndex), Math.max(start, dayIndex));
      setEditingEdge(null);
      setHoverDay(null);
      return;
    }

    const draft = draftStartDay();
    if (draft === null) {
      setDraftStartDay(dayIndex);
      setHoverDay(dayIndex);
      return;
    }
    const start = Math.min(draft, dayIndex);
    const end = Math.max(draft, dayIndex);
    setDraftStartDay(null);
    setHoverDay(null);
    props.onSelectCustomRange(start, end);
    setOpen(false);
    setTzExpanded(false);
  };

  const renderPickerBody = () => (
    <div class="grid grid-cols-1 sm:grid-cols-12">
      {/* Presets list */}
      <div class="max-h-48 space-y-0.5 overflow-y-auto overscroll-contain border-b border-white/[0.08] p-2.5 sm:col-span-5 sm:max-h-[430px] sm:border-r sm:border-b-0">
        <p class="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
          Presets
        </p>
        <For each={DATE_RANGE_PRESETS}>
          {(option) => {
            const isActive = () => props.preset === option.id;
            return (
              <button
                type="button"
                onClick={() => {
                  setDraftStartDay(null);
                  setEditingEdge(null);
                  setHoverDay(null);
                  setYmPickerOpen(false);
                  props.onSelectPreset(option.id);
                  if (option.id !== 'custom') {
                    setOpen(false);
                    setTzExpanded(false);
                  }
                }}
                class={`flex min-h-[34px] w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                  isActive()
                    ? 'bg-accent/15 font-medium text-ink'
                    : 'text-ink-secondary hover:bg-white/[0.06] hover:text-ink'
                }`}
              >
                <span>{option.label}</span>
                <Show when={isActive()}>
                  <CheckIcon class="h-3.5 w-3.5 shrink-0 text-accent-soft" />
                </Show>
              </button>
            );
          }}
        </For>
      </div>

      {/* Custom range calendar + Timezone */}
      <div class="space-y-4 p-4 sm:col-span-7">
        <div class="grid grid-cols-2 gap-2">
          <div class="space-y-1">
            <span class="block text-[10px] font-medium tracking-wider text-ink-dim uppercase">
              From
            </span>
            <button
              type="button"
              onClick={() => focusEdge('start')}
              aria-pressed={editingEdge() === 'start'}
              class={`flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border bg-canvas px-2.5 text-left transition-colors ${
                editingEdge() === 'start'
                  ? 'border-accent text-ink ring-1 ring-accent/40'
                  : 'border-white/[0.08] text-ink hover:border-white/25'
              }`}
            >
              <CalendarIcon
                class={`h-3.5 w-3.5 shrink-0 ${
                  editingEdge() === 'start' ? 'text-accent-soft' : 'text-ink-subtle'
                }`}
              />
              <span class="truncate font-mono text-xs tabular-nums">
                {CivilCalendar.formatShortDateWithYear(activeVisualRange().startDay)}
              </span>
            </button>
          </div>

          <div class="space-y-1">
            <span class="block text-[10px] font-medium tracking-wider text-ink-dim uppercase">
              To
            </span>
            <button
              type="button"
              onClick={() => focusEdge('end')}
              aria-pressed={editingEdge() === 'end'}
              class={`flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border bg-canvas px-2.5 text-left transition-colors ${
                editingEdge() === 'end'
                  ? 'border-accent text-ink ring-1 ring-accent/40'
                  : 'border-white/[0.08] text-ink hover:border-white/25'
              }`}
            >
              <CalendarIcon
                class={`h-3.5 w-3.5 shrink-0 ${
                  editingEdge() === 'end' ? 'text-accent-soft' : 'text-ink-subtle'
                }`}
              />
              <span class="truncate font-mono text-xs tabular-nums">
                {CivilCalendar.formatShortDateWithYear(activeVisualRange().endDay)}
              </span>
            </button>
          </div>
        </div>

        <div class="space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setYmPickerOpen((v) => !v)}
              aria-expanded={ymPickerOpen()}
              class="-ml-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-display text-sm font-semibold text-ink transition-colors hover:bg-white/[0.06]"
            >
              <span>{CivilCalendar.formatMonthYear(viewYear(), viewMonth())}</span>
              <ChevronDownIcon
                class={`h-3.5 w-3.5 text-ink-subtle transition-transform duration-150 ${
                  ymPickerOpen() ? 'rotate-180 text-accent-soft' : ''
                }`}
              />
            </button>
            <div class="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (ymPickerOpen()) {
                    setViewYear((y) => y - 1);
                  } else {
                    goPrevMonth();
                  }
                }}
                aria-label={ymPickerOpen() ? 'Previous year' : 'Previous month'}
                class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-white/[0.08] hover:text-ink"
              >
                <ChevronLeftIcon class="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (ymPickerOpen()) {
                    setViewYear((y) => Math.min(todayLocal().year, y + 1));
                  } else {
                    goNextMonth();
                  }
                }}
                aria-label={ymPickerOpen() ? 'Next year' : 'Next month'}
                class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-white/[0.08] hover:text-ink"
              >
                <ChevronRightIcon class="h-4 w-4" />
              </button>
            </div>
          </div>

          <Show
            when={!ymPickerOpen()}
            fallback={
              <div class="space-y-2.5 rounded-xl border border-white/[0.08] bg-canvas p-2.5">
                <div class="flex items-center gap-1 overflow-x-auto pb-0.5">
                  <For each={selectableYears()}>
                    {(yr) => (
                      <button
                        type="button"
                        onClick={() => {
                          setViewYear(yr);
                          if (yr === todayLocal().year && viewMonth() > todayLocal().month) {
                            setViewMonth(todayLocal().month);
                          }
                        }}
                        class={`shrink-0 cursor-pointer rounded-md px-2 py-1 font-mono text-xs tabular-nums transition-colors ${
                          viewYear() === yr
                            ? 'bg-accent font-semibold text-white'
                            : 'text-ink-subtle hover:bg-white/[0.06] hover:text-ink'
                        }`}
                      >
                        {yr}
                      </button>
                    )}
                  </For>
                </div>

                <div class="grid grid-cols-4 gap-1.5">
                  <For each={MONTH_SHORT_NAMES}>
                    {(mLabel, idx) => {
                      const monthNum = () => idx() + 1;
                      const isFutureMonth = () =>
                        viewYear() > todayLocal().year ||
                        (viewYear() === todayLocal().year && monthNum() > todayLocal().month);
                      const isActiveMonth = () => viewMonth() === monthNum();
                      return (
                        <button
                          type="button"
                          disabled={isFutureMonth()}
                          onClick={() => {
                            setViewMonth(monthNum());
                            setYmPickerOpen(false);
                          }}
                          class={`h-8 cursor-pointer rounded-lg text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-25 ${
                            isActiveMonth()
                              ? 'border border-accent/40 bg-accent/20 text-accent-soft'
                              : 'text-ink-secondary hover:bg-white/[0.06] hover:text-ink'
                          }`}
                        >
                          {mLabel}
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            }
          >
            <div class="grid grid-cols-7 gap-1 text-center">
              <For each={[0, 1, 2, 3, 4, 5, 6]}>
                {(bit) => (
                  <div class="py-0.5 text-[10px] font-medium text-ink-dim">
                    {CivilCalendar.weekdayShortLabel(bit).slice(0, 2)}
                  </div>
                )}
              </For>

              <For each={Array.from({ length: monthGrid().leadingEmpty })}>{() => <div />}</For>

              <For each={monthGrid().days}>
                {(dayIndex) => {
                  const local = CivilCalendar.toLocalDate(dayIndex);
                  const isFuture = () => dayIndex > props.todayDay;
                  const isEdge = () =>
                    dayIndex === activeVisualRange().startDay ||
                    dayIndex === activeVisualRange().endDay;
                  const isInRange = () =>
                    dayIndex > activeVisualRange().startDay &&
                    dayIndex < activeVisualRange().endDay;
                  const isToday = () => dayIndex === props.todayDay;

                  return (
                    <button
                      type="button"
                      disabled={isFuture()}
                      onClick={() => handleDayClick(dayIndex)}
                      onMouseEnter={() => {
                        if ((draftStartDay() !== null || editingEdge() !== null) && !isFuture()) {
                          setHoverDay(dayIndex);
                        }
                      }}
                      class={`flex h-8 cursor-pointer items-center justify-center rounded-lg font-mono text-xs tabular-nums transition-colors disabled:cursor-default disabled:opacity-25 ${
                        isEdge()
                          ? 'bg-accent font-semibold text-white'
                          : isInRange()
                            ? 'bg-accent/20 text-accent-tint'
                            : isToday()
                              ? 'text-accent-soft ring-1 ring-accent-soft/60 hover:bg-accent/15'
                              : 'text-ink-secondary hover:bg-white/[0.08] hover:text-ink'
                      }`}
                    >
                      {local.day}
                    </button>
                  );
                }}
              </For>
            </div>
          </Show>

          <p class="font-mono text-[11px] text-ink-subtle tabular-nums">
            {editingEdge() === 'start'
              ? 'Picking start date (From) — click any day'
              : editingEdge() === 'end'
                ? 'Picking end date (To) — click any day'
                : draftStartDay() !== null
                  ? `Start: ${CivilCalendar.formatShortDateWithYear(draftStartDay()!)} — pick end date`
                  : `Range: ${DateRangeResolver.formatRangeLabel(
                      activeVisualRange().startDay,
                      activeVisualRange().endDay
                    )}`}
          </p>
        </div>

        {/* Offline IANA Timezone selector */}
        <div class="space-y-2 border-t border-white/[0.08] pt-3">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
              <GlobeIcon class="h-3.5 w-3.5 text-accent-soft" />
              <span>Timezone</span>
            </span>
            <span class="font-mono text-[11px] text-ink-subtle tabular-nums">
              {CivilCalendar.formatClockInTimeZone(clockNow(), props.timeZone)}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => props.onChangeTimeZone('UTC')}
              class={`h-8 cursor-pointer rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                props.timeZone === 'UTC'
                  ? 'border-accent/50 bg-accent/15 text-ink'
                  : 'border-white/[0.08] bg-canvas text-ink-subtle hover:text-ink'
              }`}
            >
              UTC
            </button>
            <button
              type="button"
              onClick={() => props.onChangeTimeZone('local')}
              class={`h-8 cursor-pointer rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                props.timeZone === 'local'
                  ? 'border-accent/50 bg-accent/15 text-ink'
                  : 'border-white/[0.08] bg-canvas text-ink-subtle hover:text-ink'
              }`}
            >
              Local ({deviceTimeZone().split('/').pop()?.replace(/_/g, ' ')})
            </button>
            <button
              type="button"
              onClick={() => setTzExpanded((v) => !v)}
              class={`ml-auto h-8 cursor-pointer rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                tzExpanded() || (props.timeZone !== 'UTC' && props.timeZone !== 'local')
                  ? 'border-white/20 bg-surface-elevated text-ink'
                  : 'border-white/[0.08] bg-canvas text-ink-subtle hover:text-ink'
              }`}
            >
              {props.timeZone !== 'UTC' && props.timeZone !== 'local'
                ? props.timeZone
                : 'All Zones'}
            </button>
          </div>

          <Show when={tzExpanded()}>
            <div class="space-y-1.5 pt-1">
              <div class="relative">
                <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-dim" />
                <input
                  type="text"
                  value={tzQuery()}
                  onInput={(e) => setTzQuery(e.currentTarget.value)}
                  placeholder="Search IANA timezone (e.g. Europe/Kyiv)..."
                  class="h-8 w-full rounded-lg border border-white/[0.08] bg-canvas pr-2.5 pl-8 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                />
              </div>
              <div class="max-h-32 space-y-0.5 overflow-y-auto overscroll-contain rounded-lg border border-white/[0.08] bg-canvas p-1">
                <For each={filteredTimeZones()}>
                  {(tz) => (
                    <button
                      type="button"
                      onClick={() => {
                        props.onChangeTimeZone(tz);
                        setTzExpanded(false);
                      }}
                      class={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-xs ${
                        props.timeZone === tz
                          ? 'bg-accent/20 text-ink'
                          : 'text-ink-muted hover:bg-white/[0.06] hover:text-ink'
                      }`}
                    >
                      <span class="truncate">{tz}</span>
                      <Show when={props.timeZone === tz}>
                        <CheckIcon class="h-3 w-3 shrink-0 text-accent-soft" />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} class="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open()}
        onClick={() => setOpen((v) => !v)}
        class={`flex h-10 max-w-full shrink-0 cursor-pointer items-center gap-2 rounded-xl border bg-surface px-3.5 text-xs font-medium whitespace-nowrap text-ink transition-colors sm:gap-2.5 ${
          open() ? 'border-accent' : 'border-white/[0.08] hover:border-white/20'
        }`}
      >
        <CalendarIcon class="h-3.5 w-3.5 shrink-0 text-accent-soft" />
        <span class="min-w-0 truncate">{props.resolvedRange.label}</span>
        <span class="hidden text-ink-dim sm:inline" aria-hidden="true">
          ·
        </span>
        <span class="hidden font-mono text-ink-muted tabular-nums sm:inline">
          {DateRangeResolver.formatRangeLabel(
            props.resolvedRange.startDay,
            Math.min(props.resolvedRange.endDay, props.todayDay)
          )}
        </span>
        <span class="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary">
          {tzChipLabel()}
        </span>
        <ChevronDownIcon
          class={`h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform duration-150 ${
            open() ? 'rotate-180 text-accent-soft' : ''
          }`}
        />
      </button>

      <Show when={open()}>
        <Portal>
          <Show
            when={popoverMode() === 'modal'}
            fallback={
              <div
                ref={popoverRef}
                role="dialog"
                aria-label="Choose date range and timezone"
                style={{
                  top: `${popoverStyle().top}px`,
                  left: `${popoverStyle().left}px`,
                  width: `${popoverStyle().width}px`,
                  'max-height': `${popoverStyle().maxHeight}px`,
                }}
                class="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-surface-popover/95 shadow-2xl shadow-black/75 backdrop-blur-xl"
              >
                <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {renderPickerBody()}
                </div>
              </div>
            }
          >
            <div
              class="fixed inset-0 z-50 flex items-end justify-center overscroll-none bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  closePicker();
                }
              }}
            >
              <div
                ref={popoverRef}
                role="dialog"
                aria-modal="true"
                aria-label="Choose date range and timezone"
                class="max-h-modal flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.1] bg-surface-popover shadow-2xl shadow-black/75 sm:max-w-[660px] sm:rounded-2xl"
              >
                <div class="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-3 sm:px-5">
                  <span class="font-display text-sm font-semibold text-ink">
                    Date Range &amp; Timezone
                  </span>
                  <button
                    type="button"
                    onClick={closePicker}
                    aria-label="Close date range picker"
                    class="flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-white/[0.06] hover:text-ink"
                  >
                    <CloseIcon class="h-4 w-4" />
                  </button>
                </div>
                <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] sm:pb-0">
                  {renderPickerBody()}
                </div>
              </div>
            </div>
          </Show>
        </Portal>
      </Show>
    </div>
  );
}

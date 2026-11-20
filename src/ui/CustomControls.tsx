import { For, JSX, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { CivilCalendar } from '../utils/civil-calendar';
import {
  DATE_RANGE_PRESETS,
  DateRangePresetId,
  DateRangeResolver,
  ResolvedDateRange,
} from '../utils/date-range';
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  GlobeIcon,
  SearchIcon,
} from './Icons';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
  dotColor?: string;
}

interface CustomSelectProps<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  class?: string;
}

export function CustomSelect<T extends string | number>(
  props: CustomSelectProps<T>
): JSX.Element {
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  const selectedOption = createMemo(
    () => props.options.find((opt) => opt.value === props.value) ?? props.options[0]
  );

  createEffect(() => {
    if (!open()) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef && !containerRef.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    });
  });

  return (
    <div ref={containerRef} class={`relative ${props.class ?? ''}`}>
      <button
        type="button"
        aria-label={props.ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open()}
        onClick={() => setOpen((v) => !v)}
        class={`h-10 min-w-[180px] rounded-xl bg-[#14161B] border px-3.5 text-xs font-medium text-[#F5F7FA] flex items-center justify-between gap-3 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          open()
            ? 'border-[#3B82F6]'
            : 'border-white/[0.08] hover:border-white/20'
        }`}
      >
        <span class="flex items-center gap-2 min-w-0">
          <Show when={selectedOption()?.dotColor}>
            {(dot) => (
              <span
                class="w-2 h-2 rounded-full shrink-0"
                style={{ 'background-color': dot() }}
                aria-hidden="true"
              />
            )}
          </Show>
          <span class="truncate">{selectedOption()?.label ?? ''}</span>
        </span>
        <ChevronDownIcon
          class={`w-3.5 h-3.5 text-[#8E95A5] shrink-0 transition-transform duration-150 ${
            open() ? 'rotate-180 text-[#60A5FA]' : ''
          }`}
        />
      </button>

      <Show when={open()}>
        <div
          role="listbox"
          class="absolute left-0 sm:left-auto sm:right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-[#181B22]/95 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/70 p-1.5 z-50 max-h-64 overflow-y-auto"
        >
          <For each={props.options}>
            {(option) => {
              const isSelected = () => option.value === props.value;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected()}
                  onClick={() => {
                    props.onChange(option.value);
                    setOpen(false);
                  }}
                  class={`w-full min-h-[38px] px-3 py-2 rounded-xl flex items-center justify-between gap-2.5 text-left text-xs transition-colors cursor-pointer ${
                    isSelected()
                      ? 'bg-[#3B82F6]/15 text-[#F5F7FA]'
                      : 'text-[#C8CDD8] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
                  }`}
                >
                  <span class="flex items-center gap-2.5 min-w-0">
                    <Show when={option.dotColor}>
                      {(dot) => (
                        <span
                          class="w-2 h-2 rounded-full shrink-0"
                          style={{ 'background-color': dot() }}
                          aria-hidden="true"
                        />
                      )}
                    </Show>
                    <span class="truncate font-medium">{option.label}</span>
                    <Show when={option.hint}>
                      {(hint) => (
                        <span class="text-[11px] text-[#6B7280] shrink-0">
                          {hint()}
                        </span>
                      )}
                    </Show>
                  </span>
                  <Show when={isSelected()}>
                    <CheckIcon class="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

interface DatePickerProps {
  id?: string;
  value: number | null;
  todayDay: number;
  onChange: (dayIndex: number | null) => void;
  allowClear?: boolean;
  placeholder?: string;
  placement?: 'top' | 'bottom';
}

export function DatePicker(props: DatePickerProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const initialDate = CivilCalendar.toLocalDate(props.value ?? props.todayDay);
  const [viewYear, setViewYear] = createSignal(initialDate.year);
  const [viewMonth, setViewMonth] = createSignal(initialDate.month);
  let containerRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!open()) return;
    const target = CivilCalendar.toLocalDate(props.value ?? props.todayDay);
    setViewYear(target.year);
    setViewMonth(target.month);

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef && !containerRef.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    });
  });

  const monthGrid = createMemo(() =>
    CivilCalendar.getMonthDays(viewYear(), viewMonth())
  );

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

  const formattedLabel = createMemo(() => {
    const val = props.value;
    if (val === null) return props.placeholder ?? 'No due date';
    if (val === props.todayDay) return `Today · ${CivilCalendar.formatShortDate(val)}`;
    if (val === props.todayDay + 1)
      return `Tomorrow · ${CivilCalendar.formatShortDate(val)}`;
    return CivilCalendar.formatFullDate(val);
  });

  const placementClass = () =>
    props.placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2';

  return (
    <div ref={containerRef} class="relative">
      <div class="flex items-center gap-2">
        <button
          id={props.id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open()}
          onClick={() => setOpen((v) => !v)}
          class={`flex-1 h-11 rounded-xl bg-[#0A0B0E] border px-3.5 text-sm flex items-center justify-between gap-3 transition-colors cursor-pointer ${
            open()
              ? 'border-[#3B82F6] text-[#F5F7FA]'
              : 'border-white/[0.1] hover:border-white/25 text-[#F5F7FA]'
          }`}
        >
          <span class="flex items-center gap-2.5 min-w-0">
            <CalendarIcon
              class={`w-4 h-4 shrink-0 ${
                props.value !== null ? 'text-[#60A5FA]' : 'text-[#6B7280]'
              }`}
            />
            <span
              class={`truncate font-mono tabular-nums text-[13px] ${
                props.value === null ? 'text-[#6B7280] font-sans' : 'text-[#F5F7FA]'
              }`}
            >
              {formattedLabel()}
            </span>
          </span>
          <ChevronDownIcon
            class={`w-3.5 h-3.5 text-[#8E95A5] shrink-0 transition-transform duration-150 ${
              open() ? 'rotate-180 text-[#60A5FA]' : ''
            }`}
          />
        </button>

        <Show when={props.allowClear && props.value !== null}>
          <button
            type="button"
            onClick={() => {
              props.onChange(null);
              setOpen(false);
            }}
            aria-label="Clear date"
            class="h-11 w-11 rounded-xl bg-[#0A0B0E] border border-white/[0.1] hover:border-white/25 text-[#8E95A5] hover:text-[#F5F7FA] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <CloseIcon class="w-4 h-4" />
          </button>
        </Show>
      </div>

      <Show when={open()}>
        <div
          role="dialog"
          aria-label="Choose date"
          class={`absolute left-0 right-0 sm:right-auto sm:w-[304px] ${placementClass()} rounded-2xl bg-[#181B22]/95 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/75 p-4 space-y-3 z-50`}
        >
          <div class="flex items-center justify-between">
            <span class="font-display text-sm font-semibold text-[#F5F7FA]">
              {CivilCalendar.formatMonthYear(viewYear(), viewMonth())}
            </span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrevMonth}
                aria-label="Previous month"
                class="w-8 h-8 rounded-lg flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <ChevronLeftIcon class="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={goNextMonth}
                aria-label="Next month"
                class="w-8 h-8 rounded-lg flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <ChevronRightIcon class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="grid grid-cols-7 gap-1 text-center">
            <For each={[0, 1, 2, 3, 4, 5, 6]}>
              {(bit) => (
                <div class="text-[11px] font-medium text-[#6B7280] py-1">
                  {CivilCalendar.weekdayShortLabel(bit).slice(0, 2)}
                </div>
              )}
            </For>

            <For each={Array.from({ length: monthGrid().leadingEmpty })}>
              {() => <div />}
            </For>

            <For each={monthGrid().days}>
              {(dayIndex) => {
                const local = CivilCalendar.toLocalDate(dayIndex);
                const isSelected = () => props.value === dayIndex;
                const isToday = () => dayIndex === props.todayDay;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      props.onChange(dayIndex);
                      setOpen(false);
                    }}
                    class={`h-9 rounded-xl text-xs font-mono tabular-nums flex items-center justify-center transition-colors cursor-pointer ${
                      isSelected()
                        ? 'bg-[#3B82F6] text-white font-semibold'
                        : isToday()
                          ? 'bg-[#3B82F6]/15 text-[#60A5FA] ring-1 ring-[#3B82F6]/50 hover:bg-[#3B82F6]/25'
                          : 'text-[#C8CDD8] hover:bg-white/[0.08] hover:text-[#F5F7FA]'
                    }`}
                  >
                    {local.day}
                  </button>
                );
              }}
            </For>
          </div>

          <div class="pt-2 border-t border-white/[0.08] flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                props.onChange(props.todayDay);
                setOpen(false);
              }}
              class="px-2.5 py-1.5 rounded-lg text-[#60A5FA] hover:bg-[#3B82F6]/10 font-medium transition-colors cursor-pointer"
            >
              Today
            </button>
            <Show when={props.allowClear}>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    props.onChange(props.todayDay + 1);
                    setOpen(false);
                  }}
                  class="px-2.5 py-1.5 rounded-lg text-[#9AA1B1] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => {
                    props.onChange(null);
                    setOpen(false);
                  }}
                  class="px-2.5 py-1.5 rounded-lg text-[#9AA1B1] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  No date
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}

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

export function HistoryRangePicker(props: HistoryRangePickerProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const initialDate = CivilCalendar.toLocalDate(
    Math.min(props.resolvedRange.endDay, props.todayDay)
  );
  const [viewYear, setViewYear] = createSignal(initialDate.year);
  const [viewMonth, setViewMonth] = createSignal(initialDate.month);
  const [draftStartDay, setDraftStartDay] = createSignal<number | null>(null);
  const [hoverDay, setHoverDay] = createSignal<number | null>(null);
  const [tzExpanded, setTzExpanded] = createSignal(false);
  const [tzQuery, setTzQuery] = createSignal('');
  const [clockNow, setClockNow] = createSignal(new Date());
  const [popoverAlign, setPopoverAlign] = createSignal<'right' | 'left' | 'fixed'>('right');
  let containerRef: HTMLDivElement | undefined;

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
    setHoverDay(null);
    setClockNow(new Date());

    if (containerRef) {
      const rect = containerRef.getBoundingClientRect();
      const vw = window.innerWidth;
      if (rect.right >= 676) {
        setPopoverAlign('right');
      } else if (vw - rect.left >= 676) {
        setPopoverAlign('left');
      } else {
        setPopoverAlign('fixed');
      }
    }

    const timer = window.setInterval(() => setClockNow(new Date()), 30_000);

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef && !containerRef.contains(e.target as Node)) {
        setOpen(false);
        setTzExpanded(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (draftStartDay() !== null) {
          setDraftStartDay(null);
          setHoverDay(null);
        } else {
          setOpen(false);
          setTzExpanded(false);
        }
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => {
      window.clearInterval(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    });
  });

  const monthGrid = createMemo(() =>
    CivilCalendar.getMonthDays(viewYear(), viewMonth())
  );

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

  const activeVisualRange = createMemo(() => {
    const draft = draftStartDay();
    if (draft !== null) {
      const hover = hoverDay() ?? draft;
      return {
        startDay: Math.min(draft, hover),
        endDay: Math.max(draft, hover),
      };
    }
    return {
      startDay: props.resolvedRange.startDay,
      endDay: Math.min(props.resolvedRange.endDay, props.todayDay),
    };
  });

  const tzChipLabel = createMemo(() => {
    const tz = props.timeZone;
    if (tz === 'UTC') return 'UTC';
    if (tz === 'local') return 'Local';
    const tail = tz.split('/').pop() ?? tz;
    return tail.replace(/_/g, ' ');
  });

  const handleDayClick = (dayIndex: number) => {
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

  const handleInputDateChange = (edge: 'start' | 'end', raw: string) => {
    const parsed = CivilCalendar.fromInputDateValue(raw);
    if (parsed === null) return;
    const clamped = Math.min(parsed, props.todayDay);
    const currentStart =
      props.preset === 'custom'
        ? props.customStartDay
        : props.resolvedRange.startDay;
    const currentEnd =
      props.preset === 'custom'
        ? Math.min(props.customEndDay, props.todayDay)
        : Math.min(props.resolvedRange.endDay, props.todayDay);
    const nextStart = edge === 'start' ? clamped : currentStart;
    const nextEnd = edge === 'end' ? clamped : currentEnd;
    props.onSelectCustomRange(
      Math.min(nextStart, nextEnd),
      Math.max(nextStart, nextEnd)
    );
  };

  return (
    <div ref={containerRef} class="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open()}
        onClick={() => setOpen((v) => !v)}
        class={`h-10 rounded-xl bg-[#14161B] border px-3.5 text-xs font-medium text-[#F5F7FA] flex items-center gap-2.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          open()
            ? 'border-[#3B82F6]'
            : 'border-white/[0.08] hover:border-white/20'
        }`}
      >
        <CalendarIcon class="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
        <span>{props.resolvedRange.label}</span>
        <span class="text-[#6B7280]" aria-hidden="true">
          ·
        </span>
        <span class="font-mono tabular-nums text-[#9AA1B1] hidden sm:inline">
          {DateRangeResolver.formatRangeLabel(
            props.resolvedRange.startDay,
            Math.min(props.resolvedRange.endDay, props.todayDay)
          )}
        </span>
        <span class="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-mono text-[#C8CDD8]">
          {tzChipLabel()}
        </span>
        <ChevronDownIcon
          class={`w-3.5 h-3.5 text-[#8E95A5] shrink-0 transition-transform duration-150 ${
            open() ? 'rotate-180 text-[#60A5FA]' : ''
          }`}
        />
      </button>

      <Show when={open()}>
        <div
          role="dialog"
          aria-label="Choose date range and timezone"
          class={`${
            popoverAlign() === 'fixed'
              ? 'fixed left-4 right-4 top-20 sm:top-28 mx-auto max-w-[660px]'
              : popoverAlign() === 'left'
                ? 'absolute left-0 mt-2 w-[calc(100vw-2rem)] sm:w-[660px]'
                : 'absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-[660px]'
          } rounded-2xl bg-[#181B22]/95 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/75 overflow-hidden z-50`}
        >
          <div class="grid grid-cols-1 sm:grid-cols-12">
            {/* Presets list */}
            <div class="sm:col-span-5 border-b sm:border-b-0 sm:border-r border-white/[0.08] p-2.5 max-h-56 sm:max-h-[430px] overflow-y-auto space-y-0.5">
              <p class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
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
                        setHoverDay(null);
                        props.onSelectPreset(option.id);
                        if (option.id !== 'custom') {
                          setOpen(false);
                          setTzExpanded(false);
                        }
                      }}
                      class={`w-full min-h-[34px] px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left text-xs transition-colors cursor-pointer ${
                        isActive()
                          ? 'bg-[#3B82F6]/15 text-[#F5F7FA] font-medium'
                          : 'text-[#C8CDD8] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
                      }`}
                    >
                      <span>{option.label}</span>
                      <Show when={isActive()}>
                        <CheckIcon class="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>

            {/* Custom range calendar + Timezone */}
            <div class="sm:col-span-7 p-4 space-y-4">
              <div class="grid grid-cols-2 gap-2">
                <label class="space-y-1">
                  <span class="block text-[10px] font-medium uppercase tracking-wider text-[#6B7280]">
                    From
                  </span>
                  <input
                    type="date"
                    value={CivilCalendar.toInputDateValue(activeVisualRange().startDay)}
                    max={CivilCalendar.toInputDateValue(props.todayDay)}
                    onChange={(e) => handleInputDateChange('start', e.currentTarget.value)}
                    class="w-full h-8 rounded-lg bg-[#0A0B0E] border border-white/[0.08] px-2.5 text-xs font-mono tabular-nums text-[#F5F7FA] focus:outline-none focus:border-[#3B82F6]"
                  />
                </label>
                <label class="space-y-1">
                  <span class="block text-[10px] font-medium uppercase tracking-wider text-[#6B7280]">
                    To
                  </span>
                  <input
                    type="date"
                    value={CivilCalendar.toInputDateValue(activeVisualRange().endDay)}
                    max={CivilCalendar.toInputDateValue(props.todayDay)}
                    onChange={(e) => handleInputDateChange('end', e.currentTarget.value)}
                    class="w-full h-8 rounded-lg bg-[#0A0B0E] border border-white/[0.08] px-2.5 text-xs font-mono tabular-nums text-[#F5F7FA] focus:outline-none focus:border-[#3B82F6]"
                  />
                </label>
              </div>

              <div class="space-y-2.5">
                <div class="flex items-center justify-between">
                  <span class="font-display text-sm font-semibold text-[#F5F7FA]">
                    {CivilCalendar.formatMonthYear(viewYear(), viewMonth())}
                  </span>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={goPrevMonth}
                      aria-label="Previous month"
                      class="w-7 h-7 rounded-lg flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <ChevronLeftIcon class="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={goNextMonth}
                      aria-label="Next month"
                      class="w-7 h-7 rounded-lg flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      <ChevronRightIcon class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-7 gap-1 text-center">
                  <For each={[0, 1, 2, 3, 4, 5, 6]}>
                    {(bit) => (
                      <div class="text-[10px] font-medium text-[#6B7280] py-0.5">
                        {CivilCalendar.weekdayShortLabel(bit).slice(0, 2)}
                      </div>
                    )}
                  </For>

                  <For each={Array.from({ length: monthGrid().leadingEmpty })}>
                    {() => <div />}
                  </For>

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
                            if (draftStartDay() !== null && !isFuture()) {
                              setHoverDay(dayIndex);
                            }
                          }}
                          class={`h-8 rounded-lg text-xs font-mono tabular-nums flex items-center justify-center transition-colors cursor-pointer disabled:opacity-25 disabled:cursor-default ${
                            isEdge()
                              ? 'bg-[#3B82F6] text-white font-semibold'
                              : isInRange()
                                ? 'bg-[#3B82F6]/20 text-[#93C5FD]'
                                : isToday()
                                  ? 'ring-1 ring-[#60A5FA]/60 text-[#60A5FA] hover:bg-[#3B82F6]/15'
                                  : 'text-[#C8CDD8] hover:bg-white/[0.08] hover:text-[#F5F7FA]'
                          }`}
                        >
                          {local.day}
                        </button>
                      );
                    }}
                  </For>
                </div>

                <p class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                  {draftStartDay() !== null
                    ? `Start: ${CivilCalendar.formatShortDateWithYear(draftStartDay()!)} — pick end date`
                    : `Range: ${DateRangeResolver.formatRangeLabel(
                        activeVisualRange().startDay,
                        activeVisualRange().endDay
                      )}`}
                </p>
              </div>

              {/* Offline IANA Timezone selector */}
              <div class="pt-3 border-t border-white/[0.08] space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="inline-flex items-center gap-1.5 text-xs font-medium text-[#C8CDD8]">
                    <GlobeIcon class="w-3.5 h-3.5 text-[#60A5FA]" />
                    <span>Timezone</span>
                  </span>
                  <span class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                    {CivilCalendar.formatClockInTimeZone(clockNow(), props.timeZone)}
                  </span>
                </div>

                <div class="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => props.onChangeTimeZone('UTC')}
                    class={`h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      props.timeZone === 'UTC'
                        ? 'bg-[#3B82F6]/15 border-[#3B82F6]/50 text-[#F5F7FA]'
                        : 'bg-[#0A0B0E] border-white/[0.08] text-[#8E95A5] hover:text-[#F5F7FA]'
                    }`}
                  >
                    UTC
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onChangeTimeZone('local')}
                    class={`h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      props.timeZone === 'local'
                        ? 'bg-[#3B82F6]/15 border-[#3B82F6]/50 text-[#F5F7FA]'
                        : 'bg-[#0A0B0E] border-white/[0.08] text-[#8E95A5] hover:text-[#F5F7FA]'
                    }`}
                  >
                    Local ({deviceTimeZone().split('/').pop()?.replace(/_/g, ' ')})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTzExpanded((v) => !v)}
                    class={`h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ml-auto ${
                      tzExpanded() ||
                      (props.timeZone !== 'UTC' && props.timeZone !== 'local')
                        ? 'bg-[#1C1F26] border-white/20 text-[#F5F7FA]'
                        : 'bg-[#0A0B0E] border-white/[0.08] text-[#8E95A5] hover:text-[#F5F7FA]'
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
                      <SearchIcon class="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={tzQuery()}
                        onInput={(e) => setTzQuery(e.currentTarget.value)}
                        placeholder="Search IANA timezone (e.g. Europe/Kyiv)..."
                        class="w-full h-8 rounded-lg bg-[#0A0B0E] border border-white/[0.08] pl-8 pr-2.5 text-xs text-[#F5F7FA] placeholder:text-[#5B6270] focus:outline-none focus:border-[#3B82F6]"
                      />
                    </div>
                    <div class="max-h-32 overflow-y-auto rounded-lg bg-[#0A0B0E] border border-white/[0.08] p-1 space-y-0.5">
                      <For each={filteredTimeZones()}>
                        {(tz) => (
                          <button
                            type="button"
                            onClick={() => {
                              props.onChangeTimeZone(tz);
                              setTzExpanded(false);
                            }}
                            class={`w-full px-2.5 py-1.5 rounded-md text-left text-xs font-mono flex items-center justify-between gap-2 cursor-pointer ${
                              props.timeZone === tz
                                ? 'bg-[#3B82F6]/20 text-[#F5F7FA]'
                                : 'text-[#9AA1B1] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
                            }`}
                          >
                            <span class="truncate">{tz}</span>
                            <Show when={props.timeZone === tz}>
                              <CheckIcon class="w-3 h-3 text-[#60A5FA] shrink-0" />
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
        </div>
      </Show>
    </div>
  );
}


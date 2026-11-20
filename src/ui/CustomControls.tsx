import { For, JSX, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { CivilCalendar } from '../utils/civil-calendar';
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
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

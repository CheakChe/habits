import {
  For,
  JSX,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  untrack,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { CivilCalendar } from '../utils/civil-calendar';
import {
  DATE_RANGE_PRESETS,
  DateRangePresetId,
  DateRangeResolver,
  ResolvedDateRange,
} from '../utils/date-range';
import { HabitSchedule } from '../utils/habit-schedule';
import { ReminderPlanner } from '../utils/reminder-planner';
import { HabitBadge } from './HabitBadge';
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  GlobeIcon,
  SearchIcon,
} from './Icons';
import { useBodyScrollLock } from './scroll-lock';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
  dotColor?: string;
}

interface CustomSelectProps<T extends string | number> {
  id?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  class?: string;
  fullWidth?: boolean;
  portal?: boolean;
}

export function CustomSelect<T extends string | number>(props: CustomSelectProps<T>): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [coords, setCoords] = createSignal<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 256,
  });
  let containerRef: HTMLDivElement | undefined;
  let popoverRef: HTMLDivElement | undefined;

  const selectedOption = createMemo(
    () => props.options.find((opt) => opt.value === props.value) ?? props.options[0]
  );

  const updatePosition = () => {
    if (!containerRef || !props.portal) return;
    const rect = containerRef.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const width = Math.min(Math.max(rect.width, 224), vw - 24);
    const measuredHeight = popoverRef?.getBoundingClientRect().height || 240;
    const spaceAbove = rect.top - 12;
    const spaceBelow = vh - rect.bottom - 12;
    const openAbove = spaceAbove >= measuredHeight && spaceBelow < measuredHeight;

    const rawTop = openAbove ? rect.top - measuredHeight - 8 : rect.bottom + 8;
    const maxTop = Math.max(8, vh - measuredHeight - 8);
    const top = Math.max(8, Math.min(rawTop, maxTop));
    const left = Math.max(12, Math.min(rect.left, vw - width - 12));
    setCoords({ top, left, width });
  };

  createEffect(() => {
    if (!open()) return;

    let rafId: number | undefined;
    const handleReposition = () => updatePosition();
    if (props.portal) {
      updatePosition();
      rafId = window.requestAnimationFrame(() => updatePosition());
      window.addEventListener('resize', handleReposition);
      window.addEventListener('scroll', handleReposition, true);
    }

    const handlePointerDown = (e: PointerEvent) => {
      const targetNode = e.target as Node;
      const inTrigger = containerRef?.contains(targetNode) ?? false;
      const inPopover = popoverRef?.contains(targetNode) ?? false;
      if (!inTrigger && !inPopover) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => {
      if (rafId !== undefined) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    });
  });

  const renderListbox = (isPortal: boolean) => (
    <div
      ref={popoverRef}
      role="listbox"
      style={
        isPortal
          ? {
              top: `${coords().top}px`,
              left: `${coords().left}px`,
              width: `${coords().width}px`,
            }
          : undefined
      }
      class={
        isPortal
          ? 'fixed z-[70] max-h-64 overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.1] bg-[#181B22]/95 p-1.5 shadow-2xl shadow-black/75 backdrop-blur-xl'
          : 'absolute left-0 z-50 mt-2 max-h-64 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.1] bg-[#181B22]/95 p-1.5 shadow-2xl shadow-black/70 backdrop-blur-xl sm:right-0 sm:left-auto'
      }
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
              class={`flex min-h-[38px] w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                isSelected()
                  ? 'bg-[#3B82F6]/15 text-[#F5F7FA]'
                  : 'text-[#C8CDD8] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
              }`}
            >
              <span class="flex min-w-0 items-center gap-2.5">
                <Show when={option.dotColor}>
                  {(dot) => <HabitBadge appearanceRaw={dot()} size="xs" />}
                </Show>
                <span class="truncate font-medium">{option.label}</span>
                <Show when={option.hint}>
                  {(hint) => <span class="shrink-0 text-[11px] text-[#6B7280]">{hint()}</span>}
                </Show>
              </span>
              <Show when={isSelected()}>
                <CheckIcon class="h-3.5 w-3.5 shrink-0 text-[#60A5FA]" />
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );

  return (
    <div ref={containerRef} class={`relative ${props.class ?? ''}`}>
      <button
        id={props.id}
        type="button"
        aria-label={props.ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open()}
        onClick={() => setOpen((v) => !v)}
        class={`flex h-10 max-w-full cursor-pointer items-center justify-between gap-3 rounded-xl border bg-[#14161B] px-3.5 text-xs font-medium whitespace-nowrap text-[#F5F7FA] transition-colors ${
          props.fullWidth ? 'w-full' : 'min-w-[140px] shrink-0 sm:min-w-[180px]'
        } ${open() ? 'border-[#3B82F6]' : 'border-white/[0.08] hover:border-white/20'}`}
      >
        <span class="flex min-w-0 items-center gap-2">
          <Show when={selectedOption()?.dotColor}>
            {(dot) => <HabitBadge appearanceRaw={dot()} size="xs" />}
          </Show>
          <span class="truncate">{selectedOption()?.label ?? ''}</span>
        </span>
        <ChevronDownIcon
          class={`h-3.5 w-3.5 shrink-0 text-[#8E95A5] transition-transform duration-150 ${
            open() ? 'rotate-180 text-[#60A5FA]' : ''
          }`}
        />
      </button>

      <Show when={open()}>
        <Show when={props.portal} fallback={renderListbox(false)}>
          <Portal>{renderListbox(true)}</Portal>
        </Show>
      </Show>
    </div>
  );
}

export interface MultiSelectQuickPreset<T extends string | number> {
  label: string;
  triggerLabel?: string;
  values: T[];
}

interface CustomMultiSelectProps<T extends string | number> {
  value: 'all' | T[];
  options: SelectOption<T>[];
  onChange: (value: 'all' | T[]) => void;
  allLabel: string;
  emptyLabel?: string;
  selectedNoun?: { one: string; many: string };
  quickPreset?: MultiSelectQuickPreset<T>;
  align?: 'left' | 'right';
  ariaLabel?: string;
  class?: string;
}

export function CustomMultiSelect<T extends string | number>(
  props: CustomMultiSelectProps<T>
): JSX.Element {
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  const isAll = createMemo(() => {
    if (props.value === 'all') return true;
    if (props.options.length === 0) return false;
    const set = new Set<T>(props.value);
    return props.options.every((opt) => set.has(opt.value));
  });

  const selectedSet = createMemo(() => {
    if (isAll()) {
      return new Set<T>(props.options.map((opt) => opt.value));
    }
    return new Set<T>(props.value as T[]);
  });

  const selectedOptions = createMemo(() => {
    const set = selectedSet();
    return props.options.filter((opt) => set.has(opt.value));
  });

  const matchesQuickPreset = createMemo(() => {
    const preset = props.quickPreset;
    if (!preset || isAll()) return false;
    const set = selectedSet();
    if (set.size !== preset.values.length) return false;
    return preset.values.every((v) => set.has(v));
  });

  const triggerText = createMemo(() => {
    if (props.value === 'all' || (props.options.length > 0 && isAll())) {
      return props.allLabel;
    }
    const picked = selectedOptions();
    if (picked.length === 0) {
      return props.emptyLabel ?? 'None selected';
    }
    if (picked.length === 1) {
      return picked[0].label;
    }
    if (matchesQuickPreset() && props.quickPreset) {
      return props.quickPreset.triggerLabel ?? props.quickPreset.label;
    }
    const noun = props.selectedNoun?.many ?? 'selected';
    const preview = picked.map((o) => o.label).join(', ');
    return `${picked.length} ${noun} · ${preview}`;
  });

  const triggerTitle = createMemo(() => {
    if (isAll()) return props.allLabel;
    const picked = selectedOptions();
    if (picked.length === 0) return props.emptyLabel ?? 'None selected';
    return picked.map((o) => o.label).join(', ');
  });

  const previewDots = createMemo(() => {
    if (isAll()) return [];
    const picked = selectedOptions();
    if (picked.length === 0) return [];
    return picked
      .filter((o) => Boolean(o.dotColor))
      .slice(0, 2)
      .map((o) => o.dotColor!);
  });

  const toggleValue = (val: T) => {
    const allValues = props.options.map((o) => o.value);
    if (isAll()) {
      props.onChange(allValues.filter((item) => item !== val));
      return;
    }
    const current = new Set<T>(props.value as T[]);
    if (current.has(val)) {
      current.delete(val);
    } else {
      current.add(val);
    }
    const next = allValues.filter((item) => current.has(item));
    if (next.length === allValues.length && allValues.length > 0) {
      props.onChange('all');
    } else {
      props.onChange(next);
    }
  };

  createEffect(() => {
    if (!open()) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef && !containerRef.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
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
    <div ref={containerRef} class={`relative ${props.class ?? 'w-full sm:w-[232px]'}`}>
      <button
        type="button"
        aria-label={props.ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open()}
        title={triggerTitle()}
        onClick={() => setOpen((v) => !v)}
        class={`flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border bg-[#14161B] px-3.5 text-xs font-medium whitespace-nowrap transition-colors ${
          open()
            ? 'border-[#3B82F6] text-[#F5F7FA]'
            : 'border-white/[0.08] text-[#F5F7FA] hover:border-white/20'
        }`}
      >
        <span class="flex min-w-0 flex-1 items-center gap-2">
          <Show when={previewDots().length > 0}>
            <span class="inline-flex shrink-0 items-center gap-1">
              <For each={previewDots()}>
                {(dot) => <HabitBadge appearanceRaw={dot} size="xs" />}
              </For>
            </span>
          </Show>
          <span
            class={`truncate ${
              !isAll() && selectedOptions().length === 0 ? 'text-[#8E95A5]' : 'text-[#F5F7FA]'
            }`}
          >
            {triggerText()}
          </span>
        </span>
        <ChevronDownIcon
          class={`h-3.5 w-3.5 shrink-0 text-[#8E95A5] transition-transform duration-150 ${
            open() ? 'rotate-180 text-[#60A5FA]' : ''
          }`}
        />
      </button>

      <Show when={open()}>
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={props.ariaLabel}
          class={`absolute z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/[0.1] bg-[#181B22]/95 p-1.5 shadow-2xl shadow-black/70 backdrop-blur-xl ${
            props.align === 'right' ? 'left-0 sm:right-0 sm:left-auto' : 'left-0'
          }`}
        >
          <div class="mb-1 flex items-center justify-between gap-2 border-b border-white/[0.06] px-2 pt-1 pb-2 text-[11px]">
            <button
              type="button"
              onClick={() => props.onChange('all')}
              class={`cursor-pointer rounded-lg px-2 py-1 font-medium transition-colors ${
                isAll()
                  ? 'bg-[#3B82F6]/15 text-[#60A5FA]'
                  : 'text-[#C8CDD8] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
              }`}
            >
              All
            </button>

            <div class="flex items-center gap-1">
              <Show when={props.quickPreset}>
                {(preset) => (
                  <button
                    type="button"
                    onClick={() => props.onChange([...preset().values])}
                    class={`cursor-pointer rounded-lg px-2 py-1 font-medium transition-colors ${
                      matchesQuickPreset()
                        ? 'bg-[#3B82F6]/15 text-[#60A5FA]'
                        : 'text-[#8E95A5] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
                    }`}
                  >
                    {preset().label}
                  </button>
                )}
              </Show>
              <Show when={selectedOptions().length > 0}>
                <button
                  type="button"
                  onClick={() => props.onChange([])}
                  class="cursor-pointer rounded-lg px-2 py-1 font-medium text-[#8E95A5] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
                >
                  Clear
                </button>
              </Show>
            </div>
          </div>

          <div class="max-h-64 space-y-0.5 overflow-y-auto overscroll-contain">
            <Show
              when={props.options.length > 0}
              fallback={
                <p class="px-3 py-3 text-center text-xs text-[#8E95A5]">No options available</p>
              }
            >
              <For each={props.options}>
                {(option) => {
                  const isChecked = () => selectedSet().has(option.value);
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={isChecked()}
                      onClick={() => toggleValue(option.value)}
                      class={`flex min-h-[38px] w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                        isChecked()
                          ? 'bg-[#3B82F6]/10 text-[#F5F7FA]'
                          : 'text-[#9AA1B1] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
                      }`}
                    >
                      <span class="flex min-w-0 flex-1 items-center gap-2.5">
                        <span
                          class={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                            isChecked()
                              ? 'border-[#3B82F6] bg-[#3B82F6] text-white'
                              : 'border-white/[0.18] bg-[#0A0B0E] text-transparent'
                          }`}
                        >
                          <CheckIcon class="h-3 w-3" />
                        </span>
                        <Show when={option.dotColor}>
                          {(dot) => <HabitBadge appearanceRaw={dot()} size="xs" />}
                        </Show>
                        <span class="truncate font-medium">{option.label}</span>
                      </span>
                      <Show when={option.hint}>
                        {(hint) => (
                          <span class="shrink-0 font-mono text-[11px] text-[#6B7280] tabular-nums">
                            {hint()}
                          </span>
                        )}
                      </Show>
                    </button>
                  );
                }}
              </For>
            </Show>
          </div>
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
  const initialDate = untrack(() => CivilCalendar.toLocalDate(props.value ?? props.todayDay));
  const [viewYear, setViewYear] = createSignal(initialDate.year);
  const [viewMonth, setViewMonth] = createSignal(initialDate.month);
  const [coords, setCoords] = createSignal<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 304,
  });
  let containerRef: HTMLDivElement | undefined;
  let popoverRef: HTMLDivElement | undefined;

  const updatePosition = () => {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const width = Math.min(304, vw - 24);
    const measuredHeight = popoverRef?.getBoundingClientRect().height || 344;
    const spaceAbove = rect.top - 12;
    const spaceBelow = vh - rect.bottom - 12;
    const preferTop = props.placement !== 'bottom';
    const openAbove = preferTop
      ? spaceAbove >= measuredHeight || spaceAbove >= spaceBelow
      : !(spaceBelow >= measuredHeight || spaceBelow >= spaceAbove);

    const rawTop = openAbove ? rect.top - measuredHeight - 8 : rect.bottom + 8;
    const maxTop = Math.max(8, vh - measuredHeight - 8);
    const top = Math.max(8, Math.min(rawTop, maxTop));
    const left = Math.max(12, Math.min(rect.left, vw - width - 12));
    setCoords({ top, left, width });
  };

  createEffect(() => {
    if (!open()) return;
    const target = CivilCalendar.toLocalDate(props.value ?? props.todayDay);
    setViewYear(target.year);
    setViewMonth(target.month);

    updatePosition();
    const rafId = window.requestAnimationFrame(() => updatePosition());

    const handlePointerDown = (e: PointerEvent) => {
      const targetNode = e.target as Node;
      const inTrigger = containerRef?.contains(targetNode) ?? false;
      const inPopover = popoverRef?.contains(targetNode) ?? false;
      if (!inTrigger && !inPopover) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };

    const handleReposition = () => updatePosition();

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    onCleanup(() => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    });
  });

  createEffect(() => {
    if (!open()) return;
    viewYear();
    viewMonth();
    const rafId = window.requestAnimationFrame(() => updatePosition());
    onCleanup(() => window.cancelAnimationFrame(rafId));
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

  const formattedLabel = createMemo(() => {
    const val = props.value;
    if (val === null) return props.placeholder ?? 'No due date';
    if (val === props.todayDay) return `Today · ${CivilCalendar.formatShortDate(val)}`;
    if (val === props.todayDay + 1) return `Tomorrow · ${CivilCalendar.formatShortDate(val)}`;
    return CivilCalendar.formatFullDate(val);
  });

  return (
    <div ref={containerRef} class="relative">
      <div class="flex items-center gap-2">
        <button
          id={props.id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open()}
          onClick={() => setOpen((v) => !v)}
          class={`flex h-11 flex-1 cursor-pointer items-center justify-between gap-3 rounded-xl border bg-[#0A0B0E] px-3.5 text-sm transition-colors ${
            open()
              ? 'border-[#3B82F6] text-[#F5F7FA]'
              : 'border-white/[0.1] text-[#F5F7FA] hover:border-white/25'
          }`}
        >
          <span class="flex min-w-0 items-center gap-2.5">
            <CalendarIcon
              class={`h-4 w-4 shrink-0 ${
                props.value !== null ? 'text-[#60A5FA]' : 'text-[#6B7280]'
              }`}
            />
            <span
              class={`truncate font-mono text-[13px] tabular-nums ${
                props.value === null ? 'font-sans text-[#6B7280]' : 'text-[#F5F7FA]'
              }`}
            >
              {formattedLabel()}
            </span>
          </span>
          <ChevronDownIcon
            class={`h-3.5 w-3.5 shrink-0 text-[#8E95A5] transition-transform duration-150 ${
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
            class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/[0.1] bg-[#0A0B0E] text-[#8E95A5] transition-colors hover:border-white/25 hover:text-[#F5F7FA]"
          >
            <CloseIcon class="h-4 w-4" />
          </button>
        </Show>
      </div>

      <Show when={open()}>
        <Portal>
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose date"
            style={{
              top: `${coords().top}px`,
              left: `${coords().left}px`,
              width: `${coords().width}px`,
            }}
            class="fixed z-[70] max-h-[calc(100dvh-16px)] space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.1] bg-[#181B22]/95 p-4 shadow-2xl shadow-black/75 backdrop-blur-xl"
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
                  class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#8E95A5] transition-colors hover:bg-white/[0.08] hover:text-[#F5F7FA]"
                >
                  <ChevronLeftIcon class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={goNextMonth}
                  aria-label="Next month"
                  class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#8E95A5] transition-colors hover:bg-white/[0.08] hover:text-[#F5F7FA]"
                >
                  <ChevronRightIcon class="h-4 w-4" />
                </button>
              </div>
            </div>

            <div class="grid grid-cols-7 gap-1 text-center">
              <For each={[0, 1, 2, 3, 4, 5, 6]}>
                {(bit) => (
                  <div class="py-1 text-[11px] font-medium text-[#6B7280]">
                    {CivilCalendar.weekdayShortLabel(bit).slice(0, 2)}
                  </div>
                )}
              </For>

              <For each={Array.from({ length: monthGrid().leadingEmpty })}>{() => <div />}</For>

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
                      class={`flex h-9 cursor-pointer items-center justify-center rounded-xl font-mono text-xs tabular-nums transition-colors ${
                        isSelected()
                          ? 'bg-[#3B82F6] font-semibold text-white'
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

            <div class="flex items-center justify-between border-t border-white/[0.08] pt-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  props.onChange(props.todayDay);
                  setOpen(false);
                }}
                class="cursor-pointer rounded-lg px-2.5 py-1.5 font-medium text-[#60A5FA] transition-colors hover:bg-[#3B82F6]/10"
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
                    class="cursor-pointer rounded-lg px-2.5 py-1.5 text-[#9AA1B1] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      props.onChange(null);
                      setOpen(false);
                    }}
                    class="cursor-pointer rounded-lg px-2.5 py-1.5 text-[#9AA1B1] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
                  >
                    No date
                  </button>
                </div>
              </Show>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  );
}

interface CustomTimePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

const HOURS_LIST = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_LIST = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const TIME_QUICK_PRESETS = ['09:00', '18:00', '20:00', '21:30'] as const;

export function CustomTimePicker(props: CustomTimePickerProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [coords, setCoords] = createSignal<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 268,
  });
  let containerRef: HTMLDivElement | undefined;
  let popoverRef: HTMLDivElement | undefined;
  let hoursColRef: HTMLDivElement | undefined;
  let minutesColRef: HTMLDivElement | undefined;

  const normalized = createMemo(() => ReminderPlanner.normalizeTime(props.value));
  const selectedHour = createMemo(() => normalized().split(':')[0]);
  const selectedMinute = createMemo(() => normalized().split(':')[1]);

  const updatePosition = () => {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const width = Math.min(276, vw - 24);
    const measuredHeight = popoverRef?.getBoundingClientRect().height || 312;
    const spaceAbove = rect.top - 12;
    const spaceBelow = vh - rect.bottom - 12;
    const openAbove = spaceAbove >= measuredHeight && spaceBelow < measuredHeight;

    const rawTop = openAbove ? rect.top - measuredHeight - 8 : rect.bottom + 8;
    const maxTop = Math.max(8, vh - measuredHeight - 8);
    const top = Math.max(8, Math.min(rawTop, maxTop));
    const left = Math.max(12, Math.min(rect.left, vw - width - 12));
    setCoords({ top, left, width });
  };

  const scrollSelectedIntoView = () => {
    const activeHour = hoursColRef?.querySelector<HTMLElement>('[data-active="true"]');
    activeHour?.scrollIntoView({ block: 'center' });
    const activeMinute = minutesColRef?.querySelector<HTMLElement>('[data-active="true"]');
    activeMinute?.scrollIntoView({ block: 'center' });
  };

  createEffect(() => {
    if (!open()) return;
    updatePosition();
    const rafId = window.requestAnimationFrame(() => {
      updatePosition();
      scrollSelectedIntoView();
    });

    const handlePointerDown = (e: PointerEvent) => {
      const targetNode = e.target as Node;
      const inTrigger = containerRef?.contains(targetNode) ?? false;
      const inPopover = popoverRef?.contains(targetNode) ?? false;
      if (!inTrigger && !inPopover) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };

    const handleReposition = () => updatePosition();

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    onCleanup(() => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    });
  });

  return (
    <div ref={containerRef} class="relative">
      <button
        id={props.id}
        type="button"
        aria-label={props.ariaLabel ?? 'Reminder time'}
        aria-haspopup="dialog"
        aria-expanded={open()}
        onClick={() => setOpen((v) => !v)}
        class={`flex h-10 w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl border bg-[#14161B] px-3.5 font-mono text-sm tabular-nums transition-colors ${
          open()
            ? 'border-[#3B82F6] text-[#F5F7FA]'
            : 'border-white/[0.1] text-[#F5F7FA] hover:border-white/25'
        }`}
      >
        <span class="flex min-w-0 items-center gap-2.5">
          <ClockIcon class="h-4 w-4 shrink-0 text-[#60A5FA]" />
          <span>{normalized()}</span>
        </span>
        <ChevronDownIcon
          class={`h-3.5 w-3.5 shrink-0 text-[#8E95A5] transition-transform duration-150 ${
            open() ? 'rotate-180 text-[#60A5FA]' : ''
          }`}
        />
      </button>

      <Show when={open()}>
        <Portal>
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose reminder time"
            style={{
              top: `${coords().top}px`,
              left: `${coords().left}px`,
              width: `${coords().width}px`,
            }}
            class="fixed z-[70] max-h-[calc(100dvh-16px)] space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.1] bg-[#181B22]/95 p-3.5 shadow-2xl shadow-black/75 backdrop-blur-xl"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-[#C8CDD8]">Pick time</span>
              <span class="font-mono text-xs font-semibold text-[#60A5FA] tabular-nums">
                {normalized()}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <span class="block text-center text-[10px] font-medium tracking-wider text-[#6B7280] uppercase">
                  Hour
                </span>
                <div
                  ref={hoursColRef}
                  class="h-44 space-y-0.5 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#0A0B0E] p-1"
                >
                  <For each={HOURS_LIST}>
                    {(hh) => {
                      const active = () => selectedHour() === hh;
                      return (
                        <button
                          type="button"
                          data-active={active() ? 'true' : undefined}
                          onClick={() => props.onChange(`${hh}:${selectedMinute()}`)}
                          class={`flex h-8 w-full cursor-pointer items-center justify-center rounded-lg font-mono text-xs tabular-nums transition-colors ${
                            active()
                              ? 'bg-[#3B82F6] font-semibold text-white'
                              : 'text-[#C8CDD8] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
                          }`}
                        >
                          {hh}
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>

              <div class="space-y-1">
                <span class="block text-center text-[10px] font-medium tracking-wider text-[#6B7280] uppercase">
                  Min
                </span>
                <div
                  ref={minutesColRef}
                  class="h-44 space-y-0.5 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#0A0B0E] p-1"
                >
                  <For each={MINUTES_LIST}>
                    {(mm) => {
                      const active = () => selectedMinute() === mm;
                      return (
                        <button
                          type="button"
                          data-active={active() ? 'true' : undefined}
                          onClick={() => props.onChange(`${selectedHour()}:${mm}`)}
                          class={`flex h-8 w-full cursor-pointer items-center justify-center rounded-lg font-mono text-xs tabular-nums transition-colors ${
                            active()
                              ? 'bg-[#3B82F6] font-semibold text-white'
                              : 'text-[#C8CDD8] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
                          }`}
                        >
                          {mm}
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between gap-1.5 border-t border-white/[0.08] pt-2">
              <div class="flex flex-wrap items-center gap-1">
                <For each={TIME_QUICK_PRESETS}>
                  {(preset) => (
                    <button
                      type="button"
                      onClick={() => {
                        props.onChange(preset);
                        setOpen(false);
                      }}
                      class={`cursor-pointer rounded-lg px-2 py-1 font-mono text-[11px] tabular-nums transition-colors ${
                        normalized() === preset
                          ? 'bg-[#3B82F6]/20 text-[#93C5FD]'
                          : 'text-[#8E95A5] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
                      }`}
                    >
                      {preset}
                    </button>
                  )}
                </For>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                class="shrink-0 cursor-pointer rounded-lg bg-[#3B82F6] px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[#2563EB]"
              >
                Done
              </button>
            </div>
          </div>
        </Portal>
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

    const handlePointerDown = (e: PointerEvent) => {
      const targetNode = e.target as Node;
      const inTrigger = containerRef?.contains(targetNode) ?? false;
      const inPopover = popoverRef?.contains(targetNode) ?? false;
      if (!inTrigger && !inPopover) {
        closePicker();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
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
      }
    };

    const handleViewportChange = () => updatePopoverLayout();
    const handleScroll = () => {
      if (popoverMode() === 'popover') {
        updatePopoverLayout();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleScroll, true);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    onCleanup(() => {
      window.cancelAnimationFrame(rafId);
      window.clearInterval(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleScroll, true);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
    });
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
        <p class="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-[#6B7280] uppercase">
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
                    ? 'bg-[#3B82F6]/15 font-medium text-[#F5F7FA]'
                    : 'text-[#C8CDD8] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
                }`}
              >
                <span>{option.label}</span>
                <Show when={isActive()}>
                  <CheckIcon class="h-3.5 w-3.5 shrink-0 text-[#60A5FA]" />
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
            <span class="block text-[10px] font-medium tracking-wider text-[#6B7280] uppercase">
              From
            </span>
            <button
              type="button"
              onClick={() => focusEdge('start')}
              aria-pressed={editingEdge() === 'start'}
              class={`flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border bg-[#0A0B0E] px-2.5 text-left transition-colors ${
                editingEdge() === 'start'
                  ? 'border-[#3B82F6] text-[#F5F7FA] ring-1 ring-[#3B82F6]/40'
                  : 'border-white/[0.08] text-[#F5F7FA] hover:border-white/25'
              }`}
            >
              <CalendarIcon
                class={`h-3.5 w-3.5 shrink-0 ${
                  editingEdge() === 'start' ? 'text-[#60A5FA]' : 'text-[#8E95A5]'
                }`}
              />
              <span class="truncate font-mono text-xs tabular-nums">
                {CivilCalendar.formatShortDateWithYear(activeVisualRange().startDay)}
              </span>
            </button>
          </div>

          <div class="space-y-1">
            <span class="block text-[10px] font-medium tracking-wider text-[#6B7280] uppercase">
              To
            </span>
            <button
              type="button"
              onClick={() => focusEdge('end')}
              aria-pressed={editingEdge() === 'end'}
              class={`flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border bg-[#0A0B0E] px-2.5 text-left transition-colors ${
                editingEdge() === 'end'
                  ? 'border-[#3B82F6] text-[#F5F7FA] ring-1 ring-[#3B82F6]/40'
                  : 'border-white/[0.08] text-[#F5F7FA] hover:border-white/25'
              }`}
            >
              <CalendarIcon
                class={`h-3.5 w-3.5 shrink-0 ${
                  editingEdge() === 'end' ? 'text-[#60A5FA]' : 'text-[#8E95A5]'
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
              class="-ml-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-display text-sm font-semibold text-[#F5F7FA] transition-colors hover:bg-white/[0.06]"
            >
              <span>{CivilCalendar.formatMonthYear(viewYear(), viewMonth())}</span>
              <ChevronDownIcon
                class={`h-3.5 w-3.5 text-[#8E95A5] transition-transform duration-150 ${
                  ymPickerOpen() ? 'rotate-180 text-[#60A5FA]' : ''
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
                class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[#8E95A5] transition-colors hover:bg-white/[0.08] hover:text-[#F5F7FA]"
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
                class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[#8E95A5] transition-colors hover:bg-white/[0.08] hover:text-[#F5F7FA]"
              >
                <ChevronRightIcon class="h-4 w-4" />
              </button>
            </div>
          </div>

          <Show
            when={!ymPickerOpen()}
            fallback={
              <div class="space-y-2.5 rounded-xl border border-white/[0.08] bg-[#0A0B0E] p-2.5">
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
                            ? 'bg-[#3B82F6] font-semibold text-white'
                            : 'text-[#8E95A5] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
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
                              ? 'border border-[#3B82F6]/40 bg-[#3B82F6]/20 text-[#60A5FA]'
                              : 'text-[#C8CDD8] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
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
                  <div class="py-0.5 text-[10px] font-medium text-[#6B7280]">
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
                          ? 'bg-[#3B82F6] font-semibold text-white'
                          : isInRange()
                            ? 'bg-[#3B82F6]/20 text-[#93C5FD]'
                            : isToday()
                              ? 'text-[#60A5FA] ring-1 ring-[#60A5FA]/60 hover:bg-[#3B82F6]/15'
                              : 'text-[#C8CDD8] hover:bg-white/[0.08] hover:text-[#F5F7FA]'
                      }`}
                    >
                      {local.day}
                    </button>
                  );
                }}
              </For>
            </div>
          </Show>

          <p class="font-mono text-[11px] text-[#8E95A5] tabular-nums">
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
            <span class="inline-flex items-center gap-1.5 text-xs font-medium text-[#C8CDD8]">
              <GlobeIcon class="h-3.5 w-3.5 text-[#60A5FA]" />
              <span>Timezone</span>
            </span>
            <span class="font-mono text-[11px] text-[#8E95A5] tabular-nums">
              {CivilCalendar.formatClockInTimeZone(clockNow(), props.timeZone)}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => props.onChangeTimeZone('UTC')}
              class={`h-8 cursor-pointer rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                props.timeZone === 'UTC'
                  ? 'border-[#3B82F6]/50 bg-[#3B82F6]/15 text-[#F5F7FA]'
                  : 'border-white/[0.08] bg-[#0A0B0E] text-[#8E95A5] hover:text-[#F5F7FA]'
              }`}
            >
              UTC
            </button>
            <button
              type="button"
              onClick={() => props.onChangeTimeZone('local')}
              class={`h-8 cursor-pointer rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                props.timeZone === 'local'
                  ? 'border-[#3B82F6]/50 bg-[#3B82F6]/15 text-[#F5F7FA]'
                  : 'border-white/[0.08] bg-[#0A0B0E] text-[#8E95A5] hover:text-[#F5F7FA]'
              }`}
            >
              Local ({deviceTimeZone().split('/').pop()?.replace(/_/g, ' ')})
            </button>
            <button
              type="button"
              onClick={() => setTzExpanded((v) => !v)}
              class={`ml-auto h-8 cursor-pointer rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                tzExpanded() || (props.timeZone !== 'UTC' && props.timeZone !== 'local')
                  ? 'border-white/20 bg-[#1C1F26] text-[#F5F7FA]'
                  : 'border-white/[0.08] bg-[#0A0B0E] text-[#8E95A5] hover:text-[#F5F7FA]'
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
                <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#6B7280]" />
                <input
                  type="text"
                  value={tzQuery()}
                  onInput={(e) => setTzQuery(e.currentTarget.value)}
                  placeholder="Search IANA timezone (e.g. Europe/Kyiv)..."
                  class="h-8 w-full rounded-lg border border-white/[0.08] bg-[#0A0B0E] pr-2.5 pl-8 text-xs text-[#F5F7FA] placeholder:text-[#5B6270] focus:border-[#3B82F6] focus:outline-none"
                />
              </div>
              <div class="max-h-32 space-y-0.5 overflow-y-auto overscroll-contain rounded-lg border border-white/[0.08] bg-[#0A0B0E] p-1">
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
                          ? 'bg-[#3B82F6]/20 text-[#F5F7FA]'
                          : 'text-[#9AA1B1] hover:bg-white/[0.06] hover:text-[#F5F7FA]'
                      }`}
                    >
                      <span class="truncate">{tz}</span>
                      <Show when={props.timeZone === tz}>
                        <CheckIcon class="h-3 w-3 shrink-0 text-[#60A5FA]" />
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
        class={`flex h-10 max-w-full shrink-0 cursor-pointer items-center gap-2 rounded-xl border bg-[#14161B] px-3.5 text-xs font-medium whitespace-nowrap text-[#F5F7FA] transition-colors sm:gap-2.5 ${
          open() ? 'border-[#3B82F6]' : 'border-white/[0.08] hover:border-white/20'
        }`}
      >
        <CalendarIcon class="h-3.5 w-3.5 shrink-0 text-[#60A5FA]" />
        <span class="min-w-0 truncate">{props.resolvedRange.label}</span>
        <span class="hidden text-[#6B7280] sm:inline" aria-hidden="true">
          ·
        </span>
        <span class="hidden font-mono text-[#9AA1B1] tabular-nums sm:inline">
          {DateRangeResolver.formatRangeLabel(
            props.resolvedRange.startDay,
            Math.min(props.resolvedRange.endDay, props.todayDay)
          )}
        </span>
        <span class="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-[#C8CDD8]">
          {tzChipLabel()}
        </span>
        <ChevronDownIcon
          class={`h-3.5 w-3.5 shrink-0 text-[#8E95A5] transition-transform duration-150 ${
            open() ? 'rotate-180 text-[#60A5FA]' : ''
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
                class="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#181B22]/95 shadow-2xl shadow-black/75 backdrop-blur-xl"
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
                class="max-h-modal flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.1] bg-[#181B22] shadow-2xl shadow-black/75 sm:max-w-[660px] sm:rounded-2xl"
              >
                <div class="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-3 sm:px-5">
                  <span class="font-display text-sm font-semibold text-[#F5F7FA]">
                    Date Range &amp; Timezone
                  </span>
                  <button
                    type="button"
                    onClick={closePicker}
                    aria-label="Close date range picker"
                    class="flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-full text-[#8E95A5] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
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

interface MeasuredQuickControlsProps {
  habitName: string;
  accentColor: string;
  unit?: string | null;
  value: number;
  target: number;
  onIncrement: (delta: number) => Promise<void>;
  onSetValue: (value: number) => Promise<void>;
}

export function MeasuredQuickControls(props: MeasuredQuickControlsProps): JSX.Element {
  const formattedPropValue = () =>
    props.value > 0 ? HabitSchedule.formatNumericValue(props.value) : '';

  const [draft, setDraft] = createSignal(formattedPropValue());
  const [focused, setFocused] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  // Only sync draft when props.value itself changes externally — never overwrite
  // typed input merely because `focused` flipped to false before commitDraft ran.
  createEffect(
    on(formattedPropValue, (next) => {
      if (!untrack(focused) && !untrack(busy)) {
        setDraft(next);
      }
    })
  );

  const progressPct = () => {
    if (props.target <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((props.value / props.target) * 100)));
  };

  const parsedDraft = (): number | null => {
    const clean = draft().trim().replace(',', '.');
    if (clean === '') return 0;
    const n = Number(clean);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  };

  const isDirty = () => {
    const parsed = parsedDraft();
    return parsed !== null && parsed !== props.value;
  };

  const commitDraft = async () => {
    if (busy()) return;
    const parsed = parsedDraft();
    if (parsed === null) {
      setDraft(formattedPropValue());
      return;
    }
    if (parsed === props.value) {
      setDraft(formattedPropValue());
      return;
    }
    setBusy(true);
    try {
      await props.onSetValue(parsed);
    } finally {
      setBusy(false);
      if (!focused()) {
        setDraft(formattedPropValue());
      }
    }
  };

  const handleIncrement = async (delta: number) => {
    if (busy()) return;
    const pendingVal = isDirty() ? parsedDraft() : null;
    setBusy(true);
    try {
      if (pendingVal !== null) {
        await props.onSetValue(Math.round((pendingVal + delta) * 100) / 100);
      } else {
        await props.onIncrement(delta);
      }
    } finally {
      setBusy(false);
      setDraft(formattedPropValue());
    }
  };

  return (
    <div class="space-y-2">
      <div class="h-1 w-full overflow-hidden rounded-full border border-white/[0.05] bg-[#0A0B0E]">
        <div
          class="h-full rounded-full transition-all duration-200"
          style={{
            width: `${progressPct()}%`,
            'background-color': props.accentColor,
          }}
        />
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={busy()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void handleIncrement(1)}
          aria-label={`Add 1${props.unit ? ` ${props.unit}` : ''} to ${props.habitName}`}
          class="min-h-[38px] shrink-0 cursor-pointer rounded-xl border border-white/[0.08] bg-[#0A0B0E] px-3 font-mono text-xs font-medium text-[#F5F7FA] tabular-nums transition-colors hover:bg-[#1C1F26] disabled:opacity-50"
        >
          +1
        </button>

        <button
          type="button"
          disabled={busy()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void handleIncrement(5)}
          aria-label={`Add 5${props.unit ? ` ${props.unit}` : ''} to ${props.habitName}`}
          class="min-h-[38px] shrink-0 cursor-pointer rounded-xl border border-white/[0.08] bg-[#0A0B0E] px-3 font-mono text-xs font-medium text-[#F5F7FA] tabular-nums transition-colors hover:bg-[#1C1F26] disabled:opacity-50"
        >
          +5
        </button>

        <div class="flex items-center gap-1.5">
          <div class="relative flex items-center">
            <input
              ref={inputRef}
              type="text"
              inputmode="decimal"
              aria-label={`Set ${props.habitName} value${props.unit ? ` (${props.unit})` : ''}`}
              placeholder="0"
              value={draft()}
              onFocus={() => setFocused(true)}
              onInput={(e) => setDraft(e.currentTarget.value)}
              onBlur={() => {
                setFocused(false);
                void commitDraft();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setFocused(false);
                  void commitDraft().then(() => inputRef?.blur());
                } else if (e.key === 'Escape') {
                  setDraft(formattedPropValue());
                  setFocused(false);
                  e.currentTarget.blur();
                }
              }}
              class="min-h-[38px] w-20 rounded-xl border border-white/[0.1] bg-[#0A0B0E] px-2.5 font-mono text-xs text-[#F5F7FA] tabular-nums placeholder:text-[#5B6270] focus:border-[#3B82F6] focus:outline-none"
            />
          </div>

          <Show when={props.unit}>
            <span class="shrink-0 text-[11px] text-[#8E95A5]">{props.unit}</span>
          </Show>

          <Show when={isDirty()}>
            <button
              type="button"
              disabled={busy()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setFocused(false);
                void commitDraft().then(() => inputRef?.blur());
              }}
              aria-label={`Apply value for ${props.habitName}`}
              class="inline-flex min-h-[38px] shrink-0 cursor-pointer items-center justify-center rounded-xl bg-[#3B82F6] px-2.5 text-xs font-medium text-white hover:bg-[#2563EB] disabled:opacity-50"
            >
              <CheckIcon class="h-3.5 w-3.5" />
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}

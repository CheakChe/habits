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
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from '../Icons';
import { computeClampedPopoverPosition, usePopoverDismiss } from './use-popover-dismiss';

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
    setCoords(
      computeClampedPopoverPosition({
        rect: containerRef.getBoundingClientRect(),
        preferredWidth: 304,
        estimatedHeight: 344,
        measuredHeight: popoverRef?.getBoundingClientRect().height,
        placementMode: props.placement === 'bottom' ? 'prefer-bottom' : 'prefer-top',
      })
    );
  };

  createEffect(() => {
    if (!open()) return;
    const target = CivilCalendar.toLocalDate(props.value ?? props.todayDay);
    setViewYear(target.year);
    setViewMonth(target.month);

    updatePosition();
    const rafId = window.requestAnimationFrame(() => updatePosition());
    onCleanup(() => window.cancelAnimationFrame(rafId));
  });

  usePopoverDismiss({
    open,
    getContainer: () => containerRef,
    getPopover: () => popoverRef,
    onDismiss: () => setOpen(false),
    onReposition: () => updatePosition(),
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
          class={`flex h-11 flex-1 cursor-pointer items-center justify-between gap-3 rounded-xl border bg-canvas px-3.5 text-sm transition-colors ${
            open() ? 'border-accent text-ink' : 'border-white/[0.1] text-ink hover:border-white/25'
          }`}
        >
          <span class="flex min-w-0 items-center gap-2.5">
            <CalendarIcon
              class={`h-4 w-4 shrink-0 ${
                props.value !== null ? 'text-accent-soft' : 'text-ink-dim'
              }`}
            />
            <span
              class={`truncate font-mono text-[13px] tabular-nums ${
                props.value === null ? 'font-sans text-ink-dim' : 'text-ink'
              }`}
            >
              {formattedLabel()}
            </span>
          </span>
          <ChevronDownIcon
            class={`h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform duration-150 ${
              open() ? 'rotate-180 text-accent-soft' : ''
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
            class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/[0.1] bg-canvas text-ink-subtle transition-colors hover:border-white/25 hover:text-ink"
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
            class="fixed z-[70] max-h-[calc(100dvh-16px)] space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.1] bg-surface-popover/95 p-4 shadow-2xl shadow-black/75 backdrop-blur-xl"
          >
            <div class="flex items-center justify-between">
              <span class="font-display text-sm font-semibold text-ink">
                {CivilCalendar.formatMonthYear(viewYear(), viewMonth())}
              </span>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  aria-label="Previous month"
                  class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-white/[0.08] hover:text-ink"
                >
                  <ChevronLeftIcon class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={goNextMonth}
                  aria-label="Next month"
                  class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-white/[0.08] hover:text-ink"
                >
                  <ChevronRightIcon class="h-4 w-4" />
                </button>
              </div>
            </div>

            <div class="grid grid-cols-7 gap-1 text-center">
              <For each={[0, 1, 2, 3, 4, 5, 6]}>
                {(bit) => (
                  <div class="py-1 text-[11px] font-medium text-ink-dim">
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
                          ? 'bg-accent font-semibold text-white'
                          : isToday()
                            ? 'bg-accent/15 text-accent-soft ring-1 ring-accent/50 hover:bg-accent/25'
                            : 'text-ink-secondary hover:bg-white/[0.08] hover:text-ink'
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
                class="cursor-pointer rounded-lg px-2.5 py-1.5 font-medium text-accent-soft transition-colors hover:bg-accent/10"
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
                    class="cursor-pointer rounded-lg px-2.5 py-1.5 text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      props.onChange(null);
                      setOpen(false);
                    }}
                    class="cursor-pointer rounded-lg px-2.5 py-1.5 text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
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

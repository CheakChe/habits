import { For, JSX, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { ReminderPlanner } from '../../utils/reminder-planner';
import { ChevronDownIcon, ClockIcon } from '../Icons';
import { computeClampedPopoverPosition, usePopoverDismiss } from './use-popover-dismiss';

interface TimePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

const HOURS_LIST = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_LIST = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const TIME_QUICK_PRESETS = ['09:00', '18:00', '20:00', '21:30'] as const;

export function TimePicker(props: TimePickerProps): JSX.Element {
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
    setCoords(
      computeClampedPopoverPosition({
        rect: containerRef.getBoundingClientRect(),
        preferredWidth: 276,
        estimatedHeight: 312,
        measuredHeight: popoverRef?.getBoundingClientRect().height,
        placementMode: 'below-or-above',
      })
    );
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
    onCleanup(() => window.cancelAnimationFrame(rafId));
  });

  usePopoverDismiss({
    open,
    getContainer: () => containerRef,
    getPopover: () => popoverRef,
    onDismiss: () => setOpen(false),
    onReposition: () => updatePosition(),
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
        class={`flex h-10 w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl border bg-surface px-3.5 font-mono text-sm tabular-nums transition-colors ${
          open() ? 'border-accent text-ink' : 'border-white/[0.1] text-ink hover:border-white/25'
        }`}
      >
        <span class="flex min-w-0 items-center gap-2.5">
          <ClockIcon class="h-4 w-4 shrink-0 text-accent-soft" />
          <span>{normalized()}</span>
        </span>
        <ChevronDownIcon
          class={`h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform duration-150 ${
            open() ? 'rotate-180 text-accent-soft' : ''
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
            class="fixed z-[70] max-h-[calc(100dvh-16px)] space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.1] bg-surface-popover/95 p-3.5 shadow-2xl shadow-black/75 backdrop-blur-xl"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-ink-secondary">Pick time</span>
              <span class="font-mono text-xs font-semibold text-accent-soft tabular-nums">
                {normalized()}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <span class="block text-center text-[10px] font-medium tracking-wider text-ink-dim uppercase">
                  Hour
                </span>
                <div
                  ref={hoursColRef}
                  class="h-44 space-y-0.5 overflow-y-auto rounded-xl border border-white/[0.08] bg-canvas p-1"
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
                              ? 'bg-accent font-semibold text-white'
                              : 'text-ink-secondary hover:bg-white/[0.06] hover:text-ink'
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
                <span class="block text-center text-[10px] font-medium tracking-wider text-ink-dim uppercase">
                  Min
                </span>
                <div
                  ref={minutesColRef}
                  class="h-44 space-y-0.5 overflow-y-auto rounded-xl border border-white/[0.08] bg-canvas p-1"
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
                              ? 'bg-accent font-semibold text-white'
                              : 'text-ink-secondary hover:bg-white/[0.06] hover:text-ink'
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
                          ? 'bg-accent/20 text-accent-tint'
                          : 'text-ink-subtle hover:bg-white/[0.06] hover:text-ink'
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
                class="shrink-0 cursor-pointer rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent-hover"
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

import { For, JSX, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { HabitBadge } from '../HabitBadge';
import { CheckIcon, ChevronDownIcon } from '../Icons';
import { computeClampedPopoverPosition, usePopoverDismiss } from './use-popover-dismiss';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
  dotColor?: string;
}

interface SelectProps<T extends string | number> {
  id?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  class?: string;
  fullWidth?: boolean;
  portal?: boolean;
}

export function Select<T extends string | number>(props: SelectProps<T>): JSX.Element {
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
    setCoords(
      computeClampedPopoverPosition({
        rect,
        preferredWidth: Math.max(rect.width, 224),
        estimatedHeight: 240,
        measuredHeight: popoverRef?.getBoundingClientRect().height,
        placementMode: 'below-or-above',
      })
    );
  };

  createEffect(() => {
    if (!open() || !props.portal) return;
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
          ? 'fixed z-[70] max-h-64 overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.1] bg-surface-popover/95 p-1.5 shadow-2xl shadow-black/75 backdrop-blur-xl'
          : 'absolute left-0 z-50 mt-2 max-h-64 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.1] bg-surface-popover/95 p-1.5 shadow-2xl shadow-black/70 backdrop-blur-xl sm:right-0 sm:left-auto'
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
                  ? 'bg-accent/15 text-ink'
                  : 'text-ink-secondary hover:bg-white/[0.06] hover:text-ink'
              }`}
            >
              <span class="flex min-w-0 items-center gap-2.5">
                <Show when={option.dotColor}>
                  {(dot) => <HabitBadge appearanceRaw={dot()} size="xs" />}
                </Show>
                <span class="truncate font-medium">{option.label}</span>
                <Show when={option.hint}>
                  {(hint) => <span class="shrink-0 text-[11px] text-ink-dim">{hint()}</span>}
                </Show>
              </span>
              <Show when={isSelected()}>
                <CheckIcon class="h-3.5 w-3.5 shrink-0 text-accent-soft" />
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
        class={`flex h-10 max-w-full cursor-pointer items-center justify-between gap-3 rounded-xl border bg-surface px-3.5 text-xs font-medium whitespace-nowrap text-ink transition-colors ${
          props.fullWidth ? 'w-full' : 'min-w-[140px] shrink-0 sm:min-w-[180px]'
        } ${open() ? 'border-accent' : 'border-white/[0.08] hover:border-white/20'}`}
      >
        <span class="flex min-w-0 items-center gap-2">
          <Show when={selectedOption()?.dotColor}>
            {(dot) => <HabitBadge appearanceRaw={dot()} size="xs" />}
          </Show>
          <span class="truncate">{selectedOption()?.label ?? ''}</span>
        </span>
        <ChevronDownIcon
          class={`h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform duration-150 ${
            open() ? 'rotate-180 text-accent-soft' : ''
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

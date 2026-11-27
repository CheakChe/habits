import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { HabitBadge } from '../HabitBadge';
import { CheckIcon, ChevronDownIcon } from '../Icons';
import { SelectOption } from './Select';
import { usePopoverDismiss } from './use-popover-dismiss';

export interface MultiSelectQuickPreset<T extends string | number> {
  label: string;
  triggerLabel?: string;
  values: T[];
}

interface MultiSelectProps<T extends string | number> {
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

export function MultiSelect<T extends string | number>(props: MultiSelectProps<T>): JSX.Element {
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

  usePopoverDismiss({
    open,
    getContainer: () => containerRef,
    onDismiss: () => setOpen(false),
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
        class={`flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border bg-surface px-3.5 text-xs font-medium whitespace-nowrap transition-colors ${
          open() ? 'border-accent text-ink' : 'border-white/[0.08] text-ink hover:border-white/20'
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
              !isAll() && selectedOptions().length === 0 ? 'text-ink-subtle' : 'text-ink'
            }`}
          >
            {triggerText()}
          </span>
        </span>
        <ChevronDownIcon
          class={`h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform duration-150 ${
            open() ? 'rotate-180 text-accent-soft' : ''
          }`}
        />
      </button>

      <Show when={open()}>
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={props.ariaLabel}
          class={`absolute z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/[0.1] bg-surface-popover/95 p-1.5 shadow-2xl shadow-black/70 backdrop-blur-xl ${
            props.align === 'right' ? 'left-0 sm:right-0 sm:left-auto' : 'left-0'
          }`}
        >
          <div class="mb-1 flex items-center justify-between gap-2 border-b border-white/[0.06] px-2 pt-1 pb-2 text-[11px]">
            <button
              type="button"
              onClick={() => props.onChange('all')}
              class={`cursor-pointer rounded-lg px-2 py-1 font-medium transition-colors ${
                isAll()
                  ? 'bg-accent/15 text-accent-soft'
                  : 'text-ink-secondary hover:bg-white/[0.06] hover:text-ink'
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
                        ? 'bg-accent/15 text-accent-soft'
                        : 'text-ink-subtle hover:bg-white/[0.06] hover:text-ink'
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
                  class="cursor-pointer rounded-lg px-2 py-1 font-medium text-ink-subtle transition-colors hover:bg-white/[0.06] hover:text-ink"
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
                <p class="px-3 py-3 text-center text-xs text-ink-subtle">No options available</p>
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
                          ? 'bg-accent/10 text-ink'
                          : 'text-ink-muted hover:bg-white/[0.06] hover:text-ink'
                      }`}
                    >
                      <span class="flex min-w-0 flex-1 items-center gap-2.5">
                        <span
                          class={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                            isChecked()
                              ? 'border-accent bg-accent text-white'
                              : 'border-white/[0.18] bg-canvas text-transparent'
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
                          <span class="shrink-0 font-mono text-[11px] text-ink-dim tabular-nums">
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

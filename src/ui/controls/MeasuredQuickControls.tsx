import { JSX, Show, createEffect, createSignal, on, untrack } from 'solid-js';
import { HabitSchedule } from '../../utils/habit-schedule';
import { CheckIcon } from '../Icons';

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
      <div class="h-1 w-full overflow-hidden rounded-full border border-white/[0.05] bg-canvas">
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
          class="min-h-[38px] shrink-0 cursor-pointer rounded-xl border border-white/[0.08] bg-canvas px-3 font-mono text-xs font-medium text-ink tabular-nums transition-colors hover:bg-surface-elevated disabled:opacity-50"
        >
          +1
        </button>

        <button
          type="button"
          disabled={busy()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void handleIncrement(5)}
          aria-label={`Add 5${props.unit ? ` ${props.unit}` : ''} to ${props.habitName}`}
          class="min-h-[38px] shrink-0 cursor-pointer rounded-xl border border-white/[0.08] bg-canvas px-3 font-mono text-xs font-medium text-ink tabular-nums transition-colors hover:bg-surface-elevated disabled:opacity-50"
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
              class="min-h-[38px] w-20 rounded-xl border border-white/[0.1] bg-canvas px-2.5 font-mono text-xs text-ink tabular-nums placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
          </div>

          <Show when={props.unit}>
            <span class="shrink-0 text-[11px] text-ink-subtle">{props.unit}</span>
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
              class="inline-flex min-h-[38px] shrink-0 cursor-pointer items-center justify-center rounded-xl bg-accent px-2.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <CheckIcon class="h-3.5 w-3.5" />
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}

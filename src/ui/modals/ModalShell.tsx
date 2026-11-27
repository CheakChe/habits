import { JSX, Show, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { CloseIcon } from '../Icons';
import { useBodyScrollLock } from '../scroll-lock';

interface ModalShellProps {
  open: boolean;
  titleId: string;
  onClose: () => void;
  busy?: boolean;
  closeOnBackdrop?: boolean;
  maxWidthClass?: string;
  children: JSX.Element;
}

export function ModalShell(props: ModalShellProps): JSX.Element {
  useBodyScrollLock(() => props.open);

  createEffect(() => {
    if (!props.open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !props.busy) {
        props.onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-end justify-center overscroll-none bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={props.titleId}
          onClick={(e) => {
            if (props.closeOnBackdrop && e.target === e.currentTarget && !props.busy) {
              props.onClose();
            }
          }}
        >
          <div
            class={`max-h-modal flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-surface ${
              props.maxWidthClass ?? 'sm:max-w-md'
            } sm:rounded-3xl`}
          >
            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  );
}

interface ModalHeaderProps {
  titleId: string;
  title: string;
  subtitle?: string;
  icon?: JSX.Element;
  onClose: () => void;
  closeDisabled?: boolean;
  compactHorizontal?: boolean;
}

export function ModalHeader(props: ModalHeaderProps): JSX.Element {
  return (
    <div
      class={`flex shrink-0 justify-between border-b border-white/[0.06] pt-5 pb-3 sm:pt-6 ${
        props.icon || props.subtitle ? 'items-start gap-3' : 'items-center gap-2'
      } ${props.compactHorizontal ? 'px-5 sm:px-6' : 'px-6'}`}
    >
      <Show
        when={props.icon || props.subtitle}
        fallback={
          <h2 id={props.titleId} class="min-w-0 font-display text-lg font-semibold text-ink">
            {props.title}
          </h2>
        }
      >
        <div class="flex min-w-0 flex-1 items-start gap-3">
          <Show when={props.icon}>
            {(icon) => (
              <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent-soft">
                {icon()}
              </div>
            )}
          </Show>
          <div class="min-w-0 flex-1 space-y-0.5">
            <h2 id={props.titleId} class="font-display text-lg font-semibold text-ink">
              {props.title}
            </h2>
            <Show when={props.subtitle}>
              {(subtitle) => <p class="text-xs text-ink-subtle">{subtitle()}</p>}
            </Show>
          </div>
        </div>
      </Show>
      <button
        type="button"
        onClick={() => props.onClose()}
        disabled={props.closeDisabled}
        aria-label="Close modal"
        class="flex min-h-[40px] min-w-[40px] shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
      >
        <CloseIcon class="h-4 w-4" />
      </button>
    </div>
  );
}

import { Accessor, createEffect, onCleanup } from 'solid-js';

export interface ClampedPopoverCoords {
  top: number;
  left: number;
  width: number;
}

export interface ComputeClampedPopoverOptions {
  rect: DOMRect;
  preferredWidth: number;
  estimatedHeight: number;
  measuredHeight?: number;
  placementMode?: 'below-or-above' | 'prefer-top' | 'prefer-bottom';
}

export function computeClampedPopoverPosition(
  options: ComputeClampedPopoverOptions
): ClampedPopoverCoords {
  const { rect, preferredWidth, estimatedHeight, measuredHeight, placementMode } = options;
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const width = Math.min(preferredWidth, vw - 24);
  const height = measuredHeight || estimatedHeight;
  const spaceAbove = rect.top - 12;
  const spaceBelow = vh - rect.bottom - 12;

  let openAbove: boolean;
  if (placementMode === 'prefer-top') {
    openAbove = spaceAbove >= height || spaceAbove >= spaceBelow;
  } else if (placementMode === 'prefer-bottom') {
    openAbove = !(spaceBelow >= height || spaceBelow >= spaceAbove);
  } else {
    openAbove = spaceAbove >= height && spaceBelow < height;
  }

  const rawTop = openAbove ? rect.top - height - 8 : rect.bottom + 8;
  const maxTop = Math.max(8, vh - height - 8);
  const top = Math.max(8, Math.min(rawTop, maxTop));
  const left = Math.max(12, Math.min(rect.left, vw - width - 12));
  return { top, left, width };
}

export interface UsePopoverDismissOptions {
  open: Accessor<boolean>;
  getContainer: () => HTMLElement | undefined;
  getPopover?: () => HTMLElement | undefined;
  onDismiss: () => void;
  onEscape?: () => void;
  onReposition?: () => void;
  listenVisualViewport?: boolean;
}

export function usePopoverDismiss(options: UsePopoverDismissOptions): void {
  createEffect(() => {
    if (!options.open()) return;

    const handlePointerDown = (e: PointerEvent) => {
      const targetNode = e.target as Node;
      const inTrigger = options.getContainer()?.contains(targetNode) ?? false;
      const inPopover = options.getPopover?.()?.contains(targetNode) ?? false;
      if (!inTrigger && !inPopover) {
        options.onDismiss();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (options.onEscape) {
          options.onEscape();
        } else {
          options.onDismiss();
        }
      }
    };

    const handleReposition = () => {
      options.onReposition?.();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    if (options.onReposition) {
      window.addEventListener('resize', handleReposition);
      window.addEventListener('scroll', handleReposition, true);
      if (options.listenVisualViewport) {
        window.visualViewport?.addEventListener('resize', handleReposition);
      }
    }

    onCleanup(() => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      if (options.onReposition) {
        window.removeEventListener('resize', handleReposition);
        window.removeEventListener('scroll', handleReposition, true);
        if (options.listenVisualViewport) {
          window.visualViewport?.removeEventListener('resize', handleReposition);
        }
      }
    });
  });
}

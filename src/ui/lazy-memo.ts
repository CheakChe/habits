import { Accessor, createMemo, untrack } from 'solid-js';

/**
 * Lazily computes and caches a derived value while `isActive()` is true.
 * Preserves the cached result across tab/view unmounts as long as tracked
 * dependencies do not change, and avoids recomputing while inactive until
 * the consumer becomes active again.
 */
export function createLazyActiveMemo<T>(
  isActive: Accessor<boolean>,
  trackDeps: () => void,
  compute: () => T
): Accessor<T | null> {
  const version = createMemo<number>((prev = 0) => {
    trackDeps();
    return prev + 1;
  });

  const activeVersion = createMemo<number | null>((prev = null) => (isActive() ? version() : prev));

  return createMemo<T | null>(() => {
    const currentVersion = activeVersion();
    if (currentVersion === null) return null;
    return untrack(compute);
  });
}

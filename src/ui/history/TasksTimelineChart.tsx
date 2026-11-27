import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { TaskOutcomeBucket, TaskRangeSummary } from '../../utils/task-analytics';

interface TasksTimelineChartProps {
  rangeLabel: string;
  taskSummary: TaskRangeSummary;
  taskOutcomeBuckets: TaskOutcomeBucket[];
}

export function TasksTimelineChart(props: TasksTimelineChartProps): JSX.Element {
  const [hoveredTaskBucketKey, setHoveredTaskBucketKey] = createSignal<string | null>(null);

  const maxBucketCount = createMemo(() =>
    Math.max(1, ...props.taskOutcomeBuckets.map((b) => b.doneCount + b.notDoneCount))
  );

  const hoveredTaskBucket = createMemo(() => {
    const key = hoveredTaskBucketKey();
    if (!key) return null;
    return props.taskOutcomeBuckets.find((b) => b.key === key) ?? null;
  });

  return (
    <section class="flex flex-col justify-between space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6 lg:col-span-7">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="font-display text-base font-semibold text-ink">Tasks Timeline</h2>
          <p class="font-mono text-xs text-ink-subtle tabular-nums">
            <Show when={hoveredTaskBucket()} fallback={<span>{props.rangeLabel}</span>}>
              {(b) => (
                <span class="text-ink">
                  {b().label} · {b().doneCount} done · {b().notDoneCount} not done
                  {b().archivedCount > 0 ? ` · ${b().archivedCount} arch` : ''}
                </span>
              )}
            </Show>
          </p>
        </div>
        <div class="flex items-center gap-3 text-[11px] text-ink-subtle">
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-[2px] bg-accent" />
            <span>Done</span>
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-[2px] bg-danger/80" />
            <span>Not Done</span>
          </span>
        </div>
      </div>

      <Show
        when={
          props.taskSummary.doneCount > 0 ||
          props.taskSummary.notDoneCount > 0 ||
          props.taskSummary.archivedCount > 0
        }
        fallback={
          <div class="py-12 text-center">
            <p class="text-sm text-ink-subtle">No task outcomes in the selected date range.</p>
          </div>
        }
      >
        <div class="flex h-40 items-end gap-1 pt-4 sm:gap-2">
          <For each={props.taskOutcomeBuckets}>
            {(bucket) => {
              const total = () => bucket.doneCount + bucket.notDoneCount;
              const totalPct = () => Math.round((total() / maxBucketCount()) * 100);
              const doneShare = () => (total() === 0 ? 0 : (bucket.doneCount / total()) * 100);
              const notDoneShare = () =>
                total() === 0 ? 0 : (bucket.notDoneCount / total()) * 100;
              return (
                <div
                  class="flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end gap-1.5"
                  onMouseEnter={() => setHoveredTaskBucketKey(bucket.key)}
                  onMouseLeave={() => setHoveredTaskBucketKey(null)}
                >
                  <span class="h-4 shrink-0 font-mono text-[11px] leading-4 text-ink-subtle tabular-nums">
                    {total() > 0 ? total() : ''}
                  </span>
                  <div class="flex w-full flex-1 items-end">
                    <Show
                      when={total() > 0}
                      fallback={<div class="h-[3px] w-full rounded-t-md bg-white/[0.05]" />}
                    >
                      <div
                        class={`flex w-full flex-col justify-end overflow-hidden rounded-t-md transition-opacity ${
                          hoveredTaskBucketKey() && hoveredTaskBucketKey() !== bucket.key
                            ? 'opacity-60'
                            : 'opacity-100'
                        }`}
                        style={{ height: `${Math.max(12, totalPct())}%` }}
                        title={`${bucket.label}: ${bucket.doneCount} done, ${bucket.notDoneCount} not done${
                          bucket.archivedCount > 0 ? `, ${bucket.archivedCount} archived` : ''
                        }`}
                      >
                        <Show when={bucket.notDoneCount > 0}>
                          <div
                            class="w-full bg-danger/80"
                            style={{ height: `${notDoneShare()}%` }}
                          />
                        </Show>
                        <Show when={bucket.doneCount > 0}>
                          <div class="w-full bg-accent" style={{ height: `${doneShare()}%` }} />
                        </Show>
                      </div>
                    </Show>
                  </div>
                  <span class="h-4 max-w-full shrink-0 truncate font-mono text-[11px] leading-4 text-ink-subtle tabular-nums">
                    {bucket.shortLabel}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );
}

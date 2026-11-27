import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { TaskRangeSummary } from '../../utils/task-analytics';

interface TaskDisciplineDonutProps {
  taskSummary: TaskRangeSummary;
}

export function TaskDisciplineDonut(props: TaskDisciplineDonutProps): JSX.Element {
  const [hoveredTaskSegment, setHoveredTaskSegment] = createSignal<string | null>(null);

  const taskSegments = createMemo(() => {
    const s = props.taskSummary;
    const raw = [
      { key: 'on_time', label: 'On time', count: s.onTimeCount, color: '#3B82F6' },
      { key: 'late', label: 'Late', count: s.lateCount, color: '#F59E0B' },
      { key: 'goal_done', label: 'Goals done', count: s.goalsDoneCount, color: '#60A5FA' },
      { key: 'not_done', label: 'Not Done', count: s.notDoneCount, color: '#EF4444' },
      { key: 'archived', label: 'Archived', count: s.archivedCount, color: '#6B7280' },
    ];
    const total = raw.reduce((acc, item) => acc + item.count, 0);
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    let accumulated = 0;

    const arcs = raw.map((item) => {
      const length = total === 0 ? 0 : (item.count / total) * circumference;
      const offset = -accumulated;
      accumulated += length;
      const sharePct = total === 0 ? 0 : Math.round((item.count / total) * 100);
      return {
        ...item,
        length,
        offset,
        sharePct,
      };
    });

    return { total, radius, circumference, arcs };
  });

  const hoveredDonutSegment = createMemo(() => {
    const key = hoveredTaskSegment();
    if (!key) return null;
    return taskSegments().arcs.find((a) => a.key === key && a.count > 0) ?? null;
  });

  return (
    <section class="flex flex-col justify-between space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6 lg:col-span-5">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="font-display text-base font-semibold text-ink">Task Discipline</h2>
          <p class="font-mono text-xs text-ink-subtle tabular-nums">
            {taskSegments().total} total outcomes · Excl. archived from rate
          </p>
        </div>
      </div>

      <Show
        when={taskSegments().total > 0}
        fallback={
          <div class="py-10 text-center">
            <p class="text-sm text-ink-subtle">No closed or archived tasks in this period.</p>
          </div>
        }
      >
        <div class="flex flex-col items-center gap-5 sm:flex-row">
          {/* Donut SVG */}
          <div class="relative flex h-32 w-32 shrink-0 items-center justify-center">
            <svg
              viewBox="0 0 140 140"
              class="h-full w-full -rotate-90"
              role="img"
              aria-label="Task outcomes breakdown donut chart"
            >
              <circle
                cx="70"
                cy="70"
                r={taskSegments().radius}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                stroke-width="16"
              />
              <For each={taskSegments().arcs}>
                {(arc) => (
                  <Show when={arc.count > 0}>
                    <circle
                      cx="70"
                      cy="70"
                      r={taskSegments().radius}
                      fill="none"
                      stroke={arc.color}
                      stroke-width={hoveredTaskSegment() === arc.key ? '19' : '16'}
                      stroke-dasharray={`${arc.length} ${taskSegments().circumference}`}
                      stroke-dashoffset={arc.offset}
                      class="cursor-pointer transition-all duration-150"
                      onMouseEnter={() => setHoveredTaskSegment(arc.key)}
                      onMouseLeave={() => setHoveredTaskSegment(null)}
                    />
                  </Show>
                )}
              </For>
            </svg>
            <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
              <Show
                when={hoveredDonutSegment()}
                fallback={
                  <>
                    <span class="font-display font-mono text-xl font-semibold text-ink tabular-nums">
                      {props.taskSummary.completionRate !== null
                        ? `${Math.round(props.taskSummary.completionRate * 100)}%`
                        : '—'}
                    </span>
                    <span class="text-[10px] text-ink-subtle">Success</span>
                  </>
                }
              >
                {(seg) => (
                  <>
                    <span class="font-display font-mono text-xl font-semibold text-ink tabular-nums">
                      {seg().count}
                    </span>
                    <span class="text-[10px] leading-tight text-ink-secondary">{seg().label}</span>
                  </>
                )}
              </Show>
            </div>
          </div>

          {/* Clean Legend */}
          <ul class="min-w-0 flex-1 space-y-2 text-xs">
            <For each={taskSegments().arcs}>
              {(arc) => (
                <li
                  class={`flex items-center justify-between gap-2 transition-opacity ${
                    hoveredTaskSegment() && hoveredTaskSegment() !== arc.key
                      ? 'opacity-45'
                      : 'opacity-100'
                  }`}
                  onMouseEnter={() => (arc.count > 0 ? setHoveredTaskSegment(arc.key) : undefined)}
                  onMouseLeave={() => setHoveredTaskSegment(null)}
                >
                  <span class="flex min-w-0 items-center gap-2 text-ink-secondary">
                    <span
                      class="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ 'background-color': arc.color }}
                    />
                    <span class="truncate">{arc.label}</span>
                  </span>
                  <span class="shrink-0 font-mono text-ink tabular-nums">
                    {arc.count}
                    <span class="ml-1 text-[11px] text-ink-dim">({arc.sharePct}%)</span>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <div class="grid grid-cols-1 gap-2.5 border-t border-white/[0.06] pt-3 text-[11px] min-[380px]:grid-cols-3">
        <div class="min-w-0">
          <span class="block text-ink-dim">On-Time</span>
          <span class="block font-mono break-words text-ink tabular-nums">
            {props.taskSummary.onTimeRate !== null
              ? `${Math.round(props.taskSummary.onTimeRate * 100)}% (${props.taskSummary.onTimeCount}/${props.taskSummary.datedDoneCount})`
              : '—'}
          </span>
        </div>
        <div class="min-w-0">
          <span class="block text-ink-dim">Goals</span>
          <span
            class="block font-mono break-words text-ink tabular-nums"
            title={`${props.taskSummary.goalsDoneCount} done, ${props.taskSummary.goalsArchivedCount} archived, ${props.taskSummary.goalsOpenCount} open`}
          >
            {props.taskSummary.goalsDoneCount}d · {props.taskSummary.goalsArchivedCount}a ·{' '}
            {props.taskSummary.goalsOpenCount}o
          </span>
        </div>
        <div class="min-w-0">
          <span class="block text-ink-dim">Repeats</span>
          <span class="block font-mono break-words text-ink tabular-nums">
            {props.taskSummary.repeatableDoneCount} done
          </span>
        </div>
      </div>
    </section>
  );
}

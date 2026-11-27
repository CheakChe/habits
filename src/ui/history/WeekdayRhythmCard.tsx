import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { Habit, HabitCheckin, Task } from '../../types/domain';
import { ChartsAnalytics } from '../../utils/charts-analytics';

interface WeekdayRhythmCardProps {
  targetHabits: Habit[];
  checkins: HabitCheckin[];
  tasks: Task[];
  effectiveRangeStart: number;
  effectiveRangeEnd: number;
  timeZone: string;
}

function weekdayBarColor(rate: number): string {
  if (rate >= 0.999) return '#3B82F6';
  if (rate >= 0.7) return '#60A5FA';
  if (rate >= 0.4) return '#F59E0B';
  return '#EF4444';
}

export function WeekdayRhythmCard(props: WeekdayRhythmCardProps): JSX.Element {
  const [weekdayMode, setWeekdayMode] = createSignal<'habits' | 'tasks'>('habits');
  const [hoveredWeekday, setHoveredWeekday] = createSignal<number | null>(null);

  const weekdayHabits = createMemo(() =>
    ChartsAnalytics.weekdayHabitStats(
      props.targetHabits,
      props.checkins,
      props.effectiveRangeStart,
      props.effectiveRangeEnd
    )
  );

  const weekdayTasks = createMemo(() =>
    ChartsAnalytics.weekdayTaskStats(
      props.tasks,
      props.effectiveRangeStart,
      props.effectiveRangeEnd,
      props.timeZone
    )
  );

  const weekdayExtremes = createMemo(() => {
    if (weekdayMode() === 'habits') {
      const valid = weekdayHabits().filter((d) => d.rate !== null);
      if (valid.length === 0) return null;
      const best = valid.reduce((a, b) => (b.rate! > a.rate! ? b : a));
      const worst = valid.reduce((a, b) => (b.rate! < a.rate! ? b : a));
      return {
        bestLabel: best.label,
        bestPct: Math.round(best.rate! * 100),
        worstLabel: worst.label,
        worstPct: Math.round(worst.rate! * 100),
      };
    }
    const valid = weekdayTasks().filter((d) => d.rate !== null);
    if (valid.length === 0) return null;
    const best = valid.reduce((a, b) => (b.doneCount > a.doneCount ? b : a));
    const worst = valid.reduce((a, b) => (b.rate! < a.rate! ? b : a));
    return {
      bestLabel: best.label,
      bestPct: Math.round(best.rate! * 100),
      worstLabel: worst.label,
      worstPct: Math.round(worst.rate! * 100),
    };
  });

  const maxWeekdayTaskTotal = createMemo(() =>
    Math.max(1, ...weekdayTasks().map((d) => d.totalCount))
  );

  const hoveredWeekdaySummary = createMemo(() => {
    const bit = hoveredWeekday();
    if (bit === null) return null;
    if (weekdayMode() === 'habits') {
      const d = weekdayHabits()[bit];
      if (!d) return null;
      return `${d.label} · ${d.doneCount}/${d.scheduledCount} ${
        d.rate !== null ? `(${Math.round(d.rate * 100)}%)` : '(—)'
      }`;
    }
    const d = weekdayTasks()[bit];
    if (!d) return null;
    return `${d.label} · ${d.doneCount} done · ${d.notDoneCount} not done`;
  });

  return (
    <section class="flex flex-col justify-between space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6 lg:col-span-5">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <h2 class="font-display text-base font-semibold text-ink">Weekday Rhythm</h2>
          <p class="font-mono text-xs break-words text-ink-subtle tabular-nums">
            <Show
              when={hoveredWeekdaySummary()}
              fallback={
                <span>
                  {weekdayMode() === 'habits'
                    ? 'Habit completion by weekday'
                    : 'Task outcomes by weekday'}
                </span>
              }
            >
              {(text) => <span class="text-ink">{text()}</span>}
            </Show>
          </p>
        </div>

        <div class="inline-flex shrink-0 items-center rounded-xl border border-white/[0.08] bg-canvas p-0.5">
          <button
            type="button"
            onClick={() => {
              setWeekdayMode('habits');
              setHoveredWeekday(null);
            }}
            class={`shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
              weekdayMode() === 'habits'
                ? 'bg-surface-elevated text-ink'
                : 'text-ink-subtle hover:text-ink'
            }`}
          >
            Habits
          </button>
          <button
            type="button"
            onClick={() => {
              setWeekdayMode('tasks');
              setHoveredWeekday(null);
            }}
            class={`shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
              weekdayMode() === 'tasks'
                ? 'bg-surface-elevated text-ink'
                : 'text-ink-subtle hover:text-ink'
            }`}
          >
            Tasks
          </button>
        </div>
      </div>

      <Show
        when={
          weekdayMode() === 'habits'
            ? weekdayHabits().some((d) => d.scheduledCount > 0)
            : weekdayTasks().some((d) => d.totalCount > 0)
        }
        fallback={
          <div class="py-12 text-center">
            <p class="text-sm text-ink-subtle">
              {weekdayMode() === 'habits'
                ? 'No scheduled habit days in this period.'
                : 'No task outcomes in this period.'}
            </p>
          </div>
        }
      >
        <div class="grid h-36 grid-cols-7 items-end gap-1 pt-3 sm:gap-2">
          <Show
            when={weekdayMode() === 'habits'}
            fallback={
              <For each={weekdayTasks()}>
                {(d) => {
                  const heightPct = () =>
                    d.totalCount === 0
                      ? 0
                      : Math.round((d.totalCount / maxWeekdayTaskTotal()) * 100);
                  const doneShare = () =>
                    d.totalCount === 0 ? 0 : (d.doneCount / d.totalCount) * 100;
                  const notDoneShare = () =>
                    d.totalCount === 0 ? 0 : (d.notDoneCount / d.totalCount) * 100;
                  return (
                    <div
                      class="flex h-full cursor-pointer flex-col items-center justify-end gap-1.5"
                      onMouseEnter={() => setHoveredWeekday(d.weekdayBit)}
                      onMouseLeave={() => setHoveredWeekday(null)}
                    >
                      <span class="h-4 shrink-0 font-mono text-[11px] leading-4 text-ink-subtle tabular-nums">
                        {d.totalCount > 0 ? d.totalCount : ''}
                      </span>
                      <div class="flex w-full flex-1 items-end">
                        <Show
                          when={d.totalCount > 0}
                          fallback={<div class="h-[3px] w-full rounded-t-md bg-white/[0.06]" />}
                        >
                          <div
                            class="flex w-full flex-col justify-end overflow-hidden rounded-t-md"
                            style={{ height: `${Math.max(12, heightPct())}%` }}
                          >
                            <Show when={d.notDoneCount > 0}>
                              <div
                                class="w-full bg-danger/80"
                                style={{ height: `${notDoneShare()}%` }}
                              />
                            </Show>
                            <Show when={d.doneCount > 0}>
                              <div class="w-full bg-accent" style={{ height: `${doneShare()}%` }} />
                            </Show>
                          </div>
                        </Show>
                      </div>
                      <span class="font-mono text-[11px] text-ink-subtle">{d.label}</span>
                    </div>
                  );
                }}
              </For>
            }
          >
            <For each={weekdayHabits()}>
              {(d) => {
                const pct = () => (d.rate === null ? null : Math.round(d.rate * 100));
                return (
                  <div
                    class="flex h-full cursor-pointer flex-col items-center justify-end gap-1.5"
                    onMouseEnter={() => setHoveredWeekday(d.weekdayBit)}
                    onMouseLeave={() => setHoveredWeekday(null)}
                  >
                    <span class="font-mono text-[11px] text-ink-subtle tabular-nums">
                      {pct() !== null ? `${pct()}%` : '—'}
                    </span>
                    <div class="flex w-full flex-1 items-end">
                      <Show
                        when={pct() !== null}
                        fallback={<div class="h-[3px] w-full rounded-t-md bg-white/[0.06]" />}
                      >
                        <div
                          class="w-full rounded-t-md transition-opacity"
                          style={{
                            height: `${Math.max(10, pct()!)}%`,
                            'background-color': weekdayBarColor(d.rate!),
                            opacity:
                              hoveredWeekday() !== null && hoveredWeekday() !== d.weekdayBit
                                ? 0.55
                                : 1,
                          }}
                        />
                      </Show>
                    </div>
                    <span class="font-mono text-[11px] text-ink-subtle">{d.label}</span>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>
      </Show>

      <div class="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3 font-mono text-[11px] text-ink-subtle tabular-nums">
        <Show when={weekdayExtremes()} fallback={<span>Not enough data to compare weekdays</span>}>
          {(ex) => (
            <>
              <span>
                Best:{' '}
                <span class="text-accent-tint">
                  {ex().bestLabel} ({ex().bestPct}%)
                </span>
              </span>
              <span>
                Weakest:{' '}
                <span class="text-danger-soft">
                  {ex().worstLabel} ({ex().worstPct}%)
                </span>
              </span>
            </>
          )}
        </Show>
      </div>
    </section>
  );
}

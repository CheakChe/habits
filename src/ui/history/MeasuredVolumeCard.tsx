import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { Habit, HabitCheckin } from '../../types/domain';
import { ChartsAnalytics } from '../../utils/charts-analytics';
import { HabitAppearance } from '../../utils/habit-appearance';
import { HabitSchedule } from '../../utils/habit-schedule';
import { Select, SelectOption } from '../controls/Select';
import { HabitBadge } from '../HabitBadge';

interface MeasuredVolumeCardProps {
  targetHabits: Habit[];
  checkins: HabitCheckin[];
  effectiveRangeStart: number;
  effectiveRangeEnd: number;
}

export function MeasuredVolumeCard(props: MeasuredVolumeCardProps): JSX.Element {
  const [selectedVolumeHabitId, setSelectedVolumeHabitId] = createSignal<number | null>(null);
  const [hoveredVolumeKey, setHoveredVolumeKey] = createSignal<string | null>(null);

  const measuredHabits = createMemo(() =>
    props.targetHabits.filter((h) => HabitSchedule.hasAnyDailyTarget(h))
  );

  const activeVolumeHabit = createMemo(() => {
    const list = measuredHabits();
    if (list.length === 0) return null;
    return list.find((h) => h.id === selectedVolumeHabitId()) ?? list[0];
  });

  const volumeData = createMemo(() => {
    const habit = activeVolumeHabit();
    if (!habit) return null;
    const buckets = ChartsAnalytics.habitVolumeBuckets(
      habit,
      props.checkins,
      props.effectiveRangeStart,
      props.effectiveRangeEnd,
      14
    );
    const summary = ChartsAnalytics.summarizeHabitVolume(
      habit,
      props.checkins,
      props.effectiveRangeStart,
      props.effectiveRangeEnd
    );
    const maxVal = Math.max(1, ...buckets.map((b) => Math.max(b.actualTotal, b.targetTotal)));
    const accentColor = HabitAppearance.getColor(habit.color);
    return { habit, buckets, summary, maxVal, accentColor };
  });

  const hoveredVolumeBucket = createMemo(() => {
    const data = volumeData();
    const key = hoveredVolumeKey();
    if (!data || !key) return null;
    return data.buckets.find((b) => b.key === key) ?? null;
  });

  return (
    <Show when={volumeData()}>
      {(vol) => {
        const unitSuffix = () => (vol().summary.unit ? ` ${vol().summary.unit}` : '');
        const targetRangeLabel = () => {
          const s = vol().summary.targetStart;
          const e = vol().summary.targetEnd;
          if (s !== null && e !== null && s !== e) {
            return `Target ${HabitSchedule.formatNumericValue(s)} → ${HabitSchedule.formatNumericValue(e)}${unitSuffix()}/day`;
          }
          const t = e ?? s;
          return t !== null
            ? `Target ${HabitSchedule.formatNumericValue(t)}${unitSuffix()}/day`
            : null;
        };
        return (
          <section class="space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 space-y-0.5">
                <h2 class="font-display text-base font-semibold text-ink">Measured Volume</h2>
                <p class="font-mono text-xs break-words text-ink-subtle tabular-nums">
                  <Show
                    when={hoveredVolumeBucket()}
                    fallback={
                      <span>
                        {HabitSchedule.formatNumericValue(vol().summary.totalVolume)}
                        {unitSuffix()} total ·{' '}
                        {HabitSchedule.formatNumericValue(vol().summary.averagePerActiveDay)}
                        {unitSuffix()}/active day
                        {targetRangeLabel() ? ` · ${targetRangeLabel()}` : ''}
                      </span>
                    }
                  >
                    {(b) => (
                      <span class="text-ink">
                        {b().label} · {HabitSchedule.formatNumericValue(b().actualTotal)}
                        {unitSuffix()} logged
                        {b().targetTotal > 0
                          ? ` / ${HabitSchedule.formatNumericValue(b().targetTotal)}${unitSuffix()} target`
                          : ''}
                      </span>
                    )}
                  </Show>
                </p>
              </div>

              <div class="flex shrink-0 items-center gap-3">
                <Show
                  when={measuredHabits().length > 1}
                  fallback={
                    <div class="flex items-center gap-2 text-xs text-ink-secondary">
                      <HabitBadge appearanceRaw={vol().habit.color} size="xs" />
                      <span class="max-w-[160px] truncate">{vol().habit.name}</span>
                    </div>
                  }
                >
                  <Select<number>
                    ariaLabel="Select measured habit"
                    value={vol().habit.id}
                    options={measuredHabits().map((h): SelectOption<number> => ({
                      value: h.id,
                      label: h.name,
                      hint: h.unit ?? undefined,
                      dotColor: h.color,
                    }))}
                    onChange={(id) => {
                      setSelectedVolumeHabitId(id);
                      setHoveredVolumeKey(null);
                    }}
                  />
                </Show>
              </div>
            </div>

            <div class="flex h-40 items-end gap-1 pt-4 sm:gap-2">
              <For each={vol().buckets}>
                {(bucket) => {
                  const actualPct = () =>
                    bucket.actualTotal <= 0
                      ? 0
                      : Math.max(8, (bucket.actualTotal / vol().maxVal) * 100);
                  const targetPct = () =>
                    bucket.targetTotal <= 0
                      ? null
                      : Math.min(100, (bucket.targetTotal / vol().maxVal) * 100);
                  const metGoal = () =>
                    bucket.targetTotal > 0 && bucket.actualTotal >= bucket.targetTotal;
                  return (
                    <div
                      class="flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end gap-1.5"
                      onMouseEnter={() => setHoveredVolumeKey(bucket.key)}
                      onMouseLeave={() => setHoveredVolumeKey(null)}
                    >
                      <span class="h-4 max-w-full shrink-0 truncate font-mono text-[11px] leading-4 text-ink-subtle tabular-nums">
                        {bucket.actualTotal > 0
                          ? HabitSchedule.formatNumericValue(bucket.actualTotal)
                          : ''}
                      </span>
                      <div class="relative flex w-full flex-1 items-end">
                        <Show
                          when={bucket.actualTotal > 0}
                          fallback={<div class="h-[3px] w-full rounded-t-md bg-white/[0.05]" />}
                        >
                          <div
                            class="w-full rounded-t-md transition-opacity"
                            style={{
                              height: `${actualPct()}%`,
                              'background-color': vol().accentColor,
                              opacity:
                                hoveredVolumeKey() && hoveredVolumeKey() !== bucket.key
                                  ? 0.45
                                  : metGoal() || bucket.targetTotal === 0
                                    ? 1
                                    : 0.55,
                            }}
                            title={`${bucket.label}: ${HabitSchedule.formatNumericValue(bucket.actualTotal)}${unitSuffix()}${
                              bucket.targetTotal > 0
                                ? ` / ${HabitSchedule.formatNumericValue(bucket.targetTotal)}${unitSuffix()} target`
                                : ''
                            }`}
                          />
                        </Show>

                        <Show when={targetPct() !== null}>
                          <div
                            aria-hidden="true"
                            class="pointer-events-none absolute right-0 left-0 border-t border-dashed border-white/60"
                            style={{ bottom: `${targetPct()}%` }}
                          />
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

            <div class="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-[11px] text-ink-subtle">
              <span class="font-mono tabular-nums">
                {vol().summary.activeDaysLogged}{' '}
                {vol().summary.activeDaysLogged === 1 ? 'day' : 'days'} logged ·{' '}
                {HabitSchedule.formatNumericValue(vol().summary.averagePerScheduledDay)}
                {unitSuffix()}/scheduled day
                <Show when={vol().summary.volumeAchievementRate !== null}>
                  {' '}
                  · {Math.round(vol().summary.volumeAchievementRate! * 100)}% of{' '}
                  {HabitSchedule.formatNumericValue(vol().summary.totalTargetVolume)}
                  {unitSuffix()} target
                </Show>
              </span>
              <div class="flex items-center gap-3">
                <span class="inline-flex items-center gap-1.5">
                  <span
                    class="h-2.5 w-2.5 rounded-[2px]"
                    style={{ 'background-color': vol().accentColor }}
                  />
                  <span>Logged</span>
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <span class="w-3 border-t border-dashed border-white/70" />
                  <span>Target</span>
                </span>
              </div>
            </div>
          </section>
        );
      }}
    </Show>
  );
}

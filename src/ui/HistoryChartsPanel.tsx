import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { Habit, HabitCheckin, HabitNote, Task } from '../types/domain';
import {
  ChartsAnalytics,
  HabitRowTrendInfo,
  PerfectDaysSummary,
} from '../utils/charts-analytics';
import { CivilCalendar } from '../utils/civil-calendar';
import { DateRangeResolver, DayCellTone } from '../utils/date-range';
import { HabitAppearance } from '../utils/habit-appearance';
import { HabitSchedule } from '../utils/habit-schedule';
import { HabitPeriodSummary, StreakUnit } from '../utils/streak-calculator';
import { TaskOutcomeBucket, TaskRangeSummary } from '../utils/task-analytics';
import { CustomSelect, SelectOption } from './CustomControls';
import { HabitBadge } from './HabitBadge';
import { CalendarIcon } from './Icons';

interface HeatmapDayCell {
  dayIndex: number;
  inRange: boolean;
  done: number;
  scheduled: number;
  tone: DayCellTone;
}

export interface HeatmapDataView {
  weeks: {
    weekStart: number;
    monthLabel: string;
    days: HeatmapDayCell[];
  }[];
  totalDone: number;
  clampedStart: number;
  effectiveEnd: number;
  isCapped: boolean;
}

interface AnalyticsSummaryView {
  currentStreak: number;
  currentStreakUnit: StreakUnit;
  longestStreak: number;
  longestStreakUnit: StreakUnit;
  completionRate: number;
  scheduledDays: number;
  completedScheduledDays: number;
  missedScheduledDays: number;
}

export interface PeriodComparisonView {
  prevLabel: string;
  habitRateDeltaPct: number | null;
  taskDoneDelta: number | null;
  taskRateDeltaPct: number | null;
}

interface HistoryChartsPanelProps {
  habits: Habit[];
  targetHabits: Habit[];
  habitFilter: 'all' | number[];
  checkins: HabitCheckin[];
  notes: HabitNote[];
  tasks: Task[];
  effectiveRangeStart: number;
  effectiveRangeEnd: number;
  rangeLabel: string;
  timeZone: string;
  analyticsSummary: AnalyticsSummaryView;
  perfectDays: PerfectDaysSummary;
  prevComparison: PeriodComparisonView | null;
  habitTrends: Map<number, HabitRowTrendInfo>;
  taskSummary: TaskRangeSummary;
  taskOutcomeBuckets: TaskOutcomeBucket[];
  habitBreakdown: HabitPeriodSummary[];
  heatmapData: HeatmapDataView;
  selectedDay: number;
  onSelectDay: (dayIndex: number) => void;
  onInspectDayInCalendar: (dayIndex: number) => void;
  onSelectHabitFilter: (filter: 'all' | number[]) => void;
}

function heatmapSquareClass(tone: DayCellTone): string {
  switch (tone) {
    case 'complete':
      return 'bg-[#3B82F6]';
    case 'missed-slight':
      return 'bg-[#581C24]';
    case 'missed-moderate':
      return 'bg-[#881B22]';
    case 'missed-heavy':
      return 'bg-[#B91C1C]';
    case 'missed-all':
      return 'bg-[#EF4444]';
    case 'today-open':
      return 'bg-[#3B181E] border border-[#EF4444]/40';
    case 'unscheduled':
    case 'future':
    default:
      return 'bg-[#0D1016] border border-white/[0.06]';
  }
}

function weekdayBarColor(rate: number): string {
  if (rate >= 0.999) return '#3B82F6';
  if (rate >= 0.7) return '#60A5FA';
  if (rate >= 0.4) return '#F59E0B';
  return '#EF4444';
}

export function HistoryChartsPanel(props: HistoryChartsPanelProps): JSX.Element {
  const [hoveredTrendIdx, setHoveredTrendIdx] = createSignal<number | null>(null);
  const [hoveredTaskSegment, setHoveredTaskSegment] = createSignal<string | null>(null);
  const [hoveredTaskBucketKey, setHoveredTaskBucketKey] = createSignal<string | null>(null);
  const [weekdayMode, setWeekdayMode] = createSignal<'habits' | 'tasks'>('habits');
  const [hoveredWeekday, setHoveredWeekday] = createSignal<number | null>(null);
  const [selectedVolumeHabitId, setSelectedVolumeHabitId] = createSignal<number | null>(null);
  const [hoveredVolumeKey, setHoveredVolumeKey] = createSignal<string | null>(null);
  const [hoveredCell, setHoveredCell] = createSignal<{
    dayIndex: number;
    done: number;
    scheduled: number;
  } | null>(null);

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
    const maxVal = Math.max(
      1,
      ...buckets.map((b) => Math.max(b.actualTotal, b.targetTotal))
    );
    const accentColor = HabitAppearance.getColor(habit.color);
    return { habit, buckets, summary, maxVal, accentColor };
  });

  const hoveredVolumeBucket = createMemo(() => {
    const data = volumeData();
    const key = hoveredVolumeKey();
    if (!data || !key) return null;
    return data.buckets.find((b) => b.key === key) ?? null;
  });

  const trendBuckets = createMemo(() =>
    ChartsAnalytics.habitTrendBuckets(
      props.targetHabits,
      props.checkins,
      props.effectiveRangeStart,
      props.effectiveRangeEnd,
      14
    )
  );

  const trendChart = createMemo(() => {
    const buckets = trendBuckets();
    const width = 620;
    const height = 176;
    const padLeft = 36;
    const padRight = 14;
    const padTop = 14;
    const padBottom = 26;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const n = buckets.length;

    const points = buckets.map((bucket, idx) => {
      const x = n <= 1 ? padLeft + plotW / 2 : padLeft + (idx / (n - 1)) * plotW;
      const y =
        bucket.rate === null ? null : padTop + (1 - bucket.rate) * plotH;
      const maY =
        bucket.movingAvgRate === null
          ? null
          : padTop + (1 - bucket.movingAvgRate) * plotH;
      return { ...bucket, idx, x, y, maY };
    });

    // Build contiguous line/area segments where rate !== null
    const segments: {
      linePath: string;
      areaPath: string;
      pts: typeof points;
    }[] = [];

    let current: typeof points = [];
    const flush = () => {
      if (current.length === 0) return;
      const baseY = padTop + plotH;
      const linePath = current
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y!.toFixed(1)}`)
        .join(' ');
      const first = current[0];
      const last = current[current.length - 1];
      const areaPath =
        current.length >= 2
          ? `${linePath} L ${last.x.toFixed(1)} ${baseY.toFixed(1)} L ${first.x.toFixed(1)} ${baseY.toFixed(1)} Z`
          : '';
      segments.push({ linePath, areaPath, pts: current });
      current = [];
    };

    for (const pt of points) {
      if (pt.y === null) {
        flush();
      } else {
        current.push(pt);
      }
    }
    flush();

    // Moving average continuous segments
    const maSegments: string[] = [];
    let maCurrent: typeof points = [];
    const flushMa = () => {
      if (maCurrent.length >= 2) {
        maSegments.push(
          maCurrent
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.maY!.toFixed(1)}`)
            .join(' ')
        );
      }
      maCurrent = [];
    };
    for (const pt of points) {
      if (pt.maY === null) {
        flushMa();
      } else {
        maCurrent.push(pt);
      }
    }
    flushMa();

    const activePts = points.filter((p) => p.rate !== null);
    let trendDeltaPct: number | null = null;
    if (activePts.length >= 2) {
      const firstRate = activePts[0].rate!;
      const lastRate = activePts[activePts.length - 1].rate!;
      trendDeltaPct = Math.round((lastRate - firstRate) * 100);
    }

    const accentColor =
      props.targetHabits.length === 1 && props.targetHabits[0]
        ? HabitAppearance.getColor(props.targetHabits[0].color)
        : '#3B82F6';

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotW,
      plotH,
      points,
      segments,
      maSegments,
      hasData: activePts.length > 0,
      trendDeltaPct,
      accentColor,
    };
  });

  const activeTrendPoint = createMemo(() => {
    const idx = hoveredTrendIdx();
    if (idx === null) return null;
    return trendChart().points[idx] ?? null;
  });

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

  const maxBucketCount = createMemo(() =>
    Math.max(
      1,
      ...props.taskOutcomeBuckets.map((b) => b.doneCount + b.notDoneCount)
    )
  );

  const hoveredTaskBucket = createMemo(() => {
    const key = hoveredTaskBucketKey();
    if (!key) return null;
    return props.taskOutcomeBuckets.find((b) => b.key === key) ?? null;
  });

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
    const best = valid.reduce((a, b) =>
      b.doneCount > a.doneCount ? b : a
    );
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

  const dayNotesMap = createMemo(() => {
    const allowed = new Set(props.targetHabits.map((h) => h.id));
    const map = new Map<number, string[]>();
    for (const note of props.notes) {
      if (!allowed.has(note.habitId)) continue;
      const trimmed = note.text.trim();
      if (!trimmed) continue;
      if (
        note.dayIndex < props.heatmapData.clampedStart ||
        note.dayIndex > props.heatmapData.effectiveEnd
      ) {
        continue;
      }
      let list = map.get(note.dayIndex);
      if (!list) {
        list = [];
        map.set(note.dayIndex, list);
      }
      list.push(trimmed);
    }
    return map;
  });

  const activeHeatmapDayNotes = createMemo(() => {
    const day = hoveredCell()?.dayIndex ?? props.selectedDay;
    return dayNotesMap().get(day) ?? [];
  });

  return (
    <div class="space-y-6">
      {/* 4-Column KPI Strip */}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-5 space-y-1">
          <span class="text-xs text-[#8E95A5]">
            {props.targetHabits.length === 1 ? 'Current Streak' : 'Best Current Streak'}
          </span>
          <p class="text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {props.analyticsSummary.currentStreak}
            {props.analyticsSummary.currentStreakUnit === 'weeks' ? 'w' : 'd'}
          </p>
          <Show when={props.perfectDays.longestPerfectStreak > 0}>
            <span class="text-[11px] font-mono tabular-nums text-[#8E95A5] block">
              {props.perfectDays.currentPerfectStreak}d perfect streak
            </span>
          </Show>
        </div>

        <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-5 space-y-1">
          <span class="text-xs text-[#8E95A5]">Longest Streak</span>
          <p class="text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {props.analyticsSummary.longestStreak}
            {props.analyticsSummary.longestStreakUnit === 'weeks' ? 'w' : 'd'}
          </p>
          <Show when={props.perfectDays.scheduledDaysWithHabits > 0}>
            <span class="text-[11px] font-mono tabular-nums text-[#8E95A5] block">
              {props.perfectDays.perfectDays}/{props.perfectDays.scheduledDaysWithHabits} perfect days (
              {Math.round((props.perfectDays.perfectRate ?? 0) * 100)}%)
            </span>
          </Show>
        </div>

        <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-5 space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-[#8E95A5]">Habit Completion</span>
            <Show
              when={
                props.prevComparison &&
                props.prevComparison.habitRateDeltaPct !== null
              }
            >
              {(() => {
                const delta = props.prevComparison!.habitRateDeltaPct!;
                return (
                  <span
                    title={`Compared to ${props.prevComparison!.prevLabel}`}
                    class={`text-[11px] font-mono tabular-nums ${
                      delta > 0
                        ? 'text-[#60A5FA]'
                        : delta < 0
                          ? 'text-[#FCA5A5]'
                          : 'text-[#8E95A5]'
                    }`}
                  >
                    {delta > 0 ? `+${delta}%` : `${delta}%`} vs prev
                  </span>
                );
              })()}
            </Show>
          </div>
          <p class="text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {Math.round(props.analyticsSummary.completionRate * 100)}%
          </p>
          <span class="text-[11px] font-mono tabular-nums text-[#8E95A5] block">
            {props.analyticsSummary.completedScheduledDays} done ·{' '}
            {props.analyticsSummary.missedScheduledDays} missed
          </span>
        </div>

        <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-5 space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-[#8E95A5]">Tasks Done</span>
            <Show
              when={
                props.prevComparison &&
                props.prevComparison.taskDoneDelta !== null
              }
            >
              {(() => {
                const delta = props.prevComparison!.taskDoneDelta!;
                return (
                  <span
                    title={`Compared to ${props.prevComparison!.prevLabel}`}
                    class={`text-[11px] font-mono tabular-nums ${
                      delta > 0
                        ? 'text-[#60A5FA]'
                        : delta < 0
                          ? 'text-[#FCA5A5]'
                          : 'text-[#8E95A5]'
                    }`}
                  >
                    {delta > 0 ? `+${delta}` : `${delta}`} vs prev
                  </span>
                );
              })()}
            </Show>
          </div>
          <p class="text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {props.taskSummary.doneCount}
            <Show when={props.taskSummary.completionRate !== null}>
              <span class="text-sm font-normal text-[#8E95A5]">
                {' '}
                · {Math.round(props.taskSummary.completionRate! * 100)}%
              </span>
            </Show>
          </p>
          <span class="text-[11px] font-mono tabular-nums text-[#8E95A5] block truncate">
            {props.taskSummary.doneCount} done · {props.taskSummary.notDoneCount} not done
            <Show when={props.taskSummary.archivedCount > 0}>
              {' '}
              · {props.taskSummary.archivedCount} arch
            </Show>
          </span>
        </div>
      </div>

      {/* Row 1: Consistency Trend (Area/Line SVG) + Task Discipline (Donut SVG) */}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section class="lg:col-span-7 rounded-2xl bg-[#14161B] border border-white/[0.08] p-6 flex flex-col justify-between space-y-4">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                Consistency Trend
              </h2>
              <p class="text-xs text-[#8E95A5] font-mono tabular-nums">
                <Show
                  when={activeTrendPoint()}
                  fallback={
                    <span>
                      {DateRangeResolver.formatRangeLabel(
                        props.effectiveRangeStart,
                        props.effectiveRangeEnd
                      )}{' '}
                      · {Math.round(props.analyticsSummary.completionRate * 100)}% avg
                    </span>
                  }
                >
                  {(pt) => (
                    <span class="text-[#F5F7FA]">
                      {pt().label} · {pt().doneCount}/{pt().scheduledCount} scheduled (
                      {pt().rate !== null ? `${Math.round(pt().rate! * 100)}%` : '—'}
                      {pt().movingAvgRate !== null
                        ? ` · ${Math.round(pt().movingAvgRate! * 100)}% MA`
                        : ''}
                      )
                    </span>
                  )}
                </Show>
              </p>
            </div>

            <div class="flex items-center gap-3">
              <Show when={trendChart().maSegments.length > 0}>
                <span class="inline-flex items-center gap-1.5 text-[11px] text-[#8E95A5]">
                  <span class="w-3.5 border-t border-dashed border-[#93C5FD]/80" />
                  <span>Moving avg</span>
                </span>
              </Show>
              <Show when={trendChart().trendDeltaPct !== null}>
                <span
                  class={`text-xs font-mono tabular-nums ${
                    (trendChart().trendDeltaPct ?? 0) > 0
                      ? 'text-[#60A5FA]'
                      : (trendChart().trendDeltaPct ?? 0) < 0
                        ? 'text-[#FCA5A5]'
                        : 'text-[#8E95A5]'
                  }`}
                >
                  {(trendChart().trendDeltaPct ?? 0) > 0
                    ? `+${trendChart().trendDeltaPct}%`
                    : `${trendChart().trendDeltaPct}%`}{' '}
                  vs start
                </span>
              </Show>
            </div>
          </div>

          <Show
            when={trendChart().hasData}
            fallback={
              <div class="py-12 text-center">
                <p class="text-sm text-[#8E95A5]">
                  No scheduled habit days in this date range.
                </p>
              </div>
            }
          >
            <div class="w-full">
              <svg
                viewBox={`0 0 ${trendChart().width} ${trendChart().height}`}
                class="w-full h-44 overflow-visible"
                role="img"
                aria-label="Habit consistency completion rate trend chart"
              >
                <defs>
                  <linearGradient id="consistencyTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stop-color={trendChart().accentColor}
                      stop-opacity="0.28"
                    />
                    <stop
                      offset="100%"
                      stop-color={trendChart().accentColor}
                      stop-opacity="0"
                    />
                  </linearGradient>
                </defs>

                {/* Horizontal gridlines: 100%, 50%, 0% */}
                <For each={[1, 0.5, 0]}>
                  {(ratio) => {
                    const y = () =>
                      trendChart().padTop + (1 - ratio) * trendChart().plotH;
                    return (
                      <g>
                        <line
                          x1={trendChart().padLeft}
                          y1={y()}
                          x2={trendChart().width - trendChart().padRight}
                          y2={y()}
                          stroke="rgba(255,255,255,0.07)"
                          stroke-dasharray={ratio === 0 ? undefined : '3 4'}
                        />
                        <text
                          x={trendChart().padLeft - 8}
                          y={y() + 3.5}
                          text-anchor="end"
                          class="fill-[#6B7280] text-[10px] font-mono tabular-nums"
                        >
                          {Math.round(ratio * 100)}%
                        </text>
                      </g>
                    );
                  }}
                </For>

                {/* Area fills & line paths */}
                <For each={trendChart().segments}>
                  {(seg) => (
                    <g>
                      <Show when={seg.areaPath}>
                        <path d={seg.areaPath} fill="url(#consistencyTrendFill)" />
                      </Show>
                      <Show when={seg.pts.length >= 2}>
                        <path
                          d={seg.linePath}
                          fill="none"
                          stroke={trendChart().accentColor}
                          stroke-width="2.2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </Show>
                    </g>
                  )}
                </For>

                {/* Moving average dashed overlay */}
                <For each={trendChart().maSegments}>
                  {(maPath) => (
                    <path
                      d={maPath}
                      fill="none"
                      stroke="rgba(147, 197, 253, 0.72)"
                      stroke-width="1.6"
                      stroke-dasharray="4 4"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  )}
                </For>

                {/* Interactive data points + vertical hover guide */}
                <For each={trendChart().points}>
                  {(pt) => {
                    const isHovered = () => hoveredTrendIdx() === pt.idx;
                    const showLabel = () => {
                      const len = trendChart().points.length;
                      if (len <= 7) return true;
                      if (pt.idx === 0 || pt.idx === len - 1) return true;
                      const step = Math.ceil(len / 6);
                      return pt.idx % step === 0 && len - 1 - pt.idx >= step / 2;
                    };
                    return (
                      <g>
                        <Show when={isHovered() && pt.y !== null}>
                          <line
                            x1={pt.x}
                            y1={trendChart().padTop}
                            x2={pt.x}
                            y2={trendChart().padTop + trendChart().plotH}
                            stroke="rgba(255,255,255,0.16)"
                          />
                        </Show>
                        <Show when={pt.y !== null}>
                          <circle
                            cx={pt.x}
                            cy={pt.y!}
                            r={isHovered() ? 5 : 3.2}
                            fill={isHovered() ? '#F5F7FA' : trendChart().accentColor}
                            stroke="#14161B"
                            stroke-width="1.5"
                          />
                        </Show>
                        <Show when={showLabel()}>
                          <text
                            x={pt.x}
                            y={trendChart().height - 4}
                            text-anchor="middle"
                            class="fill-[#6B7280] text-[10px] font-mono tabular-nums"
                          >
                            {pt.shortLabel}
                          </text>
                        </Show>
                        {/* Generous hit target column */}
                        <rect
                          x={
                            pt.x -
                            trendChart().plotW /
                              Math.max(2, trendChart().points.length * 2)
                          }
                          y={trendChart().padTop}
                          width={
                            trendChart().plotW / Math.max(1, trendChart().points.length)
                          }
                          height={trendChart().plotH}
                          fill="transparent"
                          class="cursor-pointer outline-none"
                          tabindex={0}
                          aria-label={`${pt.label}: ${pt.doneCount} of ${pt.scheduledCount} completed`}
                          onMouseEnter={() => setHoveredTrendIdx(pt.idx)}
                          onMouseLeave={() => setHoveredTrendIdx(null)}
                          onFocus={() => setHoveredTrendIdx(pt.idx)}
                          onBlur={() => setHoveredTrendIdx(null)}
                        />
                      </g>
                    );
                  }}
                </For>
              </svg>
            </div>
          </Show>
        </section>

        <section class="lg:col-span-5 rounded-2xl bg-[#14161B] border border-white/[0.08] p-6 flex flex-col justify-between space-y-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                Task Discipline
              </h2>
              <p class="text-xs text-[#8E95A5] font-mono tabular-nums">
                {taskSegments().total} total outcomes · Excl. archived from rate
              </p>
            </div>
          </div>

          <Show
            when={taskSegments().total > 0}
            fallback={
              <div class="py-10 text-center">
                <p class="text-sm text-[#8E95A5]">
                  No closed or archived tasks in this period.
                </p>
              </div>
            }
          >
            <div class="flex flex-col sm:flex-row items-center gap-5">
              {/* Donut SVG */}
              <div class="relative w-32 h-32 shrink-0 flex items-center justify-center">
                <svg
                  viewBox="0 0 140 140"
                  class="w-full h-full -rotate-90"
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
                          class="transition-all duration-150 cursor-pointer"
                          onMouseEnter={() => setHoveredTaskSegment(arc.key)}
                          onMouseLeave={() => setHoveredTaskSegment(null)}
                        />
                      </Show>
                    )}
                  </For>
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
                  <Show
                    when={hoveredDonutSegment()}
                    fallback={
                      <>
                        <span class="text-xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
                          {props.taskSummary.completionRate !== null
                            ? `${Math.round(props.taskSummary.completionRate * 100)}%`
                            : '—'}
                        </span>
                        <span class="text-[10px] text-[#8E95A5]">Success</span>
                      </>
                    }
                  >
                    {(seg) => (
                      <>
                        <span class="text-xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
                          {seg().count}
                        </span>
                        <span class="text-[10px] text-[#C8CDD8] leading-tight">
                          {seg().label}
                        </span>
                      </>
                    )}
                  </Show>
                </div>
              </div>

              {/* Clean Legend */}
              <ul class="flex-1 min-w-0 space-y-2 text-xs">
                <For each={taskSegments().arcs}>
                  {(arc) => (
                    <li
                      class={`flex items-center justify-between gap-2 transition-opacity ${
                        hoveredTaskSegment() && hoveredTaskSegment() !== arc.key
                          ? 'opacity-45'
                          : 'opacity-100'
                      }`}
                      onMouseEnter={() =>
                        arc.count > 0 ? setHoveredTaskSegment(arc.key) : undefined
                      }
                      onMouseLeave={() => setHoveredTaskSegment(null)}
                    >
                      <span class="flex items-center gap-2 min-w-0 text-[#C8CDD8]">
                        <span
                          class="w-2.5 h-2.5 rounded-[3px] shrink-0"
                          style={{ 'background-color': arc.color }}
                        />
                        <span class="truncate">{arc.label}</span>
                      </span>
                      <span class="font-mono tabular-nums text-[#F5F7FA] shrink-0">
                        {arc.count}
                        <span class="text-[#6B7280] ml-1 text-[11px]">
                          ({arc.sharePct}%)
                        </span>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>

          <div class="grid grid-cols-1 min-[380px]:grid-cols-3 gap-2.5 pt-3 border-t border-white/[0.06] text-[11px]">
            <div class="min-w-0">
              <span class="text-[#6B7280] block">On-Time</span>
              <span class="font-mono tabular-nums text-[#F5F7FA] break-words block">
                {props.taskSummary.onTimeRate !== null
                  ? `${Math.round(props.taskSummary.onTimeRate * 100)}% (${props.taskSummary.onTimeCount}/${props.taskSummary.datedDoneCount})`
                  : '—'}
              </span>
            </div>
            <div class="min-w-0">
              <span class="text-[#6B7280] block">Goals</span>
              <span
                class="font-mono tabular-nums text-[#F5F7FA] break-words block"
                title={`${props.taskSummary.goalsDoneCount} done, ${props.taskSummary.goalsArchivedCount} archived, ${props.taskSummary.goalsOpenCount} open`}
              >
                {props.taskSummary.goalsDoneCount}d · {props.taskSummary.goalsArchivedCount}a ·{' '}
                {props.taskSummary.goalsOpenCount}o
              </span>
            </div>
            <div class="min-w-0">
              <span class="text-[#6B7280] block">Repeats</span>
              <span class="font-mono tabular-nums text-[#F5F7FA] break-words block">
                {props.taskSummary.repeatableDoneCount} done
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Row 2: Tasks Overview (Stacked Bars) + Weekday Rhythm */}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section class="lg:col-span-7 rounded-2xl bg-[#14161B] border border-white/[0.08] p-6 flex flex-col justify-between space-y-4">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                Tasks Timeline
              </h2>
              <p class="text-xs text-[#8E95A5] font-mono tabular-nums">
                <Show
                  when={hoveredTaskBucket()}
                  fallback={<span>{props.rangeLabel}</span>}
                >
                  {(b) => (
                    <span class="text-[#F5F7FA]">
                      {b().label} · {b().doneCount} done · {b().notDoneCount} not done
                      {b().archivedCount > 0 ? ` · ${b().archivedCount} arch` : ''}
                    </span>
                  )}
                </Show>
              </p>
            </div>
            <div class="flex items-center gap-3 text-[11px] text-[#8E95A5]">
              <span class="inline-flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-[2px] bg-[#3B82F6]" />
                <span>Done</span>
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-[2px] bg-[#EF4444]/80" />
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
                <p class="text-sm text-[#8E95A5]">
                  No task outcomes in the selected date range.
                </p>
              </div>
            }
          >
            <div class="flex items-end gap-2 h-40 pt-4">
              <For each={props.taskOutcomeBuckets}>
                {(bucket) => {
                  const total = () => bucket.doneCount + bucket.notDoneCount;
                  const totalPct = () =>
                    Math.round((total() / maxBucketCount()) * 100);
                  const doneShare = () =>
                    total() === 0 ? 0 : (bucket.doneCount / total()) * 100;
                  const notDoneShare = () =>
                    total() === 0 ? 0 : (bucket.notDoneCount / total()) * 100;
                  return (
                    <div
                      class="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1.5 cursor-pointer"
                      onMouseEnter={() => setHoveredTaskBucketKey(bucket.key)}
                      onMouseLeave={() => setHoveredTaskBucketKey(null)}
                    >
                      <span class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                        {total() > 0 ? total() : ''}
                      </span>
                      <div class="w-full flex-1 flex items-end">
                        <Show
                          when={total() > 0}
                          fallback={
                            <div class="w-full bg-white/[0.05] h-[3px] rounded-t-md" />
                          }
                        >
                          <div
                            class={`w-full rounded-t-md overflow-hidden flex flex-col justify-end transition-opacity ${
                              hoveredTaskBucketKey() && hoveredTaskBucketKey() !== bucket.key
                                ? 'opacity-60'
                                : 'opacity-100'
                            }`}
                            style={{ height: `${Math.max(12, totalPct())}%` }}
                            title={`${bucket.label}: ${bucket.doneCount} done, ${bucket.notDoneCount} not done${
                              bucket.archivedCount > 0
                                ? `, ${bucket.archivedCount} archived`
                                : ''
                            }`}
                          >
                            <Show when={bucket.notDoneCount > 0}>
                              <div
                                class="w-full bg-[#EF4444]/80"
                                style={{ height: `${notDoneShare()}%` }}
                              />
                            </Show>
                            <Show when={bucket.doneCount > 0}>
                              <div
                                class="w-full bg-[#3B82F6]"
                                style={{ height: `${doneShare()}%` }}
                              />
                            </Show>
                          </div>
                        </Show>
                      </div>
                      <span class="text-[10px] font-mono tabular-nums text-[#6B7280] truncate max-w-full">
                        {bucket.shortLabel}
                      </span>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </section>

        <section class="lg:col-span-5 rounded-2xl bg-[#14161B] border border-white/[0.08] p-6 flex flex-col justify-between space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                Weekday Rhythm
              </h2>
              <p class="text-xs text-[#8E95A5] font-mono tabular-nums break-words">
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
                  {(text) => <span class="text-[#F5F7FA]">{text()}</span>}
                </Show>
              </p>
            </div>

            <div class="inline-flex items-center p-0.5 rounded-xl bg-[#0A0B0E] border border-white/[0.08] shrink-0">
              <button
                type="button"
                onClick={() => {
                  setWeekdayMode('habits');
                  setHoveredWeekday(null);
                }}
                class={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  weekdayMode() === 'habits'
                    ? 'bg-[#1C1F26] text-[#F5F7FA]'
                    : 'text-[#8E95A5] hover:text-[#F5F7FA]'
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
                class={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  weekdayMode() === 'tasks'
                    ? 'bg-[#1C1F26] text-[#F5F7FA]'
                    : 'text-[#8E95A5] hover:text-[#F5F7FA]'
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
                <p class="text-sm text-[#8E95A5]">
                  {weekdayMode() === 'habits'
                    ? 'No scheduled habit days in this period.'
                    : 'No task outcomes in this period.'}
                </p>
              </div>
            }
          >
            <div class="grid grid-cols-7 gap-2 h-36 pt-3 items-end">
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
                          class="h-full flex flex-col items-center justify-end gap-1.5 cursor-pointer"
                          onMouseEnter={() => setHoveredWeekday(d.weekdayBit)}
                          onMouseLeave={() => setHoveredWeekday(null)}
                        >
                          <span class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                            {d.totalCount > 0 ? d.totalCount : ''}
                          </span>
                          <div class="w-full flex-1 flex items-end">
                            <Show
                              when={d.totalCount > 0}
                              fallback={
                                <div class="w-full h-[3px] rounded-t-md bg-white/[0.06]" />
                              }
                            >
                              <div
                                class="w-full rounded-t-md overflow-hidden flex flex-col justify-end"
                                style={{ height: `${Math.max(12, heightPct())}%` }}
                              >
                                <Show when={d.notDoneCount > 0}>
                                  <div
                                    class="w-full bg-[#EF4444]/80"
                                    style={{ height: `${notDoneShare()}%` }}
                                  />
                                </Show>
                                <Show when={d.doneCount > 0}>
                                  <div
                                    class="w-full bg-[#3B82F6]"
                                    style={{ height: `${doneShare()}%` }}
                                  />
                                </Show>
                              </div>
                            </Show>
                          </div>
                          <span class="text-[11px] font-mono text-[#8E95A5]">
                            {d.label}
                          </span>
                        </div>
                      );
                    }}
                  </For>
                }
              >
                <For each={weekdayHabits()}>
                  {(d) => {
                    const pct = () =>
                      d.rate === null ? null : Math.round(d.rate * 100);
                    return (
                      <div
                        class="h-full flex flex-col items-center justify-end gap-1.5 cursor-pointer"
                        onMouseEnter={() => setHoveredWeekday(d.weekdayBit)}
                        onMouseLeave={() => setHoveredWeekday(null)}
                      >
                        <span class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                          {pct() !== null ? `${pct()}%` : '—'}
                        </span>
                        <div class="w-full flex-1 flex items-end">
                          <Show
                            when={pct() !== null}
                            fallback={
                              <div class="w-full h-[3px] rounded-t-md bg-white/[0.06]" />
                            }
                          >
                            <div
                              class="w-full rounded-t-md transition-opacity"
                              style={{
                                height: `${Math.max(10, pct()!)}%`,
                                'background-color': weekdayBarColor(d.rate!),
                                opacity:
                                  hoveredWeekday() !== null &&
                                  hoveredWeekday() !== d.weekdayBit
                                    ? 0.55
                                    : 1,
                              }}
                            />
                          </Show>
                        </div>
                        <span class="text-[11px] font-mono text-[#8E95A5]">
                          {d.label}
                        </span>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </div>
          </Show>

          <div class="pt-3 border-t border-white/[0.06] text-[11px] font-mono tabular-nums text-[#8E95A5] flex items-center justify-between gap-2">
            <Show
              when={weekdayExtremes()}
              fallback={<span>Not enough data to compare weekdays</span>}
            >
              {(ex) => (
                <>
                  <span>
                    Best: <span class="text-[#93C5FD]">{ex().bestLabel} ({ex().bestPct}%)</span>
                  </span>
                  <span>
                    Weakest: <span class="text-[#FCA5A5]">{ex().worstLabel} ({ex().worstPct}%)</span>
                  </span>
                </>
              )}
            </Show>
          </div>
        </section>
      </div>

      {/* Row 2.5: Measured Volume Progression (shown when at least one measured habit is in view) */}
      <Show when={volumeData()}>
        {(vol) => {
          const unitSuffix = () =>
            vol().summary.unit ? ` ${vol().summary.unit}` : '';
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
            <section class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-6 space-y-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 space-y-0.5">
                  <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                    Measured Volume
                  </h2>
                  <p class="text-xs text-[#8E95A5] font-mono tabular-nums break-words">
                    <Show
                      when={hoveredVolumeBucket()}
                      fallback={
                        <span>
                          {HabitSchedule.formatNumericValue(vol().summary.totalVolume)}
                          {unitSuffix()} total ·{' '}
                          {HabitSchedule.formatNumericValue(
                            vol().summary.averagePerActiveDay
                          )}
                          {unitSuffix()}/active day
                          {targetRangeLabel() ? ` · ${targetRangeLabel()}` : ''}
                        </span>
                      }
                    >
                      {(b) => (
                        <span class="text-[#F5F7FA]">
                          {b().label} ·{' '}
                          {HabitSchedule.formatNumericValue(b().actualTotal)}
                          {unitSuffix()} logged
                          {b().targetTotal > 0
                            ? ` / ${HabitSchedule.formatNumericValue(b().targetTotal)}${unitSuffix()} target`
                            : ''}
                        </span>
                      )}
                    </Show>
                  </p>
                </div>

                <div class="flex items-center gap-3 shrink-0">
                  <Show
                    when={measuredHabits().length > 1}
                    fallback={
                      <div class="flex items-center gap-2 text-xs text-[#C8CDD8]">
                        <HabitBadge appearanceRaw={vol().habit.color} size="xs" />
                        <span class="truncate max-w-[160px]">{vol().habit.name}</span>
                      </div>
                    }
                  >
                    <CustomSelect<number>
                      ariaLabel="Select measured habit"
                      value={vol().habit.id}
                      options={measuredHabits().map(
                        (h): SelectOption<number> => ({
                          value: h.id,
                          label: h.name,
                          hint: h.unit ?? undefined,
                          dotColor: h.color,
                        })
                      )}
                      onChange={(id) => {
                        setSelectedVolumeHabitId(id);
                        setHoveredVolumeKey(null);
                      }}
                    />
                  </Show>
                </div>
              </div>

              <div class="flex items-end gap-2 h-40 pt-4">
                <For each={vol().buckets}>
                  {(bucket) => {
                    const actualPct = () =>
                      bucket.actualTotal <= 0
                        ? 0
                        : Math.max(8, Math.round((bucket.actualTotal / vol().maxVal) * 100));
                    const targetPct = () =>
                      bucket.targetTotal <= 0
                        ? null
                        : Math.min(100, Math.round((bucket.targetTotal / vol().maxVal) * 100));
                    const metGoal = () =>
                      bucket.targetTotal > 0 && bucket.actualTotal >= bucket.targetTotal;
                    return (
                      <div
                        class="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1.5 cursor-pointer"
                        onMouseEnter={() => setHoveredVolumeKey(bucket.key)}
                        onMouseLeave={() => setHoveredVolumeKey(null)}
                      >
                        <span class="text-[10px] font-mono tabular-nums text-[#8E95A5] truncate max-w-full">
                          {bucket.actualTotal > 0
                            ? HabitSchedule.formatNumericValue(bucket.actualTotal)
                            : ''}
                        </span>
                        <div class="relative w-full flex-1 flex items-end">
                          <Show
                            when={bucket.actualTotal > 0}
                            fallback={
                              <div class="w-full bg-white/[0.05] h-[3px] rounded-t-md" />
                            }
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
                              class="absolute left-0 right-0 border-t border-dashed border-white/60 pointer-events-none"
                              style={{ bottom: `${targetPct()}%` }}
                            />
                          </Show>
                        </div>
                        <span class="text-[10px] font-mono tabular-nums text-[#6B7280] truncate max-w-full">
                          {bucket.shortLabel}
                        </span>
                      </div>
                    );
                  }}
                </For>
              </div>

              <div class="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8E95A5]">
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
                      class="w-2.5 h-2.5 rounded-[2px]"
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

      {/* Row 3: Full-Width Consistency Heatmap */}
      <section class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-6 space-y-5">
        <div class="flex items-start sm:items-center justify-between flex-wrap gap-3">
          <div>
            <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
              Consistency Heatmap
            </h2>
            <p class="text-xs text-[#8E95A5]">
              <span class="font-mono tabular-nums text-[#C8CDD8]">
                {props.heatmapData.totalDone}
              </span>{' '}
              check-ins ·{' '}
              <span class="font-mono tabular-nums">
                {DateRangeResolver.formatRangeLabel(
                  props.heatmapData.clampedStart,
                  props.heatmapData.effectiveEnd
                )}
              </span>
              {props.heatmapData.isCapped ? ' (last 2 years shown)' : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={() => props.onInspectDayInCalendar(props.selectedDay)}
            class="h-9 px-3 rounded-xl bg-[#0A0B0E] hover:bg-[#1C1F26] border border-white/[0.08] text-xs font-medium text-[#C8CDD8] hover:text-[#F5F7FA] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CalendarIcon class="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>
              Inspect {CivilCalendar.formatShortDate(props.selectedDay)} in Calendar
            </span>
          </button>
        </div>

        <div class="overflow-x-auto pb-1">
          <div class="inline-flex gap-2.5 items-start py-1 pl-0.5 pr-2">
            <div class="flex flex-col gap-[4px] pt-[20px] text-[11px] leading-[18px] text-[#6B7280] select-none shrink-0">
              <span class="h-[18px] flex items-center">Mon</span>
              <span class="h-[18px]" aria-hidden="true" />
              <span class="h-[18px] flex items-center">Wed</span>
              <span class="h-[18px]" aria-hidden="true" />
              <span class="h-[18px] flex items-center">Fri</span>
              <span class="h-[18px]" aria-hidden="true" />
              <span class="h-[18px]" aria-hidden="true" />
            </div>

            <div class="flex flex-col gap-1.5">
              <div class="flex gap-[4px] h-[14px] text-[10px] leading-[14px] text-[#8E95A5] select-none">
                <For each={props.heatmapData.weeks}>
                  {(week) => (
                    <div class="w-[18px] shrink-0 overflow-visible whitespace-nowrap">
                      {week.monthLabel}
                    </div>
                  )}
                </For>
              </div>

              <div class="flex gap-[4px]">
                <For each={props.heatmapData.weeks}>
                  {(week) => (
                    <div class="flex flex-col gap-[4px] shrink-0">
                      <For each={week.days}>
                        {(cell) => (
                          <Show
                            when={cell.inRange}
                            fallback={
                              <div class="w-[18px] h-[18px] rounded-[4px] bg-transparent" />
                            }
                          >
                            <button
                              type="button"
                              onClick={() => props.onSelectDay(cell.dayIndex)}
                              onMouseEnter={() =>
                                setHoveredCell({
                                  dayIndex: cell.dayIndex,
                                  done: cell.done,
                                  scheduled: cell.scheduled,
                                })
                              }
                              onMouseLeave={() => setHoveredCell(null)}
                              onFocus={() =>
                                setHoveredCell({
                                  dayIndex: cell.dayIndex,
                                  done: cell.done,
                                  scheduled: cell.scheduled,
                                })
                              }
                              onBlur={() => setHoveredCell(null)}
                              title={`${CivilCalendar.formatShortDate(cell.dayIndex)}: ${cell.done}/${cell.scheduled} scheduled`}
                              aria-label={`${CivilCalendar.formatShortDate(cell.dayIndex)}: ${cell.done} of ${cell.scheduled} completed`}
                              class={`w-[18px] h-[18px] rounded-[4px] transition-transform duration-100 hover:scale-115 cursor-pointer ${heatmapSquareClass(
                                cell.tone
                              )} ${
                                cell.dayIndex === props.selectedDay
                                  ? 'ring-2 ring-white ring-offset-1 ring-offset-[#14161B]'
                                  : ''
                              }`}
                            />
                          </Show>
                        )}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between flex-wrap gap-2 text-[11px] text-[#8E95A5] pt-1 border-t border-white/[0.06]">
          <div class="min-w-0 flex-1 space-y-0.5">
            <Show
              when={hoveredCell()}
              fallback={
                <span class="font-mono tabular-nums block">
                  Selected: {CivilCalendar.formatShortDate(props.selectedDay)}
                  <Show when={activeHeatmapDayNotes().length > 0}>
                    {' '}
                    · {activeHeatmapDayNotes().length}{' '}
                    {activeHeatmapDayNotes().length === 1 ? 'note' : 'notes'}:{' '}
                    <span class="text-[#C8CDD8]">
                      “{activeHeatmapDayNotes()[0]}”
                    </span>
                  </Show>
                </span>
              }
            >
              {(cell) => (
                <span class="font-mono tabular-nums text-[#F5F7FA] block truncate">
                  {CivilCalendar.formatShortDate(cell().dayIndex)} · {cell().done}/
                  {cell().scheduled} completed
                  <Show when={activeHeatmapDayNotes().length > 0}>
                    {' '}
                    · {activeHeatmapDayNotes().length}{' '}
                    {activeHeatmapDayNotes().length === 1 ? 'note' : 'notes'}:{' '}
                    <span class="text-[#93C5FD]">
                      “{activeHeatmapDayNotes()[0]}”
                    </span>
                  </Show>
                </span>
              )}
            </Show>
          </div>

          <div
            class="flex items-center gap-1.5 shrink-0"
            title="Rest = unscheduled · Red = unclosed severity · Blue = 100% done"
          >
            <span>Rest</span>
            <span class="w-[14px] h-[14px] rounded-[3px] bg-[#0D1016] border border-white/[0.06]" />
            <span class="ml-1">0%</span>
            <span class="w-[14px] h-[14px] rounded-[3px] bg-[#EF4444]" />
            <span class="w-[14px] h-[14px] rounded-[3px] bg-[#B91C1C]" />
            <span class="w-[14px] h-[14px] rounded-[3px] bg-[#881B22]" />
            <span class="w-[14px] h-[14px] rounded-[3px] bg-[#581C24]" />
            <span>Done</span>
            <span class="w-[14px] h-[14px] rounded-[3px] bg-[#3B82F6]" />
          </div>
        </div>
      </section>

      {/* Row 4: Habit Breakdown */}
      <Show
        when={
          props.habitBreakdown.length > 0 &&
          (props.habitFilter === 'all' || props.targetHabits.length > 1)
        }
      >
        <section class="rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
          <div class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
            <div>
              <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                Habit Breakdown
              </h2>
              <p class="text-xs text-[#8E95A5]">
                {props.rangeLabel} ·{' '}
                <span class="font-mono tabular-nums">
                  {DateRangeResolver.formatRangeLabel(
                    props.effectiveRangeStart,
                    props.effectiveRangeEnd
                  )}
                </span>
              </p>
            </div>
            <span class="text-xs font-mono tabular-nums text-[#8E95A5]">
              {props.habitBreakdown.length}{' '}
              {props.habitBreakdown.length === 1 ? 'habit' : 'habits'}
            </span>
          </div>

          <ul class="divide-y divide-white/[0.06]">
            <For each={props.habitBreakdown}>
              {(row) => {
                const pct = () => Math.round(row.completionRate * 100);
                return (
                  <li>
                    <button
                      type="button"
                      onClick={() => props.onSelectHabitFilter([row.habit.id])}
                      class="w-full text-left px-6 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div class="min-w-0 space-y-1 flex-1">
                        <div class="flex items-start gap-2.5">
                          <HabitBadge appearanceRaw={row.habit.color} size="sm" />
                          <span
                            class="text-sm font-medium text-[#F5F7FA] line-clamp-2 break-words"
                            title={row.habit.name}
                          >
                            {row.habit.name}
                          </span>
                          <Show when={row.habit.archivedAt !== null}>
                            <span class="text-[11px] text-[#6B7280] shrink-0">
                              (Archived)
                            </span>
                          </Show>
                        </div>
                        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs font-mono tabular-nums text-[#8E95A5]">
                          <span>
                            {row.completedDays} done · {row.missedDays} missed
                          </span>
                          <Show when={row.totalValue !== undefined}>
                            <span aria-hidden="true">·</span>
                            <span class="text-[#C8CDD8]">
                              {HabitSchedule.formatNumericValue(row.totalValue!)}
                              {row.unit ? ` ${row.unit}` : ''} total
                            </span>
                          </Show>
                          <Show when={row.habit.weeklyTarget !== null}>
                            <span aria-hidden="true">·</span>
                            <span>{row.habit.weeklyTarget}×/wk</span>
                          </Show>
                          <Show when={(props.habitTrends.get(row.habit.id)?.bonusCount ?? 0) > 0}>
                            <span aria-hidden="true">·</span>
                            <span class="text-[#60A5FA]">
                              +{props.habitTrends.get(row.habit.id)!.bonusCount} bonus
                            </span>
                          </Show>
                          <span aria-hidden="true">·</span>
                          <span>
                            {row.currentStreak}
                            {row.streakUnit === 'weeks' ? 'w' : 'd'} current
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {row.longestStreak}
                            {row.streakUnit === 'weeks' ? 'w' : 'd'} best
                          </span>
                          <Show when={props.habitTrends.get(row.habit.id)?.deltaPct !== null && props.habitTrends.get(row.habit.id)?.deltaPct !== undefined}>
                            {(() => {
                              const d = props.habitTrends.get(row.habit.id)!.deltaPct!;
                              return (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span
                                    class={
                                      d > 0
                                        ? 'text-[#60A5FA]'
                                        : d < 0
                                          ? 'text-[#FCA5A5]'
                                          : 'text-[#8E95A5]'
                                    }
                                    title="Second half vs first half of period"
                                  >
                                    {d > 0 ? `↗ +${d}%` : d < 0 ? `↘ ${d}%` : '→ 0%'}
                                  </span>
                                </>
                              );
                            })()}
                          </Show>
                        </div>
                      </div>

                      <div class="flex items-center gap-3 sm:w-52 shrink-0">
                        <div class="flex-1 h-2 rounded-full bg-[#0A0B0E] border border-white/[0.06] overflow-hidden">
                          <div
                            class="h-full rounded-full transition-all"
                            style={{
                              width: `${pct()}%`,
                              'background-color': HabitAppearance.getColor(
                                row.habit.color
                              ),
                            }}
                          />
                        </div>
                        <span class="w-10 text-right text-sm font-mono tabular-nums font-medium text-[#F5F7FA]">
                          {pct()}%
                        </span>
                      </div>
                    </button>
                  </li>
                );
              }}
            </For>
          </ul>
        </section>
      </Show>
    </div>
  );
}

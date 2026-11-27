import { For, JSX, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { Habit, HabitCheckin } from '../../types/domain';
import { ChartsAnalytics } from '../../utils/charts-analytics';
import { DateRangeResolver } from '../../utils/date-range';
import { HabitAppearance } from '../../utils/habit-appearance';

interface ConsistencyTrendChartProps {
  targetHabits: Habit[];
  checkins: HabitCheckin[];
  effectiveRangeStart: number;
  effectiveRangeEnd: number;
  completionRate: number;
}

export function ConsistencyTrendChart(props: ConsistencyTrendChartProps): JSX.Element {
  const [hoveredTrendIdx, setHoveredTrendIdx] = createSignal<number | null>(null);
  const [trendPlotEl, setTrendPlotEl] = createSignal<HTMLDivElement | null>(null);
  const [trendPlotSize, setTrendPlotSize] = createSignal({ width: 540, height: 144 });

  createEffect(() => {
    const el = trendPlotEl();
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setTrendPlotSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    onCleanup(() => observer.disconnect());
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
    const { width, height } = trendPlotSize();
    const padLeft = 10;
    const padRight = 10;
    const padTop = 8;
    const padBottom = 8;
    const plotW = Math.max(1, width - padLeft - padRight);
    const plotH = Math.max(1, height - padTop - padBottom);
    const n = buckets.length;

    const points = buckets.map((bucket, idx) => {
      const x = n <= 1 ? padLeft + plotW / 2 : padLeft + (idx / (n - 1)) * plotW;
      const y = bucket.rate === null ? null : padTop + (1 - bucket.rate) * plotH;
      const maY =
        bucket.movingAvgRate === null ? null : padTop + (1 - bucket.movingAvgRate) * plotH;
      return { ...bucket, idx, x, y, maY };
    });

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

  return (
    <section class="flex flex-col justify-between space-y-4 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6 lg:col-span-7">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="font-display text-base font-semibold text-ink">Consistency Trend</h2>
          <p class="font-mono text-xs text-ink-subtle tabular-nums">
            <Show
              when={activeTrendPoint()}
              fallback={
                <span>
                  {DateRangeResolver.formatRangeLabel(
                    props.effectiveRangeStart,
                    props.effectiveRangeEnd
                  )}{' '}
                  · {Math.round(props.completionRate * 100)}% avg
                </span>
              }
            >
              {(pt) => (
                <span class="text-ink">
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
            <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-subtle">
              <span class="w-3.5 border-t border-dashed border-accent-tint/80" />
              <span>Moving avg</span>
            </span>
          </Show>
          <Show when={trendChart().trendDeltaPct !== null}>
            <span
              class={`font-mono text-xs tabular-nums ${
                (trendChart().trendDeltaPct ?? 0) > 0
                  ? 'text-accent-soft'
                  : (trendChart().trendDeltaPct ?? 0) < 0
                    ? 'text-danger-soft'
                    : 'text-ink-subtle'
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
            <p class="text-sm text-ink-subtle">No scheduled habit days in this date range.</p>
          </div>
        }
      >
        <div class="w-full space-y-1.5">
          <div class="flex items-stretch gap-2">
            {/* HTML Y-axis labels so numbers stay crisp and readable on mobile */}
            <div
              aria-hidden="true"
              class="relative w-9 shrink-0 text-right font-mono text-[11px] leading-none text-ink-subtle tabular-nums select-none"
            >
              <span
                class="absolute right-0 -translate-y-1/2"
                style={{ top: `${trendChart().padTop}px` }}
              >
                100%
              </span>
              <span class="absolute top-1/2 right-0 -translate-y-1/2">50%</span>
              <span
                class="absolute right-0 translate-y-1/2"
                style={{ bottom: `${trendChart().padBottom}px` }}
              >
                0%
              </span>
            </div>

            <div ref={setTrendPlotEl} class="relative h-36 min-w-0 flex-1 sm:h-40">
              <svg
                viewBox={`0 0 ${trendChart().width} ${trendChart().height}`}
                class="block h-full w-full overflow-visible"
                role="img"
                aria-label="Habit consistency completion rate trend chart"
              >
                <defs>
                  <linearGradient id="consistencyTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color={trendChart().accentColor} stop-opacity="0.28" />
                    <stop offset="100%" stop-color={trendChart().accentColor} stop-opacity="0" />
                  </linearGradient>
                </defs>

                {/* Horizontal gridlines: 100%, 50%, 0% */}
                <For each={[1, 0.5, 0]}>
                  {(ratio) => {
                    const y = () => trendChart().padTop + (1 - ratio) * trendChart().plotH;
                    return (
                      <line
                        x1={0}
                        y1={y()}
                        x2={trendChart().width}
                        y2={y()}
                        stroke="rgba(255,255,255,0.07)"
                        stroke-dasharray={ratio === 0 ? undefined : '3 4'}
                      />
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
                            r={isHovered() ? 5 : 3.5}
                            fill={isHovered() ? '#F5F7FA' : trendChart().accentColor}
                            stroke="#14161B"
                            stroke-width="1.5"
                          />
                        </Show>
                        {/* Generous hit target column */}
                        <rect
                          x={
                            pt.x - trendChart().plotW / Math.max(2, trendChart().points.length * 2)
                          }
                          y={trendChart().padTop}
                          width={trendChart().plotW / Math.max(1, trendChart().points.length)}
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
          </div>

          {/* HTML X-axis labels */}
          <div class="pl-11">
            <div class="relative h-4 font-mono text-[11px] leading-4 text-ink-subtle tabular-nums select-none">
              <For each={trendChart().points}>
                {(pt) => {
                  const showLabel = () => {
                    const len = trendChart().points.length;
                    if (len <= 7) return true;
                    if (pt.idx === 0 || pt.idx === len - 1) return true;
                    const maxTicks = trendChart().width < 420 ? 5 : 6;
                    const step = Math.ceil(len / maxTicks);
                    return pt.idx % step === 0 && len - 1 - pt.idx >= step / 2;
                  };
                  const leftPct = () => (pt.x / Math.max(1, trendChart().width)) * 100;
                  return (
                    <Show when={showLabel()}>
                      <span
                        class="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                        style={{ left: `${leftPct()}%` }}
                      >
                        {pt.shortLabel}
                      </span>
                    </Show>
                  );
                }}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </section>
  );
}

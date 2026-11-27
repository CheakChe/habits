import {
  JSX,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  untrack,
} from 'solid-js';
import { DomainSnapshot, Habit, HistorySubTab } from '../types/domain';
import {
  AdvancedAnalyticsReport,
  AdvancedHeatmapMode,
  AdvancedNotesFilter,
} from '../utils/advanced-analytics';
import { ChartsAnalytics } from '../utils/charts-analytics';
import { CivilCalendar } from '../utils/civil-calendar';
import {
  DateRangePresetId,
  DateRangeResolver,
  DayCellClassifier,
  DayCellTone,
} from '../utils/date-range';
import { StreakCalculator, StreakUnit } from '../utils/streak-calculator';
import { TaskAnalytics } from '../utils/task-analytics';
import { MultiSelect } from './controls/MultiSelect';
import { SelectOption } from './controls/Select';
import { HistoryRangePicker } from './controls/HistoryRangePicker';
import { HistoryAdvancedPanel } from './history/HistoryAdvancedPanel';
import { HistoryCalendarPanel } from './history/HistoryCalendarPanel';
import { HistoryChartsPanel, PeriodComparisonView } from './history/HistoryChartsPanel';
import { CalendarIcon, HistoryTabIcon, LayersIcon } from './Icons';

interface HistoryViewProps {
  snapshot: DomainSnapshot;
  todayDay: number;
  timeZone: string;
  subTab: HistorySubTab;
  onSelectSubTab: (tab: HistorySubTab) => void;
  habitFilter: 'all' | number[];
  onChangeHabitFilter: (filter: 'all' | number[]) => void;
  rangePreset: DateRangePresetId;
  customStartDay: number;
  customEndDay: number;
  onSelectRangePreset: (preset: DateRangePresetId) => void;
  onSelectCustomRange: (startDay: number, endDay: number) => void;
  onChangeTimeZone: (timeZone: string) => void;
  advancedHeatmapMode: AdvancedHeatmapMode;
  onChangeAdvancedHeatmapMode: (mode: AdvancedHeatmapMode) => void;
  advancedNotesFilter: AdvancedNotesFilter;
  onChangeAdvancedNotesFilter: (filter: AdvancedNotesFilter) => void;
  getAdvancedAnalytics: (
    targetHabits: Habit[],
    habitFilter: 'all' | number[],
    startDay: number,
    endDay: number
  ) => AdvancedAnalyticsReport;
  onToggleCheckin: (habitId: number, dayIndex: number, nextDone: boolean) => Promise<void>;
  onSetCheckinValue: (habitId: number, dayIndex: number, value: number) => Promise<void>;
  onIncrementCheckinValue: (habitId: number, dayIndex: number, delta: number) => Promise<void>;
  onSaveNote: (habitId: number, dayIndex: number, text: string) => Promise<void>;
}

export function HistoryView(props: HistoryViewProps): JSX.Element {
  const initialDay = untrack(() => {
    const initialRange = DateRangeResolver.resolve(props.rangePreset, props.todayDay, {
      customStartDay: props.customStartDay,
      customEndDay: props.customEndDay,
      snapshot: props.snapshot,
      timeZone: props.timeZone,
    });
    return Math.min(initialRange.endDay, props.todayDay);
  });
  const initialLocal = CivilCalendar.toLocalDate(initialDay);
  const [viewYear, setViewYear] = createSignal(initialLocal.year);
  const [viewMonth, setViewMonth] = createSignal(initialLocal.month);
  const [selectedDay, setSelectedDay] = createSignal(initialDay);

  createEffect(() => {
    if (selectedDay() > props.todayDay) {
      setSelectedDay(props.todayDay);
    }
  });

  const resolvedRange = createMemo(() =>
    DateRangeResolver.resolve(props.rangePreset, props.todayDay, {
      customStartDay: props.customStartDay,
      customEndDay: props.customEndDay,
      snapshot: props.snapshot,
      timeZone: props.timeZone,
    })
  );

  const effectiveRangeEnd = createMemo(() => Math.min(resolvedRange().endDay, props.todayDay));
  const effectiveRangeStart = createMemo(() =>
    Math.min(resolvedRange().startDay, effectiveRangeEnd())
  );

  const syncCalendarToRangeEnd = (endDay: number) => {
    const target = Math.min(endDay, props.todayDay);
    const local = CivilCalendar.toLocalDate(target);
    setViewYear(local.year);
    setViewMonth(local.month);
    setSelectedDay(target);
  };

  const handleSelectPreset = (nextPreset: DateRangePresetId) => {
    props.onSelectRangePreset(nextPreset);
    if (nextPreset !== 'custom') {
      const next = DateRangeResolver.resolve(nextPreset, props.todayDay, {
        snapshot: props.snapshot,
        timeZone: props.timeZone,
      });
      syncCalendarToRangeEnd(next.endDay);
    }
  };

  const handleSelectCustomRange = (startDay: number, endDay: number) => {
    const s = Math.min(startDay, endDay);
    const e = Math.min(Math.max(startDay, endDay), props.todayDay);
    props.onSelectCustomRange(s, e);
    syncCalendarToRangeEnd(e);
  };

  const targetHabits = createMemo(() => {
    const filter = props.habitFilter;
    if (filter === 'all') return props.snapshot.habits;
    const allowed = new Set(filter);
    return props.snapshot.habits.filter((h) => allowed.has(h.id));
  });

  const analyticsSummary = createMemo(
    (): {
      currentStreak: number;
      currentStreakUnit: StreakUnit;
      longestStreak: number;
      longestStreakUnit: StreakUnit;
      completionRate: number;
      scheduledDays: number;
      completedScheduledDays: number;
      missedScheduledDays: number;
    } => {
      const habits = targetHabits();
      if (habits.length === 0) {
        return {
          currentStreak: 0,
          currentStreakUnit: 'days',
          longestStreak: 0,
          longestStreakUnit: 'days',
          completionRate: 0,
          scheduledDays: 0,
          completedScheduledDays: 0,
          missedScheduledDays: 0,
        };
      }

      let bestCurrent = 0;
      let bestCurrentEquiv = -1;
      let bestCurrentUnit: StreakUnit = 'days';
      let bestLongest = 0;
      let bestLongestEquiv = -1;
      let bestLongestUnit: StreakUnit = 'days';
      let totalScheduled = 0;
      let totalCompleted = 0;
      const startDay = effectiveRangeStart();
      const endDay = effectiveRangeEnd();
      const allowPending = endDay >= props.todayDay;

      for (const habit of habits) {
        const m = StreakCalculator.calculate(
          habit,
          props.snapshot.checkins,
          startDay,
          endDay,
          allowPending
        );
        const currEquiv = m.streakUnit === 'weeks' ? m.currentStreak * 7 : m.currentStreak;
        if (currEquiv > bestCurrentEquiv) {
          bestCurrentEquiv = currEquiv;
          bestCurrent = m.currentStreak;
          bestCurrentUnit = m.streakUnit;
        }
        const longEquiv = m.streakUnit === 'weeks' ? m.longestStreak * 7 : m.longestStreak;
        if (longEquiv > bestLongestEquiv) {
          bestLongestEquiv = longEquiv;
          bestLongest = m.longestStreak;
          bestLongestUnit = m.streakUnit;
        }
        totalScheduled += m.scheduledDays;
        totalCompleted += m.completedScheduledDays;
      }

      return {
        currentStreak: bestCurrent,
        currentStreakUnit: bestCurrentUnit,
        longestStreak: bestLongest,
        longestStreakUnit: bestLongestUnit,
        completionRate: totalScheduled === 0 ? 0 : totalCompleted / totalScheduled,
        scheduledDays: totalScheduled,
        completedScheduledDays: totalCompleted,
        missedScheduledDays: Math.max(0, totalScheduled - totalCompleted),
      };
    }
  );

  const perfectDays = createMemo(() =>
    ChartsAnalytics.perfectDaysSummary(
      targetHabits(),
      props.snapshot.checkins,
      effectiveRangeStart(),
      effectiveRangeEnd(),
      props.todayDay
    )
  );

  const habitTrends = createMemo(() =>
    ChartsAnalytics.habitTrendDeltas(
      targetHabits(),
      props.snapshot.checkins,
      effectiveRangeStart(),
      effectiveRangeEnd(),
      props.todayDay
    )
  );

  const habitBreakdown = createMemo(() =>
    StreakCalculator.summarizeHabitsForRange(
      targetHabits(),
      props.snapshot.checkins,
      effectiveRangeStart(),
      effectiveRangeEnd(),
      props.todayDay
    )
  );

  const taskSummary = createMemo(() =>
    TaskAnalytics.summarizeRange(
      props.snapshot.tasks,
      effectiveRangeStart(),
      effectiveRangeEnd(),
      props.timeZone
    )
  );

  const prevComparison = createMemo((): PeriodComparisonView | null => {
    const prev = DateRangeResolver.previousPeriod(
      props.rangePreset,
      effectiveRangeStart(),
      effectiveRangeEnd()
    );
    if (!prev) return null;

    const habits = targetHabits();
    let prevScheduled = 0;
    let prevCompleted = 0;
    for (const h of habits) {
      const m = StreakCalculator.calculate(
        h,
        props.snapshot.checkins,
        prev.startDay,
        prev.endDay,
        false
      );
      prevScheduled += m.scheduledDays;
      prevCompleted += m.completedScheduledDays;
    }

    const curHabitsSummary = analyticsSummary();
    const habitRateDeltaPct =
      prevScheduled > 0 && curHabitsSummary.scheduledDays > 0
        ? Math.round((curHabitsSummary.completionRate - prevCompleted / prevScheduled) * 100)
        : null;

    const prevTasks = TaskAnalytics.summarizeRange(
      props.snapshot.tasks,
      prev.startDay,
      prev.endDay,
      props.timeZone
    );
    const curTasks = taskSummary();
    const taskDoneDelta =
      prevTasks.doneCount > 0 || curTasks.doneCount > 0
        ? curTasks.doneCount - prevTasks.doneCount
        : null;
    const taskRateDeltaPct =
      prevTasks.completionRate !== null && curTasks.completionRate !== null
        ? Math.round((curTasks.completionRate - prevTasks.completionRate) * 100)
        : null;

    return {
      prevLabel: prev.label,
      habitRateDeltaPct,
      taskDoneDelta,
      taskRateDeltaPct,
    };
  });

  const taskOutcomeBuckets = createMemo(() =>
    TaskAnalytics.rangeOutcomeBuckets(
      props.snapshot.tasks,
      effectiveRangeStart(),
      effectiveRangeEnd(),
      12,
      props.timeZone
    )
  );

  const heatmapData = createMemo(() => {
    const effectiveEnd = effectiveRangeEnd();
    const effectiveStart = effectiveRangeStart();
    const maxWeeks = 104;
    const minAllowedStart = effectiveEnd - (maxWeeks * 7 - 1);
    const clampedStart = Math.max(effectiveStart, minAllowedStart);
    const isCapped = clampedStart > effectiveStart;

    const firstWeekStart = CivilCalendar.startOfWeek(clampedStart);
    const endWeekStart = CivilCalendar.startOfWeek(effectiveEnd);
    const weeksCount = Math.max(1, Math.floor((endWeekStart - firstWeekStart) / 7) + 1);
    const habits = targetHabits();
    const dayStats = StreakCalculator.getPeriodDayStats(
      habits,
      props.snapshot.checkins,
      clampedStart,
      effectiveEnd,
      props.todayDay
    );

    const weeks: {
      weekStart: number;
      monthLabel: string;
      days: {
        dayIndex: number;
        inRange: boolean;
        done: number;
        scheduled: number;
        tone: DayCellTone;
      }[];
    }[] = [];

    let lastMonth = -1;
    let totalDone = 0;

    for (let w = 0; w < weeksCount; w++) {
      const weekStart = firstWeekStart + w * 7;
      const startLocal = CivilCalendar.toLocalDate(weekStart);
      let monthLabel = '';
      if (startLocal.month !== lastMonth) {
        const shortMonth = CivilCalendar.formatShortDate(weekStart).split(' ')[0];
        if (w === 0 && weeksCount > 4) {
          const nextLocal = CivilCalendar.toLocalDate(weekStart + 7);
          if (nextLocal.month === startLocal.month) {
            monthLabel = shortMonth;
          }
        } else {
          monthLabel = shortMonth;
        }
        lastMonth = startLocal.month;
      }

      const days: {
        dayIndex: number;
        inRange: boolean;
        done: number;
        scheduled: number;
        tone: DayCellTone;
      }[] = [];

      for (let d = 0; d < 7; d++) {
        const dayIndex = weekStart + d;
        if (dayIndex < clampedStart || dayIndex > effectiveEnd) {
          days.push({
            dayIndex,
            inRange: false,
            done: 0,
            scheduled: 0,
            tone: 'future',
          });
          continue;
        }
        const entry = dayStats.get(dayIndex);
        const scheduled = entry?.scheduled ?? 0;
        const done = entry?.done ?? 0;
        totalDone += done;
        const tone = DayCellClassifier.classify(dayIndex, props.todayDay, scheduled, done);
        days.push({ dayIndex, inRange: true, done, scheduled, tone });
      }
      weeks.push({ weekStart, monthLabel, days });
    }

    return { weeks, totalDone, clampedStart, effectiveEnd, isCapped };
  });

  const goPrevMonth = () => {
    if (viewMonth() === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth() === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const isDatabaseEmpty = createMemo(
    () =>
      props.snapshot.habits.length === 0 && props.snapshot.tasks.every((t) => t.deletedAt !== null)
  );

  const inspectDayInCalendar = (dayIndex: number) => {
    const target = Math.min(dayIndex, props.todayDay);
    const local = CivilCalendar.toLocalDate(target);
    setViewYear(local.year);
    setViewMonth(local.month);
    setSelectedDay(target);
    props.onSelectSubTab('calendar');
  };

  return (
    <div class="space-y-6">
      <div class="flex flex-col gap-4 border-b border-white/[0.08] pb-5">
        <div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div class="min-w-0 space-y-1">
            <h1 class="font-display text-3xl font-semibold tracking-tight text-ink">Progress</h1>
            <p class="text-sm text-ink-subtle">
              {props.subTab === 'calendar'
                ? 'Inspect past days, edit check-ins, and review daily notes and tasks.'
                : props.subTab === 'charts'
                  ? 'Track habit consistency trends, weekday patterns, and task discipline over time.'
                  : 'Explore deeper behavioral diagnostics, backlog flow, workload forecast, and notes.'}
            </p>
          </div>

          {/* Sub-tab Segmented Control: Calendar | Charts | Advanced */}
          <div
            role="tablist"
            aria-label="Progress view mode"
            class="inline-flex max-w-full shrink-0 items-center self-start overflow-x-auto rounded-xl border border-white/[0.08] bg-surface p-1 lg:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={props.subTab === 'calendar'}
              onClick={() => props.onSelectSubTab('calendar')}
              class={`inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors sm:gap-2 sm:px-3.5 ${
                props.subTab === 'calendar'
                  ? 'bg-accent text-white'
                  : 'text-ink-subtle hover:text-ink'
              }`}
            >
              <CalendarIcon class="h-3.5 w-3.5" />
              <span>Calendar</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={props.subTab === 'charts'}
              onClick={() => props.onSelectSubTab('charts')}
              class={`inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors sm:gap-2 sm:px-3.5 ${
                props.subTab === 'charts'
                  ? 'bg-accent text-white'
                  : 'text-ink-subtle hover:text-ink'
              }`}
            >
              <HistoryTabIcon class="h-3.5 w-3.5" />
              <span>Charts</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={props.subTab === 'advanced'}
              onClick={() => props.onSelectSubTab('advanced')}
              class={`inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors sm:gap-2 sm:px-3.5 ${
                props.subTab === 'advanced'
                  ? 'bg-accent text-white'
                  : 'text-ink-subtle hover:text-ink'
              }`}
            >
              <LayersIcon class="h-3.5 w-3.5" />
              <span>Advanced</span>
            </button>
          </div>
        </div>

        {/* Context Filters Row */}
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <MultiSelect<number>
              ariaLabel="Filter by habits"
              value={props.habitFilter}
              options={props.snapshot.habits.map((h): SelectOption<number> => ({
                value: h.id,
                label: h.name,
                hint: h.archivedAt !== null ? 'Archived' : undefined,
                dotColor: h.color,
              }))}
              allLabel={`All Habits (${props.snapshot.habits.length})`}
              emptyLabel="No habits selected"
              selectedNoun={{ one: 'habit', many: 'habits' }}
              align="left"
              onChange={(val) => props.onChangeHabitFilter(val)}
            />

            <Show when={props.subTab === 'charts' || props.subTab === 'advanced'}>
              <HistoryRangePicker
                preset={props.rangePreset}
                customStartDay={props.customStartDay}
                customEndDay={props.customEndDay}
                resolvedRange={resolvedRange()}
                todayDay={props.todayDay}
                timeZone={props.timeZone}
                onSelectPreset={handleSelectPreset}
                onSelectCustomRange={handleSelectCustomRange}
                onChangeTimeZone={props.onChangeTimeZone}
              />
            </Show>
          </div>

          <Show when={props.subTab === 'calendar'}>
            <span class="font-mono text-xs text-ink-subtle tabular-nums">
              Best streak: {analyticsSummary().currentStreak}
              {analyticsSummary().currentStreakUnit === 'weeks' ? 'w' : 'd'} current ·{' '}
              {analyticsSummary().longestStreak}
              {analyticsSummary().longestStreakUnit === 'weeks' ? 'w' : 'd'} best
            </span>
          </Show>
        </div>
      </div>

      <Show
        when={!isDatabaseEmpty()}
        fallback={
          <div class="space-y-2 rounded-2xl border border-white/[0.08] bg-surface px-6 py-14 text-center">
            <p class="text-sm font-medium text-ink">Empty Period</p>
            <p class="mx-auto max-w-md text-sm text-ink-subtle">
              Create habits and check them off or complete tasks to see real streaks, heatmaps, and
              weekly completion charts.
            </p>
          </div>
        }
      >
        <Switch>
          <Match when={props.subTab === 'charts'}>
            <HistoryChartsPanel
              habits={props.snapshot.habits}
              targetHabits={targetHabits()}
              habitFilter={props.habitFilter}
              checkins={props.snapshot.checkins}
              notes={props.snapshot.notes}
              tasks={props.snapshot.tasks}
              effectiveRangeStart={effectiveRangeStart()}
              effectiveRangeEnd={effectiveRangeEnd()}
              rangeLabel={resolvedRange().label}
              timeZone={props.timeZone}
              analyticsSummary={analyticsSummary()}
              perfectDays={perfectDays()}
              prevComparison={prevComparison()}
              habitTrends={habitTrends()}
              taskSummary={taskSummary()}
              taskOutcomeBuckets={taskOutcomeBuckets()}
              habitBreakdown={habitBreakdown()}
              heatmapData={heatmapData()}
              selectedDay={selectedDay()}
              onSelectDay={(day) => setSelectedDay(day)}
              onInspectDayInCalendar={inspectDayInCalendar}
              onSelectHabitFilter={(filter) => props.onChangeHabitFilter(filter)}
            />
          </Match>

          <Match when={props.subTab === 'advanced'}>
            <HistoryAdvancedPanel
              report={props.getAdvancedAnalytics(
                targetHabits(),
                props.habitFilter,
                effectiveRangeStart(),
                effectiveRangeEnd()
              )}
              effectiveRangeStart={effectiveRangeStart()}
              effectiveRangeEnd={effectiveRangeEnd()}
              rangeLabel={resolvedRange().label}
              selectedDay={selectedDay()}
              heatmapMode={props.advancedHeatmapMode}
              notesFilter={props.advancedNotesFilter}
              onChangeHeatmapMode={props.onChangeAdvancedHeatmapMode}
              onChangeNotesFilter={props.onChangeAdvancedNotesFilter}
              onSelectDay={(day) => setSelectedDay(day)}
              onInspectDayInCalendar={inspectDayInCalendar}
              onSelectHabitFilter={(filter) => props.onChangeHabitFilter(filter)}
            />
          </Match>

          <Match when={props.subTab === 'calendar'}>
            <HistoryCalendarPanel
              snapshot={props.snapshot}
              targetHabits={targetHabits()}
              habitFilter={props.habitFilter}
              todayDay={props.todayDay}
              timeZone={props.timeZone}
              viewYear={viewYear()}
              viewMonth={viewMonth()}
              selectedDay={selectedDay()}
              onPrevMonth={goPrevMonth}
              onNextMonth={goNextMonth}
              onSelectDay={(day) => setSelectedDay(day)}
              onChangeHabitFilter={props.onChangeHabitFilter}
              onToggleCheckin={props.onToggleCheckin}
              onSetCheckinValue={props.onSetCheckinValue}
              onIncrementCheckinValue={props.onIncrementCheckinValue}
              onSaveNote={props.onSaveNote}
            />
          </Match>
        </Switch>
      </Show>
    </div>
  );
}

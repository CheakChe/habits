import { For, JSX, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot, HistorySubTab } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import {
  DateRangePresetId,
  DateRangeResolver,
  DayCellClassifier,
  DayCellTone,
} from '../utils/date-range';
import { StreakCalculator, StreakUnit } from '../utils/streak-calculator';
import { TaskAnalytics } from '../utils/task-analytics';
import { HabitAppearance } from '../utils/habit-appearance';
import { CustomMultiSelect, HistoryRangePicker, SelectOption } from './CustomControls';
import { HabitBadge } from './HabitBadge';
import { HistoryChartsPanel } from './HistoryChartsPanel';
import {
  ArchiveIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  HistoryTabIcon,
  NoteIcon,
  RepeatIcon,
} from './Icons';

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
  onToggleCheckin: (habitId: number, dayIndex: number, nextDone: boolean) => Promise<void>;
  onSaveNote: (habitId: number, dayIndex: number, text: string) => Promise<void>;
}

function calendarTileClass(tone: DayCellTone, isSelected: boolean): string {
  if (isSelected) {
    return 'bg-[#3B82F6]/25 border-[#3B82F6] text-white';
  }
  switch (tone) {
    case 'complete':
      return 'bg-[#3B82F6]/15 border-[#3B82F6]/40 text-[#F5F7FA] hover:bg-[#3B82F6]/25';
    case 'missed-slight':
      return 'bg-[#7F1D1D]/20 border-[#EF4444]/25 text-[#FECACA] hover:bg-[#7F1D1D]/30';
    case 'missed-moderate':
      return 'bg-[#991B1B]/30 border-[#EF4444]/40 text-[#FECACA] hover:bg-[#991B1B]/40';
    case 'missed-heavy':
      return 'bg-[#B91C1C]/40 border-[#EF4444]/55 text-[#FEE2E2] hover:bg-[#B91C1C]/50';
    case 'missed-all':
      return 'bg-[#DC2626]/35 border-[#EF4444]/75 text-[#FEE2E2] hover:bg-[#DC2626]/45';
    case 'today-open':
      return 'bg-[#451A1D]/55 border-[#EF4444]/40 text-[#F5F7FA] hover:bg-[#451A1D]/75';
    case 'unscheduled':
    case 'future':
    default:
      return 'bg-[#0A0B0E] border-white/[0.06] text-[#9AA1B1] hover:border-white/20';
  }
}

export function HistoryView(props: HistoryViewProps): JSX.Element {
  const initialRange = DateRangeResolver.resolve(props.rangePreset, props.todayDay, {
    customStartDay: props.customStartDay,
    customEndDay: props.customEndDay,
    snapshot: props.snapshot,
    timeZone: props.timeZone,
  });
  const initialDay = Math.min(initialRange.endDay, props.todayDay);
  const initialLocal = CivilCalendar.toLocalDate(initialDay);
  const [viewYear, setViewYear] = createSignal(initialLocal.year);
  const [viewMonth, setViewMonth] = createSignal(initialLocal.month);
  const [selectedDay, setSelectedDay] = createSignal(initialDay);
  const [editingNoteHabitId, setEditingNoteHabitId] = createSignal<number | null>(null);
  const [noteDraft, setNoteDraft] = createSignal('');

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

  const effectiveRangeEnd = createMemo(() =>
    Math.min(resolvedRange().endDay, props.todayDay)
  );
  const effectiveRangeStart = createMemo(() =>
    Math.min(resolvedRange().startDay, effectiveRangeEnd())
  );

  const syncCalendarToRangeEnd = (endDay: number) => {
    const target = Math.min(endDay, props.todayDay);
    const local = CivilCalendar.toLocalDate(target);
    setViewYear(local.year);
    setViewMonth(local.month);
    setSelectedDay(target);
    setEditingNoteHabitId(null);
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

  const checkinIndex = createMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of props.snapshot.checkins) {
      map.set(`${c.habitId}:${c.dayIndex}`, c.done);
    }
    return map;
  });

  const noteIndex = createMemo(() => {
    const map = new Map<string, string>();
    for (const n of props.snapshot.notes) {
      map.set(`${n.habitId}:${n.dayIndex}`, n.text);
    }
    return map;
  });

  const targetHabits = createMemo(() => {
    const filter = props.habitFilter;
    if (filter === 'all') return props.snapshot.habits;
    const allowed = new Set(filter);
    return props.snapshot.habits.filter((h) => allowed.has(h.id));
  });

  const analyticsSummary = createMemo(() => {
    const habits = targetHabits();
    if (habits.length === 0) {
      return {
        currentStreak: 0,
        currentStreakUnit: 'days' as StreakUnit,
        longestStreak: 0,
        longestStreakUnit: 'days' as StreakUnit,
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
  });

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

  const taskOutcomeBuckets = createMemo(() =>
    TaskAnalytics.rangeOutcomeBuckets(
      props.snapshot.tasks,
      effectiveRangeStart(),
      effectiveRangeEnd(),
      12,
      props.timeZone
    )
  );

  const selectedDayTasks = createMemo(() =>
    TaskAnalytics.tasksForDay(
      props.snapshot.tasks,
      selectedDay(),
      props.timeZone
    )
  );

  const selectedDayTasksCount = createMemo(() => {
    const d = selectedDayTasks();
    return d.done.length + d.notDone.length + d.archived.length + d.dueOpen.length;
  });

  const heatmapData = createMemo(() => {
    const effectiveEnd = effectiveRangeEnd();
    const effectiveStart = effectiveRangeStart();
    const maxWeeks = 104;
    const minAllowedStart = effectiveEnd - (maxWeeks * 7 - 1);
    const clampedStart = Math.max(effectiveStart, minAllowedStart);
    const isCapped = clampedStart > effectiveStart;

    const firstWeekStart = CivilCalendar.startOfWeek(clampedStart);
    const endWeekStart = CivilCalendar.startOfWeek(effectiveEnd);
    const weeksCount = Math.max(
      1,
      Math.floor((endWeekStart - firstWeekStart) / 7) + 1
    );
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
        const tone = DayCellClassifier.classify(
          dayIndex,
          props.todayDay,
          scheduled,
          done
        );
        days.push({ dayIndex, inRange: true, done, scheduled, tone });
      }
      weeks.push({ weekStart, monthLabel, days });
    }

    return { weeks, totalDone, clampedStart, effectiveEnd, isCapped };
  });

  const monthGrid = createMemo(() =>
    CivilCalendar.getMonthDays(viewYear(), viewMonth())
  );

  const monthDayStats = createMemo(() => {
    const days = monthGrid().days;
    if (days.length === 0) return new Map<number, { scheduled: number; done: number }>();
    return StreakCalculator.getPeriodDayStats(
      targetHabits(),
      props.snapshot.checkins,
      days[0],
      Math.min(days[days.length - 1], props.todayDay),
      props.todayDay
    );
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

  const selectedDayHabits = createMemo(() =>
    targetHabits()
      .filter((h) => h.startDay <= selectedDay())
      .sort((a, b) => a.id - b.id)
  );

  const isDatabaseEmpty = createMemo(
    () =>
      props.snapshot.habits.length === 0 &&
      props.snapshot.tasks.every((t) => t.deletedAt !== null)
  );

  const inspectDayInCalendar = (dayIndex: number) => {
    const target = Math.min(dayIndex, props.todayDay);
    const local = CivilCalendar.toLocalDate(target);
    setViewYear(local.year);
    setViewMonth(local.month);
    setSelectedDay(target);
    setEditingNoteHabitId(null);
    props.onSelectSubTab('calendar');
  };

  return (
    <div class="space-y-6">
      <div class="flex flex-col gap-4 border-b border-white/[0.08] pb-5">
        <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div class="space-y-1 min-w-0">
            <h1 class="font-display text-3xl font-semibold tracking-tight text-[#F5F7FA]">
              History &amp; Analytics
            </h1>
            <p class="text-sm text-[#8E95A5]">
              {props.subTab === 'calendar'
                ? 'Inspect past days, edit check-ins, and review daily notes and tasks.'
                : 'Track habit consistency trends, weekday patterns, and task discipline over time.'}
            </p>
          </div>

          {/* Sub-tab Segmented Control: Calendar | Charts */}
          <div
            role="tablist"
            aria-label="History view mode"
            class="inline-flex items-center p-1 rounded-xl bg-[#14161B] border border-white/[0.08] self-start lg:self-auto shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={props.subTab === 'calendar'}
              onClick={() => props.onSelectSubTab('calendar')}
              class={`h-9 px-3.5 rounded-lg text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                props.subTab === 'calendar'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#8E95A5] hover:text-[#F5F7FA]'
              }`}
            >
              <CalendarIcon class="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={props.subTab === 'charts'}
              onClick={() => props.onSelectSubTab('charts')}
              class={`h-9 px-3.5 rounded-lg text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                props.subTab === 'charts'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#8E95A5] hover:text-[#F5F7FA]'
              }`}
            >
              <HistoryTabIcon class="w-3.5 h-3.5" />
              <span>Charts</span>
            </button>
          </div>
        </div>

        {/* Context Filters Row */}
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-3 flex-wrap">
            <CustomMultiSelect<number>
              ariaLabel="Filter by habits"
              value={props.habitFilter}
              options={props.snapshot.habits.map(
                (h): SelectOption<number> => ({
                  value: h.id,
                  label: h.name,
                  hint: h.archivedAt !== null ? 'Archived' : undefined,
                  dotColor: h.color,
                })
              )}
              allLabel={`All Habits (${props.snapshot.habits.length})`}
              emptyLabel="No habits selected"
              selectedNoun={{ one: 'habit', many: 'habits' }}
              align="left"
              onChange={(val) => props.onChangeHabitFilter(val)}
            />

            <Show when={props.subTab === 'charts'}>
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
            <span class="text-xs font-mono tabular-nums text-[#8E95A5]">
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
          <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] px-6 py-14 text-center space-y-2">
            <p class="text-sm font-medium text-[#F5F7FA]">Empty Period</p>
            <p class="text-sm text-[#8E95A5] max-w-md mx-auto">
              Create habits and check them off or complete tasks to see real streaks, heatmaps, and weekly completion charts.
            </p>
          </div>
        }
      >
        <Show
          when={props.subTab === 'calendar'}
          fallback={
            <HistoryChartsPanel
              habits={props.snapshot.habits}
              targetHabits={targetHabits()}
              habitFilter={props.habitFilter}
              checkins={props.snapshot.checkins}
              tasks={props.snapshot.tasks}
              effectiveRangeStart={effectiveRangeStart()}
              effectiveRangeEnd={effectiveRangeEnd()}
              rangeLabel={resolvedRange().label}
              timeZone={props.timeZone}
              analyticsSummary={analyticsSummary()}
              taskSummary={taskSummary()}
              taskOutcomeBuckets={taskOutcomeBuckets()}
              habitBreakdown={habitBreakdown()}
              heatmapData={heatmapData()}
              selectedDay={selectedDay()}
              onSelectDay={(day) => setSelectedDay(day)}
              onInspectDayInCalendar={inspectDayInCalendar}
              onSelectHabitFilter={(filter) => props.onChangeHabitFilter(filter)}
            />
          }
        >
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <section class="lg:col-span-7 rounded-2xl bg-[#14161B] border border-white/[0.08] p-6 space-y-5">
            <div class="flex items-center justify-between">
              <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                {CivilCalendar.formatMonthYear(viewYear(), viewMonth())}
              </h2>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  aria-label="Previous month"
                  class="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <ChevronLeftIcon class="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={goNextMonth}
                  aria-label="Next month"
                  class="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <ChevronRightIcon class="w-4 h-4" />
                </button>
              </div>
            </div>

            <div class="grid grid-cols-7 gap-1.5 text-center">
              <For each={[0, 1, 2, 3, 4, 5, 6]}>
                {(bit) => (
                  <div class="text-[11px] font-medium text-[#6B7280] py-1">
                    {CivilCalendar.weekdayShortLabel(bit)}
                  </div>
                )}
              </For>

              <For each={Array.from({ length: monthGrid().leadingEmpty })}>
                {() => <div />}
              </For>

              <For each={monthGrid().days}>
                {(dayIndex) => {
                  const local = CivilCalendar.toLocalDate(dayIndex);
                  const isFuture = () => dayIndex > props.todayDay;
                  const isSelected = () => dayIndex === selectedDay();

                  const stats = () => {
                    if (isFuture()) return { scheduled: 0, done: 0 };
                    return monthDayStats().get(dayIndex) ?? { scheduled: 0, done: 0 };
                  };

                  const tone = createMemo(() =>
                    DayCellClassifier.classify(
                      dayIndex,
                      props.todayDay,
                      stats().scheduled,
                      stats().done
                    )
                  );

                  return (
                    <button
                      type="button"
                      disabled={isFuture()}
                      onClick={() => {
                        setSelectedDay(dayIndex);
                        setEditingNoteHabitId(null);
                      }}
                      class={`h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 text-xs font-mono tabular-nums transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default border ${calendarTileClass(
                        tone(),
                        isSelected()
                      )}`}
                    >
                      <span>{local.day}</span>
                      <Show when={stats().scheduled > 0 && !isFuture()}>
                        <span
                          class={`text-[9px] ${
                            tone() === 'complete'
                              ? 'text-[#93C5FD]'
                              : tone().startsWith('missed')
                                ? 'text-[#FCA5A5]'
                                : 'text-[#8E95A5]'
                          }`}
                        >
                          {stats().done}/{stats().scheduled}
                        </span>
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>
          </section>

          <section class="lg:col-span-5 rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
            <div class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                  {selectedDay() === props.todayDay
                    ? 'Today'
                    : CivilCalendar.formatShortDate(selectedDay())}
                </h2>
                <p class="text-xs text-[#8E95A5]">
                  {CivilCalendar.formatFullDate(selectedDay())}
                </p>
              </div>
            </div>

            <Show
              when={selectedDayHabits().length > 0}
              fallback={
                <div class="px-6 py-10 text-center space-y-3">
                  <p class="text-sm text-[#8E95A5]">
                    {props.habitFilter !== 'all' && targetHabits().length === 0
                      ? 'No habits selected in filter.'
                      : 'No habits were active on this date.'}
                  </p>
                  <Show when={props.habitFilter !== 'all'}>
                    <button
                      type="button"
                      onClick={() => props.onChangeHabitFilter('all')}
                      class="h-9 px-3.5 rounded-xl bg-[#1C1F26] hover:bg-[#252933] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] transition-colors cursor-pointer"
                    >
                      Show All Habits
                    </button>
                  </Show>
                </div>
              }
            >
              <ul class="divide-y divide-white/[0.06]">
                <For each={selectedDayHabits()}>
                  {(habit) => {
                    const isDone = () =>
                      checkinIndex().get(`${habit.id}:${selectedDay()}`) === true;
                    const scheduleStatusLabel = () => {
                      if (habit.weeklyTarget !== null) {
                        const wkEnd = Math.min(
                          CivilCalendar.startOfWeek(selectedDay()) + 6,
                          props.todayDay
                        );
                        const wk = StreakCalculator.calculateWeeklyProgress(
                          habit,
                          props.snapshot.checkins,
                          wkEnd
                        );
                        return wk.isComplete
                          ? `Flexible (${wk.completedDays}/${wk.scheduledDays} wk complete)`
                          : `Flexible (${wk.completedDays}/${wk.scheduledDays} wk)`;
                      }
                      return CivilCalendar.isScheduled(habit.weekdays, selectedDay())
                        ? 'Scheduled'
                        : 'Off-schedule day';
                    };
                    const noteText = () =>
                      noteIndex().get(`${habit.id}:${selectedDay()}`) ?? '';
                    const isEditingNote = () => editingNoteHabitId() === habit.id;

                    return (
                      <li class="px-5 py-3.5 space-y-2.5">
                        <div class="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              void props.onToggleCheckin(
                                habit.id,
                                selectedDay(),
                                !isDone()
                              )
                            }
                            aria-pressed={isDone()}
                            aria-label={`Toggle ${habit.name} for ${CivilCalendar.formatShortDate(selectedDay())}`}
                            class={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors cursor-pointer border ${
                              isDone()
                                ? 'border-transparent'
                                : 'bg-[#0A0B0E] border-white/[0.12] text-transparent hover:border-white/30'
                            }`}
                            style={
                              isDone()
                                ? {
                                    'background-color': HabitAppearance.getColor(habit.color),
                                    color: HabitAppearance.getContrastTextColor(
                                      HabitAppearance.getColor(habit.color)
                                    ),
                                  }
                                : undefined
                            }
                          >
                            <CheckIcon class="w-4 h-4" />
                          </button>

                          <div class="min-w-0 flex-1">
                            <div class="flex items-start gap-2">
                              <HabitBadge appearanceRaw={habit.color} size="xs" />
                              <p
                                class="text-sm font-medium text-[#F5F7FA] line-clamp-2 break-words"
                                title={habit.name}
                              >
                                {habit.name}
                              </p>
                            </div>
                            <p
                              class="text-xs text-[#8E95A5] line-clamp-2 break-words"
                              title={
                                noteText() && !isEditingNote()
                                  ? `${scheduleStatusLabel()} · ${noteText()}`
                                  : scheduleStatusLabel()
                              }
                            >
                              {scheduleStatusLabel()}
                              {noteText() && !isEditingNote() ? ` · ${noteText()}` : ''}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingNote()) {
                                setEditingNoteHabitId(null);
                              } else {
                                setNoteDraft(noteText());
                                setEditingNoteHabitId(habit.id);
                              }
                            }}
                            aria-label={`Edit note for ${habit.name}`}
                            class={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                              noteText() || isEditingNote()
                                ? 'text-[#60A5FA] bg-[#3B82F6]/10'
                                : 'text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.05]'
                            }`}
                          >
                            <NoteIcon class="w-4 h-4" />
                          </button>
                        </div>

                        <Show when={isEditingNote()}>
                          <div class="flex items-center gap-2">
                            <input
                              type="text"
                              value={noteDraft()}
                              onInput={(e) => setNoteDraft(e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void props
                                    .onSaveNote(habit.id, selectedDay(), noteDraft())
                                    .then(() => setEditingNoteHabitId(null));
                                }
                              }}
                              placeholder="Day note..."
                              autofocus
                              class="flex-1 h-9 rounded-xl bg-[#0A0B0E] border border-white/[0.1] px-3 text-xs text-[#F5F7FA] placeholder:text-[#5B6270] focus:outline-none focus:border-[#3B82F6]"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                void props
                                  .onSaveNote(habit.id, selectedDay(), noteDraft())
                                  .then(() => setEditingNoteHabitId(null))
                              }
                              class="h-9 px-3.5 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-medium text-white cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        </Show>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>

            <div class="border-t border-white/[0.06]">
              <div class="px-6 py-3 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs font-medium text-[#9AA1B1]">Tasks</span>
                <span class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                  {selectedDayTasksCount() === 0
                    ? 'None on this day'
                    : `${selectedDayTasks().done.length} done${
                        selectedDayTasks().notDone.length > 0
                          ? ` · ${selectedDayTasks().notDone.length} not done`
                          : ''
                      }${
                        selectedDayTasks().archived.length > 0
                          ? ` · ${selectedDayTasks().archived.length} arch`
                          : ''
                      }${
                        selectedDayTasks().dueOpen.length > 0
                          ? ` · ${selectedDayTasks().dueOpen.length} due`
                          : ''
                      }`}
                </span>
              </div>

              <Show when={selectedDayTasksCount() > 0}>
                <ul class="divide-y divide-white/[0.06]">
                  <For each={selectedDayTasks().done}>
                    {(task) => {
                      const doneDay = () =>
                        task.completedDay ??
                        CivilCalendar.fromTimestamp(task.updatedAt, props.timeZone);
                      const timingHint = () => {
                        if (task.dueDay === null) return 'Goal';
                        return doneDay() <= task.dueDay ? 'On time' : 'Late';
                      };
                      return (
                        <li class="px-5 py-2.5 flex items-center gap-3">
                          <span class="w-6 h-6 rounded-lg bg-[#3B82F6]/20 border border-[#3B82F6]/40 text-[#93C5FD] flex items-center justify-center shrink-0">
                            <CheckIcon class="w-3.5 h-3.5" />
                          </span>
                          <div class="min-w-0 flex-1">
                            <p
                              class="text-xs font-medium text-[#9AA1B1] line-through line-clamp-2 break-words"
                              title={task.title}
                            >
                              {task.title}
                            </p>
                            <p class="text-[11px] text-[#6B7280] line-clamp-2 break-words">
                              Done · {timingHint()}
                              {task.repeatable ? ' · Repeats' : ''}
                              {task.note ? ` · ${task.note}` : ''}
                            </p>
                          </div>
                        </li>
                      );
                    }}
                  </For>

                  <For each={selectedDayTasks().notDone}>
                    {(task) => (
                      <li class="px-5 py-2.5 flex items-center gap-3">
                        <span class="w-6 h-6 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#FCA5A5] flex items-center justify-center shrink-0">
                          <CloseIcon class="w-3.5 h-3.5" />
                        </span>
                        <div class="min-w-0 flex-1">
                          <p
                            class="text-xs font-medium text-[#C8CDD8] line-clamp-2 break-words"
                            title={task.title}
                          >
                            {task.title}
                          </p>
                          <p class="text-[11px] text-[#FCA5A5]/80 line-clamp-2 break-words">
                            Not Done
                            {task.note ? ` · ${task.note}` : ''}
                          </p>
                        </div>
                      </li>
                    )}
                  </For>

                  <For each={selectedDayTasks().archived}>
                    {(task) => (
                      <li class="px-5 py-2.5 flex items-center gap-3">
                        <span class="w-6 h-6 rounded-lg bg-[#1C1F26] border border-white/[0.08] text-[#8E95A5] flex items-center justify-center shrink-0">
                          <ArchiveIcon class="w-3.5 h-3.5" />
                        </span>
                        <div class="min-w-0 flex-1">
                          <p
                            class="text-xs font-medium text-[#8E95A5] line-clamp-2 break-words"
                            title={task.title}
                          >
                            {task.title}
                          </p>
                          <p class="text-[11px] text-[#6B7280] line-clamp-2 break-words">
                            Archived
                            {task.note ? ` · ${task.note}` : ''}
                          </p>
                        </div>
                      </li>
                    )}
                  </For>

                  <For each={selectedDayTasks().dueOpen}>
                    {(task) => (
                      <li class="px-5 py-2.5 flex items-center gap-3">
                        <span class="w-6 h-6 rounded-lg bg-[#0A0B0E] border border-white/[0.15] flex items-center justify-center shrink-0">
                          <span class="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
                        </span>
                        <div class="min-w-0 flex-1">
                          <p
                            class="text-xs font-medium text-[#F5F7FA] line-clamp-2 break-words"
                            title={task.title}
                          >
                            {task.title}
                          </p>
                          <div class="text-[11px] text-[#8E95A5] flex flex-wrap items-center gap-1 min-w-0">
                            <span class="shrink-0">Open · Due</span>
                            <Show when={task.repeatable}>
                              <span aria-hidden="true" class="shrink-0">·</span>
                              <RepeatIcon class="w-3 h-3 text-[#60A5FA] shrink-0" />
                            </Show>
                            <Show when={task.note}>
                              <span class="line-clamp-2 break-words max-w-full">
                                · {task.note}
                              </span>
                            </Show>
                          </div>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </section>
        </div>
        </Show>
      </Show>
    </div>
  );
}

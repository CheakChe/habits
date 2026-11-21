import { For, JSX, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import {
  DateRangePresetId,
  DateRangeResolver,
  DayCellClassifier,
  DayCellTone,
} from '../utils/date-range';
import { StreakCalculator } from '../utils/streak-calculator';
import { TaskAnalytics } from '../utils/task-analytics';
import { HabitAppearance } from '../utils/habit-appearance';
import { CustomSelect, HistoryRangePicker, SelectOption } from './CustomControls';
import { HabitBadge } from './HabitBadge';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, NoteIcon } from './Icons';

interface HistoryViewProps {
  snapshot: DomainSnapshot;
  todayDay: number;
  timeZone: string;
  rangePreset: DateRangePresetId;
  customStartDay: number;
  customEndDay: number;
  onSelectRangePreset: (preset: DateRangePresetId) => void;
  onSelectCustomRange: (startDay: number, endDay: number) => void;
  onChangeTimeZone: (timeZone: string) => void;
  onToggleCheckin: (habitId: number, dayIndex: number, nextDone: boolean) => Promise<void>;
  onSaveNote: (habitId: number, dayIndex: number, text: string) => Promise<void>;
}

function heatmapSquareClass(tone: DayCellTone): string {
  switch (tone) {
    case 'complete':
      return 'bg-[#39D353]';
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

function calendarTileClass(tone: DayCellTone, isSelected: boolean): string {
  if (isSelected) {
    return 'bg-[#3B82F6]/25 border-[#3B82F6] text-white';
  }
  switch (tone) {
    case 'complete':
      return 'bg-[#22C55E]/15 border-[#22C55E]/35 text-[#F5F7FA] hover:bg-[#22C55E]/25';
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
  const [selectedHabitId, setSelectedHabitId] = createSignal<number | 'all'>('all');
  const [editingNoteHabitId, setEditingNoteHabitId] = createSignal<number | null>(null);
  const [noteDraft, setNoteDraft] = createSignal('');
  const [hoveredCell, setHoveredCell] = createSignal<{
    dayIndex: number;
    done: number;
    scheduled: number;
  } | null>(null);

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
    const id = selectedHabitId();
    if (id === 'all') return props.snapshot.habits;
    return props.snapshot.habits.filter((h) => h.id === id);
  });

  const analyticsSummary = createMemo(() => {
    const habits = targetHabits();
    if (habits.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        completionRate: 0,
        scheduledDays: 0,
        completedScheduledDays: 0,
        missedScheduledDays: 0,
      };
    }

    let bestCurrent = 0;
    let bestLongest = 0;
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
      if (m.currentStreak > bestCurrent) bestCurrent = m.currentStreak;
      if (m.longestStreak > bestLongest) bestLongest = m.longestStreak;
      totalScheduled += m.scheduledDays;
      totalCompleted += m.completedScheduledDays;
    }

    return {
      currentStreak: bestCurrent,
      longestStreak: bestLongest,
      completionRate: totalScheduled === 0 ? 0 : totalCompleted / totalScheduled,
      scheduledDays: totalScheduled,
      completedScheduledDays: totalCompleted,
      missedScheduledDays: Math.max(0, totalScheduled - totalCompleted),
    };
  });

  const habitBreakdown = createMemo(() =>
    StreakCalculator.summarizeHabitsForRange(
      props.snapshot.habits,
      props.snapshot.checkins,
      effectiveRangeStart(),
      effectiveRangeEnd(),
      props.todayDay
    )
  );

  const totalTasksInRange = createMemo(() =>
    TaskAnalytics.countCompletedInRange(
      props.snapshot.tasks,
      effectiveRangeStart(),
      effectiveRangeEnd(),
      props.timeZone
    )
  );

  const taskBuckets = createMemo(() =>
    TaskAnalytics.rangeCompletedBuckets(
      props.snapshot.tasks,
      effectiveRangeStart(),
      effectiveRangeEnd(),
      12,
      props.timeZone
    )
  );

  const maxBucketCount = createMemo(() =>
    Math.max(1, ...taskBuckets().map((b) => b.count))
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
    const weeksCount = Math.max(
      1,
      Math.floor((endWeekStart - firstWeekStart) / 7) + 1
    );
    const habits = targetHabits();
    const cIndex = checkinIndex();

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
        let scheduled = 0;
        let done = 0;
        for (const h of habits) {
          if (h.startDay <= dayIndex && CivilCalendar.isScheduled(h.weekdays, dayIndex)) {
            scheduled += 1;
            if (cIndex.get(`${h.id}:${dayIndex}`) === true) {
              done += 1;
            }
          }
        }
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
    props.snapshot.habits
      .filter((h) => h.startDay <= selectedDay())
      .sort((a, b) => a.id - b.id)
  );

  const isDatabaseEmpty = createMemo(
    () =>
      props.snapshot.habits.length === 0 &&
      props.snapshot.tasks.every((t) => t.deletedAt !== null)
  );

  return (
    <div class="space-y-8">
      <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div class="space-y-1 min-w-0">
          <h1 class="font-display text-3xl font-semibold tracking-tight text-[#F5F7FA]">
            History &amp; Analytics
          </h1>
          <p class="text-sm text-[#8E95A5]">
            Inspect past days, edit check-ins, and track streaks computed directly from local records.
          </p>
        </div>

        <div class="flex items-center gap-3 flex-wrap lg:flex-nowrap shrink-0">
          <CustomSelect
            ariaLabel="Filter by habit"
            value={selectedHabitId() === 'all' ? 'all' : String(selectedHabitId())}
            options={[
              {
                value: 'all',
                label: `All Habits (${props.snapshot.habits.length})`,
              },
              ...props.snapshot.habits.map(
                (h): SelectOption<string> => ({
                  value: String(h.id),
                  label: h.name,
                  hint: h.archivedAt !== null ? 'Archived' : undefined,
                  dotColor: h.color,
                })
              ),
            ]}
            onChange={(val) =>
              setSelectedHabitId(val === 'all' ? 'all' : Number(val))
            }
          />

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
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-5 space-y-1">
          <span class="text-xs text-[#8E95A5]">
            {selectedHabitId() === 'all' ? 'Best Current Streak' : 'Current Streak'}
          </span>
          <p class="text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {analyticsSummary().currentStreak}d
          </p>
        </div>

        <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-5 space-y-1">
          <span class="text-xs text-[#8E95A5]">Longest Streak</span>
          <p class="text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {analyticsSummary().longestStreak}d
          </p>
        </div>

        <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-5 space-y-1">
          <span class="text-xs text-[#8E95A5]">Completion Rate</span>
          <p class="text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {Math.round(analyticsSummary().completionRate * 100)}%
          </p>
          <span class="text-[11px] font-mono tabular-nums text-[#8E95A5] block">
            {analyticsSummary().completedScheduledDays} done ·{' '}
            {analyticsSummary().missedScheduledDays} missed
          </span>
        </div>

        <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-5 space-y-1">
          <span class="text-xs text-[#8E95A5]">Tasks Done</span>
          <p class="text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {totalTasksInRange()}
          </p>
          <span class="text-[11px] text-[#8E95A5] block truncate">
            {resolvedRange().label}
          </span>
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

                  const stats = createMemo(() => {
                    if (isFuture()) return { scheduled: 0, done: 0 };
                    let scheduled = 0;
                    let done = 0;
                    const cIndex = checkinIndex();
                    for (const h of targetHabits()) {
                      if (
                        h.startDay <= dayIndex &&
                        CivilCalendar.isScheduled(h.weekdays, dayIndex)
                      ) {
                        scheduled += 1;
                        if (cIndex.get(`${h.id}:${dayIndex}`) === true) {
                          done += 1;
                        }
                      }
                    }
                    return { scheduled, done };
                  });

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
                              ? 'text-[#86EFAC]'
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
                <div class="px-6 py-10 text-center">
                  <p class="text-sm text-[#8E95A5]">
                    No habits were active on this date.
                  </p>
                </div>
              }
            >
              <ul class="divide-y divide-white/[0.06]">
                <For each={selectedDayHabits()}>
                  {(habit) => {
                    const isDone = () =>
                      checkinIndex().get(`${habit.id}:${selectedDay()}`) === true;
                    const isScheduled = () =>
                      CivilCalendar.isScheduled(habit.weekdays, selectedDay());
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
                            <div class="flex items-center gap-2">
                              <HabitBadge appearanceRaw={habit.color} size="xs" />
                              <p class="text-sm font-medium text-[#F5F7FA] truncate">
                                {habit.name}
                              </p>
                            </div>
                            <p class="text-xs text-[#8E95A5] truncate">
                              {isScheduled() ? 'Scheduled' : 'Off-schedule day'}
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
          </section>
        </div>

        {/* Heatmap & Weekly Completed Tasks Chart */}
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <section class="lg:col-span-7 rounded-2xl bg-[#14161B] border border-white/[0.08] p-6 flex flex-col justify-between space-y-5">
            <div class="flex items-start sm:items-center justify-between flex-wrap gap-3">
              <div>
                <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                  Consistency Heatmap
                </h2>
                <p class="text-xs text-[#8E95A5]">
                  <span class="font-mono tabular-nums text-[#C8CDD8]">
                    {heatmapData().totalDone}
                  </span>{' '}
                  check-ins ·{' '}
                  <span class="font-mono tabular-nums">
                    {DateRangeResolver.formatRangeLabel(
                      heatmapData().clampedStart,
                      heatmapData().effectiveEnd
                    )}
                  </span>
                  {heatmapData().isCapped ? ' (last 2 years shown)' : ''}
                </p>
              </div>
            </div>

            {/* Square contribution grid */}
            <div class="overflow-x-auto pb-1">
              <div class="inline-flex gap-2 items-start py-1 pl-0.5 pr-2">
                {/* Weekday axis labels */}
                <div class="flex flex-col gap-[3px] pt-[18px] text-[10px] leading-[12px] text-[#6B7280] select-none shrink-0">
                  <span class="h-[12px] flex items-center">Mon</span>
                  <span class="h-[12px]" aria-hidden="true" />
                  <span class="h-[12px] flex items-center">Wed</span>
                  <span class="h-[12px]" aria-hidden="true" />
                  <span class="h-[12px] flex items-center">Fri</span>
                  <span class="h-[12px]" aria-hidden="true" />
                  <span class="h-[12px]" aria-hidden="true" />
                </div>

                {/* Columns of 7 day squares + month header row */}
                <div class="flex flex-col gap-1.5">
                  <div class="flex gap-[3px] h-[12px] text-[10px] leading-[12px] text-[#8E95A5] select-none">
                    <For each={heatmapData().weeks}>
                      {(week) => (
                        <div class="w-[12px] shrink-0 overflow-visible whitespace-nowrap">
                          {week.monthLabel}
                        </div>
                      )}
                    </For>
                  </div>

                  <div class="flex gap-[3px]">
                    <For each={heatmapData().weeks}>
                      {(week) => (
                        <div class="flex flex-col gap-[3px] shrink-0">
                          <For each={week.days}>
                            {(cell) => (
                              <Show
                                when={cell.inRange}
                                fallback={
                                  <div class="w-[12px] h-[12px] rounded-[2px] bg-transparent" />
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => setSelectedDay(cell.dayIndex)}
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
                                  class={`w-[12px] h-[12px] rounded-[2px] transition-transform duration-100 hover:scale-125 cursor-pointer ${heatmapSquareClass(
                                    cell.tone
                                  )} ${
                                    cell.dayIndex === selectedDay()
                                      ? 'ring-1 ring-white ring-offset-1 ring-offset-[#14161B]'
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

            {/* Footer: hovered day readout + Red-to-Green severity legend */}
            <div class="flex items-center justify-between flex-wrap gap-2 text-[11px] text-[#8E95A5] pt-1 border-t border-white/[0.06]">
              <Show
                when={hoveredCell()}
                fallback={
                  <span class="font-mono tabular-nums">
                    Selected: {CivilCalendar.formatShortDate(selectedDay())}
                  </span>
                }
              >
                {(cell) => (
                  <span class="font-mono tabular-nums text-[#F5F7FA]">
                    {CivilCalendar.formatShortDate(cell().dayIndex)} · {cell().done}/
                    {cell().scheduled} completed
                  </span>
                )}
              </Show>

              <div class="flex items-center gap-1.5" title="Rest = unscheduled · Red = unclosed severity · Green = 100% done">
                <span>Rest</span>
                <span class="w-[11px] h-[11px] rounded-[2px] bg-[#0D1016] border border-white/[0.06]" />
                <span class="ml-1">0%</span>
                <span class="w-[11px] h-[11px] rounded-[2px] bg-[#EF4444]" />
                <span class="w-[11px] h-[11px] rounded-[2px] bg-[#B91C1C]" />
                <span class="w-[11px] h-[11px] rounded-[2px] bg-[#881B22]" />
                <span class="w-[11px] h-[11px] rounded-[2px] bg-[#581C24]" />
                <span>Done</span>
                <span class="w-[11px] h-[11px] rounded-[2px] bg-[#39D353]" />
              </div>
            </div>
          </section>

          <section class="lg:col-span-5 rounded-2xl bg-[#14161B] border border-white/[0.08] p-6 flex flex-col justify-between space-y-5">
            <div>
              <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                Completed Tasks
              </h2>
              <p class="text-xs text-[#8E95A5] font-mono tabular-nums">
                {DateRangeResolver.formatRangeLabel(
                  effectiveRangeStart(),
                  effectiveRangeEnd()
                )}
              </p>
            </div>

            <Show
              when={totalTasksInRange() > 0}
              fallback={
                <div class="py-10 text-center">
                  <p class="text-sm text-[#8E95A5]">
                    No completed tasks in the selected date range.
                  </p>
                </div>
              }
            >
              <div class="flex items-end gap-2 h-40 pt-4">
                <For each={taskBuckets()}>
                  {(bucket) => {
                    const heightPct = () =>
                      Math.round((bucket.count / maxBucketCount()) * 100);
                    return (
                      <div class="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1.5">
                        <span class="text-[11px] font-mono tabular-nums text-[#8E95A5]">
                          {bucket.count > 0 ? bucket.count : ''}
                        </span>
                        <div class="w-full flex-1 flex items-end">
                          <div
                            class={`w-full rounded-t-md transition-all ${
                              bucket.count > 0
                                ? 'bg-[#3B82F6]'
                                : 'bg-white/[0.05] h-[3px]'
                            }`}
                            style={
                              bucket.count > 0
                                ? { height: `${Math.max(12, heightPct())}%` }
                                : undefined
                            }
                            title={`${bucket.label}: ${bucket.count} tasks`}
                          />
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
        </div>

        <Show when={selectedHabitId() === 'all' && habitBreakdown().length > 0}>
          <section class="rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
            <div class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
              <div>
                <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                  Habit Breakdown
                </h2>
                <p class="text-xs text-[#8E95A5]">
                  {resolvedRange().label} ·{' '}
                  <span class="font-mono tabular-nums">
                    {DateRangeResolver.formatRangeLabel(
                      effectiveRangeStart(),
                      effectiveRangeEnd()
                    )}
                  </span>
                </p>
              </div>
              <span class="text-xs font-mono tabular-nums text-[#8E95A5]">
                {habitBreakdown().length} {habitBreakdown().length === 1 ? 'habit' : 'habits'}
              </span>
            </div>

            <ul class="divide-y divide-white/[0.06]">
              <For each={habitBreakdown()}>
                {(row) => {
                  const pct = () => Math.round(row.completionRate * 100);
                  return (
                    <li>
                      <button
                        type="button"
                        onClick={() => setSelectedHabitId(row.habit.id)}
                        class="w-full text-left px-6 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div class="min-w-0 space-y-1 flex-1">
                          <div class="flex items-center gap-2.5">
                            <HabitBadge appearanceRaw={row.habit.color} size="sm" />
                            <span class="text-sm font-medium text-[#F5F7FA] truncate">
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
                            <span aria-hidden="true">·</span>
                            <span>{row.currentStreak}d current</span>
                            <span aria-hidden="true">·</span>
                            <span>{row.longestStreak}d best</span>
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
      </Show>
    </div>
  );
}

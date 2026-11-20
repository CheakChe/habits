import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { StreakCalculator } from '../utils/streak-calculator';
import { TaskAnalytics } from '../utils/task-analytics';
import { CustomSelect, SelectOption } from './CustomControls';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, NoteIcon } from './Icons';

interface HistoryViewProps {
  snapshot: DomainSnapshot;
  todayDay: number;
  onToggleCheckin: (habitId: number, dayIndex: number, nextDone: boolean) => Promise<void>;
  onSaveNote: (habitId: number, dayIndex: number, text: string) => Promise<void>;
}

export function HistoryView(props: HistoryViewProps): JSX.Element {
  const initialLocal = CivilCalendar.toLocalDate(props.todayDay);
  const [viewYear, setViewYear] = createSignal(initialLocal.year);
  const [viewMonth, setViewMonth] = createSignal(initialLocal.month);
  const [selectedDay, setSelectedDay] = createSignal(props.todayDay);
  const [selectedHabitId, setSelectedHabitId] = createSignal<number | 'all'>('all');
  const [periodDays, setPeriodDays] = createSignal<30 | 90 | 'all'>(30);
  const [editingNoteHabitId, setEditingNoteHabitId] = createSignal<number | null>(null);
  const [noteDraft, setNoteDraft] = createSignal('');
  const [heatmapWeeksCount, setHeatmapWeeksCount] = createSignal<number>(26);
  const [hoveredCell, setHoveredCell] = createSignal<{
    dayIndex: number;
    done: number;
    scheduled: number;
  } | null>(null);

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
      };
    }

    let bestCurrent = 0;
    let bestLongest = 0;
    let totalScheduled = 0;
    let totalCompleted = 0;
    const pDays = periodDays();

    for (const habit of habits) {
      const startDay =
        pDays === 'all' ? habit.startDay : props.todayDay - (pDays - 1);
      const m = StreakCalculator.calculate(
        habit,
        props.snapshot.checkins,
        startDay,
        props.todayDay,
        true
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
    };
  });

  const weeklyTasks = createMemo(() =>
    TaskAnalytics.weeklyCompletedCounts(props.snapshot.tasks, props.todayDay, 8)
  );

  const totalWeeklyCompleted = createMemo(() =>
    weeklyTasks().reduce((acc, b) => acc + b.count, 0)
  );

  const maxWeeklyCount = createMemo(() =>
    Math.max(1, ...weeklyTasks().map((b) => b.count))
  );

  const heatmapData = createMemo(() => {
    const weeksCount = heatmapWeeksCount();
    const endWeekStart = CivilCalendar.startOfWeek(props.todayDay);
    const firstWeekStart = endWeekStart - (weeksCount - 1) * 7;
    const habits = targetHabits();
    const cIndex = checkinIndex();

    const weeks: {
      weekStart: number;
      monthLabel: string;
      days: { dayIndex: number; ratio: number; done: number; scheduled: number }[];
    }[] = [];

    let lastMonth = -1;
    let totalDone = 0;

    for (let w = 0; w < weeksCount; w++) {
      const weekStart = firstWeekStart + w * 7;
      const startLocal = CivilCalendar.toLocalDate(weekStart);
      let monthLabel = '';
      if (startLocal.month !== lastMonth) {
        const shortMonth = CivilCalendar.formatShortDate(weekStart).split(' ')[0];
        // Avoid crowded overlapping labels on the first column if the next week starts a new month
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

      const days: { dayIndex: number; ratio: number; done: number; scheduled: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const dayIndex = weekStart + d;
        if (dayIndex > props.todayDay) {
          days.push({ dayIndex, ratio: -1, done: 0, scheduled: 0 });
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
        const ratio = scheduled === 0 ? 0 : done / scheduled;
        days.push({ dayIndex, ratio, done, scheduled });
      }
      weeks.push({ weekStart, monthLabel, days });
    }

    return { weeks, totalDone };
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
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div class="space-y-1">
          <h1 class="font-display text-3xl font-semibold tracking-tight text-[#F5F7FA]">
            History &amp; Analytics
          </h1>
          <p class="text-sm text-[#8E95A5]">
            Inspect past days, edit check-ins, and track streaks computed directly from local records.
          </p>
        </div>

        <div class="flex items-center gap-3 flex-wrap">
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

          <div class="flex items-center gap-1 p-1 bg-[#14161B] border border-white/[0.08] rounded-xl">
            <For each={[30, 90, 'all'] as const}>
              {(p) => (
                <button
                  type="button"
                  onClick={() => setPeriodDays(p)}
                  class={`h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    periodDays() === p
                      ? 'bg-[#1C1F26] text-[#F5F7FA]'
                      : 'text-[#8E95A5] hover:text-[#F5F7FA]'
                  }`}
                >
                  {p === 'all' ? 'All Time' : `${p} Days`}
                </button>
              )}
            </For>
          </div>
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
          <span class="text-[11px] font-mono tabular-nums text-[#6B7280] block">
            {analyticsSummary().completedScheduledDays}/{analyticsSummary().scheduledDays} scheduled
          </span>
        </div>

        <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-5 space-y-1">
          <span class="text-xs text-[#8E95A5]">Tasks Done (8 Weeks)</span>
          <p class="text-2xl font-display font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {totalWeeklyCompleted()}
          </p>
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

                  const allDone = () =>
                    stats().scheduled > 0 && stats().done === stats().scheduled;
                  const partialDone = () =>
                    stats().done > 0 && stats().done < stats().scheduled;

                  return (
                    <button
                      type="button"
                      disabled={isFuture()}
                      onClick={() => {
                        setSelectedDay(dayIndex);
                        setEditingNoteHabitId(null);
                      }}
                      class={`h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 text-xs font-mono tabular-nums transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default border ${
                        isSelected()
                          ? 'bg-[#3B82F6]/20 border-[#3B82F6] text-white'
                          : allDone()
                            ? 'bg-[#22C55E]/15 border-[#22C55E]/30 text-[#F5F7FA] hover:bg-[#22C55E]/25'
                            : partialDone()
                              ? 'bg-[#3B82F6]/10 border-white/[0.08] text-[#F5F7FA] hover:bg-white/[0.06]'
                              : 'bg-[#0A0B0E] border-white/[0.06] text-[#9AA1B1] hover:border-white/20'
                      }`}
                    >
                      <span>{local.day}</span>
                      <Show when={stats().scheduled > 0 && !isFuture()}>
                        <span class="text-[9px] text-[#8E95A5]">
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
                                ? 'text-white border-transparent'
                                : 'bg-[#0A0B0E] border-white/[0.12] text-transparent hover:border-white/30'
                            }`}
                            style={isDone() ? { 'background-color': habit.color } : undefined}
                          >
                            <CheckIcon class="w-4 h-4" />
                          </button>

                          <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium text-[#F5F7FA] truncate">
                              {habit.name}
                            </p>
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
                  check-ins in the selected range
                </p>
              </div>

              <CustomSelect
                ariaLabel="Heatmap time range"
                value={String(heatmapWeeksCount())}
                options={[
                  { value: '1', label: '1 Week' },
                  { value: '2', label: '2 Weeks' },
                  { value: '4', label: '1 Month' },
                  { value: '13', label: '3 Months' },
                  { value: '26', label: '6 Months' },
                  { value: '53', label: '1 Year' },
                ]}
                onChange={(val) => setHeatmapWeeksCount(Number(val))}
              />
            </div>

            {/* GitHub-style square contribution grid */}
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
                            {(cell) => {
                              const squareClass = () => {
                                if (cell.scheduled === 0 || cell.done === 0) {
                                  return 'bg-[#0D1016] border border-white/[0.06]';
                                }
                                if (cell.ratio >= 1) return 'bg-[#39D353]';
                                if (cell.ratio >= 0.6) return 'bg-[#26A641]';
                                if (cell.ratio >= 0.3) return 'bg-[#006D32]';
                                return 'bg-[#0E4429]';
                              };

                              return (
                                <Show
                                  when={cell.ratio >= 0}
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
                                    class={`w-[12px] h-[12px] rounded-[2px] transition-transform duration-100 hover:scale-125 cursor-pointer ${squareClass()} ${
                                      cell.dayIndex === selectedDay()
                                        ? 'ring-1 ring-white ring-offset-1 ring-offset-[#14161B]'
                                        : ''
                                    }`}
                                  />
                                </Show>
                              );
                            }}
                          </For>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer: hovered day readout + GitHub Less/More legend */}
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

              <div class="flex items-center gap-1.5">
                <span>Less</span>
                <span class="w-[11px] h-[11px] rounded-[2px] bg-[#0D1016] border border-white/[0.06]" />
                <span class="w-[11px] h-[11px] rounded-[2px] bg-[#0E4429]" />
                <span class="w-[11px] h-[11px] rounded-[2px] bg-[#006D32]" />
                <span class="w-[11px] h-[11px] rounded-[2px] bg-[#26A641]" />
                <span class="w-[11px] h-[11px] rounded-[2px] bg-[#39D353]" />
                <span>More</span>
              </div>
            </div>
          </section>

          <section class="lg:col-span-5 rounded-2xl bg-[#14161B] border border-white/[0.08] p-6 flex flex-col justify-between space-y-5">
            <div>
              <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                Completed Tasks by Week
              </h2>
              <p class="text-xs text-[#8E95A5]">
                Last 8 weeks derived from task completion records
              </p>
            </div>

            <Show
              when={totalWeeklyCompleted() > 0}
              fallback={
                <div class="py-10 text-center">
                  <p class="text-sm text-[#8E95A5]">
                    No completed tasks in the last 8 weeks.
                  </p>
                </div>
              }
            >
              <div class="grid grid-cols-8 gap-2 items-end h-40 pt-4">
                <For each={weeklyTasks()}>
                  {(bucket) => {
                    const heightPct = () =>
                      Math.round((bucket.count / maxWeeklyCount()) * 100);
                    return (
                      <div class="h-full flex flex-col items-center justify-end gap-1.5">
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
                            title={`Week of ${bucket.label}: ${bucket.count} tasks`}
                          />
                        </div>
                        <span class="text-[10px] font-mono tabular-nums text-[#6B7280] truncate max-w-full">
                          {bucket.label.split(' ')[1]}
                        </span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </section>
        </div>
      </Show>
    </div>
  );
}

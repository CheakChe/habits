import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { Habit, HabitCheckin, Task } from '../../src/types/domain';
import { HistoryChartsPanel } from '../../src/ui/history/HistoryChartsPanel';
import { CivilCalendar } from '../../src/utils/civil-calendar';

describe('HistoryChartsPanel', () => {
  it('renders Consistency Trend axis labels in HTML and keeps Measured Volume target line containers equal height', () => {
    const startDay = CivilCalendar.fromLocalDate(2026, 11, 24);
    const endDay = CivilCalendar.fromLocalDate(2026, 11, 25);

    const habit: Habit = {
      id: 1,
      name: 'Screen breaks',
      color: '#3B82F6',
      weekdays: 0x7f,
      weeklyTarget: null,
      dailyTarget: 5,
      unit: null,
      startDay,
      scheduleHistory: [],
      archivedAt: null,
      createdAt: 0,
      updatedAt: 0,
    };

    const checkins: HabitCheckin[] = [
      {
        habitId: 1,
        dayIndex: startDay,
        done: true,
        value: 5,
        updatedAt: 0,
      },
    ];

    const { container } = render(() => (
      <HistoryChartsPanel
        habits={[habit]}
        targetHabits={[habit]}
        habitFilter="all"
        checkins={checkins}
        notes={[]}
        tasks={[]}
        effectiveRangeStart={startDay}
        effectiveRangeEnd={endDay}
        rangeLabel="Nov 24 – Nov 25"
        timeZone="UTC"
        analyticsSummary={{
          currentStreak: 1,
          currentStreakUnit: 'days',
          longestStreak: 1,
          longestStreakUnit: 'days',
          completionRate: 0.5,
          scheduledDays: 2,
          completedScheduledDays: 1,
          missedScheduledDays: 1,
        }}
        perfectDays={{
          perfectDays: 1,
          scheduledDaysWithHabits: 2,
          perfectRate: 0.5,
          currentPerfectStreak: 0,
          longestPerfectStreak: 1,
        }}
        prevComparison={null}
        habitTrends={new Map()}
        taskSummary={{
          doneCount: 0,
          notDoneCount: 0,
          archivedCount: 0,
          datedDoneCount: 0,
          onTimeCount: 0,
          lateCount: 0,
          goalsDoneCount: 0,
          goalsNotDoneCount: 0,
          goalsArchivedCount: 0,
          goalsOpenCount: 0,
          repeatableDoneCount: 0,
          completionRate: null,
          onTimeRate: null,
        }}
        taskOutcomeBuckets={[]}
        habitBreakdown={[]}
        heatmapData={{
          weeks: [],
          totalDone: 1,
          clampedStart: startDay,
          effectiveEnd: endDay,
          isCapped: false,
        }}
        selectedDay={endDay}
        onSelectDay={() => {}}
        onInspectDayInCalendar={() => {}}
        onSelectHabitFilter={() => {}}
      />
    ));

    // Consistency Trend axis labels are rendered as HTML spans (not SVG <text> scaled by viewBox)
    const trendSvg = screen.getByRole('img', {
      name: /habit consistency completion rate trend chart/i,
    });
    const trendSection = trendSvg.closest('section')!;
    expect(trendSvg.querySelectorAll('text')).toHaveLength(0);
    expect(within(trendSection).getByText('100%')).toBeInTheDocument();
    expect(within(trendSection).getByText('50%')).toBeInTheDocument();
    expect(within(trendSection).getByText('0%')).toBeInTheDocument();
    expect(within(trendSection).getByText('24')).toBeInTheDocument();
    expect(within(trendSection).getByText('25')).toBeInTheDocument();

    // Measured Volume renders Target lines at identical 100% positions with fixed-height value slots
    const measuredHeading = screen.getByRole('heading', { name: /measured volume/i });
    const measuredSection = measuredHeading.closest('section')!;
    const targetLines = Array.from(
      measuredSection.querySelectorAll<HTMLElement>('[aria-hidden="true"].border-dashed')
    );
    expect(targetLines).toHaveLength(2);
    expect(targetLines[0].style.bottom).toBe('100%');
    expect(targetLines[1].style.bottom).toBe('100%');

    // Top value labels above bars keep fixed h-4 height even when empty
    const valueSpans = measuredSection.querySelectorAll('span.h-4');
    expect(valueSpans.length).toBeGreaterThanOrEqual(4);
    expect(container).toBeTruthy();
  });

  it('supports interactive hover/focus on trend, donut, timeline, weekday toggle, measured selector, heatmap, and breakdown', () => {
    const startDay = CivilCalendar.fromLocalDate(2026, 11, 1);
    const endDay = CivilCalendar.fromLocalDate(2026, 11, 25);
    const onSelectDay = vi.fn();
    const onInspectDayInCalendar = vi.fn();
    const onSelectHabitFilter = vi.fn();

    const habit1: Habit = {
      id: 1,
      name: 'Read Book',
      color: '#3B82F6',
      weekdays: 0x7f,
      weeklyTarget: null,
      dailyTarget: 20,
      unit: 'pages',
      startDay,
      scheduleHistory: [
        { fromDay: startDay, weekdays: 0x7f, weeklyTarget: null, dailyTarget: 15 },
        { fromDay: startDay + 10, weekdays: 0x7f, weeklyTarget: null, dailyTarget: 20 },
      ],
      archivedAt: null,
      createdAt: 0,
      updatedAt: 0,
    };

    const habit2: Habit = {
      id: 2,
      name: 'Run',
      color: '#22C55E|emoji:🏃',
      weekdays: 0x7f,
      weeklyTarget: 3,
      dailyTarget: 5,
      unit: 'km',
      startDay,
      archivedAt: 100,
      createdAt: 0,
      updatedAt: 0,
    };

    const checkins: HabitCheckin[] = [
      { habitId: 1, dayIndex: startDay, done: true, value: 20, updatedAt: 1 },
      { habitId: 1, dayIndex: startDay + 2, done: true, value: 25, updatedAt: 1 },
      { habitId: 1, dayIndex: endDay - 1, done: false, value: 10, updatedAt: 1 },
      { habitId: 2, dayIndex: startDay + 1, done: true, value: 5, updatedAt: 1 },
    ];

    const tasks: Task[] = [
      {
        id: 101,
        title: 'Task Done',
        note: '',
        dueDay: startDay + 2,
        done: true,
        status: 'done',
        completedDay: startDay + 2,
        repeatable: false,
        deletedAt: null,
        createdAt: 1,
        updatedAt: Date.UTC(2026, 10, 3),
      },
      {
        id: 102,
        title: 'Task Missed',
        note: '',
        dueDay: startDay + 4,
        done: false,
        status: 'not_done',
        completedDay: null,
        repeatable: false,
        deletedAt: null,
        createdAt: 1,
        updatedAt: Date.UTC(2026, 10, 5),
      },
      {
        id: 103,
        title: 'Task Archived',
        note: '',
        dueDay: startDay + 5,
        done: false,
        status: 'archived',
        completedDay: null,
        repeatable: false,
        deletedAt: null,
        createdAt: 1,
        updatedAt: Date.UTC(2026, 10, 6),
      },
    ];

    render(() => (
      <HistoryChartsPanel
        habits={[habit1, habit2]}
        targetHabits={[habit1, habit2]}
        habitFilter="all"
        checkins={checkins}
        notes={[
          { habitId: 1, dayIndex: startDay, text: 'Great morning read', updatedAt: 1 },
          { habitId: 1, dayIndex: startDay + 2, text: 'Second note', updatedAt: 2 },
        ]}
        tasks={tasks}
        effectiveRangeStart={startDay}
        effectiveRangeEnd={endDay}
        rangeLabel="Nov 1 – Nov 25"
        timeZone="UTC"
        analyticsSummary={{
          currentStreak: 2,
          currentStreakUnit: 'weeks',
          longestStreak: 3,
          longestStreakUnit: 'weeks',
          completionRate: 0.72,
          scheduledDays: 20,
          completedScheduledDays: 14,
          missedScheduledDays: 6,
        }}
        perfectDays={{
          perfectDays: 5,
          scheduledDaysWithHabits: 20,
          perfectRate: 0.25,
          currentPerfectStreak: 2,
          longestPerfectStreak: 4,
        }}
        prevComparison={{
          prevLabel: 'Previous 25d',
          habitRateDeltaPct: 12,
          taskDoneDelta: -1,
          taskRateDeltaPct: -5,
        }}
        habitTrends={
          new Map([
            [1, { deltaPct: 15, bonusCount: 0 }],
            [2, { deltaPct: -10, bonusCount: 2 }],
          ])
        }
        taskSummary={{
          doneCount: 1,
          notDoneCount: 1,
          archivedCount: 1,
          datedDoneCount: 1,
          onTimeCount: 1,
          lateCount: 0,
          goalsDoneCount: 0,
          goalsNotDoneCount: 0,
          goalsArchivedCount: 0,
          goalsOpenCount: 0,
          repeatableDoneCount: 0,
          completionRate: 0.5,
          onTimeRate: 1,
        }}
        taskOutcomeBuckets={[
          {
            key: 'b1',
            label: 'Nov 1–7',
            shortLabel: 'Nov 1',
            doneCount: 1,
            notDoneCount: 1,
            archivedCount: 1,
          },
        ]}
        habitBreakdown={[
          {
            habit: habit1,
            scheduledDays: 25,
            completedDays: 18,
            missedDays: 7,
            completionRate: 0.72,
            currentStreak: 3,
            longestStreak: 7,
            streakUnit: 'days',
            totalValue: 45,
            unit: 'pages',
          },
          {
            habit: habit2,
            scheduledDays: 12,
            completedDays: 9,
            missedDays: 3,
            completionRate: 0.75,
            currentStreak: 2,
            longestStreak: 3,
            streakUnit: 'weeks',
            totalValue: 15,
            unit: 'km',
          },
        ]}
        heatmapData={{
          weeks: [
            {
              weekStart: startDay,
              monthLabel: 'Nov',
              days: [
                { dayIndex: startDay - 1, inRange: false, done: 0, scheduled: 0, tone: 'future' },
                { dayIndex: startDay, inRange: true, done: 2, scheduled: 2, tone: 'complete' },
                {
                  dayIndex: startDay + 1,
                  inRange: true,
                  done: 3,
                  scheduled: 4,
                  tone: 'missed-slight',
                },
                {
                  dayIndex: startDay + 2,
                  inRange: true,
                  done: 1,
                  scheduled: 2,
                  tone: 'missed-moderate',
                },
                {
                  dayIndex: startDay + 3,
                  inRange: true,
                  done: 1,
                  scheduled: 4,
                  tone: 'missed-heavy',
                },
                {
                  dayIndex: startDay + 4,
                  inRange: true,
                  done: 0,
                  scheduled: 2,
                  tone: 'missed-all',
                },
                { dayIndex: endDay, inRange: true, done: 0, scheduled: 2, tone: 'today-open' },
              ],
            },
          ],
          totalDone: 7,
          clampedStart: startDay,
          effectiveEnd: endDay,
          isCapped: true,
        }}
        selectedDay={startDay}
        onSelectDay={onSelectDay}
        onInspectDayInCalendar={onInspectDayInCalendar}
        onSelectHabitFilter={onSelectHabitFilter}
      />
    ));

    // KPI deltas & perfect days note
    expect(screen.getByText(/\+12% vs prev/i)).toBeInTheDocument();
    expect(screen.getByText(/-1 vs prev/i)).toBeInTheDocument();
    expect(screen.getByText(/2d perfect streak/i)).toBeInTheDocument();

    // Consistency Trend interactive rect hover & focus
    const trendSvg = screen.getByRole('img', {
      name: /habit consistency completion rate trend chart/i,
    });
    const trendRects = trendSvg.querySelectorAll('rect');
    expect(trendRects.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(trendRects[0]);
    fireEvent.mouseLeave(trendRects[0]);
    fireEvent.focus(trendRects[0]);
    fireEvent.blur(trendRects[0]);

    // Task Discipline donut hover on circle and legend
    const donutSvg = screen.getByRole('img', { name: /task outcomes breakdown donut chart/i });
    const donutCircles = donutSvg.querySelectorAll('circle');
    expect(donutCircles.length).toBeGreaterThan(1);
    fireEvent.mouseEnter(donutCircles[1]);
    fireEvent.mouseLeave(donutCircles[1]);

    // Tasks Timeline bucket hover
    const timelineHeading = screen.getByRole('heading', { name: /tasks timeline/i });
    const timelineSection = timelineHeading.closest('section')!;
    const bucketBar = within(timelineSection).getByText('Nov 1').closest('div')!;
    fireEvent.mouseEnter(bucketBar);
    expect(within(timelineSection).getByText(/nov 1–7 · 1 done/i)).toBeInTheDocument();
    fireEvent.mouseLeave(bucketBar);

    // Weekday Rhythm toggle to Tasks & hover bar
    const weekdayHeading = screen.getByRole('heading', { name: /weekday rhythm/i });
    const weekdaySection = weekdayHeading.closest('section')!;
    fireEvent.click(within(weekdaySection).getByRole('button', { name: /^tasks$/i }));
    expect(within(weekdaySection).getByText(/task outcomes by weekday/i)).toBeInTheDocument();
    fireEvent.click(within(weekdaySection).getByRole('button', { name: /^habits$/i }));

    // Measured Volume selector switching from habit1 to habit2
    expect(screen.getByText(/target 15 → 20 pages\/day/i)).toBeInTheDocument();
    const measuredSelect = screen.getByRole('button', { name: /select measured habit/i });
    fireEvent.click(measuredSelect);
    fireEvent.click(screen.getByRole('option', { name: /run/i }));
    expect(screen.getByText(/15 km total/i)).toBeInTheDocument();

    // Heatmap interaction: selected day shows completion & note, hover/focus cell with note, click cell, click inspect in calendar
    expect(screen.getByText(/\(last 2 years shown\)/i)).toBeInTheDocument();
    expect(screen.getByText('2/2 completed')).toBeInTheDocument();
    expect(screen.getByText(/great morning read/i)).toBeInTheDocument();
    const heatCell = screen.getByRole('button', { name: /nov 3: 1 of 2 completed/i });
    fireEvent.mouseEnter(heatCell);
    expect(screen.getByText('1/2 completed')).toBeInTheDocument();
    expect(screen.getByText(/second note/i)).toBeInTheDocument();
    fireEvent.mouseLeave(heatCell);
    fireEvent.click(heatCell);
    expect(onSelectDay).toHaveBeenCalledWith(startDay + 2);

    fireEvent.click(screen.getByRole('button', { name: /inspect nov 1 in calendar/i }));
    expect(onInspectDayInCalendar).toHaveBeenCalledWith(startDay);

    // Habit Breakdown row click & archived / bonus / delta badges
    expect(screen.getByText('(Archived)')).toBeInTheDocument();
    expect(screen.getByText('+2 bonus')).toBeInTheDocument();
    expect(screen.getByText('↗ +15%')).toBeInTheDocument();
    expect(screen.getByText('↘ -10%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /read book/i }));
    expect(onSelectHabitFilter).toHaveBeenCalledWith([1]);
  });

  it('renders clean empty states when there are no scheduled habits or task outcomes', () => {
    const day = CivilCalendar.fromLocalDate(2026, 11, 25);

    render(() => (
      <HistoryChartsPanel
        habits={[]}
        targetHabits={[]}
        habitFilter="all"
        checkins={[]}
        notes={[]}
        tasks={[]}
        effectiveRangeStart={day - 5}
        effectiveRangeEnd={day}
        rangeLabel="Last 7 days"
        timeZone="UTC"
        analyticsSummary={{
          currentStreak: 0,
          currentStreakUnit: 'days',
          longestStreak: 0,
          longestStreakUnit: 'days',
          completionRate: 0,
          scheduledDays: 0,
          completedScheduledDays: 0,
          missedScheduledDays: 0,
        }}
        perfectDays={{
          perfectDays: 0,
          scheduledDaysWithHabits: 0,
          perfectRate: null,
          currentPerfectStreak: 0,
          longestPerfectStreak: 0,
        }}
        prevComparison={null}
        habitTrends={new Map()}
        taskSummary={{
          doneCount: 0,
          notDoneCount: 0,
          archivedCount: 0,
          datedDoneCount: 0,
          onTimeCount: 0,
          lateCount: 0,
          goalsDoneCount: 0,
          goalsNotDoneCount: 0,
          goalsArchivedCount: 0,
          goalsOpenCount: 0,
          repeatableDoneCount: 0,
          completionRate: null,
          onTimeRate: null,
        }}
        taskOutcomeBuckets={[]}
        habitBreakdown={[]}
        heatmapData={{
          weeks: [],
          totalDone: 0,
          clampedStart: day - 5,
          effectiveEnd: day,
          isCapped: false,
        }}
        selectedDay={day}
        onSelectDay={() => {}}
        onInspectDayInCalendar={() => {}}
        onSelectHabitFilter={() => {}}
      />
    ));

    expect(screen.getByText(/no scheduled habit days in this date range/i)).toBeInTheDocument();
    expect(screen.getByText(/no closed or archived tasks in this period/i)).toBeInTheDocument();
    expect(screen.getByText(/no task outcomes in the selected date range/i)).toBeInTheDocument();
    expect(screen.getByText(/not enough data to compare weekdays/i)).toBeInTheDocument();
  });
});

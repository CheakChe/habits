import { render, screen, within } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { Habit, HabitCheckin } from '../../src/types/domain';
import { HistoryChartsPanel } from '../../src/ui/HistoryChartsPanel';
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
      measuredSection.querySelectorAll('[aria-hidden="true"].border-dashed')
    ) as HTMLElement[];
    expect(targetLines).toHaveLength(2);
    expect(targetLines[0].style.bottom).toBe('100%');
    expect(targetLines[1].style.bottom).toBe('100%');

    // Top value labels above bars keep fixed h-4 height even when empty
    const valueSpans = measuredSection.querySelectorAll('span.h-4');
    expect(valueSpans.length).toBeGreaterThanOrEqual(4);
    expect(container).toBeTruthy();
  });
});

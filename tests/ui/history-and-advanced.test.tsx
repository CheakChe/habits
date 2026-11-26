import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { DomainSnapshot } from '../../src/types/domain';
import { HistoryAdvancedPanel } from '../../src/ui/HistoryAdvancedPanel';
import { HistoryView } from '../../src/ui/HistoryView';
import { AdvancedAnalytics } from '../../src/utils/advanced-analytics';
import { CivilCalendar } from '../../src/utils/civil-calendar';

const TODAY = CivilCalendar.fromLocalDate(2026, 11, 25);

const SAMPLE_SNAPSHOT: DomainSnapshot = {
  habits: [
    {
      id: 1,
      name: 'Read',
      color: '#3B82F6',
      weekdays: 0x7f,
      weeklyTarget: null,
      dailyTarget: 20,
      unit: 'pages',
      startDay: TODAY - 10,
      archivedAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  checkins: [
    { habitId: 1, dayIndex: TODAY - 2, done: true, value: 25, updatedAt: Date.now() },
    { habitId: 1, dayIndex: TODAY - 1, done: false, value: 0, updatedAt: Date.now() },
  ],
  notes: [{ habitId: 1, dayIndex: TODAY - 1, text: 'Tired after work', updatedAt: Date.now() }],
  tasks: [
    {
      id: 10,
      title: 'Finish report',
      note: 'Q4',
      dueDay: TODAY,
      done: true,
      status: 'done',
      completedDay: TODAY,
      repeatable: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: Date.now(),
    },
  ],
};

describe('HistoryView & HistoryAdvancedPanel', () => {
  it('renders calendar subtab, navigates months, toggles check-in, and saves note', () => {
    const onSelectSubTab = vi.fn();
    const onToggleCheckin = vi.fn().mockResolvedValue(undefined);
    const onSaveNote = vi.fn().mockResolvedValue(undefined);

    render(() => (
      <HistoryView
        snapshot={SAMPLE_SNAPSHOT}
        todayDay={TODAY}
        timeZone="UTC"
        subTab="calendar"
        onSelectSubTab={onSelectSubTab}
        habitFilter="all"
        onChangeHabitFilter={() => {}}
        rangePreset="last_30"
        customStartDay={TODAY - 29}
        customEndDay={TODAY}
        onSelectRangePreset={() => {}}
        onSelectCustomRange={() => {}}
        onChangeTimeZone={() => {}}
        advancedHeatmapMode="combined"
        onChangeAdvancedHeatmapMode={() => {}}
        advancedNotesFilter="all"
        onChangeAdvancedNotesFilter={() => {}}
        getAdvancedAnalytics={(habits, _f, startDay, endDay) =>
          AdvancedAnalytics.compute({
            snapshot: SAMPLE_SNAPSHOT,
            targetHabits: habits,
            startDay,
            endDay,
            todayDay: TODAY,
            timeZone: 'UTC',
          })
        }
        onToggleCheckin={onToggleCheckin}
        onSetCheckinValue={async () => {}}
        onIncrementCheckinValue={async () => {}}
        onSaveNote={onSaveNote}
      />
    ));

    expect(screen.getByText('November 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    expect(screen.getByText('November 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /toggle read for nov 25/i }));
    expect(onToggleCheckin).toHaveBeenCalledWith(1, TODAY, true);

    fireEvent.click(screen.getByRole('button', { name: /edit note for read/i }));
    const noteInput = screen.getByPlaceholderText(/day note/i);
    fireEvent.input(noteInput, { target: { value: 'Focused' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSaveNote).toHaveBeenCalledWith(1, TODAY, 'Focused');

    // Switch tabs
    fireEvent.click(screen.getByRole('tab', { name: /charts/i }));
    expect(onSelectSubTab).toHaveBeenCalledWith('charts');
    fireEvent.click(screen.getByRole('tab', { name: /advanced/i }));
    expect(onSelectSubTab).toHaveBeenCalledWith('advanced');
  });

  it('renders HistoryAdvancedPanel diagnostics and interactive filters', () => {
    const onChangeHeatmapMode = vi.fn();
    const onChangeNotesFilter = vi.fn();
    const onSelectHabitFilter = vi.fn();

    const report = AdvancedAnalytics.compute({
      snapshot: SAMPLE_SNAPSHOT,
      targetHabits: SAMPLE_SNAPSHOT.habits,
      startDay: TODAY - 10,
      endDay: TODAY,
      todayDay: TODAY,
      timeZone: 'UTC',
    });

    render(() => (
      <HistoryAdvancedPanel
        report={report}
        effectiveRangeStart={TODAY - 10}
        effectiveRangeEnd={TODAY}
        rangeLabel="Last 30 days"
        selectedDay={TODAY}
        heatmapMode="combined"
        notesFilter="all"
        onChangeHeatmapMode={onChangeHeatmapMode}
        onChangeNotesFilter={onChangeNotesFilter}
        onSelectDay={() => {}}
        onInspectDayInCalendar={() => {}}
        onSelectHabitFilter={onSelectHabitFilter}
      />
    ));

    expect(screen.getByText(/habit resilience & behavior/i)).toBeInTheDocument();
    expect(screen.getByText(/bounce-back rate/i)).toBeInTheDocument();
    expect(screen.getByText('Tired after work')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^habits$/i }));
    expect(onChangeHeatmapMode).toHaveBeenCalledWith('habits');

    fireEvent.click(screen.getByRole('button', { name: /^missed days$/i }));
    expect(onChangeNotesFilter).toHaveBeenCalledWith('missed');
  });

  it('renders HistoryView charts, advanced subtabs, empty period state, and task statuses on calendar day', () => {
    const onSelectSubTab = vi.fn();
    const onChangeHabitFilter = vi.fn();

    const richSnapshot: DomainSnapshot = {
      habits: [
        {
          id: 1,
          name: 'Flexible Yoga',
          color: '#22C55E',
          weekdays: 0x7f,
          weeklyTarget: 3,
          dailyTarget: null,
          unit: null,
          startDay: TODAY - 20,
          archivedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 2,
          name: 'Measured Walk',
          color: '#3B82F6',
          weekdays: 0x7f,
          weeklyTarget: null,
          dailyTarget: 10,
          unit: 'min',
          startDay: TODAY - 20,
          scheduleHistory: [
            { fromDay: TODAY - 20, weekdays: 0x7f, weeklyTarget: null, dailyTarget: 5 },
            { fromDay: TODAY - 5, weekdays: 0x7f, weeklyTarget: null, dailyTarget: 10 },
          ],
          archivedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      checkins: [
        { habitId: 1, dayIndex: TODAY - 2, done: true, value: 1, updatedAt: Date.now() },
        { habitId: 2, dayIndex: TODAY - 3, done: true, value: 12, updatedAt: Date.now() },
        { habitId: 2, dayIndex: TODAY - 1, done: false, value: 4, updatedAt: Date.now() },
      ],
      notes: [
        { habitId: 2, dayIndex: TODAY - 3, text: 'Morning energy walk', updatedAt: 1 },
        { habitId: 2, dayIndex: TODAY - 1, text: 'Morning fatigue', updatedAt: 2 },
      ],
      tasks: [
        {
          id: 1,
          title: 'Done Task',
          note: 'Wrapped up',
          dueDay: TODAY,
          done: true,
          status: 'done',
          completedDay: TODAY,
          repeatable: true,
          deletedAt: null,
          createdAt: 1,
          updatedAt: Date.now(),
        },
        {
          id: 2,
          title: 'Missed Task',
          note: 'Skipped',
          dueDay: TODAY,
          done: false,
          status: 'not_done',
          completedDay: null,
          repeatable: false,
          deletedAt: null,
          createdAt: 1,
          updatedAt: Date.UTC(2026, 10, 25),
        },
        {
          id: 3,
          title: 'Arch Task',
          note: '',
          dueDay: TODAY,
          done: false,
          status: 'archived',
          completedDay: null,
          repeatable: false,
          deletedAt: null,
          createdAt: 1,
          updatedAt: Date.UTC(2026, 10, 25),
        },
        {
          id: 4,
          title: 'Due Today Open',
          note: 'Call bank',
          dueDay: TODAY,
          done: false,
          status: 'open',
          completedDay: null,
          repeatable: true,
          deletedAt: null,
          createdAt: 1,
          updatedAt: Date.now(),
        },
      ],
    };

    const { unmount } = render(() => (
      <HistoryView
        snapshot={richSnapshot}
        todayDay={TODAY}
        timeZone="UTC"
        subTab="calendar"
        onSelectSubTab={onSelectSubTab}
        habitFilter={[999]}
        onChangeHabitFilter={onChangeHabitFilter}
        rangePreset="last_30"
        customStartDay={TODAY - 29}
        customEndDay={TODAY}
        onSelectRangePreset={() => {}}
        onSelectCustomRange={() => {}}
        onChangeTimeZone={() => {}}
        advancedHeatmapMode="combined"
        onChangeAdvancedHeatmapMode={() => {}}
        advancedNotesFilter="all"
        onChangeAdvancedNotesFilter={() => {}}
        getAdvancedAnalytics={(habits, _f, startDay, endDay) =>
          AdvancedAnalytics.compute({
            snapshot: richSnapshot,
            targetHabits: habits,
            startDay,
            endDay,
            todayDay: TODAY,
            timeZone: 'UTC',
          })
        }
        onToggleCheckin={async () => {}}
        onSetCheckinValue={async () => {}}
        onIncrementCheckinValue={async () => {}}
        onSaveNote={async () => {}}
      />
    ));

    // Empty filtered habits shows Show All Habits CTA and selectedDay task statuses
    expect(screen.getByText(/no habits selected in filter/i)).toBeInTheDocument();
    expect(screen.getByText('Done Task')).toBeInTheDocument();
    expect(screen.getByText('Missed Task')).toBeInTheDocument();
    expect(screen.getByText('Arch Task')).toBeInTheDocument();
    expect(screen.getByText('Due Today Open')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show all habits/i }));
    expect(onChangeHabitFilter).toHaveBeenCalledWith('all');
    unmount();

    // Render empty database fallback
    render(() => (
      <HistoryView
        snapshot={{ habits: [], checkins: [], notes: [], tasks: [] }}
        todayDay={TODAY}
        timeZone="UTC"
        subTab="charts"
        onSelectSubTab={() => {}}
        habitFilter="all"
        onChangeHabitFilter={() => {}}
        rangePreset="last_7"
        customStartDay={TODAY - 6}
        customEndDay={TODAY}
        onSelectRangePreset={() => {}}
        onSelectCustomRange={() => {}}
        onChangeTimeZone={() => {}}
        advancedHeatmapMode="combined"
        onChangeAdvancedHeatmapMode={() => {}}
        advancedNotesFilter="all"
        onChangeAdvancedNotesFilter={() => {}}
        getAdvancedAnalytics={(habits, _f, startDay, endDay) =>
          AdvancedAnalytics.compute({
            snapshot: { habits: [], checkins: [], notes: [], tasks: [] },
            targetHabits: habits,
            startDay,
            endDay,
            todayDay: TODAY,
            timeZone: 'UTC',
          })
        }
        onToggleCheckin={async () => {}}
        onSetCheckinValue={async () => {}}
        onIncrementCheckinValue={async () => {}}
        onSaveNote={async () => {}}
      />
    ));
    expect(screen.getByText(/empty period/i)).toBeInTheDocument();
  });

  it('supports HistoryAdvancedPanel keyword filtering, heatmap inspect, flex/measured/schedule impact views', () => {
    const onSelectDay = vi.fn();
    const onInspectDayInCalendar = vi.fn();
    const onSelectHabitFilter = vi.fn();

    const richSnapshot: DomainSnapshot = {
      habits: [
        {
          id: 1,
          name: 'Flexible Reading',
          color: '#22C55E',
          weekdays: 0x7f,
          weeklyTarget: 3,
          dailyTarget: null,
          unit: null,
          startDay: TODAY - 20,
          archivedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 2,
          name: 'Running',
          color: '#3B82F6',
          weekdays: 0x7f,
          weeklyTarget: null,
          dailyTarget: 10,
          unit: 'km',
          startDay: TODAY - 20,
          scheduleHistory: [
            { fromDay: TODAY - 20, weekdays: 0x7f, weeklyTarget: null, dailyTarget: 5 },
            { fromDay: TODAY - 7, weekdays: 0x7f, weeklyTarget: null, dailyTarget: 10 },
          ],
          archivedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      checkins: [
        {
          habitId: 1,
          dayIndex: TODAY - 6,
          done: true,
          value: 1,
          updatedAt: Date.UTC(2026, 10, 19, 8),
        },
        {
          habitId: 2,
          dayIndex: TODAY - 10,
          done: true,
          value: 15,
          updatedAt: Date.UTC(2026, 10, 15, 9),
        },
        {
          habitId: 2,
          dayIndex: TODAY - 8,
          done: true,
          value: 5,
          updatedAt: Date.UTC(2026, 10, 17, 10),
        },
        {
          habitId: 2,
          dayIndex: TODAY - 1,
          done: false,
          value: 4,
          updatedAt: Date.UTC(2026, 10, 24, 21),
        },
      ],
      notes: [
        { habitId: 2, dayIndex: TODAY - 10, text: 'Morning energy boost', updatedAt: 1 },
        { habitId: 2, dayIndex: TODAY - 8, text: 'Morning focus session', updatedAt: 2 },
      ],
      tasks: [
        {
          id: 1,
          title: 'Weekly Sync',
          note: '',
          dueDay: TODAY - 3,
          done: true,
          status: 'done',
          completedDay: TODAY - 5,
          repeatable: true,
          deletedAt: null,
          createdAt: Date.UTC(2026, 10, 10),
          updatedAt: Date.UTC(2026, 10, 20),
        },
        {
          id: 2,
          title: 'Overdue Bill',
          note: '',
          dueDay: TODAY - 4,
          done: false,
          status: 'open',
          completedDay: null,
          repeatable: false,
          deletedAt: null,
          createdAt: Date.UTC(2026, 10, 12),
          updatedAt: Date.UTC(2026, 10, 12),
        },
      ],
    };

    const report = AdvancedAnalytics.compute({
      snapshot: richSnapshot,
      targetHabits: richSnapshot.habits,
      startDay: TODAY - 20,
      endDay: TODAY,
      todayDay: TODAY,
      timeZone: 'UTC',
    });

    render(() => (
      <HistoryAdvancedPanel
        report={report}
        effectiveRangeStart={TODAY - 20}
        effectiveRangeEnd={TODAY}
        rangeLabel="Last 30 days"
        selectedDay={TODAY}
        heatmapMode="tasks"
        notesFilter="all"
        onChangeHeatmapMode={() => {}}
        onChangeNotesFilter={() => {}}
        onSelectDay={onSelectDay}
        onInspectDayInCalendar={onInspectDayInCalendar}
        onSelectHabitFilter={onSelectHabitFilter}
      />
    ));

    expect(screen.getByText(/flexible habits deep dive/i)).toBeInTheDocument();
    expect(screen.getByText(/measured target intensity/i)).toBeInTheDocument();
    expect(screen.getByText(/schedule change impact/i)).toBeInTheDocument();
    expect(screen.getByText(/repeatable tasks/i)).toBeInTheDocument();
    expect(screen.getByText(/oldest overdue: overdue bill/i)).toBeInTheDocument();

    // Keyword filtering & clearing in notes section
    const morningBtn = screen.getByRole('button', { name: /morning \(2\)/i });
    fireEvent.click(morningBtn);
    expect(screen.getByRole('button', { name: /clear term/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear term/i }));

    // Inspect day in calendar button
    fireEvent.click(screen.getByRole('button', { name: /inspect nov 25/i }));
    expect(onInspectDayInCalendar).toHaveBeenCalledWith(TODAY);
  });

  it('renders flexible off-schedule and partial measured habit controls in HistoryView selected day panel and saves note on Enter', async () => {
    const onIncrementCheckinValue = vi.fn().mockResolvedValue(undefined);
    const onSaveNote = vi.fn().mockResolvedValue(undefined);

    const snapshot: DomainSnapshot = {
      habits: [
        {
          id: 1,
          name: 'Workday Flex',
          color: '#22C55E',
          weekdays: 0b0011000, // Thu-Fri only; TODAY (2026-11-25) is Wednesday -> off-schedule
          weeklyTarget: 1,
          dailyTarget: null,
          unit: null,
          startDay: TODAY - 10,
          archivedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 2,
          name: 'Hydrate',
          color: '#3B82F6',
          weekdays: 0x7f,
          weeklyTarget: null,
          dailyTarget: 8,
          unit: 'cups',
          startDay: TODAY - 10,
          archivedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      checkins: [{ habitId: 2, dayIndex: TODAY, done: false, value: 3, updatedAt: 1 }],
      notes: [],
      tasks: [],
    };

    render(() => (
      <HistoryView
        snapshot={snapshot}
        todayDay={TODAY}
        timeZone="UTC"
        subTab="calendar"
        onSelectSubTab={() => {}}
        habitFilter="all"
        onChangeHabitFilter={() => {}}
        rangePreset="last_30"
        customStartDay={TODAY - 29}
        customEndDay={TODAY}
        onSelectRangePreset={() => {}}
        onSelectCustomRange={() => {}}
        onChangeTimeZone={() => {}}
        advancedHeatmapMode="combined"
        onChangeAdvancedHeatmapMode={() => {}}
        advancedNotesFilter="all"
        onChangeAdvancedNotesFilter={() => {}}
        getAdvancedAnalytics={(habits, _f, startDay, endDay) =>
          AdvancedAnalytics.compute({
            snapshot,
            targetHabits: habits,
            startDay,
            endDay,
            todayDay: TODAY,
            timeZone: 'UTC',
          })
        }
        onToggleCheckin={async () => {}}
        onSetCheckinValue={async () => {}}
        onIncrementCheckinValue={onIncrementCheckinValue}
        onSaveNote={onSaveNote}
      />
    ));

    expect(screen.getByText(/off-schedule day · flexible/i)).toBeInTheDocument();
    expect(screen.getByText(/3\/8 cups · scheduled/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add 1 cups to hydrate/i }));
    expect(onIncrementCheckinValue).toHaveBeenCalledWith(2, TODAY, 1);

    fireEvent.click(screen.getByRole('button', { name: /edit note for workday flex/i }));
    const noteInput = screen.getByPlaceholderText(/day note/i);
    fireEvent.input(noteInput, { target: { value: 'Quick note' } });
    fireEvent.keyDown(noteInput, { key: 'Enter' });
    expect(onSaveNote).toHaveBeenCalledWith(1, TODAY, 'Quick note');
  });
});

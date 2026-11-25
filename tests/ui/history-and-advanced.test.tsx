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
});

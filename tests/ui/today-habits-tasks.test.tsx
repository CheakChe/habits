import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { DomainSnapshot, Habit, Task } from '../../src/types/domain';
import { HabitsView } from '../../src/ui/HabitsView';
import { TasksView } from '../../src/ui/TasksView';
import { TodayView } from '../../src/ui/TodayView';
import { CivilCalendar } from '../../src/utils/civil-calendar';
import { OPEN_TASK_BUCKETS } from '../../src/utils/today-board';

const TODAY = CivilCalendar.fromLocalDate(2026, 11, 25);

function makeHabit(overrides: Partial<Habit> & { id: number; name: string }): Habit {
  return {
    color: '#3B82F6',
    weekdays: 0x7f,
    weeklyTarget: null,
    startDay: TODAY - 14,
    archivedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> & { id: number; title: string }): Task {
  return {
    note: '',
    dueDay: TODAY,
    done: false,
    status: 'open',
    completedDay: null,
    repeatable: false,
    deletedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('TodayView', () => {
  it('renders empty state and triggers onOpenNewHabit', () => {
    const onOpenNewHabit = vi.fn();
    render(() => (
      <TodayView
        snapshot={{ habits: [], checkins: [], notes: [], tasks: [] }}
        todayDay={TODAY}
        goalsExpanded={true}
        onToggleGoalsExpanded={() => {}}
        onToggleCheckin={async () => {}}
        onSetCheckinValue={async () => {}}
        onIncrementCheckinValue={async () => {}}
        onSaveNote={async () => {}}
        onToggleTask={async () => {}}
        onQuickAddTask={async () => {}}
        onScheduleTaskToday={async () => {}}
        onOpenNewHabit={onOpenNewHabit}
        onOpenEditTask={() => {}}
      />
    ));

    expect(screen.getByText(/no habits are scheduled for today/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /create first habit/i }));
    expect(onOpenNewHabit).toHaveBeenCalledTimes(1);
  });

  it('handles boolean & measured habits, day notes, quick tasks, overdue tasks, and goals', async () => {
    const onToggleCheckin = vi.fn().mockResolvedValue(undefined);
    const onSetCheckinValue = vi.fn().mockResolvedValue(undefined);
    const onIncrementCheckinValue = vi.fn().mockResolvedValue(undefined);
    const onSaveNote = vi.fn().mockResolvedValue(undefined);
    const onToggleTask = vi.fn().mockResolvedValue(undefined);
    const onQuickAddTask = vi.fn().mockResolvedValue(undefined);
    const onScheduleTaskToday = vi.fn().mockResolvedValue(undefined);
    const onToggleGoalsExpanded = vi.fn();
    const onOpenEditTask = vi.fn();

    const snapshot: DomainSnapshot = {
      habits: [
        makeHabit({
          id: 1,
          name: 'Drink Water',
          color: '#22C55E|emoji:💧',
          dailyTarget: 8,
          unit: 'cups',
          reminderSlotIds: ['s1'],
        }),
        makeHabit({
          id: 2,
          name: 'Workout',
          weeklyTarget: 3,
          weekdays: 0x7f,
        }),
      ],
      checkins: [{ habitId: 1, dayIndex: TODAY, done: false, value: 3, updatedAt: 1000 }],
      notes: [{ habitId: 2, dayIndex: TODAY, text: 'Felt strong', updatedAt: 1000 }],
      tasks: [
        makeTask({
          id: 10,
          title: 'Pay rent',
          dueDay: TODAY - 2,
          repeatable: true,
          reminderSlotIds: ['s2'],
        }),
        makeTask({ id: 11, title: 'Call dentist', dueDay: TODAY, note: 'Morning' }),
        makeTask({ id: 12, title: 'Learn Rust', dueDay: null, note: 'Side goal' }),
      ],
      reminderSlots: [
        { id: 's1', label: 'Morning', time: '09:00', deletedAt: null, createdAt: 1, updatedAt: 1 },
        { id: 's2', label: 'Noon', time: '13:00', deletedAt: null, createdAt: 2, updatedAt: 2 },
      ],
    };

    render(() => (
      <TodayView
        snapshot={snapshot}
        todayDay={TODAY}
        goalsExpanded={true}
        onToggleGoalsExpanded={onToggleGoalsExpanded}
        onToggleCheckin={onToggleCheckin}
        onSetCheckinValue={onSetCheckinValue}
        onIncrementCheckinValue={onIncrementCheckinValue}
        onSaveNote={onSaveNote}
        onToggleTask={onToggleTask}
        onQuickAddTask={onQuickAddTask}
        onScheduleTaskToday={onScheduleTaskToday}
        onOpenNewHabit={() => {}}
        onOpenEditTask={onOpenEditTask}
      />
    ));

    expect(screen.getByText('Drink Water')).toBeInTheDocument();
    expect(screen.getByText('3/8 cups')).toBeInTheDocument();
    expect(screen.getByText('3× / week')).toBeInTheDocument();
    expect(screen.getByText('09:00 Morning')).toBeInTheDocument();
    expect(screen.getByText('13:00 Noon')).toBeInTheDocument();
    expect(screen.getByText('1 overdue')).toBeInTheDocument();

    // Measured +1 and toggle complete
    fireEvent.click(screen.getByRole('button', { name: /add 1 cups to drink water/i }));
    expect(onIncrementCheckinValue).toHaveBeenCalledWith(1, TODAY, 1);

    fireEvent.click(screen.getByRole('button', { name: /complete drink water/i }));
    expect(onToggleCheckin).toHaveBeenCalledWith(1, TODAY, true);

    // Open & save note for Workout
    fireEvent.click(screen.getByRole('button', { name: /day note for workout/i }));
    const noteInput = screen.getByPlaceholderText(/add a note for today/i);
    fireEvent.input(noteInput, { target: { value: 'Great session' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSaveNote).toHaveBeenCalledWith(2, TODAY, 'Great session');

    // Quick add today task & dateless goal
    const quickTaskInput = screen.getByPlaceholderText(/quick task due today/i);
    fireEvent.input(quickTaskInput, { target: { value: 'Buy milk' } });
    fireEvent.submit(quickTaskInput.closest('form')!);
    expect(onQuickAddTask).toHaveBeenCalledWith('Buy milk', TODAY);

    const quickGoalInput = screen.getByPlaceholderText(/add a goal/i);
    fireEvent.input(quickGoalInput, { target: { value: 'Read 20 books' } });
    fireEvent.submit(quickGoalInput.closest('form')!);
    expect(onQuickAddTask).toHaveBeenCalledWith('Read 20 books', null);

    // Toggle task, edit task, schedule goal today, collapse goals
    fireEvent.click(screen.getByRole('button', { name: /complete task pay rent/i }));
    expect(onToggleTask).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Call dentist').closest('button')!);
    expect(onOpenEditTask).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^today$/i }));
    expect(onScheduleTaskToday).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /goals · no due date/i }));
    expect(onToggleGoalsExpanded).toHaveBeenCalledTimes(1);
  });
});

describe('HabitsView', () => {
  it('filters active vs archived habits and triggers create, edit, and archive/restore', async () => {
    const onCreateHabit = vi.fn();
    const onEditHabit = vi.fn();
    const onToggleArchive = vi.fn().mockResolvedValue(undefined);

    const snapshot: DomainSnapshot = {
      habits: [
        makeHabit({
          id: 1,
          name: 'Morning Run',
          dailyTarget: 5,
          unit: 'km',
          reminderSlotIds: ['s1'],
          scheduleHistory: [
            { fromDay: TODAY - 14, weekdays: 0x7f, weeklyTarget: null, dailyTarget: null },
            { fromDay: TODAY - 2, weekdays: 0x7f, weeklyTarget: null, dailyTarget: 5 },
          ],
        }),
        makeHabit({
          id: 2,
          name: 'Flex Reading',
          weeklyTarget: 4,
          weekdays: 0b0011111,
        }),
        makeHabit({
          id: 3,
          name: 'Flex Yoga',
          weeklyTarget: 2,
          weekdays: 0x7f,
        }),
        makeHabit({
          id: 4,
          name: 'Old Habit',
          archivedAt: 5000,
        }),
      ],
      checkins: Array.from({ length: 7 }, (_, i) => ({
        habitId: 1,
        dayIndex: TODAY - i,
        done: true,
        value: 5,
        updatedAt: 1000,
      })),
      notes: [],
      tasks: [],
      reminderSlots: [
        { id: 's1', label: 'Dawn', time: '07:00', deletedAt: null, createdAt: 1, updatedAt: 1 },
      ],
    };

    render(() => (
      <HabitsView
        snapshot={snapshot}
        todayDay={TODAY}
        onCreateHabit={onCreateHabit}
        onEditHabit={onEditHabit}
        onToggleArchive={onToggleArchive}
      />
    ));

    expect(screen.getByText('Morning Run')).toBeInTheDocument();
    expect(screen.getByText('Flex Reading')).toBeInTheDocument();
    expect(screen.getByText('Flex Yoga')).toBeInTheDocument();
    expect(screen.queryByText('Old Habit')).not.toBeInTheDocument();
    expect(screen.getByText('Goal 5 km/day')).toBeInTheDocument();
    expect(screen.getByText('4× / week')).toBeInTheDocument();
    expect(screen.getByText('2× / week')).toBeInTheDocument();
    expect(screen.getByLabelText('Allowed weekdays')).toBeInTheDocument();
    expect(screen.getByText('Any day')).toBeInTheDocument();
    expect(screen.getByText('07:00 Dawn')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /new habit/i }));
    expect(onCreateHabit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /edit morning run/i }));
    expect(onEditHabit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /archive morning run/i }));
    expect(onToggleArchive).toHaveBeenCalledTimes(1);

    // Switch to Archived filter
    fireEvent.click(screen.getByRole('button', { name: /^archived$/i }));
    expect(screen.getByText('Old Habit')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /restore old habit/i }));
    expect(onToggleArchive).toHaveBeenCalledTimes(2);
  });
});

describe('TasksView', () => {
  it('renders task statuses, searches, clears search, toggles, schedules, edits, and deletes', () => {
    const onChangeStatusFilter = vi.fn();
    const onChangeSortMode = vi.fn();
    const onCreateTask = vi.fn();
    const onEditTask = vi.fn();
    const onToggleTask = vi.fn().mockResolvedValue(undefined);
    const onScheduleTaskToday = vi.fn().mockResolvedValue(undefined);
    const onDeleteTask = vi.fn().mockResolvedValue(undefined);

    const snapshot: DomainSnapshot = {
      habits: [],
      checkins: [],
      notes: [],
      tasks: [
        makeTask({
          id: 1,
          title: 'Overdue report',
          dueDay: TODAY - 1,
          repeatable: true,
          reminderSlotIds: ['s1'],
        }),
        makeTask({ id: 2, title: 'Someday goal', dueDay: null, note: 'Backlog' }),
        makeTask({ id: 3, title: 'Done task', status: 'done', done: true, completedDay: TODAY }),
        makeTask({ id: 4, title: 'Missed task', status: 'not_done', dueDay: TODAY - 3 }),
        makeTask({ id: 5, title: 'Archived task', status: 'archived', dueDay: TODAY - 4 }),
      ],
      reminderSlots: [
        { id: 's1', label: 'Evening', time: '18:00', deletedAt: null, createdAt: 1, updatedAt: 1 },
      ],
    };

    render(() => (
      <TasksView
        snapshot={snapshot}
        todayDay={TODAY}
        statusFilter={[...OPEN_TASK_BUCKETS]}
        onChangeStatusFilter={onChangeStatusFilter}
        sortMode="default"
        onChangeSortMode={onChangeSortMode}
        onCreateTask={onCreateTask}
        onEditTask={onEditTask}
        onToggleTask={onToggleTask}
        onScheduleTaskToday={onScheduleTaskToday}
        onDeleteTask={onDeleteTask}
      />
    ));

    expect(screen.getByText('Overdue report')).toBeInTheDocument();
    expect(screen.getByText('18:00 Evening')).toBeInTheDocument();
    expect(screen.getByText('Someday goal')).toBeInTheDocument();
    expect(screen.queryByText('Done task')).not.toBeInTheDocument();

    // Search filtering + empty fallback + Clear Search
    const search = screen.getByRole('searchbox', { name: /search tasks or notes/i });
    fireEvent.input(search, { target: { value: 'zzzzz' } });
    expect(screen.getByText(/no tasks match your search/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear Search'));
    expect(screen.getByText('Overdue report')).toBeInTheDocument();

    // Actions on tasks
    fireEvent.click(screen.getByRole('button', { name: /mark overdue report as completed/i }));
    expect(onToggleTask).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^today$/i }));
    expect(onScheduleTaskToday).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /edit overdue report/i }));
    expect(onEditTask).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /delete overdue report/i }));
    expect(onDeleteTask).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: /new task/i }));
    expect(onCreateTask).toHaveBeenCalledTimes(1);
  });

  it('renders closed-status tasks and empty-selection recovery buttons', () => {
    const onChangeStatusFilter = vi.fn();
    render(() => (
      <TasksView
        snapshot={{ habits: [], checkins: [], notes: [], tasks: [] }}
        todayDay={TODAY}
        statusFilter={[]}
        onChangeStatusFilter={onChangeStatusFilter}
        sortMode="title"
        onChangeSortMode={() => {}}
        onCreateTask={() => {}}
        onEditTask={() => {}}
        onToggleTask={async () => {}}
        onScheduleTaskToday={async () => {}}
        onDeleteTask={async () => {}}
      />
    ));

    expect(screen.getByText(/no task statuses selected/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show open tasks/i }));
    expect(onChangeStatusFilter).toHaveBeenCalledWith([...OPEN_TASK_BUCKETS]);

    fireEvent.click(screen.getByRole('button', { name: /show all statuses/i }));
    expect(onChangeStatusFilter).toHaveBeenCalledWith('all');
  });
});

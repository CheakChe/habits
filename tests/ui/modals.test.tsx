import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { Habit, ReminderSlot, Task } from '../../src/types/domain';
import {
  AccountModal,
  DriveRevisionsModal,
  HabitModal,
  RemindersModal,
  SyncConfirmModal,
  TaskModal,
} from '../../src/ui/Modals';
import { CivilCalendar } from '../../src/utils/civil-calendar';
import { DEFAULT_REMINDER_PREFERENCES } from '../../src/utils/reminder-planner';

const TODAY = CivilCalendar.fromLocalDate(2026, 11, 25);

const BASE_HABIT: Habit = {
  id: 1,
  name: 'Meditation',
  color: '#3B82F6|icon:sparkles',
  weekdays: 0x7f,
  weeklyTarget: null,
  dailyTarget: null,
  unit: null,
  startDay: TODAY - 10,
  archivedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

const BASE_TASK: Task = {
  id: 10,
  title: 'Review budget',
  note: 'Check expenses',
  dueDay: TODAY,
  done: false,
  status: 'open',
  completedDay: null,
  repeatable: false,
  deletedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

const SLOTS: ReminderSlot[] = [
  { id: 'slot-1', label: 'Morning', time: '09:00', deletedAt: null, createdAt: 1, updatedAt: 1 },
];

describe('HabitModal', () => {
  it('validates input and submits new measured/flexible habit', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onCreateReminderSlot = vi.fn().mockResolvedValue({
      id: 'slot-2',
      label: 'Evening',
      time: '20:00',
      deletedAt: null,
      updatedAt: 2,
    });

    render(() => (
      <HabitModal
        open={true}
        editingHabit={null}
        reminderSlots={SLOTS}
        todayDay={TODAY}
        onClose={onClose}
        onCreateReminderSlot={onCreateReminderSlot}
        onSave={onSave}
      />
    ));

    // Empty name validation
    fireEvent.click(screen.getByRole('button', { name: /create habit/i }));
    expect(screen.getByText(/enter a habit name/i)).toBeInTheDocument();

    fireEvent.input(screen.getByLabelText(/^name$/i), { target: { value: 'Hydrate' } });
    fireEvent.click(screen.getByRole('button', { name: /^measured$/i }));
    fireEvent.input(screen.getByLabelText(/^target$/i), { target: { value: '2.5' } });
    fireEvent.input(screen.getByLabelText(/unit/i), { target: { value: 'L' } });

    fireEvent.click(screen.getByRole('button', { name: /create habit/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Hydrate',
        dailyTarget: 2.5,
        unit: 'L',
      })
    );
  });

  it('renders edit mode with scheduleApplyScope selector when schedule changes', () => {
    render(() => (
      <HabitModal
        open={true}
        editingHabit={BASE_HABIT}
        reminderSlots={SLOTS}
        todayDay={TODAY}
        onClose={() => {}}
        onCreateReminderSlot={async () => SLOTS[0]}
        onSave={async () => {}}
      />
    ));

    expect(screen.getByRole('heading', { name: /edit habit/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /times per week/i }));
    expect(screen.getByRole('radiogroup', { name: /apply change/i })).toBeInTheDocument();
  });
});

describe('TaskModal', () => {
  it('validates title and supports create, edit status, and next occurrence mode', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(() => (
      <TaskModal
        open={true}
        mode="edit"
        editingTask={BASE_TASK}
        prefill={null}
        todayDay={TODAY}
        onClose={onClose}
        onSave={onSave}
      />
    ));

    fireEvent.click(screen.getByRole('button', { name: /^not done$/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Review budget',
          status: 'not_done',
        })
      )
    );
  });

  it('shows next-occurrence banner and Skip button', () => {
    render(() => (
      <TaskModal
        open={true}
        mode="next"
        editingTask={null}
        prefill={{ title: 'Pay rent', note: '', dueDay: TODAY + 30, repeatable: true }}
        todayDay={TODAY}
        onClose={() => {}}
        onSave={async () => {}}
      />
    ));

    expect(screen.getByRole('heading', { name: /schedule next occurrence/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^skip$/i })).toBeInTheDocument();
  });
});

describe('SyncConfirmModal & AccountModal', () => {
  it('SyncConfirmModal displays summary counts, duplicate notice, and triggers confirm/cancel', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(() => (
      <SyncConfirmModal
        pending={{
          status: 'needs-upload-confirm',
          remoteFileId: 'f1',
          remoteVersion: '1',
          remoteModifiedTime: null,
          localChanged: true,
          mergedSnapshot: { habits: [], checkins: [], notes: [], tasks: [] },
          mergedBytes: new Uint8Array([1, 2]),
          duplicateFileIds: ['dup-1'],
          summary: {
            habitsCount: 3,
            checkinsCount: 12,
            notesCount: 2,
            tasksCount: 4,
            byteSize: 2048,
          },
        }}
        uploading={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    ));

    expect(screen.getByText(/update google drive snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/detected 1 duplicate snapshot file/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /update snapshot/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('AccountModal triggers Google reconnect, revisions, reminders, and switch to entry', async () => {
    const onClose = vi.fn();
    const onConnectGoogle = vi.fn().mockResolvedValue(undefined);
    const onSwitchToEntry = vi.fn().mockResolvedValue(undefined);
    const onOpenRevisions = vi.fn().mockResolvedValue(undefined);
    const onOpenReminders = vi.fn();

    render(() => (
      <AccountModal
        open={true}
        mode="google"
        hasGoogleToken={false}
        googleEmail="alex@example.com"
        onClose={onClose}
        onConnectGoogle={onConnectGoogle}
        onSwitchToEntry={onSwitchToEntry}
        onExportBackup={async () => ({ filename: 'habits.bin', bytes: new Uint8Array([1]) })}
        onImportBackup={async () => {}}
        onOpenRevisions={onOpenRevisions}
        onOpenReminders={onOpenReminders}
      />
    ));

    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reconnect \(alex@example\.com\)/i }));
    await waitFor(() => expect(onConnectGoogle).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /version history/i }));
    expect(onOpenRevisions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /reminders & app badge/i }));
    expect(onOpenReminders).toHaveBeenCalledTimes(1);
  });
});

describe('DriveRevisionsModal & RemindersModal', () => {
  it('DriveRevisionsModal inspects and restores revisions', () => {
    const onInspect = vi.fn().mockResolvedValue(undefined);
    const onRestore = vi.fn().mockResolvedValue(undefined);
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    render(() => (
      <DriveRevisionsModal
        open={true}
        loading={false}
        error={null}
        revisions={[
          { id: 'rev-2', modifiedTime: '2026-11-25T10:00:00Z', size: 2048 },
          { id: 'rev-1', modifiedTime: '2026-11-24T10:00:00Z', size: 1024, keepForever: true },
        ]}
        inspectingRevisionId={null}
        inspectedRevision={{
          fileId: 'f1',
          revisionId: 'rev-1',
          snapshot: { habits: [], checkins: [], notes: [], tasks: [] },
          bytes: new Uint8Array([1, 2]),
          summary: {
            habitsCount: 2,
            checkinsCount: 5,
            notesCount: 1,
            tasksCount: 3,
            byteSize: 1024,
          },
        }}
        restoring={false}
        onClose={() => {}}
        onRefresh={onRefresh}
        onInspect={onInspect}
        onRestore={onRestore}
      />
    ));

    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText(/revision #rev-1 contents/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /restore this version/i }));
    expect(onRestore).toHaveBeenCalledWith('rev-1');

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('RemindersModal manages badge, slots, calendar sync plan, and delete confirmation', () => {
    const onToggleBadge = vi.fn();
    const onCreateSlot = vi.fn().mockResolvedValue(SLOTS[0]);
    const onDeleteSlot = vi.fn().mockResolvedValue(undefined);
    const onToggleCalendar = vi.fn();
    const onChangeHorizon = vi.fn();
    const onConfirmCalendarSync = vi.fn().mockResolvedValue(undefined);
    const onConfirmDeleteCalendar = vi.fn().mockResolvedValue(undefined);

    render(() => (
      <RemindersModal
        open={true}
        mode="google"
        hasGoogleToken={true}
        googleEmail="alex@example.com"
        snapshot={{
          habits: [BASE_HABIT],
          checkins: [],
          notes: [],
          tasks: [],
          reminderSlots: SLOTS,
        }}
        todayDay={TODAY}
        reminderSlots={SLOTS}
        prefs={{ ...DEFAULT_REMINDER_PREFERENCES, calendarId: 'cal-1', calendarEnabled: true }}
        badgePermission="granted"
        pendingToday={{
          unfinishedHabitsCount: 1,
          openTasksCount: 0,
          totalPendingCount: 1,
          unfinishedHabits: [BASE_HABIT],
          dueTodayTasks: [],
          overdueTasks: [],
        }}
        trackerTimeZone="UTC"
        calendarSyncNeeded={true}
        busy={false}
        error={null}
        pendingPlan={{
          calendarId: 'cal-1',
          willCreateCalendar: false,
          willUpdateCalendarTz: false,
          duplicateCalendarIds: [],
          timeZone: 'UTC',
          todayDay: TODAY,
          todayCleared: false,
          targetSignature: 'sig',
          toCreate: [
            {
              dayIndex: TODAY,
              slotId: 'slot-1',
              slotLabel: 'Morning',
              slotTime: '09:00',
              dateStr: '2026-11-25',
              summary: 'Habits',
              description: 'Test',
              startDateTime: '2026-11-25T09:00:00',
              endDateTime: '2026-11-25T09:15:00',
              timeZone: 'UTC',
              signature: 's',
            },
          ],
          toUpdate: [],
          toDelete: [],
          unchangedCount: 0,
          desiredEvents: [],
        }}
        confirmDeleteOpen={true}
        onClose={() => {}}
        onToggleBadge={onToggleBadge}
        onRequestBadgePermission={async () => {}}
        onCreateSlot={onCreateSlot}
        onUpdateSlot={async () => {}}
        onDeleteSlot={onDeleteSlot}
        onToggleCalendar={onToggleCalendar}
        onChangeTaskSlot={() => {}}
        onChangeHorizon={onChangeHorizon}
        onPrepareCalendarSync={async () => {}}
        onConfirmCalendarSync={onConfirmCalendarSync}
        onCancelCalendarSync={() => {}}
        onRequestDeleteCalendar={() => {}}
        onConfirmDeleteCalendar={onConfirmDeleteCalendar}
        onCancelDeleteCalendar={() => {}}
      />
    ));

    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    expect(onToggleBadge).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: /3 days/i }));
    expect(onChangeHorizon).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole('button', { name: /delete morning slot/i }));
    expect(onDeleteSlot).toHaveBeenCalledWith('slot-1');

    fireEvent.click(screen.getByRole('button', { name: /confirm calendar update/i }));
    expect(onConfirmCalendarSync).toHaveBeenCalledTimes(1);

    const deleteBtns = screen.getAllByRole('button', { name: /^delete calendar$/i });
    expect(deleteBtns).toHaveLength(2);
    fireEvent.click(deleteBtns[1]);
    expect(onConfirmDeleteCalendar).toHaveBeenCalledTimes(1);
  });
});

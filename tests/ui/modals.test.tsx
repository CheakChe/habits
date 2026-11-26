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

  it('supports color swatches, hex input, Icon/Emoji tabs, inline slot creation, and validation errors', async () => {
    const createdSlot: ReminderSlot = {
      id: 'slot-new',
      label: 'Midday',
      time: '12:30',
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    };
    const onCreateReminderSlot = vi.fn().mockResolvedValue(createdSlot);
    const onSave = vi.fn().mockRejectedValue(new Error('Storage full'));
    const onClose = vi.fn();

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

    // Switch badge tabs: Icons -> Emoji -> Color Dot
    fireEvent.click(screen.getByRole('button', { name: /^icons$/i }));
    const iconButtons = screen.getAllByRole('button', { name: /^icon /i });
    fireEvent.click(iconButtons[1]);
    fireEvent.click(screen.getByRole('button', { name: /^emoji$/i }));
    const emojiButtons = screen.getAllByRole('button', { name: /^emoji /i });
    fireEvent.click(emojiButtons[1]);

    // Color swatch & hex input validation
    const hexInput = screen.getByLabelText(/hex color code/i);
    fireEvent.input(hexInput, { target: { value: '#10B981' } });
    fireEvent.blur(hexInput);
    fireEvent.input(hexInput, { target: { value: '#XYZ' } });
    fireEvent.input(screen.getByLabelText(/^name$/i), { target: { value: 'Stretch' } });
    fireEvent.click(screen.getByRole('button', { name: /create habit/i }));
    expect(screen.getByText(/enter a valid hex color/i)).toBeInTheDocument();
    fireEvent.blur(hexInput); // Restores valid hex

    // Inline reminder slot creation
    fireEvent.click(screen.getByRole('button', { name: /new slot/i }));
    fireEvent.input(screen.getByLabelText(/new slot label/i), { target: { value: 'Midday' } });
    fireEvent.click(screen.getByRole('button', { name: /add & select slot/i }));
    await waitFor(() => expect(onCreateReminderSlot).toHaveBeenCalledTimes(1));

    // Select an existing slot too
    fireEvent.click(screen.getByRole('button', { name: /09:00/i }));

    // Measured zero target validation
    fireEvent.click(screen.getByRole('button', { name: /^measured$/i }));
    fireEvent.input(screen.getByLabelText(/^target$/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /create habit/i }));
    expect(screen.getByText(/enter a positive daily target/i)).toBeInTheDocument();

    // Switch back to Check-off and verify onSave rejection displays error banner
    fireEvent.click(screen.getByRole('button', { name: /^check-off$/i }));
    fireEvent.click(screen.getByRole('button', { name: /create habit/i }));
    await waitFor(() => expect(screen.getByText('Storage full')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
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

  it('validates empty title in create mode, toggles repeatable & due shortcuts, and handles save errors', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('Task error'));
    const onClose = vi.fn();

    render(() => (
      <TaskModal
        open={true}
        mode="create"
        editingTask={null}
        prefill={null}
        todayDay={TODAY}
        onClose={onClose}
        onSave={onSave}
      />
    ));

    fireEvent.click(screen.getByRole('button', { name: /^create task$/i }));
    expect(screen.getByText(/enter a task title/i)).toBeInTheDocument();

    fireEvent.input(screen.getByLabelText(/^title$/i), { target: { value: 'Call dentist' } });
    fireEvent.input(screen.getByLabelText(/note/i), { target: { value: 'Afternoon' } });
    fireEvent.click(screen.getByRole('button', { name: /^tomorrow$/i }));
    fireEvent.click(screen.getByRole('button', { name: /no date/i }));
    fireEvent.click(screen.getByRole('button', { name: /^today$/i }));
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: /^create task$/i }));
    await waitFor(() => expect(screen.getByText('Task error')).toBeInTheDocument());
  });

  it('shows next-occurrence banner and Skip button', () => {
    const onClose = vi.fn();
    render(() => (
      <TaskModal
        open={true}
        mode="next"
        editingTask={null}
        prefill={{ title: 'Pay rent', note: '', dueDay: TODAY + 30, repeatable: true }}
        todayDay={TODAY}
        onClose={onClose}
        onSave={async () => {}}
      />
    ));

    expect(screen.getByRole('heading', { name: /schedule next occurrence/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports selecting reminder slots, inline slot creation, and prefill inheritance', async () => {
    const createdSlot: ReminderSlot = {
      id: 'slot-2',
      label: 'Evening',
      time: '20:00',
      deletedAt: null,
      createdAt: 2,
      updatedAt: 2,
    };
    const onCreateReminderSlot = vi.fn().mockResolvedValue(createdSlot);
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(() => (
      <TaskModal
        open={true}
        mode="next"
        editingTask={null}
        prefill={{
          title: 'Pay rent',
          note: 'Monthly',
          dueDay: TODAY + 30,
          repeatable: true,
          reminderSlotIds: ['slot-1'],
        }}
        reminderSlots={SLOTS}
        todayDay={TODAY}
        onClose={() => {}}
        onCreateReminderSlot={onCreateReminderSlot}
        onSave={onSave}
      />
    ));

    // Existing slot from prefill is already pressed
    const morningBtn = screen.getByRole('button', { name: /09:00/i });
    expect(morningBtn).toHaveAttribute('aria-pressed', 'true');

    // Create a new slot inline and auto-select it
    fireEvent.click(screen.getByRole('button', { name: /new slot/i }));
    fireEvent.input(screen.getByLabelText(/new slot label/i), { target: { value: 'Evening' } });
    fireEvent.click(screen.getByRole('button', { name: /add & select slot/i }));
    await waitFor(() => expect(onCreateReminderSlot).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /create next task/i }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Pay rent',
          reminderSlotIds: ['slot-1', 'slot-2'],
        })
      )
    );
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

  it('AccountModal triggers Google reconnect, revisions, reminders, export, import, and switch to entry', async () => {
    const onClose = vi.fn();
    const onConnectGoogle = vi.fn().mockResolvedValue(undefined);
    const onSwitchToEntry = vi.fn().mockResolvedValue(undefined);
    const onOpenRevisions = vi.fn().mockResolvedValue(undefined);
    const onOpenReminders = vi.fn();
    const onExportBackup = vi
      .fn()
      .mockResolvedValue({ filename: 'habits.bin', bytes: new Uint8Array([1, 2, 3]) });
    const onImportBackup = vi
      .fn()
      .mockRejectedValueOnce(new Error('Invalid snapshot'))
      .mockResolvedValueOnce(undefined);

    const createObjSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    try {
      const { container } = render(() => (
        <AccountModal
          open={true}
          mode="google"
          hasGoogleToken={false}
          googleEmail="alex@example.com"
          onClose={onClose}
          onConnectGoogle={onConnectGoogle}
          onSwitchToEntry={onSwitchToEntry}
          onExportBackup={onExportBackup}
          onImportBackup={onImportBackup}
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

      fireEvent.click(screen.getByRole('button', { name: /export \.bin/i }));
      await waitFor(() => expect(onExportBackup).toHaveBeenCalledTimes(1));
      expect(createObjSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjSpy).toHaveBeenCalledWith('blob:mock');

      const fileInput = container.parentElement?.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const badFile = new File([new Uint8Array([9])], 'bad.bin', {
        type: 'application/octet-stream',
      });
      Object.defineProperty(badFile, 'arrayBuffer', {
        value: async () => new Uint8Array([9]).buffer,
      });
      fireEvent.change(fileInput, { target: { files: [badFile] } });
      await waitFor(() => expect(screen.getByText('Invalid snapshot')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /switch account or mode/i }));
      await waitFor(() => expect(onSwitchToEntry).toHaveBeenCalledTimes(1));
    } finally {
      createObjSpy.mockRestore();
      revokeObjSpy.mockRestore();
    }
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

    // Reminder Slots starts collapsed when slots exist and shows summary preview
    const slotsToggle = screen.getByRole('button', { name: /reminder slots/i });
    expect(slotsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('09:00 Morning')).toBeInTheDocument();

    fireEvent.click(slotsToggle);
    expect(slotsToggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /delete morning slot/i }));
    expect(onDeleteSlot).toHaveBeenCalledWith('slot-1');

    fireEvent.click(screen.getByRole('button', { name: /confirm calendar update/i }));
    expect(onConfirmCalendarSync).toHaveBeenCalledTimes(1);

    const deleteBtns = screen.getAllByRole('button', { name: /^delete calendar$/i });
    expect(deleteBtns).toHaveLength(2);
    fireEvent.click(deleteBtns[1]);
    expect(onConfirmDeleteCalendar).toHaveBeenCalledTimes(1);
  });

  it('HabitModal enforces weeklyTarget <= allowedDays and submits Entire history applyScope', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const habitWithHistory: Habit = {
      ...BASE_HABIT,
      weekdays: 0x7f,
      weeklyTarget: null,
      scheduleHistory: [
        { fromDay: TODAY - 10, weekdays: 0x7f, weeklyTarget: null, dailyTarget: null },
        { fromDay: TODAY - 3, weekdays: 0b0011111, weeklyTarget: null, dailyTarget: null },
      ],
    };

    render(() => (
      <HabitModal
        open={true}
        editingHabit={habitWithHistory}
        reminderSlots={SLOTS}
        todayDay={TODAY}
        onClose={() => {}}
        onCreateReminderSlot={async () => {
          throw new Error('Slot limit reached');
        }}
        onSave={onSave}
      />
    ));

    // Switch to Times per week and pick 7x, then narrow allowed days to Sat-Sun (2 days) -> triggers validation error
    fireEvent.click(screen.getByRole('button', { name: /times per week/i }));
    fireEvent.click(screen.getByRole('button', { name: /7 times per week/i }));
    fireEvent.click(screen.getByRole('button', { name: /sat–sun/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByText(/weekly target cannot exceed/i)).toBeInTheDocument();

    // Fix target to 2x and choose Entire history applyScope
    fireEvent.click(screen.getByRole('button', { name: /2 times per week/i }));
    fireEvent.click(screen.getByRole('radio', { name: /entire history/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          weeklyTarget: 2,
          scheduleApplyScope: 'all',
        })
      )
    );
  });

  it('DriveRevisionsModal covers loading, error, empty state, and inspect click', () => {
    const onInspect = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(() => (
      <DriveRevisionsModal
        open={true}
        loading={true}
        error="Network error"
        revisions={[]}
        inspectingRevisionId={null}
        inspectedRevision={null}
        restoring={false}
        onClose={() => {}}
        onRefresh={async () => {}}
        onInspect={onInspect}
        onRestore={async () => {}}
      />
    ));
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByText(/loading snapshot revisions/i)).toBeInTheDocument();
    unmount();

    const { unmount: unmountEmpty } = render(() => (
      <DriveRevisionsModal
        open={true}
        loading={false}
        error={null}
        revisions={[]}
        inspectingRevisionId={null}
        inspectedRevision={null}
        restoring={false}
        onClose={() => {}}
        onRefresh={async () => {}}
        onInspect={onInspect}
        onRestore={async () => {}}
      />
    ));
    expect(screen.getByText(/no drive versions yet/i)).toBeInTheDocument();
    unmountEmpty();

    render(() => (
      <DriveRevisionsModal
        open={true}
        loading={false}
        error={null}
        revisions={[{ id: 'rev-5', modifiedTime: '2026-11-25T10:00:00Z', size: 500 }]}
        inspectingRevisionId={null}
        inspectedRevision={null}
        restoring={false}
        onClose={() => {}}
        onRefresh={async () => {}}
        onInspect={onInspect}
        onRestore={async () => {}}
      />
    ));
    fireEvent.click(screen.getByRole('button', { name: /^inspect$/i }));
    expect(onInspect).toHaveBeenCalledWith('rev-5');
  });

  it('RemindersModal covers slot label editing, delete error, and full calendar pending plan flags', async () => {
    const onUpdateSlot = vi.fn().mockResolvedValue(undefined);
    const onDeleteSlot = vi.fn().mockRejectedValue(new Error('Cannot remove slot'));
    const onCancelCalendarSync = vi.fn();

    render(() => (
      <RemindersModal
        open={true}
        mode="google"
        hasGoogleToken={false}
        googleEmail={null}
        snapshot={{
          habits: [BASE_HABIT],
          checkins: [],
          notes: [],
          tasks: [],
          reminderSlots: SLOTS,
        }}
        todayDay={TODAY}
        reminderSlots={SLOTS}
        prefs={DEFAULT_REMINDER_PREFERENCES}
        badgePermission="denied"
        pendingToday={{
          unfinishedHabitsCount: 0,
          openTasksCount: 0,
          totalPendingCount: 0,
          unfinishedHabits: [],
          dueTodayTasks: [],
          overdueTasks: [],
        }}
        trackerTimeZone="UTC"
        calendarSyncNeeded={false}
        busy={false}
        error={null}
        pendingPlan={{
          calendarId: 'cal-1',
          willCreateCalendar: true,
          willUpdateCalendarTz: true,
          duplicateCalendarIds: ['cal-dup'],
          timeZone: 'Europe/Berlin',
          todayDay: TODAY,
          todayCleared: true,
          targetSignature: 'sig2',
          toCreate: [],
          toUpdate: [
            {
              existingId: 'ev-1',
              desired: {
                dayIndex: TODAY,
                slotId: 'slot-1',
                slotLabel: 'Morning',
                slotTime: '09:00',
                dateStr: '2026-11-25',
                summary: 'Habits',
                description: 'D',
                startDateTime: '2026-11-25T09:00:00',
                endDateTime: '2026-11-25T09:15:00',
                timeZone: 'Europe/Berlin',
                signature: 's2',
              },
            },
          ],
          toDelete: [{ existingId: 'ev-2', summary: 'Old', dayIndex: TODAY - 1 }],
          unchangedCount: 0,
          desiredEvents: [],
        }}
        confirmDeleteOpen={false}
        onClose={() => {}}
        onToggleBadge={() => {}}
        onRequestBadgePermission={async () => {}}
        onCreateSlot={async () => SLOTS[0]}
        onUpdateSlot={onUpdateSlot}
        onDeleteSlot={onDeleteSlot}
        onToggleCalendar={() => {}}
        onChangeTaskSlot={() => {}}
        onChangeHorizon={() => {}}
        onPrepareCalendarSync={async () => {}}
        onConfirmCalendarSync={async () => {}}
        onCancelCalendarSync={onCancelCalendarSync}
        onRequestDeleteCalendar={() => {}}
        onConfirmDeleteCalendar={async () => {}}
        onCancelDeleteCalendar={() => {}}
      />
    ));

    expect(screen.getByText(/0 \(all clear\)/i)).toBeInTheDocument();
    expect(screen.getByText(/create secondary calendar/i)).toBeInTheDocument();
    expect(screen.getByText(/update calendar timezone to europe\/berlin/i)).toBeInTheDocument();
    expect(screen.getByText(/remove 1 duplicate/i)).toBeInTheDocument();
    expect(screen.getByText(/update 1 existing reminder event/i)).toBeInTheDocument();
    expect(screen.getByText(/clears today/i)).toBeInTheDocument();

    // Expand Reminder Slots and open inline editor for Morning slot
    fireEvent.click(screen.getByRole('button', { name: /reminder slots/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit morning slot/i }));

    // Update slot label via blur
    const labelInput = screen.getByLabelText(/label for 09:00 slot/i);
    fireEvent.input(labelInput, { target: { value: 'Sunrise' } });
    fireEvent.blur(labelInput);
    await waitFor(() => expect(onUpdateSlot).toHaveBeenCalledWith('slot-1', { label: 'Sunrise' }));

    // Delete slot failure displays slotError
    fireEvent.click(screen.getByRole('button', { name: /delete morning slot/i }));
    await waitFor(() => expect(screen.getByText('Cannot remove slot')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onCancelCalendarSync).toHaveBeenCalledTimes(1);
  });

  it('RemindersModal renders multi-slot Today reminders summary and habit/task usage badge', () => {
    const multiSlots: ReminderSlot[] = [
      {
        id: 'slot-1',
        label: 'Morning',
        time: '10:00',
        deletedAt: null,
        createdAt: 1,
        updatedAt: 1,
      },
      { id: 'slot-2', label: 'Noon', time: '13:00', deletedAt: null, createdAt: 2, updatedAt: 2 },
    ];
    render(() => (
      <RemindersModal
        open={true}
        mode="google"
        hasGoogleToken={false}
        googleEmail="alex@example.com"
        snapshot={{
          habits: [{ ...BASE_HABIT, reminderSlotIds: ['slot-1'] }],
          checkins: [],
          notes: [],
          tasks: [{ ...BASE_TASK, reminderSlotIds: ['slot-1', 'slot-2'] }],
          reminderSlots: multiSlots,
        }}
        todayDay={TODAY}
        reminderSlots={multiSlots}
        prefs={DEFAULT_REMINDER_PREFERENCES}
        badgePermission="granted"
        pendingToday={{
          unfinishedHabitsCount: 1,
          openTasksCount: 1,
          totalPendingCount: 2,
          unfinishedHabits: [{ ...BASE_HABIT, reminderSlotIds: ['slot-1'] }],
          dueTodayTasks: [{ ...BASE_TASK, reminderSlotIds: ['slot-1', 'slot-2'] }],
          overdueTasks: [],
        }}
        trackerTimeZone="Europe/Kyiv"
        calendarSyncNeeded={false}
        busy={false}
        error={null}
        pendingPlan={null}
        confirmDeleteOpen={false}
        onClose={() => {}}
        onToggleBadge={() => {}}
        onRequestBadgePermission={async () => {}}
        onCreateSlot={async () => multiSlots[0]}
        onUpdateSlot={async () => {}}
        onDeleteSlot={async () => {}}
        onToggleCalendar={() => {}}
        onChangeTaskSlot={() => {}}
        onChangeHorizon={() => {}}
        onPrepareCalendarSync={async () => {}}
        onConfirmCalendarSync={async () => {}}
        onCancelCalendarSync={() => {}}
        onRequestDeleteCalendar={() => {}}
        onConfirmDeleteCalendar={async () => {}}
        onCancelDeleteCalendar={() => {}}
      />
    ));

    expect(screen.getByText("Today's reminders")).toBeInTheDocument();
    expect(screen.getAllByText('2 slots').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('10:00 · 13:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reminder slots/i }));
    expect(screen.getByText('1h · 1t')).toBeInTheDocument();
    expect(screen.getByText('1 task')).toBeInTheDocument();
  });
});

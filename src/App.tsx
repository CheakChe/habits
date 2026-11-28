import { For, JSX, Match, Show, Switch, onCleanup, onMount } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { EntryView } from './ui/EntryView';
import { HabitsView } from './ui/HabitsView';
import { HistoryView } from './ui/HistoryView';
import {
  CloseIcon,
  CloudSyncIcon,
  DriveIcon,
  HabitsTabIcon,
  HistoryTabIcon,
  TasksTabIcon,
  TodayTabIcon,
} from './ui/Icons';
import { AccountModal } from './ui/modals/AccountModal';
import { DriveRevisionsModal } from './ui/modals/DriveRevisionsModal';
import { HabitModal } from './ui/modals/HabitModal';
import { RemindersModal } from './ui/modals/RemindersModal';
import { SyncConfirmModal } from './ui/modals/SyncConfirmModal';
import { TaskModal } from './ui/modals/TaskModal';
import { TasksView } from './ui/TasksView';
import { TodayView } from './ui/TodayView';
import { OfflineBanner, PWAInstallButton } from './ui/PwaControls';
import { TrackerStore } from './ui/tracker-store';

const NAV_ITEMS = [
  { id: 'today', label: 'Today', icon: TodayTabIcon },
  { id: 'habits', label: 'Habits', icon: HabitsTabIcon },
  { id: 'tasks', label: 'Tasks', icon: TasksTabIcon },
  { id: 'history', label: 'Progress', icon: HistoryTabIcon },
] as const;

export default function App(): JSX.Element {
  const store = new TrackerStore();

  onMount(() => {
    store.init();
  });

  onCleanup(() => {
    store.dispose();
  });

  return (
    <Show
      when={store.auth.mode() !== null}
      fallback={
        <EntryView
          onSelectGuest={() => store.auth.selectGuest()}
          onSelectGoogle={() => store.auth.selectGoogle()}
          isSigningIn={store.auth.isSigningIn()}
          error={store.auth.authError()}
        />
      }
    >
      <div class="min-h-screen overflow-x-clip bg-canvas pb-24 text-ink md:pb-12">
        {/* Top Bar Contract: 3 zones separated by gap-8 */}
        <header class="sticky top-0 z-30 h-14 border-b border-white/[0.08] bg-canvas/85 backdrop-blur-md">
          <div class="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 sm:gap-8 sm:px-6">
            {/* Zone 1: Brand Wordmark */}
            <button
              type="button"
              onClick={() => store.filters.setActiveTab('today')}
              class="shrink-0 cursor-pointer font-display text-lg font-semibold tracking-tight whitespace-nowrap text-ink"
            >
              Habits
            </button>

            {/* Zone 2: 4 single-line nav links */}
            <nav
              aria-label="Primary navigation"
              class="hidden items-center gap-6 text-sm font-medium md:flex"
            >
              <For each={NAV_ITEMS}>
                {(item) => (
                  <button
                    type="button"
                    onClick={() => store.filters.setActiveTab(item.id)}
                    class={`shrink-0 cursor-pointer border-b-2 py-1.5 whitespace-nowrap transition-colors ${
                      store.filters.activeTab() === item.id
                        ? 'border-accent text-ink'
                        : 'border-transparent text-ink-subtle hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </button>
                )}
              </For>
            </nav>

            {/* Zone 3: Primary action (+ optional install trigger when available) */}
            <div class="flex shrink-0 items-center gap-2">
              <PWAInstallButton variant="compact" />
              <Show
                when={store.auth.mode() === 'google'}
                fallback={
                  <button
                    type="button"
                    onClick={() => store.auth.setAccountModalOpen(true)}
                    class="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-surface px-3.5 text-xs font-medium whitespace-nowrap text-ink transition-colors hover:bg-surface-elevated"
                  >
                    <DriveIcon class="h-3.5 w-3.5 text-ink-subtle" />
                    <span>Guest Mode</span>
                  </button>
                }
              >
                <button
                  type="button"
                  onClick={() => void store.drive.startDriveSync()}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    store.auth.setAccountModalOpen(true);
                  }}
                  disabled={store.drive.syncBusy()}
                  class="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-accent px-3.5 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  <CloudSyncIcon class="h-3.5 w-3.5" />
                  <span>
                    {store.drive.syncBusy()
                      ? 'Syncing...'
                      : store.auth.hasGoogleToken()
                        ? 'Sync Drive'
                        : 'Reconnect Drive'}
                  </span>
                </button>
              </Show>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main class="mx-auto max-w-6xl space-y-6 px-4 pt-6 sm:px-6 sm:pt-8">
          <OfflineBanner />

          <Show when={store.auth.mode() === 'google'}>
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs text-ink-subtle">
              <span class="break-anywhere min-w-0">
                {store.auth.googleEmail()
                  ? `Google Mode (${store.auth.googleEmail()}) · Private Drive snapshots`
                  : 'Google Sync Mode · Snapshot stored in private app folder'}
              </span>
              <div class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
                <button
                  type="button"
                  onClick={() => store.calendar.openRemindersModal()}
                  class={`shrink-0 cursor-pointer whitespace-nowrap ${
                    store.calendar.isCalendarSyncNeeded()
                      ? 'text-warning hover:underline'
                      : 'text-ink-subtle hover:text-ink'
                  }`}
                >
                  {store.calendar.isCalendarSyncNeeded() ? 'Reminders · Sync' : 'Reminders'}
                </button>
                <button
                  type="button"
                  onClick={() => void store.drive.openDriveRevisions()}
                  class="shrink-0 cursor-pointer whitespace-nowrap text-ink-subtle hover:text-ink"
                >
                  Version History
                </button>
                <button
                  type="button"
                  onClick={() => store.auth.setAccountModalOpen(true)}
                  class="shrink-0 cursor-pointer whitespace-nowrap text-accent-soft hover:underline"
                >
                  Account &amp; Mode
                </button>
              </div>
            </div>
          </Show>

          <Show when={store.drive.syncBanner()}>
            {(banner) => (
              <div
                role="status"
                class={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs ${
                  banner().kind === 'error'
                    ? 'border-danger/25 bg-danger/10 text-danger-soft'
                    : 'border-accent/30 bg-accent/10 text-accent-tint'
                }`}
              >
                <span class="break-anywhere min-w-0 flex-1">{banner().text}</span>
                <button
                  type="button"
                  onClick={() => store.drive.setSyncBanner(null)}
                  aria-label="Dismiss message"
                  class="shrink-0 cursor-pointer rounded-lg p-1 hover:bg-white/[0.08]"
                >
                  <CloseIcon class="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </Show>

          <Show
            when={store.domain.dbReady()}
            fallback={
              <div class="rounded-2xl border border-white/[0.08] bg-surface p-12 text-center text-sm text-ink-subtle">
                Opening local IndexedDB store...
              </div>
            }
          >
            <Switch>
              <Match when={store.filters.activeTab() === 'today'}>
                <TodayView
                  snapshot={store.domain.snapshot()}
                  todayDay={store.filters.todayDay()}
                  goalsExpanded={store.filters.todayGoalsExpanded()}
                  todayData={store.views.todayData()}
                  onToggleGoalsExpanded={() => store.filters.toggleTodayGoalsExpanded()}
                  onToggleCheckin={(hId, d, next) => store.domain.toggleCheckin(hId, d, next)}
                  onSetCheckinValue={(hId, d, val) => store.domain.setCheckinValue(hId, d, val)}
                  onIncrementCheckinValue={(hId, d, delta) =>
                    store.domain.incrementCheckinValue(hId, d, delta)
                  }
                  onSaveNote={(hId, d, txt) => store.domain.saveNote(hId, d, txt)}
                  onToggleTask={(t) => store.domain.toggleTaskDone(t)}
                  onQuickAddTask={(title, due) => store.domain.quickAddTask(title, due)}
                  onScheduleTaskToday={(t) =>
                    store.domain.scheduleTaskForDay(t, store.filters.todayDay())
                  }
                  onOpenNewHabit={() => store.domain.openCreateHabit()}
                  onOpenEditTask={(t) => store.domain.openEditTask(t)}
                />
              </Match>
              <Match when={store.filters.activeTab() === 'habits'}>
                <HabitsView
                  snapshot={store.domain.snapshot()}
                  todayDay={store.filters.todayDay()}
                  habitsData={store.views.habitsData()}
                  onCreateHabit={() => store.domain.openCreateHabit()}
                  onEditHabit={(h) => store.domain.openEditHabit(h)}
                  onToggleArchive={(h) => store.domain.toggleArchiveHabit(h)}
                />
              </Match>
              <Match when={store.filters.activeTab() === 'tasks'}>
                <TasksView
                  snapshot={store.domain.snapshot()}
                  todayDay={store.filters.todayDay()}
                  statusFilter={store.filters.tasksStatusFilter()}
                  tasksData={store.views.tasksData()}
                  onChangeStatusFilter={(f) => store.filters.setTasksStatusFilter(f)}
                  sortMode={store.filters.tasksSortMode()}
                  onChangeSortMode={(s) => store.filters.setTasksSortMode(s)}
                  onCreateTask={(opts) => store.domain.openCreateTask(opts)}
                  onEditTask={(t) => store.domain.openEditTask(t)}
                  onToggleTask={(t) => store.domain.toggleTaskDone(t)}
                  onScheduleTaskToday={(t) =>
                    store.domain.scheduleTaskForDay(t, store.filters.todayDay())
                  }
                  onDeleteTask={(id) => store.domain.deleteTask(id)}
                />
              </Match>
              <Match when={store.filters.activeTab() === 'history'}>
                <HistoryView
                  snapshot={store.domain.snapshot()}
                  todayDay={store.filters.todayDay()}
                  timeZone={store.filters.timeZone()}
                  subTab={store.filters.historySubTab()}
                  onSelectSubTab={(tab) => store.filters.setHistorySubTab(tab)}
                  habitFilter={store.filters.historyHabitFilter()}
                  onChangeHabitFilter={(f) => store.filters.setHistoryHabitFilter(f)}
                  rangePreset={store.filters.historyRangePreset()}
                  customStartDay={store.filters.historyCustomStartDay()}
                  customEndDay={store.filters.historyCustomEndDay()}
                  onSelectRangePreset={(p) => store.filters.setHistoryRangePreset(p)}
                  onSelectCustomRange={(s, e) => store.filters.setHistoryCustomRange(s, e)}
                  onChangeTimeZone={(tz) => store.filters.setTimeZone(tz)}
                  advancedHeatmapMode={store.filters.advancedHeatmapMode()}
                  onChangeAdvancedHeatmapMode={(m) => store.filters.setAdvancedHeatmapMode(m)}
                  advancedNotesFilter={store.filters.advancedNotesFilter()}
                  onChangeAdvancedNotesFilter={(f) => store.filters.setAdvancedNotesFilter(f)}
                  analyticsSummary={store.views.historySummary()}
                  chartsReport={store.views.chartsReport()}
                  advancedReport={store.views.advancedReport()}
                  onToggleCheckin={(hId, d, next) => store.domain.toggleCheckin(hId, d, next)}
                  onSetCheckinValue={(hId, d, val) => store.domain.setCheckinValue(hId, d, val)}
                  onIncrementCheckinValue={(hId, d, delta) =>
                    store.domain.incrementCheckinValue(hId, d, delta)
                  }
                  onSaveNote={(hId, d, txt) => store.domain.saveNote(hId, d, txt)}
                />
              </Match>
            </Switch>
          </Show>
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav
          aria-label="Mobile navigation"
          class="fixed right-0 bottom-0 left-0 z-40 grid h-16 grid-cols-4 items-center border-t border-white/[0.08] bg-canvas/92 backdrop-blur-md md:hidden"
        >
          <For each={NAV_ITEMS}>
            {(item) => (
              <button
                type="button"
                onClick={() => store.filters.setActiveTab(item.id)}
                class={`flex h-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  store.filters.activeTab() === item.id ? 'text-accent-soft' : 'text-ink-subtle'
                }`}
              >
                <Dynamic component={item.icon} class="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            )}
          </For>
        </nav>

        {/* Modals */}
        <HabitModal
          open={store.domain.habitModalOpen()}
          editingHabit={store.domain.editingHabit()}
          reminderSlots={store.reminders.activeReminderSlots()}
          todayDay={store.filters.todayDay()}
          onClose={() => store.domain.closeHabitModal()}
          onCreateReminderSlot={(input) => store.reminders.createReminderSlot(input)}
          onSave={(data) => store.domain.saveHabit(data)}
        />
        <TaskModal
          open={store.domain.taskModalOpen()}
          mode={store.domain.taskModalMode()}
          editingTask={store.domain.editingTask()}
          prefill={store.domain.taskDraftPrefill()}
          reminderSlots={store.reminders.activeReminderSlots()}
          todayDay={store.filters.todayDay()}
          onClose={() => store.domain.closeTaskModal()}
          onCreateReminderSlot={(input) => store.reminders.createReminderSlot(input)}
          onSave={(data) => store.domain.saveTask(data)}
        />
        <SyncConfirmModal
          pending={store.drive.pendingSync()}
          uploading={store.drive.syncBusy()}
          onCancel={() => store.drive.cancelPendingSync()}
          onConfirm={() => store.drive.confirmUploadSync()}
        />
        <AccountModal
          open={store.auth.accountModalOpen()}
          mode={store.auth.mode()!}
          hasGoogleToken={store.auth.hasGoogleToken()}
          googleEmail={store.auth.googleEmail()}
          onClose={() => store.auth.setAccountModalOpen(false)}
          onConnectGoogle={() => store.auth.reconnectGoogle()}
          onSwitchToEntry={() => store.auth.switchToEntry()}
          onExportBackup={() => store.domain.exportBackup()}
          onImportBackup={(bytes) => store.domain.importBackup(bytes)}
          onOpenRevisions={() => store.drive.openDriveRevisions()}
          onOpenReminders={() => store.calendar.openRemindersModal()}
        />
        <RemindersModal
          open={store.calendar.remindersModalOpen()}
          mode={store.auth.mode()!}
          hasGoogleToken={store.auth.hasGoogleToken()}
          googleEmail={store.auth.googleEmail()}
          snapshot={store.domain.snapshot()}
          todayDay={store.filters.todayDay()}
          reminderSlots={store.reminders.activeReminderSlots()}
          prefs={store.reminders.reminderPrefs()}
          badgePermission={store.reminders.badgePermission()}
          pendingToday={store.reminders.getTodayPendingSummary()}
          trackerTimeZone={store.filters.timeZone()}
          calendarSyncNeeded={store.calendar.isCalendarSyncNeeded()}
          busy={store.calendar.calendarBusy()}
          error={store.calendar.calendarError()}
          pendingPlan={store.calendar.pendingCalendarPlan()}
          confirmDeleteOpen={store.calendar.confirmDeleteCalendarOpen()}
          onClose={() => store.calendar.closeRemindersModal()}
          onToggleBadge={(enabled) => store.reminders.setBadgeEnabled(enabled)}
          onRequestBadgePermission={() => store.reminders.requestBadgePermissionAndRefresh()}
          onCreateSlot={(input) => store.reminders.createReminderSlot(input)}
          onUpdateSlot={(id, patch) => store.reminders.updateReminderSlot(id, patch)}
          onDeleteSlot={(id) => store.reminders.deleteReminderSlot(id)}
          onToggleCalendar={(enabled) => store.reminders.setCalendarEnabled(enabled)}
          onChangeTaskSlot={(slotId) => store.reminders.setTaskReminderSlotId(slotId)}
          onChangeHorizon={(d) => store.reminders.setReminderHorizonDays(d)}
          onPrepareCalendarSync={() => store.calendar.prepareCalendarSync()}
          onConfirmCalendarSync={() => store.calendar.confirmCalendarSync()}
          onCancelCalendarSync={() => store.calendar.cancelCalendarSync()}
          onRequestDeleteCalendar={() => store.calendar.requestDeleteCalendar()}
          onConfirmDeleteCalendar={() => store.calendar.confirmDeleteCalendar()}
          onCancelDeleteCalendar={() => store.calendar.cancelDeleteCalendar()}
        />
        <DriveRevisionsModal
          open={store.drive.revisionsModalOpen()}
          loading={store.drive.revisionsLoading()}
          error={store.drive.revisionsError()}
          revisions={store.drive.revisions()}
          inspectingRevisionId={store.drive.inspectingRevisionId()}
          inspectedRevision={store.drive.inspectedRevision()}
          restoring={store.drive.restoringRevision()}
          onClose={() => store.drive.closeDriveRevisions()}
          onRefresh={() => store.drive.openDriveRevisions()}
          onInspect={(revId) => store.drive.inspectDriveRevision(revId)}
          onRestore={(revId) => store.drive.restoreDriveRevision(revId)}
        />
      </div>
    </Show>
  );
}

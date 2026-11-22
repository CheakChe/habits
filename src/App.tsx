import { JSX, Match, Show, Switch, onCleanup, onMount } from 'solid-js';
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
import {
  AccountModal,
  DriveRevisionsModal,
  HabitModal,
  RemindersModal,
  SyncConfirmModal,
  TaskModal,
} from './ui/Modals';
import { TasksView } from './ui/TasksView';
import { TodayView } from './ui/TodayView';
import { OfflineBanner, PWAInstallButton } from './ui/PwaControls';
import { TrackerStore } from './ui/tracker-store';

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
      when={store.mode() !== null}
      fallback={
        <EntryView
          onSelectGuest={() => store.selectGuest()}
          onSelectGoogle={() => store.selectGoogle()}
          isSigningIn={store.isSigningIn()}
          error={store.authError()}
        />
      }
    >
      <div class="min-h-screen bg-[#0A0B0E] text-[#F5F7FA] pb-24 md:pb-12">
        {/* Top Bar Contract: 3 zones separated by gap-8 */}
        <header class="sticky top-0 z-30 h-14 bg-[#0A0B0E]/85 backdrop-blur-md border-b border-white/[0.08]">
          <div class="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8">
            {/* Zone 1: Brand Wordmark */}
            <button
              type="button"
              onClick={() => store.setActiveTab('today')}
              class="font-display text-lg font-semibold tracking-tight text-[#F5F7FA] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Habits
            </button>

            {/* Zone 2: 4 single-line nav links */}
            <nav
              aria-label="Primary navigation"
              class="hidden md:flex items-center gap-6 text-sm font-medium"
            >
              <button
                type="button"
                onClick={() => store.setActiveTab('today')}
                class={`py-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                  store.activeTab() === 'today'
                    ? 'text-[#F5F7FA] border-[#3B82F6]'
                    : 'text-[#8E95A5] border-transparent hover:text-[#F5F7FA]'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => store.setActiveTab('habits')}
                class={`py-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                  store.activeTab() === 'habits'
                    ? 'text-[#F5F7FA] border-[#3B82F6]'
                    : 'text-[#8E95A5] border-transparent hover:text-[#F5F7FA]'
                }`}
              >
                Habits
              </button>
              <button
                type="button"
                onClick={() => store.setActiveTab('tasks')}
                class={`py-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                  store.activeTab() === 'tasks'
                    ? 'text-[#F5F7FA] border-[#3B82F6]'
                    : 'text-[#8E95A5] border-transparent hover:text-[#F5F7FA]'
                }`}
              >
                Tasks
              </button>
              <button
                type="button"
                onClick={() => store.setActiveTab('history')}
                class={`py-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                  store.activeTab() === 'history'
                    ? 'text-[#F5F7FA] border-[#3B82F6]'
                    : 'text-[#8E95A5] border-transparent hover:text-[#F5F7FA]'
                }`}
              >
                History
              </button>
            </nav>

            {/* Zone 3: Primary action (+ optional install trigger when available) */}
            <div class="flex items-center gap-2 shrink-0">
              <PWAInstallButton variant="compact" />
              <Show
                when={store.mode() === 'google'}
                fallback={
                  <button
                    type="button"
                    onClick={() => store.setAccountModalOpen(true)}
                    class="h-9 px-3.5 rounded-xl bg-[#14161B] hover:bg-[#1C1F26] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <DriveIcon class="w-3.5 h-3.5 text-[#8E95A5]" />
                    <span>Guest Mode</span>
                  </button>
                }
              >
                <button
                  type="button"
                  onClick={() => void store.startDriveSync()}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    store.setAccountModalOpen(true);
                  }}
                  disabled={store.syncBusy()}
                  class="h-9 px-3.5 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-medium text-white inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <CloudSyncIcon class="w-3.5 h-3.5" />
                  <span>
                    {store.syncBusy()
                      ? 'Syncing...'
                      : store.hasGoogleToken()
                        ? 'Sync Drive'
                        : 'Reconnect Drive'}
                  </span>
                </button>
              </Show>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main class="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6">
          <OfflineBanner />

          <Show when={store.mode() === 'google'}>
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs text-[#8E95A5]">
              <span class="min-w-0 break-anywhere">
                {store.googleEmail()
                  ? `Google Mode (${store.googleEmail()}) · Private Drive snapshots`
                  : 'Google Sync Mode · Snapshot stored in private app folder'}
              </span>
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0">
                <button
                  type="button"
                  onClick={() => store.openRemindersModal()}
                  class={`whitespace-nowrap shrink-0 cursor-pointer ${
                    store.isCalendarSyncNeeded()
                      ? 'text-[#F59E0B] hover:underline'
                      : 'text-[#8E95A5] hover:text-[#F5F7FA]'
                  }`}
                >
                  {store.isCalendarSyncNeeded() ? 'Reminders · Sync' : 'Reminders'}
                </button>
                <button
                  type="button"
                  onClick={() => void store.openDriveRevisions()}
                  class="text-[#8E95A5] hover:text-[#F5F7FA] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Version History
                </button>
                <button
                  type="button"
                  onClick={() => store.setAccountModalOpen(true)}
                  class="text-[#60A5FA] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Account &amp; Mode
                </button>
              </div>
            </div>
          </Show>

          <Show when={store.syncBanner()}>
            {(banner) => (
              <div
                role="status"
                class={`rounded-2xl px-4 py-3 flex items-start sm:items-center justify-between gap-3 text-xs border ${
                  banner().kind === 'error'
                    ? 'bg-[#EF4444]/10 border-[#EF4444]/25 text-[#FCA5A5]'
                    : 'bg-[#3B82F6]/10 border-[#3B82F6]/30 text-[#93C5FD]'
                }`}
              >
                <span class="min-w-0 flex-1 break-anywhere">{banner().text}</span>
                <button
                  type="button"
                  onClick={() => store.setSyncBanner(null)}
                  aria-label="Dismiss message"
                  class="p-1 rounded-lg hover:bg-white/[0.08] cursor-pointer shrink-0"
                >
                  <CloseIcon class="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </Show>

          <Show
            when={store.dbReady()}
            fallback={
              <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-12 text-center text-sm text-[#8E95A5]">
                Opening local IndexedDB store...
              </div>
            }
          >
            <Switch>
              <Match when={store.activeTab() === 'today'}>
                <TodayView
                  snapshot={store.snapshot()}
                  todayDay={store.todayDay()}
                  goalsExpanded={store.todayGoalsExpanded()}
                  onToggleGoalsExpanded={() => store.toggleTodayGoalsExpanded()}
                  onToggleCheckin={(hId, d, next) => store.toggleCheckin(hId, d, next)}
                  onSaveNote={(hId, d, txt) => store.saveNote(hId, d, txt)}
                  onToggleTask={(t) => store.toggleTaskDone(t)}
                  onQuickAddTask={(title, due) => store.quickAddTask(title, due)}
                  onScheduleTaskToday={(t) => store.scheduleTaskForDay(t, store.todayDay())}
                  onOpenNewHabit={() => store.openCreateHabit()}
                  onOpenEditTask={(t) => store.openEditTask(t)}
                />
              </Match>
              <Match when={store.activeTab() === 'habits'}>
                <HabitsView
                  snapshot={store.snapshot()}
                  todayDay={store.todayDay()}
                  onCreateHabit={() => store.openCreateHabit()}
                  onEditHabit={(h) => store.openEditHabit(h)}
                  onToggleArchive={(h) => store.toggleArchiveHabit(h)}
                />
              </Match>
              <Match when={store.activeTab() === 'tasks'}>
                <TasksView
                  snapshot={store.snapshot()}
                  todayDay={store.todayDay()}
                  statusFilter={store.tasksStatusFilter()}
                  onChangeStatusFilter={(f) => store.setTasksStatusFilter(f)}
                  sortMode={store.tasksSortMode()}
                  onChangeSortMode={(s) => store.setTasksSortMode(s)}
                  onCreateTask={(opts) => store.openCreateTask(opts)}
                  onEditTask={(t) => store.openEditTask(t)}
                  onToggleTask={(t) => store.toggleTaskDone(t)}
                  onScheduleTaskToday={(t) => store.scheduleTaskForDay(t, store.todayDay())}
                  onDeleteTask={(id) => store.deleteTask(id)}
                />
              </Match>
              <Match when={store.activeTab() === 'history'}>
                <HistoryView
                  snapshot={store.snapshot()}
                  todayDay={store.todayDay()}
                  timeZone={store.timeZone()}
                  subTab={store.historySubTab()}
                  onSelectSubTab={(tab) => store.setHistorySubTab(tab)}
                  habitFilter={store.historyHabitFilter()}
                  onChangeHabitFilter={(f) => store.setHistoryHabitFilter(f)}
                  rangePreset={store.historyRangePreset()}
                  customStartDay={store.historyCustomStartDay()}
                  customEndDay={store.historyCustomEndDay()}
                  onSelectRangePreset={(p) => store.setHistoryRangePreset(p)}
                  onSelectCustomRange={(s, e) => store.setHistoryCustomRange(s, e)}
                  onChangeTimeZone={(tz) => store.setTimeZone(tz)}
                  onToggleCheckin={(hId, d, next) => store.toggleCheckin(hId, d, next)}
                  onSaveNote={(hId, d, txt) => store.saveNote(hId, d, txt)}
                />
              </Match>
            </Switch>
          </Show>
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav
          aria-label="Mobile navigation"
          class="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0A0B0E]/92 backdrop-blur-md border-t border-white/[0.08] grid grid-cols-4 items-center"
        >
          <button
            type="button"
            onClick={() => store.setActiveTab('today')}
            class={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
              store.activeTab() === 'today' ? 'text-[#60A5FA]' : 'text-[#8E95A5]'
            }`}
          >
            <TodayTabIcon class="w-5 h-5" />
            <span>Today</span>
          </button>
          <button
            type="button"
            onClick={() => store.setActiveTab('habits')}
            class={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
              store.activeTab() === 'habits' ? 'text-[#60A5FA]' : 'text-[#8E95A5]'
            }`}
          >
            <HabitsTabIcon class="w-5 h-5" />
            <span>Habits</span>
          </button>
          <button
            type="button"
            onClick={() => store.setActiveTab('tasks')}
            class={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
              store.activeTab() === 'tasks' ? 'text-[#60A5FA]' : 'text-[#8E95A5]'
            }`}
          >
            <TasksTabIcon class="w-5 h-5" />
            <span>Tasks</span>
          </button>
          <button
            type="button"
            onClick={() => store.setActiveTab('history')}
            class={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
              store.activeTab() === 'history' ? 'text-[#60A5FA]' : 'text-[#8E95A5]'
            }`}
          >
            <HistoryTabIcon class="w-5 h-5" />
            <span>History</span>
          </button>
        </nav>

        {/* Modals */}
        <HabitModal
          open={store.habitModalOpen()}
          editingHabit={store.editingHabit()}
          todayDay={store.todayDay()}
          onClose={() => store.closeHabitModal()}
          onSave={(data) => store.saveHabit(data)}
        />
        <TaskModal
          open={store.taskModalOpen()}
          mode={store.taskModalMode()}
          editingTask={store.editingTask()}
          prefill={store.taskDraftPrefill()}
          todayDay={store.todayDay()}
          onClose={() => store.closeTaskModal()}
          onSave={(data) => store.saveTask(data)}
        />
        <SyncConfirmModal
          pending={store.pendingSync()}
          uploading={store.syncBusy()}
          onCancel={() => store.cancelPendingSync()}
          onConfirm={() => store.confirmUploadSync()}
        />
        <AccountModal
          open={store.accountModalOpen()}
          mode={store.mode()!}
          hasGoogleToken={store.hasGoogleToken()}
          googleEmail={store.googleEmail()}
          onClose={() => store.setAccountModalOpen(false)}
          onConnectGoogle={() => store.reconnectGoogle()}
          onSwitchToEntry={() => store.switchToEntry()}
          onExportBackup={() => store.exportBackup()}
          onImportBackup={(bytes) => store.importBackup(bytes)}
          onOpenRevisions={() => store.openDriveRevisions()}
          onOpenReminders={() => store.openRemindersModal()}
        />
        <RemindersModal
          open={store.remindersModalOpen()}
          mode={store.mode()!}
          hasGoogleToken={store.hasGoogleToken()}
          googleEmail={store.googleEmail()}
          prefs={store.reminderPrefs()}
          pendingToday={store.getTodayPendingSummary()}
          trackerTimeZone={store.timeZone()}
          calendarSyncNeeded={store.isCalendarSyncNeeded()}
          busy={store.calendarBusy()}
          error={store.calendarError()}
          pendingPlan={store.pendingCalendarPlan()}
          confirmDeleteOpen={store.confirmDeleteCalendarOpen()}
          onClose={() => store.closeRemindersModal()}
          onToggleBadge={(enabled) => store.setBadgeEnabled(enabled)}
          onToggleCalendar={(enabled) => store.setCalendarEnabled(enabled)}
          onChangeTime={(t) => store.setReminderTime(t)}
          onChangeHorizon={(d) => store.setReminderHorizonDays(d)}
          onPrepareCalendarSync={() => store.prepareCalendarSync()}
          onConfirmCalendarSync={() => store.confirmCalendarSync()}
          onCancelCalendarSync={() => store.cancelCalendarSync()}
          onRequestDeleteCalendar={() => store.requestDeleteCalendar()}
          onConfirmDeleteCalendar={() => store.confirmDeleteCalendar()}
          onCancelDeleteCalendar={() => store.cancelDeleteCalendar()}
        />
        <DriveRevisionsModal
          open={store.revisionsModalOpen()}
          loading={store.revisionsLoading()}
          error={store.revisionsError()}
          revisions={store.revisions()}
          inspectingRevisionId={store.inspectingRevisionId()}
          inspectedRevision={store.inspectedRevision()}
          restoring={store.restoringRevision()}
          onClose={() => store.closeDriveRevisions()}
          onRefresh={() => store.openDriveRevisions()}
          onInspect={(revId) => store.inspectDriveRevision(revId)}
          onRestore={(revId) => store.restoreDriveRevision(revId)}
        />
      </div>
    </Show>
  );
}

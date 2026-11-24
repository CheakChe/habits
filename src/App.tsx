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
      <div class="min-h-screen overflow-x-clip bg-[#0A0B0E] pb-24 text-[#F5F7FA] md:pb-12">
        {/* Top Bar Contract: 3 zones separated by gap-8 */}
        <header class="sticky top-0 z-30 h-14 border-b border-white/[0.08] bg-[#0A0B0E]/85 backdrop-blur-md">
          <div class="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 sm:gap-8 sm:px-6">
            {/* Zone 1: Brand Wordmark */}
            <button
              type="button"
              onClick={() => store.setActiveTab('today')}
              class="shrink-0 cursor-pointer font-display text-lg font-semibold tracking-tight whitespace-nowrap text-[#F5F7FA]"
            >
              Habits
            </button>

            {/* Zone 2: 4 single-line nav links */}
            <nav
              aria-label="Primary navigation"
              class="hidden items-center gap-6 text-sm font-medium md:flex"
            >
              <button
                type="button"
                onClick={() => store.setActiveTab('today')}
                class={`shrink-0 cursor-pointer border-b-2 py-1.5 whitespace-nowrap transition-colors ${
                  store.activeTab() === 'today'
                    ? 'border-[#3B82F6] text-[#F5F7FA]'
                    : 'border-transparent text-[#8E95A5] hover:text-[#F5F7FA]'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => store.setActiveTab('habits')}
                class={`shrink-0 cursor-pointer border-b-2 py-1.5 whitespace-nowrap transition-colors ${
                  store.activeTab() === 'habits'
                    ? 'border-[#3B82F6] text-[#F5F7FA]'
                    : 'border-transparent text-[#8E95A5] hover:text-[#F5F7FA]'
                }`}
              >
                Habits
              </button>
              <button
                type="button"
                onClick={() => store.setActiveTab('tasks')}
                class={`shrink-0 cursor-pointer border-b-2 py-1.5 whitespace-nowrap transition-colors ${
                  store.activeTab() === 'tasks'
                    ? 'border-[#3B82F6] text-[#F5F7FA]'
                    : 'border-transparent text-[#8E95A5] hover:text-[#F5F7FA]'
                }`}
              >
                Tasks
              </button>
              <button
                type="button"
                onClick={() => store.setActiveTab('history')}
                class={`shrink-0 cursor-pointer border-b-2 py-1.5 whitespace-nowrap transition-colors ${
                  store.activeTab() === 'history'
                    ? 'border-[#3B82F6] text-[#F5F7FA]'
                    : 'border-transparent text-[#8E95A5] hover:text-[#F5F7FA]'
                }`}
              >
                Progress
              </button>
            </nav>

            {/* Zone 3: Primary action (+ optional install trigger when available) */}
            <div class="flex shrink-0 items-center gap-2">
              <PWAInstallButton variant="compact" />
              <Show
                when={store.mode() === 'google'}
                fallback={
                  <button
                    type="button"
                    onClick={() => store.setAccountModalOpen(true)}
                    class="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-[#14161B] px-3.5 text-xs font-medium whitespace-nowrap text-[#F5F7FA] transition-colors hover:bg-[#1C1F26]"
                  >
                    <DriveIcon class="h-3.5 w-3.5 text-[#8E95A5]" />
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
                  class="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-[#3B82F6] px-3.5 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-[#2563EB] disabled:opacity-50"
                >
                  <CloudSyncIcon class="h-3.5 w-3.5" />
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
        <main class="mx-auto max-w-6xl space-y-6 px-4 pt-6 sm:px-6 sm:pt-8">
          <OfflineBanner />

          <Show when={store.mode() === 'google'}>
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs text-[#8E95A5]">
              <span class="break-anywhere min-w-0">
                {store.googleEmail()
                  ? `Google Mode (${store.googleEmail()}) · Private Drive snapshots`
                  : 'Google Sync Mode · Snapshot stored in private app folder'}
              </span>
              <div class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
                <button
                  type="button"
                  onClick={() => store.openRemindersModal()}
                  class={`shrink-0 cursor-pointer whitespace-nowrap ${
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
                  class="shrink-0 cursor-pointer whitespace-nowrap text-[#8E95A5] hover:text-[#F5F7FA]"
                >
                  Version History
                </button>
                <button
                  type="button"
                  onClick={() => store.setAccountModalOpen(true)}
                  class="shrink-0 cursor-pointer whitespace-nowrap text-[#60A5FA] hover:underline"
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
                class={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs ${
                  banner().kind === 'error'
                    ? 'border-[#EF4444]/25 bg-[#EF4444]/10 text-[#FCA5A5]'
                    : 'border-[#3B82F6]/30 bg-[#3B82F6]/10 text-[#93C5FD]'
                }`}
              >
                <span class="break-anywhere min-w-0 flex-1">{banner().text}</span>
                <button
                  type="button"
                  onClick={() => store.setSyncBanner(null)}
                  aria-label="Dismiss message"
                  class="shrink-0 cursor-pointer rounded-lg p-1 hover:bg-white/[0.08]"
                >
                  <CloseIcon class="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </Show>

          <Show
            when={store.dbReady()}
            fallback={
              <div class="rounded-2xl border border-white/[0.08] bg-[#14161B] p-12 text-center text-sm text-[#8E95A5]">
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
                  onSetCheckinValue={(hId, d, val) => store.setCheckinValue(hId, d, val)}
                  onIncrementCheckinValue={(hId, d, delta) =>
                    store.incrementCheckinValue(hId, d, delta)
                  }
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
                  advancedHeatmapMode={store.advancedHeatmapMode()}
                  onChangeAdvancedHeatmapMode={(m) => store.setAdvancedHeatmapMode(m)}
                  advancedNotesFilter={store.advancedNotesFilter()}
                  onChangeAdvancedNotesFilter={(f) => store.setAdvancedNotesFilter(f)}
                  getAdvancedAnalytics={(habits, filter, startDay, endDay) =>
                    store.getAdvancedAnalytics(habits, filter, startDay, endDay)
                  }
                  onToggleCheckin={(hId, d, next) => store.toggleCheckin(hId, d, next)}
                  onSetCheckinValue={(hId, d, val) => store.setCheckinValue(hId, d, val)}
                  onIncrementCheckinValue={(hId, d, delta) =>
                    store.incrementCheckinValue(hId, d, delta)
                  }
                  onSaveNote={(hId, d, txt) => store.saveNote(hId, d, txt)}
                />
              </Match>
            </Switch>
          </Show>
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav
          aria-label="Mobile navigation"
          class="fixed right-0 bottom-0 left-0 z-40 grid h-16 grid-cols-4 items-center border-t border-white/[0.08] bg-[#0A0B0E]/92 backdrop-blur-md md:hidden"
        >
          <button
            type="button"
            onClick={() => store.setActiveTab('today')}
            class={`flex h-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              store.activeTab() === 'today' ? 'text-[#60A5FA]' : 'text-[#8E95A5]'
            }`}
          >
            <TodayTabIcon class="h-5 w-5" />
            <span>Today</span>
          </button>
          <button
            type="button"
            onClick={() => store.setActiveTab('habits')}
            class={`flex h-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              store.activeTab() === 'habits' ? 'text-[#60A5FA]' : 'text-[#8E95A5]'
            }`}
          >
            <HabitsTabIcon class="h-5 w-5" />
            <span>Habits</span>
          </button>
          <button
            type="button"
            onClick={() => store.setActiveTab('tasks')}
            class={`flex h-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              store.activeTab() === 'tasks' ? 'text-[#60A5FA]' : 'text-[#8E95A5]'
            }`}
          >
            <TasksTabIcon class="h-5 w-5" />
            <span>Tasks</span>
          </button>
          <button
            type="button"
            onClick={() => store.setActiveTab('history')}
            class={`flex h-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              store.activeTab() === 'history' ? 'text-[#60A5FA]' : 'text-[#8E95A5]'
            }`}
          >
            <HistoryTabIcon class="h-5 w-5" />
            <span>Progress</span>
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
          badgePermission={store.badgePermission()}
          pendingToday={store.getTodayPendingSummary()}
          trackerTimeZone={store.timeZone()}
          calendarSyncNeeded={store.isCalendarSyncNeeded()}
          busy={store.calendarBusy()}
          error={store.calendarError()}
          pendingPlan={store.pendingCalendarPlan()}
          confirmDeleteOpen={store.confirmDeleteCalendarOpen()}
          onClose={() => store.closeRemindersModal()}
          onToggleBadge={(enabled) => store.setBadgeEnabled(enabled)}
          onRequestBadgePermission={() => store.requestBadgePermissionAndRefresh()}
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

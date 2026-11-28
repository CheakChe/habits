import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot, ReminderSlot, Task } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import {
  OPEN_TASK_BUCKETS,
  TaskSortMode,
  TaskStatusBucket,
  TaskStatusFilterSelection,
  TodayBoard,
} from '../utils/today-board';
import { TasksViewData, createTasksDataSelector } from './board-selectors';
import { MultiSelect } from './controls/MultiSelect';
import { Select, SelectOption } from './controls/Select';
import {
  AlertIcon,
  ArchiveIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  EditIcon,
  PlusIcon,
  RepeatIcon,
  SearchIcon,
  TrashIcon,
} from './Icons';

interface TasksViewProps {
  snapshot: DomainSnapshot;
  todayDay: number;
  statusFilter: TaskStatusFilterSelection;
  tasksData?: TasksViewData | null;
  onChangeStatusFilter: (filter: TaskStatusFilterSelection) => void;
  sortMode: TaskSortMode;
  onChangeSortMode: (sort: TaskSortMode) => void;
  onCreateTask: (options?: { dueDay?: number | null }) => void;
  onEditTask: (task: Task) => void;
  onToggleTask: (task: Task) => Promise<void>;
  onScheduleTaskToday: (task: Task) => Promise<void>;
  onDeleteTask: (taskId: number) => Promise<void>;
}

export function TasksView(props: TasksViewProps): JSX.Element {
  const [searchQuery, setSearchQuery] = createSignal('');

  const localTasksData = createTasksDataSelector({
    isActive: () => props.tasksData === undefined,
    snapshot: () => props.snapshot,
    todayDay: () => props.todayDay,
    statusFilter: () => props.statusFilter,
    sortMode: () => props.sortMode,
  });

  const tasksData = createMemo(() =>
    props.tasksData !== undefined && props.tasksData !== null ? props.tasksData : localTasksData()!
  );

  const visibleTasks = () => tasksData().visibleTasks;
  const activeSlotMap = () => tasksData().activeSlotMap;
  const bucketCounts = () => tasksData().bucketCounts;

  const filtered = createMemo(() => {
    const base = tasksData().baseFiltered;
    const q = searchQuery().trim().toLowerCase();
    if (q.length === 0) return base;
    return base.filter(
      (task) => task.title.toLowerCase().includes(q) || task.note.toLowerCase().includes(q)
    );
  });

  const openCount = createMemo(
    () =>
      bucketCounts().overdue +
      bucketCounts().today +
      bucketCounts().upcoming +
      bucketCounts().nodate
  );
  const overdueCount = createMemo(() => bucketCounts().overdue);
  const doneCount = createMemo(() => bucketCounts().completed);
  const notDoneCount = createMemo(() => bucketCounts().not_done);
  const archivedCount = createMemo(() => bucketCounts().archived);

  const statusOptions = createMemo((): SelectOption<TaskStatusBucket>[] => {
    const c = bucketCounts();
    return [
      {
        value: 'overdue',
        label: 'Overdue',
        hint: c.overdue > 0 ? String(c.overdue) : undefined,
      },
      {
        value: 'today',
        label: 'Today',
        hint: c.today > 0 ? String(c.today) : undefined,
      },
      {
        value: 'upcoming',
        label: 'Upcoming',
        hint: c.upcoming > 0 ? String(c.upcoming) : undefined,
      },
      {
        value: 'nodate',
        label: 'No Date',
        hint: c.nodate > 0 ? String(c.nodate) : undefined,
      },
      {
        value: 'completed',
        label: 'Completed',
        hint: c.completed > 0 ? String(c.completed) : undefined,
      },
      {
        value: 'not_done',
        label: 'Not Done',
        hint: c.not_done > 0 ? String(c.not_done) : undefined,
      },
      {
        value: 'archived',
        label: 'Archived',
        hint: c.archived > 0 ? String(c.archived) : undefined,
      },
    ];
  });

  const handleOpenCreate = () => {
    const sel = props.statusFilter;
    if (Array.isArray(sel) && sel.length === 1 && sel[0] === 'nodate') {
      props.onCreateTask({ dueDay: null });
      return;
    }
    props.onCreateTask(undefined);
  };

  const isEmptySelection = () =>
    Array.isArray(props.statusFilter) && props.statusFilter.length === 0;

  const isClosedOnlySelection = () =>
    Array.isArray(props.statusFilter) &&
    props.statusFilter.length > 0 &&
    props.statusFilter.every((b) => b === 'completed' || b === 'not_done' || b === 'archived');

  return (
    <div class="space-y-6">
      <div class="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end">
        <div class="space-y-1">
          <h1 class="font-display text-3xl font-semibold tracking-tight text-ink">Tasks</h1>
          <p class="text-sm text-ink-subtle">
            <span class="font-mono tabular-nums">{openCount()}</span> open
            <Show when={overdueCount() > 0}>
              <span aria-hidden="true"> · </span>
              <span class="font-mono text-warning tabular-nums">{overdueCount()} overdue</span>
            </Show>
            <span aria-hidden="true"> · </span>
            <span class="font-mono tabular-nums">{doneCount()}</span> completed
            <Show when={notDoneCount() > 0}>
              <span aria-hidden="true"> · </span>
              <span class="font-mono text-danger-soft tabular-nums">{notDoneCount()} not done</span>
            </Show>
            <Show when={archivedCount() > 0}>
              <span aria-hidden="true"> · </span>
              <span class="font-mono tabular-nums">{archivedCount()} archived</span>
            </Show>
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          class="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 self-start rounded-xl bg-accent px-4 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-accent-hover sm:self-auto"
        >
          <PlusIcon class="h-4 w-4" />
          <span>New Task</span>
        </button>
      </div>

      {/* Search, Status Multi-Select & Sort */}
      <div class="flex flex-col justify-between gap-2.5 lg:flex-row lg:items-center">
        <div class="relative max-w-md flex-1">
          <SearchIcon class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-dim" />
          <input
            type="search"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Search tasks or notes..."
            aria-label="Search tasks or notes"
            class="h-10 w-full rounded-xl border border-white/[0.08] bg-surface pr-9 pl-10 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          <Show when={searchQuery().length > 0}>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              class="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-ink-subtle hover:bg-white/[0.06] hover:text-ink"
            >
              <CloseIcon class="h-3.5 w-3.5" />
            </button>
          </Show>
        </div>

        <div class="flex flex-wrap items-center gap-2.5 sm:flex-nowrap">
          <MultiSelect<TaskStatusBucket>
            ariaLabel="Filter tasks by status"
            value={props.statusFilter}
            options={statusOptions()}
            allLabel={`All Statuses (${visibleTasks().length})`}
            emptyLabel="No statuses selected"
            selectedNoun={{ one: 'status', many: 'statuses' }}
            quickPreset={{
              label: 'Open Only',
              triggerLabel: `Open Tasks (${openCount()})`,
              values: OPEN_TASK_BUCKETS,
            }}
            align="right"
            onChange={(val) => props.onChangeStatusFilter(val)}
          />

          <Select<TaskSortMode>
            ariaLabel="Sort tasks"
            value={props.sortMode}
            options={[
              { value: 'default', label: 'Default Order' },
              { value: 'due_asc', label: 'Due: Earliest' },
              { value: 'due_desc', label: 'Due: Latest' },
              { value: 'newest', label: 'Newest First' },
              { value: 'title', label: 'Title A–Z' },
            ]}
            onChange={(val) => props.onChangeSortMode(val)}
          />
        </div>
      </div>

      <Show
        when={filtered().length > 0}
        fallback={
          <div class="space-y-4 rounded-2xl border border-white/[0.08] bg-surface px-6 py-14 text-center">
            <p class="text-sm text-ink-subtle">
              {searchQuery().trim().length > 0
                ? 'No tasks match your search.'
                : isEmptySelection()
                  ? 'No task statuses selected.'
                  : 'No tasks match the selected statuses.'}
            </p>
            <div class="flex flex-wrap items-center justify-center gap-2">
              <Show when={searchQuery().trim().length > 0}>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  class="h-10 cursor-pointer rounded-xl border border-white/[0.08] bg-surface-elevated px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
                >
                  Clear Search
                </button>
              </Show>
              <Show when={searchQuery().trim().length === 0 && isEmptySelection()}>
                <button
                  type="button"
                  onClick={() => props.onChangeStatusFilter([...OPEN_TASK_BUCKETS])}
                  class="h-10 cursor-pointer rounded-xl border border-white/[0.08] bg-surface-elevated px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
                >
                  Show Open Tasks
                </button>
              </Show>
              <Show
                when={
                  searchQuery().trim().length === 0 &&
                  (isClosedOnlySelection() || isEmptySelection())
                }
              >
                <button
                  type="button"
                  onClick={() => props.onChangeStatusFilter('all')}
                  class="h-10 cursor-pointer rounded-xl border border-white/[0.08] bg-surface-elevated px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
                >
                  Show All Statuses
                </button>
              </Show>
              <Show
                when={
                  searchQuery().trim().length === 0 &&
                  !isEmptySelection() &&
                  !isClosedOnlySelection()
                }
              >
                <button
                  type="button"
                  onClick={handleOpenCreate}
                  class="h-10 cursor-pointer rounded-xl bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  Create Task
                </button>
              </Show>
            </div>
          </div>
        }
      >
        <div class="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface">
          <ul class="divide-y divide-white/[0.06]">
            <For each={filtered()}>
              {(task) => {
                const status = () => TodayBoard.getStatus(task);
                const isOverdue = () =>
                  status() === 'open' && task.dueDay !== null && task.dueDay < props.todayDay;
                const assignedSlots = createMemo(() =>
                  (task.reminderSlotIds ?? [])
                    .map((id) => activeSlotMap().get(id))
                    .filter((s): s is ReminderSlot => Boolean(s))
                    .sort((a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label))
                );

                return (
                  <li class="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.02] sm:flex-nowrap sm:items-center sm:gap-4">
                    <div class="flex min-w-0 flex-1 items-start gap-3.5">
                      <Show
                        when={status() === 'open' || status() === 'done'}
                        fallback={
                          <div
                            title={
                              status() === 'not_done'
                                ? 'Not Done — change status in Edit'
                                : 'Archived — change status in Edit'
                            }
                            aria-label={
                              status() === 'not_done' ? 'Status: Not Done' : 'Status: Archived'
                            }
                            class={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                              status() === 'not_done'
                                ? 'border-danger/30 bg-danger/10 text-danger-soft'
                                : 'border-white/[0.08] bg-surface-elevated text-ink-subtle'
                            }`}
                          >
                            <Show
                              when={status() === 'not_done'}
                              fallback={<ArchiveIcon class="h-4 w-4" />}
                            >
                              <CloseIcon class="h-4 w-4" />
                            </Show>
                          </div>
                        }
                      >
                        <button
                          type="button"
                          onClick={() => void props.onToggleTask(task)}
                          aria-pressed={status() === 'done'}
                          aria-label={`Mark ${task.title} as ${
                            status() === 'done' ? 'open' : 'completed'
                          }`}
                          class={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-colors ${
                            status() === 'done'
                              ? 'border-transparent bg-accent text-white'
                              : isOverdue()
                                ? 'border-danger/40 bg-canvas text-transparent hover:border-danger'
                                : 'border-white/[0.12] bg-canvas text-transparent hover:border-white/30'
                          }`}
                        >
                          <CheckIcon class="h-4 w-4" />
                        </button>
                      </Show>

                      <div class="min-w-0 flex-1 py-0.5">
                        <p
                          class={`line-clamp-2 text-sm font-medium break-words ${
                            status() === 'done'
                              ? 'text-ink-subtle line-through'
                              : status() === 'not_done'
                                ? 'text-ink-secondary'
                                : status() === 'archived'
                                  ? 'text-ink-subtle'
                                  : 'text-ink'
                          }`}
                          title={task.title}
                        >
                          {task.title}
                        </p>
                        <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                          <Show when={status() === 'not_done'}>
                            <span class="font-medium text-danger-soft">Not Done</span>
                            <Show when={task.dueDay !== null}>
                              <span aria-hidden="true" class="text-ink-faint">
                                ·
                              </span>
                            </Show>
                          </Show>
                          <Show when={status() === 'archived'}>
                            <span class="font-medium text-ink-subtle">Archived</span>
                            <Show when={task.dueDay !== null}>
                              <span aria-hidden="true" class="text-ink-faint">
                                ·
                              </span>
                            </Show>
                          </Show>
                          <Show
                            when={isOverdue() && task.dueDay !== null}
                            fallback={
                              <Show
                                when={task.dueDay !== null}
                                fallback={
                                  <Show when={status() === 'open' || status() === 'done'}>
                                    <span class="text-ink-dim">No due date</span>
                                  </Show>
                                }
                              >
                                <span class="font-mono text-ink-subtle tabular-nums">
                                  Due {CivilCalendar.formatShortDate(task.dueDay!)}
                                </span>
                              </Show>
                            }
                          >
                            <span class="inline-flex items-center gap-1 font-mono text-danger-soft tabular-nums">
                              <AlertIcon class="h-3.5 w-3.5 text-danger" />
                              Overdue · {CivilCalendar.formatShortDate(task.dueDay!)}
                            </span>
                          </Show>
                          <Show when={task.repeatable}>
                            <span aria-hidden="true" class="text-ink-faint">
                              ·
                            </span>
                            <span class="inline-flex items-center gap-1 text-accent-soft">
                              <RepeatIcon class="h-3 w-3" />
                              Repeats
                            </span>
                          </Show>
                          <Show when={task.note}>
                            <span aria-hidden="true" class="text-ink-faint">
                              ·
                            </span>
                            <span
                              class="line-clamp-2 max-w-full break-words text-ink-muted"
                              title={task.note}
                            >
                              {task.note}
                            </span>
                          </Show>
                        </div>
                        <Show when={assignedSlots().length > 0}>
                          <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <For each={assignedSlots()}>
                              {(slot) => (
                                <span class="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent-tint tabular-nums">
                                  <ClockIcon class="h-3 w-3 shrink-0 text-accent-soft" />
                                  <span>
                                    {slot.time}
                                    {slot.label ? ` ${slot.label}` : ''}
                                  </span>
                                </span>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </div>

                    <div class="flex shrink-0 items-center gap-1">
                      <Show when={status() === 'open' && task.dueDay === null}>
                        <button
                          type="button"
                          onClick={() => void props.onScheduleTaskToday(task)}
                          title="Schedule for today"
                          class="mr-1 h-8 cursor-pointer rounded-lg border border-white/[0.08] bg-canvas px-2.5 text-xs font-medium whitespace-nowrap text-ink-muted transition-colors hover:bg-surface-elevated hover:text-accent-soft"
                        >
                          Today
                        </button>
                      </Show>
                      <button
                        type="button"
                        onClick={() => props.onEditTask(task)}
                        aria-label={`Edit ${task.title}`}
                        class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl text-ink-subtle transition-colors hover:bg-white/[0.06] hover:text-ink"
                      >
                        <EditIcon class="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void props.onDeleteTask(task.id)}
                        aria-label={`Delete ${task.title}`}
                        class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl text-ink-subtle transition-colors hover:bg-danger/10 hover:text-danger-soft"
                      >
                        <TrashIcon class="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}

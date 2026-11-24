import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot, Task } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import {
  OPEN_TASK_BUCKETS,
  TaskSortMode,
  TaskStatusBucket,
  TaskStatusFilterSelection,
  TodayBoard,
} from '../utils/today-board';
import { CustomMultiSelect, CustomSelect, SelectOption } from './CustomControls';
import {
  AlertIcon,
  ArchiveIcon,
  CheckIcon,
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

  const visibleTasks = createMemo(() =>
    props.snapshot.tasks.filter((task) => task.deletedAt === null)
  );

  const filtered = createMemo(() =>
    TodayBoard.filterTasksByStatuses(
      props.snapshot.tasks,
      props.todayDay,
      props.statusFilter,
      searchQuery(),
      props.sortMode
    )
  );

  const bucketCounts = createMemo(() => {
    const counts: Record<TaskStatusBucket, number> = {
      overdue: 0,
      today: 0,
      upcoming: 0,
      nodate: 0,
      completed: 0,
      not_done: 0,
      archived: 0,
    };
    for (const task of visibleTasks()) {
      const bucket = TodayBoard.getTaskBucket(task, props.todayDay);
      counts[bucket] += 1;
    }
    return counts;
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
          <h1 class="font-display text-3xl font-semibold tracking-tight text-[#F5F7FA]">Tasks</h1>
          <p class="text-sm text-[#8E95A5]">
            <span class="font-mono tabular-nums">{openCount()}</span> open
            <Show when={overdueCount() > 0}>
              <span aria-hidden="true"> · </span>
              <span class="font-mono text-[#F59E0B] tabular-nums">{overdueCount()} overdue</span>
            </Show>
            <span aria-hidden="true"> · </span>
            <span class="font-mono tabular-nums">{doneCount()}</span> completed
            <Show when={notDoneCount() > 0}>
              <span aria-hidden="true"> · </span>
              <span class="font-mono text-[#FCA5A5] tabular-nums">{notDoneCount()} not done</span>
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
          class="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 self-start rounded-xl bg-[#3B82F6] px-4 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#2563EB] sm:self-auto"
        >
          <PlusIcon class="h-4 w-4" />
          <span>New Task</span>
        </button>
      </div>

      {/* Search, Status Multi-Select & Sort */}
      <div class="flex flex-col justify-between gap-2.5 lg:flex-row lg:items-center">
        <div class="relative max-w-md flex-1">
          <SearchIcon class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="search"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Search tasks or notes..."
            aria-label="Search tasks or notes"
            class="h-10 w-full rounded-xl border border-white/[0.08] bg-[#14161B] pr-9 pl-10 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:border-[#3B82F6] focus:outline-none"
          />
          <Show when={searchQuery().length > 0}>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              class="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-[#8E95A5] hover:bg-white/[0.06] hover:text-[#F5F7FA]"
            >
              <CloseIcon class="h-3.5 w-3.5" />
            </button>
          </Show>
        </div>

        <div class="flex flex-wrap items-center gap-2.5 sm:flex-nowrap">
          <CustomMultiSelect<TaskStatusBucket>
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

          <CustomSelect
            ariaLabel="Sort tasks"
            value={props.sortMode}
            options={[
              { value: 'default', label: 'Default Order' },
              { value: 'due_asc', label: 'Due: Earliest' },
              { value: 'due_desc', label: 'Due: Latest' },
              { value: 'newest', label: 'Newest First' },
              { value: 'title', label: 'Title A–Z' },
            ]}
            onChange={(val) => props.onChangeSortMode(val as TaskSortMode)}
          />
        </div>
      </div>

      <Show
        when={filtered().length > 0}
        fallback={
          <div class="space-y-4 rounded-2xl border border-white/[0.08] bg-[#14161B] px-6 py-14 text-center">
            <p class="text-sm text-[#8E95A5]">
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
                  class="h-10 cursor-pointer rounded-xl border border-white/[0.08] bg-[#1C1F26] px-4 text-sm font-medium text-[#F5F7FA] transition-colors hover:bg-[#252933]"
                >
                  Clear Search
                </button>
              </Show>
              <Show when={searchQuery().trim().length === 0 && isEmptySelection()}>
                <button
                  type="button"
                  onClick={() => props.onChangeStatusFilter([...OPEN_TASK_BUCKETS])}
                  class="h-10 cursor-pointer rounded-xl border border-white/[0.08] bg-[#1C1F26] px-4 text-sm font-medium text-[#F5F7FA] transition-colors hover:bg-[#252933]"
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
                  class="h-10 cursor-pointer rounded-xl border border-white/[0.08] bg-[#1C1F26] px-4 text-sm font-medium text-[#F5F7FA] transition-colors hover:bg-[#252933]"
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
                  class="h-10 cursor-pointer rounded-xl bg-[#3B82F6] px-5 text-sm font-medium text-white transition-colors hover:bg-[#2563EB]"
                >
                  Create Task
                </button>
              </Show>
            </div>
          </div>
        }
      >
        <div class="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#14161B]">
          <ul class="divide-y divide-white/[0.06]">
            <For each={filtered()}>
              {(task) => {
                const status = () => TodayBoard.getStatus(task);
                const isOverdue = () =>
                  status() === 'open' && task.dueDay !== null && task.dueDay < props.todayDay;

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
                                ? 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#FCA5A5]'
                                : 'border-white/[0.08] bg-[#1C1F26] text-[#8E95A5]'
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
                              ? 'border-transparent bg-[#3B82F6] text-white'
                              : isOverdue()
                                ? 'border-[#EF4444]/40 bg-[#0A0B0E] text-transparent hover:border-[#EF4444]'
                                : 'border-white/[0.12] bg-[#0A0B0E] text-transparent hover:border-white/30'
                          }`}
                        >
                          <CheckIcon class="h-4 w-4" />
                        </button>
                      </Show>

                      <div class="min-w-0 flex-1 py-0.5">
                        <p
                          class={`line-clamp-2 text-sm font-medium break-words ${
                            status() === 'done'
                              ? 'text-[#8E95A5] line-through'
                              : status() === 'not_done'
                                ? 'text-[#C8CDD8]'
                                : status() === 'archived'
                                  ? 'text-[#8E95A5]'
                                  : 'text-[#F5F7FA]'
                          }`}
                          title={task.title}
                        >
                          {task.title}
                        </p>
                        <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                          <Show when={status() === 'not_done'}>
                            <span class="font-medium text-[#FCA5A5]">Not Done</span>
                            <Show when={task.dueDay !== null}>
                              <span aria-hidden="true" class="text-[#5B6270]">
                                ·
                              </span>
                            </Show>
                          </Show>
                          <Show when={status() === 'archived'}>
                            <span class="font-medium text-[#8E95A5]">Archived</span>
                            <Show when={task.dueDay !== null}>
                              <span aria-hidden="true" class="text-[#5B6270]">
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
                                    <span class="text-[#6B7280]">No due date</span>
                                  </Show>
                                }
                              >
                                <span class="font-mono text-[#8E95A5] tabular-nums">
                                  Due {CivilCalendar.formatShortDate(task.dueDay!)}
                                </span>
                              </Show>
                            }
                          >
                            <span class="inline-flex items-center gap-1 font-mono text-[#FCA5A5] tabular-nums">
                              <AlertIcon class="h-3.5 w-3.5 text-[#EF4444]" />
                              Overdue · {CivilCalendar.formatShortDate(task.dueDay!)}
                            </span>
                          </Show>
                          <Show when={task.repeatable}>
                            <span aria-hidden="true" class="text-[#5B6270]">
                              ·
                            </span>
                            <span class="inline-flex items-center gap-1 text-[#60A5FA]">
                              <RepeatIcon class="h-3 w-3" />
                              Repeats
                            </span>
                          </Show>
                          <Show when={task.note}>
                            <span aria-hidden="true" class="text-[#5B6270]">
                              ·
                            </span>
                            <span
                              class="line-clamp-2 max-w-full break-words text-[#9AA1B1]"
                              title={task.note}
                            >
                              {task.note}
                            </span>
                          </Show>
                        </div>
                      </div>
                    </div>

                    <div class="flex shrink-0 items-center gap-1">
                      <Show when={status() === 'open' && task.dueDay === null}>
                        <button
                          type="button"
                          onClick={() => void props.onScheduleTaskToday(task)}
                          title="Schedule for today"
                          class="mr-1 h-8 cursor-pointer rounded-lg border border-white/[0.08] bg-[#0A0B0E] px-2.5 text-xs font-medium whitespace-nowrap text-[#9AA1B1] transition-colors hover:bg-[#1C1F26] hover:text-[#60A5FA]"
                        >
                          Today
                        </button>
                      </Show>
                      <button
                        type="button"
                        onClick={() => props.onEditTask(task)}
                        aria-label={`Edit ${task.title}`}
                        class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl text-[#8E95A5] transition-colors hover:bg-white/[0.06] hover:text-[#F5F7FA]"
                      >
                        <EditIcon class="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void props.onDeleteTask(task.id)}
                        aria-label={`Delete ${task.title}`}
                        class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl text-[#8E95A5] transition-colors hover:bg-[#EF4444]/10 hover:text-[#FCA5A5]"
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

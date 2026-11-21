import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot, Task } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { TaskFilterMode, TaskSortMode, TodayBoard } from '../utils/today-board';
import { CustomSelect } from './CustomControls';
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
  onCreateTask: (options?: { dueDay?: number | null }) => void;
  onEditTask: (task: Task) => void;
  onToggleTask: (task: Task) => Promise<void>;
  onScheduleTaskToday: (task: Task) => Promise<void>;
  onDeleteTask: (taskId: number) => Promise<void>;
}

const FILTER_TABS: { id: TaskFilterMode; label: string }[] = [
  { id: 'all', label: 'All Open' },
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'nodate', label: 'No Date' },
  { id: 'completed', label: 'Completed' },
  { id: 'not_done', label: 'Not Done' },
  { id: 'archived', label: 'Archived' },
];

export function TasksView(props: TasksViewProps): JSX.Element {
  const [filter, setFilter] = createSignal<TaskFilterMode>('all');
  const [searchQuery, setSearchQuery] = createSignal('');
  const [sortMode, setSortMode] = createSignal<TaskSortMode>('default');

  const visibleTasks = createMemo(() =>
    props.snapshot.tasks.filter((task) => task.deletedAt === null)
  );

  const filtered = createMemo(() =>
    TodayBoard.filterTasks(
      props.snapshot.tasks,
      props.todayDay,
      filter(),
      searchQuery(),
      sortMode()
    )
  );

  const openCount = createMemo(
    () => visibleTasks().filter((t) => TodayBoard.getStatus(t) === 'open').length
  );

  const overdueCount = createMemo(
    () =>
      visibleTasks().filter(
        (t) =>
          TodayBoard.getStatus(t) === 'open' &&
          t.dueDay !== null &&
          t.dueDay < props.todayDay
      ).length
  );

  const noDateCount = createMemo(
    () =>
      visibleTasks().filter(
        (t) => TodayBoard.getStatus(t) === 'open' && t.dueDay === null
      ).length
  );

  const doneCount = createMemo(
    () => visibleTasks().filter((t) => TodayBoard.getStatus(t) === 'done').length
  );

  const notDoneCount = createMemo(
    () => visibleTasks().filter((t) => TodayBoard.getStatus(t) === 'not_done').length
  );

  const archivedCount = createMemo(
    () => visibleTasks().filter((t) => TodayBoard.getStatus(t) === 'archived').length
  );

  const handleOpenCreate = () => {
    props.onCreateTask(filter() === 'nodate' ? { dueDay: null } : undefined);
  };

  const isClosedFilter = () =>
    filter() === 'completed' || filter() === 'not_done' || filter() === 'archived';

  return (
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div class="space-y-1">
          <h1 class="font-display text-3xl font-semibold tracking-tight text-[#F5F7FA]">
            Tasks
          </h1>
          <p class="text-sm text-[#8E95A5]">
            <span class="font-mono tabular-nums">{openCount()}</span> open
            <Show when={overdueCount() > 0}>
              <span aria-hidden="true"> · </span>
              <span class="font-mono tabular-nums text-[#F59E0B]">
                {overdueCount()} overdue
              </span>
            </Show>
            <span aria-hidden="true"> · </span>
            <span class="font-mono tabular-nums">{doneCount()}</span> completed
            <Show when={notDoneCount() > 0}>
              <span aria-hidden="true"> · </span>
              <span class="font-mono tabular-nums text-[#FCA5A5]">
                {notDoneCount()} not done
              </span>
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
          class="h-10 px-4 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
        >
          <PlusIcon class="w-4 h-4" />
          <span>New Task</span>
        </button>
      </div>

      {/* Search, Sort & Status Filters */}
      <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div class="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
          <div class="relative flex-1 max-w-md">
            <SearchIcon class="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              placeholder="Search tasks or notes..."
              aria-label="Search tasks or notes"
              class="w-full h-10 rounded-xl bg-[#14161B] border border-white/[0.08] pl-10 pr-9 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:outline-none focus:border-[#3B82F6]"
            />
            <Show when={searchQuery().length > 0}>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.06] cursor-pointer"
              >
                <CloseIcon class="w-3.5 h-3.5" />
              </button>
            </Show>
          </div>

          <CustomSelect
            ariaLabel="Sort tasks"
            value={sortMode()}
            options={[
              { value: 'default', label: 'Default Order' },
              { value: 'due_asc', label: 'Due: Earliest' },
              { value: 'due_desc', label: 'Due: Latest' },
              { value: 'newest', label: 'Newest First' },
              { value: 'title', label: 'Title A–Z' },
            ]}
            onChange={(val) => setSortMode(val as TaskSortMode)}
          />
        </div>

        <div class="flex items-center gap-1 p-1 bg-[#14161B] border border-white/[0.08] rounded-xl overflow-x-auto max-w-full">
          <For each={FILTER_TABS}>
            {(tab) => (
              <button
                type="button"
                onClick={() => setFilter(tab.id)}
                class={`h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter() === tab.id
                    ? 'bg-[#1C1F26] text-[#F5F7FA]'
                    : 'text-[#8E95A5] hover:text-[#F5F7FA]'
                }`}
              >
                {tab.label}
                <Show when={tab.id === 'overdue' && overdueCount() > 0}>
                  <span class="ml-1.5 font-mono tabular-nums text-[#F59E0B]">
                    {overdueCount()}
                  </span>
                </Show>
                <Show when={tab.id === 'nodate' && noDateCount() > 0}>
                  <span class="ml-1.5 font-mono tabular-nums text-[#8E95A5]">
                    {noDateCount()}
                  </span>
                </Show>
                <Show when={tab.id === 'not_done' && notDoneCount() > 0}>
                  <span class="ml-1.5 font-mono tabular-nums text-[#FCA5A5]">
                    {notDoneCount()}
                  </span>
                </Show>
                <Show when={tab.id === 'archived' && archivedCount() > 0}>
                  <span class="ml-1.5 font-mono tabular-nums text-[#8E95A5]">
                    {archivedCount()}
                  </span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </div>

      <Show
        when={filtered().length > 0}
        fallback={
          <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] px-6 py-14 text-center space-y-4">
            <p class="text-sm text-[#8E95A5]">
              {searchQuery().trim().length > 0
                ? 'No tasks match your search.'
                : filter() === 'completed'
                  ? 'No completed tasks yet.'
                  : filter() === 'not_done'
                    ? 'No tasks marked as Not Done.'
                    : filter() === 'archived'
                      ? 'No archived tasks.'
                      : 'No tasks match this filter.'}
            </p>
            <Show
              when={searchQuery().trim().length === 0 && !isClosedFilter()}
              fallback={
                <Show when={searchQuery().trim().length > 0}>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    class="h-10 px-4 rounded-xl bg-[#1C1F26] hover:bg-[#252933] border border-white/[0.08] text-sm font-medium text-[#F5F7FA] transition-colors cursor-pointer"
                  >
                    Clear Search
                  </button>
                </Show>
              }
            >
              <button
                type="button"
                onClick={handleOpenCreate}
                class="h-10 px-5 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white transition-colors cursor-pointer"
              >
                Create Task
              </button>
            </Show>
          </div>
        }
      >
        <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
          <ul class="divide-y divide-white/[0.06]">
            <For each={filtered()}>
              {(task) => {
                const status = () => TodayBoard.getStatus(task);
                const isOverdue = () =>
                  status() === 'open' && task.dueDay !== null && task.dueDay < props.todayDay;

                return (
                  <li class="px-5 py-3.5 flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-3 sm:gap-4 hover:bg-white/[0.02] transition-colors">
                    <div class="flex items-start gap-3.5 min-w-0 flex-1">
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
                              status() === 'not_done'
                                ? 'Status: Not Done'
                                : 'Status: Archived'
                            }
                            class={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                              status() === 'not_done'
                                ? 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#FCA5A5]'
                                : 'bg-[#1C1F26] border-white/[0.08] text-[#8E95A5]'
                            }`}
                          >
                            <Show
                              when={status() === 'not_done'}
                              fallback={<ArchiveIcon class="w-4 h-4" />}
                            >
                              <CloseIcon class="w-4 h-4" />
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
                          class={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors cursor-pointer border ${
                            status() === 'done'
                              ? 'bg-[#22C55E] border-transparent text-white'
                              : isOverdue()
                                ? 'bg-[#0A0B0E] border-[#EF4444]/40 hover:border-[#EF4444] text-transparent'
                                : 'bg-[#0A0B0E] border-white/[0.12] hover:border-white/30 text-transparent'
                          }`}
                        >
                          <CheckIcon class="w-4 h-4" />
                        </button>
                      </Show>

                      <div class="min-w-0 flex-1 py-0.5">
                        <p
                          class={`text-sm font-medium line-clamp-2 break-words ${
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
                        <div class="flex flex-wrap items-center gap-2 mt-0.5 text-xs">
                          <Show when={status() === 'not_done'}>
                            <span class="text-[#FCA5A5] font-medium">Not Done</span>
                            <Show when={task.dueDay !== null}>
                              <span aria-hidden="true" class="text-[#5B6270]">·</span>
                            </Show>
                          </Show>
                          <Show when={status() === 'archived'}>
                            <span class="text-[#8E95A5] font-medium">Archived</span>
                            <Show when={task.dueDay !== null}>
                              <span aria-hidden="true" class="text-[#5B6270]">·</span>
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
                                <span class="text-[#8E95A5] font-mono tabular-nums">
                                  Due {CivilCalendar.formatShortDate(task.dueDay!)}
                                </span>
                              </Show>
                            }
                          >
                            <span class="inline-flex items-center gap-1 text-[#FCA5A5] font-mono tabular-nums">
                              <AlertIcon class="w-3.5 h-3.5 text-[#EF4444]" />
                              Overdue · {CivilCalendar.formatShortDate(task.dueDay!)}
                            </span>
                          </Show>
                          <Show when={task.repeatable}>
                            <span aria-hidden="true" class="text-[#5B6270]">·</span>
                            <span class="inline-flex items-center gap-1 text-[#60A5FA]">
                              <RepeatIcon class="w-3 h-3" />
                              Repeats
                            </span>
                          </Show>
                          <Show when={task.note}>
                            <span aria-hidden="true" class="text-[#5B6270]">·</span>
                            <span
                              class="text-[#9AA1B1] line-clamp-2 break-words max-w-full"
                              title={task.note}
                            >
                              {task.note}
                            </span>
                          </Show>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      <Show when={status() === 'open' && task.dueDay === null}>
                        <button
                          type="button"
                          onClick={() => void props.onScheduleTaskToday(task)}
                          title="Schedule for today"
                          class="h-8 px-2.5 mr-1 rounded-lg bg-[#0A0B0E] hover:bg-[#1C1F26] border border-white/[0.08] text-xs font-medium text-[#9AA1B1] hover:text-[#60A5FA] transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Today
                        </button>
                      </Show>
                      <button
                        type="button"
                        onClick={() => props.onEditTask(task)}
                        aria-label={`Edit ${task.title}`}
                        class="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <EditIcon class="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void props.onDeleteTask(task.id)}
                        aria-label={`Delete ${task.title}`}
                        class="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#8E95A5] hover:text-[#FCA5A5] hover:bg-[#EF4444]/10 transition-colors cursor-pointer"
                      >
                        <TrashIcon class="w-4 h-4" />
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

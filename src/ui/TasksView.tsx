import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot, Task } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { AlertIcon, CheckIcon, EditIcon, PlusIcon, TrashIcon } from './Icons';

interface TasksViewProps {
  snapshot: DomainSnapshot;
  todayDay: number;
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onToggleTask: (task: Task) => Promise<void>;
  onDeleteTask: (taskId: number) => Promise<void>;
}

export function TasksView(props: TasksViewProps): JSX.Element {
  const [filter, setFilter] = createSignal<'active' | 'scheduled' | 'completed'>('active');

  const visibleTasks = createMemo(() =>
    props.snapshot.tasks.filter((task) => task.deletedAt === null)
  );

  const filtered = createMemo(() =>
    visibleTasks()
      .filter((task) => {
        if (filter() === 'active') return !task.done;
        if (filter() === 'scheduled') return !task.done && task.dueDay !== null;
        return task.done;
      })
      .sort((a, b) => {
        if (filter() === 'completed') return b.updatedAt - a.updatedAt;
        if (a.dueDay === null && b.dueDay !== null) return 1;
        if (a.dueDay !== null && b.dueDay === null) return -1;
        if (a.dueDay !== null && b.dueDay !== null && a.dueDay !== b.dueDay) {
          return a.dueDay - b.dueDay;
        }
        return a.id - b.id;
      })
  );

  const openCount = createMemo(
    () => visibleTasks().filter((t) => !t.done).length
  );

  const doneCount = createMemo(
    () => visibleTasks().length - openCount()
  );

  return (
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div class="space-y-1">
          <h1 class="font-display text-3xl font-semibold tracking-tight text-[#F5F7FA]">
            Tasks
          </h1>
          <p class="text-sm text-[#8E95A5]">
            <span class="font-mono tabular-nums">{openCount()}</span> open
            <span aria-hidden="true"> · </span>
            <span class="font-mono tabular-nums">{doneCount()}</span> completed
          </p>
        </div>

        <div class="flex items-center gap-3 flex-wrap self-start sm:self-auto">
          <div class="flex items-center gap-1 p-1 bg-[#14161B] border border-white/[0.08] rounded-xl">
            <button
              type="button"
              onClick={() => setFilter('active')}
              class={`h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter() === 'active'
                  ? 'bg-[#1C1F26] text-[#F5F7FA]'
                  : 'text-[#8E95A5] hover:text-[#F5F7FA]'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setFilter('scheduled')}
              class={`h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter() === 'scheduled'
                  ? 'bg-[#1C1F26] text-[#F5F7FA]'
                  : 'text-[#8E95A5] hover:text-[#F5F7FA]'
              }`}
            >
              Scheduled
            </button>
            <button
              type="button"
              onClick={() => setFilter('completed')}
              class={`h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter() === 'completed'
                  ? 'bg-[#1C1F26] text-[#F5F7FA]'
                  : 'text-[#8E95A5] hover:text-[#F5F7FA]'
              }`}
            >
              Completed
            </button>
          </div>

          <button
            type="button"
            onClick={() => props.onCreateTask()}
            class="h-10 px-4 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PlusIcon class="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      <Show
        when={filtered().length > 0}
        fallback={
          <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] px-6 py-14 text-center space-y-4">
            <p class="text-sm text-[#8E95A5]">
              {filter() === 'completed'
                ? 'No completed tasks yet.'
                : 'No tasks match this filter.'}
            </p>
            <Show when={filter() !== 'completed'}>
              <button
                type="button"
                onClick={() => props.onCreateTask()}
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
                const isOverdue = () =>
                  !task.done && task.dueDay !== null && task.dueDay < props.todayDay;

                return (
                  <li class="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                    <div class="flex items-start gap-3.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => void props.onToggleTask(task)}
                        aria-pressed={task.done}
                        aria-label={`Mark ${task.title} as ${task.done ? 'open' : 'completed'}`}
                        class={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors cursor-pointer border ${
                          task.done
                            ? 'bg-[#22C55E] border-transparent text-white'
                            : isOverdue()
                              ? 'bg-[#0A0B0E] border-[#EF4444]/40 hover:border-[#EF4444] text-transparent'
                              : 'bg-[#0A0B0E] border-white/[0.12] hover:border-white/30 text-transparent'
                        }`}
                      >
                        <CheckIcon class="w-4 h-4" />
                      </button>

                      <div class="min-w-0 flex-1 py-0.5">
                        <p
                          class={`text-sm font-medium truncate ${
                            task.done
                              ? 'text-[#8E95A5] line-through'
                              : 'text-[#F5F7FA]'
                          }`}
                        >
                          {task.title}
                        </p>
                        <div class="flex flex-wrap items-center gap-2 mt-0.5 text-xs">
                          <Show
                            when={isOverdue() && task.dueDay !== null}
                            fallback={
                              <Show
                                when={task.dueDay !== null}
                                fallback={<span class="text-[#6B7280]">No due date</span>}
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
                          <Show when={task.note}>
                            <span aria-hidden="true" class="text-[#5B6270]">·</span>
                            <span class="text-[#9AA1B1] truncate max-w-md">
                              {task.note}
                            </span>
                          </Show>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
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

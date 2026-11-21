import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot, Habit, Task } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { HabitAppearance } from '../utils/habit-appearance';
import { StreakCalculator } from '../utils/streak-calculator';
import { TodayBoard } from '../utils/today-board';
import { HabitBadge } from './HabitBadge';
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  NoteIcon,
  PlusIcon,
  RepeatIcon,
} from './Icons';

interface TodayViewProps {
  snapshot: DomainSnapshot;
  todayDay: number;
  goalsExpanded: boolean;
  onToggleGoalsExpanded: () => void;
  onToggleCheckin: (habitId: number, dayIndex: number, nextDone: boolean) => Promise<void>;
  onSaveNote: (habitId: number, dayIndex: number, text: string) => Promise<void>;
  onToggleTask: (task: Task) => Promise<void>;
  onQuickAddTask: (title: string, dueDay: number | null) => Promise<void>;
  onScheduleTaskToday: (task: Task) => Promise<void>;
  onOpenNewHabit: () => void;
  onOpenEditTask: (task: Task) => void;
}

export function TodayView(props: TodayViewProps): JSX.Element {
  const [expandedNoteHabitId, setExpandedNoteHabitId] = createSignal<number | null>(null);
  const [noteDraft, setNoteDraft] = createSignal('');
  const [quickTaskTitle, setQuickTaskTitle] = createSignal('');
  const [addingTask, setAddingTask] = createSignal(false);
  const [quickGoalTitle, setQuickGoalTitle] = createSignal('');
  const [addingGoal, setAddingGoal] = createSignal(false);

  const scheduledHabits = createMemo(() =>
    TodayBoard.getScheduledHabits(
      props.snapshot.habits,
      props.todayDay,
      props.snapshot.checkins
    )
  );

  const partitionedTasks = createMemo(() =>
    TodayBoard.getTodayAndOverdueTasks(props.snapshot.tasks, props.todayDay)
  );

  const noDateTasks = createMemo(() =>
    TodayBoard.getNoDateTasks(props.snapshot.tasks)
  );

  const checkinMap = createMemo(() => {
    const map = new Map<number, boolean>();
    for (const c of props.snapshot.checkins) {
      if (c.dayIndex === props.todayDay) {
        map.set(c.habitId, c.done);
      }
    }
    return map;
  });

  const noteMap = createMemo(() => {
    const map = new Map<number, string>();
    for (const n of props.snapshot.notes) {
      if (n.dayIndex === props.todayDay) {
        map.set(n.habitId, n.text);
      }
    }
    return map;
  });

  const completedHabitsCount = createMemo(() => {
    const cMap = checkinMap();
    return scheduledHabits().filter((h) => cMap.get(h.id) === true).length;
  });

  const openNoteEditor = (habit: Habit) => {
    if (expandedNoteHabitId() === habit.id) {
      setExpandedNoteHabitId(null);
      return;
    }
    setNoteDraft(noteMap().get(habit.id) ?? '');
    setExpandedNoteHabitId(habit.id);
  };

  const handleSaveNote = async (habitId: number) => {
    await props.onSaveNote(habitId, props.todayDay, noteDraft());
    setExpandedNoteHabitId(null);
  };

  const handleQuickTaskSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const trimmed = quickTaskTitle().trim();
    if (!trimmed) return;
    setAddingTask(true);
    try {
      await props.onQuickAddTask(trimmed, props.todayDay);
      setQuickTaskTitle('');
    } finally {
      setAddingTask(false);
    }
  };

  const handleQuickGoalSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const trimmed = quickGoalTitle().trim();
    if (!trimmed) return;
    setAddingGoal(true);
    try {
      await props.onQuickAddTask(trimmed, null);
      setQuickGoalTitle('');
    } finally {
      setAddingGoal(false);
    }
  };

  return (
    <div class="space-y-8">
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div class="space-y-1">
          <h1 class="font-display text-3xl font-semibold tracking-tight text-[#F5F7FA]">
            Today
          </h1>
          <div class="flex items-center gap-2 text-sm text-[#8E95A5]">
            <span>{CivilCalendar.formatFullDate(props.todayDay)}</span>
            <span aria-hidden="true">·</span>
            <span class="font-mono tabular-nums">
              {completedHabitsCount()}/{scheduledHabits().length} habits done
            </span>
            <Show when={partitionedTasks().overdue.length > 0}>
              <span aria-hidden="true">·</span>
              <span class="text-[#F59E0B] font-mono tabular-nums">
                {partitionedTasks().overdue.length} overdue
              </span>
            </Show>
          </div>
        </div>

        <button
          type="button"
          onClick={() => props.onOpenNewHabit()}
          class="h-10 px-4 rounded-xl bg-[#1C1F26] hover:bg-[#252933] border border-white/[0.08] text-sm font-medium text-[#F5F7FA] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
        >
          <PlusIcon class="w-4 h-4 text-[#60A5FA]" />
          <span>New Habit</span>
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <section class="lg:col-span-7 rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
          <div class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
              Scheduled Habits
            </h2>
            <span class="text-xs font-mono tabular-nums text-[#8E95A5]">
              {scheduledHabits().length === 0
                ? 'None today'
                : `${completedHabitsCount()} of ${scheduledHabits().length}`}
            </span>
          </div>

          <Show
            when={scheduledHabits().length > 0}
            fallback={
              <div class="px-6 py-12 text-center space-y-4">
                <p class="text-sm text-[#8E95A5] max-w-sm mx-auto">
                  No habits are scheduled for today. Create a daily habit or adjust an existing schedule.
                </p>
                <button
                  type="button"
                  onClick={() => props.onOpenNewHabit()}
                  class="h-10 px-5 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white transition-colors cursor-pointer"
                >
                  Create First Habit
                </button>
              </div>
            }
          >
            <ul class="divide-y divide-white/[0.06]">
              <For each={scheduledHabits()}>
                {(habit) => {
                  const isDone = () => checkinMap().get(habit.id) === true;
                  const existingNote = () => noteMap().get(habit.id) ?? '';
                  const isNoteOpen = () => expandedNoteHabitId() === habit.id;
                  const metrics = createMemo(() =>
                    StreakCalculator.calculate(
                      habit,
                      props.snapshot.checkins,
                      props.todayDay - 29,
                      props.todayDay,
                      true
                    )
                  );
                  const weekly = createMemo(() =>
                    StreakCalculator.calculateWeeklyProgress(
                      habit,
                      props.snapshot.checkins,
                      props.todayDay
                    )
                  );
                  const flexStatus = createMemo(() =>
                    TodayBoard.getFlexibleWeekStatus(
                      habit,
                      props.snapshot.checkins,
                      props.todayDay
                    )
                  );
                  const streakUnitShort = () =>
                    metrics().streakUnit === 'weeks' ? 'w' : 'd';
                  const streakUnitLong = () =>
                    metrics().streakUnit === 'weeks' ? 'week' : 'day';
                  const milestone = () =>
                    StreakCalculator.getMilestone(metrics().currentStreak);
                  const exactMilestone = () =>
                    StreakCalculator.isExactMilestone(metrics().currentStreak);

                  const streakToneClass = () => {
                    const m = milestone();
                    if (m === 100) return 'text-[#FBBF24]';
                    if (m === 30) return 'text-[#4ADE80]';
                    if (m === 7) return 'text-[#60A5FA]';
                    return '';
                  };

                  return (
                    <li
                      class={`transition-colors hover:bg-white/[0.02] ${
                        exactMilestone() ? 'bg-white/[0.015]' : ''
                      }`}
                    >
                      <div class="px-5 py-3.5 flex items-center gap-3.5 min-h-[60px]">
                        <button
                          type="button"
                          onClick={() =>
                            void props.onToggleCheckin(habit.id, props.todayDay, !isDone())
                          }
                          aria-pressed={isDone()}
                          aria-label={`Mark ${habit.name} as ${isDone() ? 'not done' : 'done'}`}
                          class={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer border ${
                            isDone()
                              ? 'border-transparent'
                              : 'bg-[#0A0B0E] border-white/[0.12] text-transparent hover:border-white/30'
                          }`}
                          style={
                            isDone()
                              ? {
                                  'background-color': HabitAppearance.getColor(habit.color),
                                  color: HabitAppearance.getContrastTextColor(
                                    HabitAppearance.getColor(habit.color)
                                  ),
                                }
                              : undefined
                          }
                        >
                          <CheckIcon class="w-5 h-5" />
                        </button>

                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2.5">
                            <HabitBadge appearanceRaw={habit.color} size="sm" />
                            <p
                              class={`text-sm font-medium truncate transition-colors ${
                                isDone() ? 'text-[#8E95A5] line-through' : 'text-[#F5F7FA]'
                              }`}
                            >
                              {habit.name}
                            </p>
                          </div>
                          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-[#8E95A5]">
                            <span
                              class={`font-mono tabular-nums ${streakToneClass()}`}
                              title={
                                milestone()
                                  ? `${milestone()}-${streakUnitLong()} streak milestone`
                                  : undefined
                              }
                            >
                              {metrics().currentStreak}
                              {streakUnitShort()} streak
                              <Show when={exactMilestone()}>
                                <span>
                                  {' '}
                                  · {metrics().currentStreak}
                                  {streakUnitShort()} milestone
                                </span>
                              </Show>
                            </span>
                            <Show when={weekly().scheduledDays > 0}>
                              <span aria-hidden="true">·</span>
                              <span
                                class={`font-mono tabular-nums ${
                                  weekly().isComplete ? 'text-[#4ADE80]' : ''
                                }`}
                              >
                                {weekly().isComplete
                                  ? `Week complete (${weekly().completedDays}/${weekly().scheduledDays})`
                                  : `${weekly().completedDays}/${weekly().scheduledDays} this week`}
                              </span>
                            </Show>
                            <Show when={flexStatus()?.mustDoToday}>
                              <span aria-hidden="true">·</span>
                              <span class="text-[#F59E0B] font-mono tabular-nums">
                                {flexStatus()!.remainingDays === 1
                                  ? 'Last day this week'
                                  : `${flexStatus()!.remainingDays}d left for ${flexStatus()!.remainingNeeded}`}
                              </span>
                            </Show>
                            <span aria-hidden="true">·</span>
                            <span class="font-mono tabular-nums">
                              {Math.round(metrics().completionRate * 100)}% (30d)
                            </span>
                            <Show when={existingNote() && !isNoteOpen()}>
                              <span aria-hidden="true">·</span>
                              <span class="truncate text-[#9AA1B1]">{existingNote()}</span>
                            </Show>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openNoteEditor(habit)}
                          aria-expanded={isNoteOpen()}
                          aria-label={`Day note for ${habit.name}`}
                          class={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                            existingNote() || isNoteOpen()
                              ? 'text-[#60A5FA] bg-[#3B82F6]/10'
                              : 'text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.05]'
                          }`}
                        >
                          <NoteIcon class="w-4 h-4" />
                        </button>
                      </div>

                      <Show when={isNoteOpen()}>
                        <div class="px-5 pb-4 pt-1 flex items-center gap-2.5">
                          <input
                            type="text"
                            value={noteDraft()}
                            onInput={(e) => setNoteDraft(e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleSaveNote(habit.id);
                              }
                            }}
                            placeholder="Add a note for today..."
                            autofocus
                            class="flex-1 h-10 rounded-xl bg-[#0A0B0E] border border-white/[0.1] px-3.5 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:outline-none focus:border-[#3B82F6]"
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveNote(habit.id)}
                            class="h-10 px-4 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-medium text-white transition-colors cursor-pointer shrink-0"
                          >
                            Save
                          </button>
                        </div>
                      </Show>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </section>

        <div class="lg:col-span-5 space-y-6">
          <section class="rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
            <div class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <h2 class="font-display text-base font-semibold text-[#F5F7FA]">
                Tasks Due &amp; Overdue
              </h2>
              <span class="text-xs font-mono tabular-nums text-[#8E95A5]">
                {partitionedTasks().overdue.length + partitionedTasks().dueToday.length} open
              </span>
            </div>

            <form
              onSubmit={(e) => void handleQuickTaskSubmit(e)}
              class="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2"
            >
              <input
                type="text"
                value={quickTaskTitle()}
                onInput={(e) => setQuickTaskTitle(e.currentTarget.value)}
                placeholder="Quick task due today..."
                class="flex-1 h-10 rounded-xl bg-[#0A0B0E] border border-white/[0.1] px-3.5 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:outline-none focus:border-[#3B82F6]"
              />
              <button
                type="submit"
                disabled={addingTask() || quickTaskTitle().trim() === ''}
                class="h-10 px-4 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-40 shrink-0"
              >
                Add
              </button>
            </form>

            <Show
              when={
                partitionedTasks().overdue.length > 0 ||
                partitionedTasks().dueToday.length > 0
              }
              fallback={
                <div class="px-6 py-10 text-center">
                  <p class="text-sm text-[#8E95A5]">
                    No tasks due today or overdue. Add one above or manage all tasks in the Tasks view.
                  </p>
                </div>
              }
            >
              <ul class="divide-y divide-white/[0.06]">
                <For each={partitionedTasks().overdue}>
                  {(task) => (
                    <li class="px-5 py-3.5 flex items-start gap-3.5 hover:bg-white/[0.02] transition-colors">
                      <button
                        type="button"
                        onClick={() => void props.onToggleTask(task)}
                        aria-label={`Complete task ${task.title}`}
                        class="w-11 h-11 rounded-xl bg-[#0A0B0E] border border-[#EF4444]/40 hover:border-[#EF4444] flex items-center justify-center shrink-0 text-transparent transition-colors cursor-pointer"
                      >
                        <CheckIcon class="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onOpenEditTask(task)}
                        class="min-w-0 flex-1 text-left cursor-pointer py-0.5"
                      >
                        <p class="text-sm font-medium text-[#F5F7FA] truncate">
                          {task.title}
                        </p>
                        <div class="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-[#FCA5A5]">
                          <AlertIcon class="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
                          <span class="font-mono tabular-nums">
                            Overdue · {CivilCalendar.formatShortDate(task.dueDay ?? props.todayDay)}
                          </span>
                          <Show when={task.repeatable}>
                            <span aria-hidden="true" class="text-[#5B6270]">·</span>
                            <span class="inline-flex items-center gap-1 text-[#60A5FA]">
                              <RepeatIcon class="w-3 h-3" />
                              Repeats
                            </span>
                          </Show>
                        </div>
                      </button>
                    </li>
                  )}
                </For>

                <For each={partitionedTasks().dueToday}>
                  {(task) => (
                    <li class="px-5 py-3.5 flex items-start gap-3.5 hover:bg-white/[0.02] transition-colors">
                      <button
                        type="button"
                        onClick={() => void props.onToggleTask(task)}
                        aria-label={`Complete task ${task.title}`}
                        class="w-11 h-11 rounded-xl bg-[#0A0B0E] border border-white/[0.12] hover:border-white/30 flex items-center justify-center shrink-0 text-transparent transition-colors cursor-pointer"
                      >
                        <CheckIcon class="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onOpenEditTask(task)}
                        class="min-w-0 flex-1 text-left cursor-pointer py-0.5"
                      >
                        <p class="text-sm font-medium text-[#F5F7FA] truncate">
                          {task.title}
                        </p>
                        <div class="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-[#8E95A5]">
                          <span>Due today</span>
                          <Show when={task.repeatable}>
                            <span aria-hidden="true" class="text-[#5B6270]">·</span>
                            <span class="inline-flex items-center gap-1 text-[#60A5FA]">
                              <RepeatIcon class="w-3 h-3" />
                              Repeats
                            </span>
                          </Show>
                          <Show when={task.note}>
                            <span aria-hidden="true" class="text-[#5B6270]">·</span>
                            <span class="truncate">{task.note}</span>
                          </Show>
                        </div>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>

          {/* Collapsible Goals / No Due Date list */}
          <section class="rounded-2xl bg-[#14161B] border border-white/[0.08] overflow-hidden">
            <button
              type="button"
              onClick={() => props.onToggleGoalsExpanded()}
              aria-expanded={props.goalsExpanded}
              class="w-full px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              <div class="min-w-0 flex items-center gap-2.5">
                <h2 class="font-display text-base font-semibold text-[#F5F7FA] truncate">
                  Goals · No Due Date
                </h2>
              </div>
              <div class="flex items-center gap-2.5 shrink-0">
                <span class="text-xs font-mono tabular-nums text-[#8E95A5]">
                  {noDateTasks().length} open
                </span>
                <ChevronDownIcon
                  class={`w-4 h-4 text-[#8E95A5] transition-transform duration-150 ${
                    props.goalsExpanded ? '' : '-rotate-90'
                  }`}
                />
              </div>
            </button>

            <Show when={props.goalsExpanded}>
              <div class="border-t border-white/[0.06]">
                <form
                  onSubmit={(e) => void handleQuickGoalSubmit(e)}
                  class="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={quickGoalTitle()}
                    onInput={(e) => setQuickGoalTitle(e.currentTarget.value)}
                    placeholder="Add a goal (no due date)..."
                    class="flex-1 h-10 rounded-xl bg-[#0A0B0E] border border-white/[0.1] px-3.5 text-sm text-[#F5F7FA] placeholder:text-[#5B6270] focus:outline-none focus:border-[#3B82F6]"
                  />
                  <button
                    type="submit"
                    disabled={addingGoal() || quickGoalTitle().trim() === ''}
                    class="h-10 px-4 rounded-xl bg-[#1C1F26] hover:bg-[#252933] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                  >
                    Add
                  </button>
                </form>

                <Show
                  when={noDateTasks().length > 0}
                  fallback={
                    <div class="px-6 py-7 text-center">
                      <p class="text-xs text-[#8E95A5]">
                        No dateless goals yet. Add one above for things without a fixed deadline.
                      </p>
                    </div>
                  }
                >
                  <ul class="divide-y divide-white/[0.06]">
                    <For each={noDateTasks()}>
                      {(task) => (
                        <li class="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                          <button
                            type="button"
                            onClick={() => void props.onToggleTask(task)}
                            aria-label={`Complete goal ${task.title}`}
                            class="w-10 h-10 rounded-xl bg-[#0A0B0E] border border-white/[0.12] hover:border-white/30 flex items-center justify-center shrink-0 text-transparent transition-colors cursor-pointer"
                          >
                            <CheckIcon class="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => props.onOpenEditTask(task)}
                            class="min-w-0 flex-1 text-left cursor-pointer py-0.5"
                          >
                            <p class="text-sm font-medium text-[#F5F7FA] truncate">
                              {task.title}
                            </p>
                            <Show when={task.note || task.repeatable}>
                              <div class="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-[#8E95A5]">
                                <Show when={task.repeatable}>
                                  <span class="inline-flex items-center gap-1 text-[#60A5FA]">
                                    <RepeatIcon class="w-3 h-3" />
                                    Repeats
                                  </span>
                                  <Show when={task.note}>
                                    <span aria-hidden="true" class="text-[#5B6270]">·</span>
                                  </Show>
                                </Show>
                                <Show when={task.note}>
                                  <span class="truncate">{task.note}</span>
                                </Show>
                              </div>
                            </Show>
                          </button>

                          <button
                            type="button"
                            onClick={() => void props.onScheduleTaskToday(task)}
                            title="Schedule for today"
                            class="h-8 px-2.5 rounded-lg bg-[#0A0B0E] hover:bg-[#1C1F26] border border-white/[0.08] text-[11px] font-medium text-[#9AA1B1] hover:text-[#60A5FA] transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                          >
                            Today
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </Show>
          </section>
        </div>
      </div>
    </div>
  );
}

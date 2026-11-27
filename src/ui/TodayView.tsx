import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot, Habit, HabitCheckin, ReminderSlot, Task } from '../types/domain';
import { CivilCalendar } from '../utils/civil-calendar';
import { HabitAppearance } from '../utils/habit-appearance';
import { HabitSchedule } from '../utils/habit-schedule';
import { ReminderPlanner } from '../utils/reminder-planner';
import { StreakCalculator } from '../utils/streak-calculator';
import { TodayBoard } from '../utils/today-board';
import { MeasuredQuickControls } from './controls/MeasuredQuickControls';
import { HabitBadge } from './HabitBadge';
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
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
  onSetCheckinValue: (habitId: number, dayIndex: number, value: number) => Promise<void>;
  onIncrementCheckinValue: (habitId: number, dayIndex: number, delta: number) => Promise<void>;
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
    TodayBoard.getScheduledHabits(props.snapshot.habits, props.todayDay, props.snapshot.checkins)
  );

  const partitionedTasks = createMemo(() =>
    TodayBoard.getTodayAndOverdueTasks(props.snapshot.tasks, props.todayDay)
  );

  const noDateTasks = createMemo(() => TodayBoard.getNoDateTasks(props.snapshot.tasks));

  const checkinMap = createMemo(() => {
    const map = new Map<number, HabitCheckin>();
    for (const c of props.snapshot.checkins) {
      if (c.dayIndex === props.todayDay) {
        map.set(c.habitId, c);
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

  const activeSlotMap = createMemo(() => {
    const map = new Map<string, ReminderSlot>();
    for (const slot of ReminderPlanner.getActiveSlots(props.snapshot)) {
      map.set(slot.id, slot);
    }
    return map;
  });

  const completedHabitsCount = createMemo(() => {
    const cMap = checkinMap();
    return scheduledHabits().filter((h) =>
      HabitSchedule.isCheckinDoneForDay(h, cMap.get(h.id), props.todayDay)
    ).length;
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
      <div class="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end">
        <div class="space-y-1">
          <h1 class="font-display text-3xl font-semibold tracking-tight text-ink">Today</h1>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-subtle">
            <span>{CivilCalendar.formatFullDate(props.todayDay)}</span>
            <span aria-hidden="true">·</span>
            <span class="font-mono tabular-nums">
              {completedHabitsCount()}/{scheduledHabits().length} habits done
            </span>
            <Show when={partitionedTasks().overdue.length > 0}>
              <span aria-hidden="true">·</span>
              <span class="font-mono text-warning tabular-nums">
                {partitionedTasks().overdue.length} overdue
              </span>
            </Show>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => props.onOpenNewHabit()}
            class="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-surface-elevated px-4 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:bg-surface-hover"
          >
            <PlusIcon class="h-4 w-4 text-accent-soft" />
            <span>New Habit</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface lg:col-span-7">
          <div class="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
            <h2 class="font-display text-base font-semibold text-ink">Scheduled Habits</h2>
            <span class="font-mono text-xs text-ink-subtle tabular-nums">
              {scheduledHabits().length === 0
                ? 'None today'
                : `${completedHabitsCount()} of ${scheduledHabits().length}`}
            </span>
          </div>

          <Show
            when={scheduledHabits().length > 0}
            fallback={
              <div class="space-y-4 px-6 py-12 text-center">
                <p class="mx-auto max-w-sm text-sm text-ink-subtle">
                  No habits are scheduled for today. Create a daily habit or adjust an existing
                  schedule.
                </p>
                <button
                  type="button"
                  onClick={() => props.onOpenNewHabit()}
                  class="h-10 cursor-pointer rounded-xl bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  Create First Habit
                </button>
              </div>
            }
          >
            <ul class="divide-y divide-white/[0.06]">
              <For each={scheduledHabits()}>
                {(habit) => {
                  const checkinEntry = () => checkinMap().get(habit.id);
                  const activeSchedule = () => HabitSchedule.getAtDay(habit, props.todayDay);
                  const activeTarget = () => activeSchedule().dailyTarget;
                  const currentValue = () =>
                    HabitSchedule.getCheckinValueForDay(habit, checkinEntry(), props.todayDay);
                  const isDone = () =>
                    HabitSchedule.isCheckinDoneForDay(habit, checkinEntry(), props.todayDay);
                  const isPartial = () => {
                    const target = activeTarget();
                    return target !== null && !isDone() && currentValue() > 0;
                  };
                  const partialPct = () => {
                    const target = activeTarget();
                    if (target === null || target <= 0) return 0;
                    return Math.min(100, Math.round((currentValue() / target) * 100));
                  };
                  const accentColor = () => HabitAppearance.getColor(habit.color);
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
                    TodayBoard.getFlexibleWeekStatus(habit, props.snapshot.checkins, props.todayDay)
                  );
                  const streakUnitShort = () => (metrics().streakUnit === 'weeks' ? 'w' : 'd');
                  const streakUnitLong = () => (metrics().streakUnit === 'weeks' ? 'week' : 'day');
                  const milestone = () => StreakCalculator.getMilestone(metrics().currentStreak);
                  const exactMilestone = () =>
                    StreakCalculator.isExactMilestone(metrics().currentStreak);

                  const streakToneClass = () => {
                    const m = milestone();
                    if (m === 100) return 'text-milestone-gold';
                    if (m === 30) return 'text-accent-tint';
                    if (m === 7) return 'text-accent-soft';
                    return '';
                  };
                  const assignedSlots = createMemo(() =>
                    (habit.reminderSlotIds ?? [])
                      .map((id) => activeSlotMap().get(id))
                      .filter((s): s is ReminderSlot => Boolean(s))
                      .sort(
                        (a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label)
                      )
                  );

                  return (
                    <li
                      class={`transition-colors hover:bg-white/[0.02] ${
                        exactMilestone() ? 'bg-white/[0.015]' : ''
                      }`}
                    >
                      <div class="flex min-h-[60px] items-center gap-3.5 px-5 py-3.5">
                        <button
                          type="button"
                          onClick={() =>
                            void props.onToggleCheckin(habit.id, props.todayDay, !isDone())
                          }
                          aria-pressed={isDone()}
                          aria-label={
                            activeTarget() !== null
                              ? isDone()
                                ? `Reset ${habit.name} to 0`
                                : `Complete ${habit.name} (${HabitSchedule.formatNumericValue(activeTarget()!)}${habit.unit ? ` ${habit.unit}` : ''})`
                              : `Mark ${habit.name} as ${isDone() ? 'not done' : 'done'}`
                          }
                          class={`relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border transition-all duration-150 ${
                            isDone()
                              ? 'border-transparent'
                              : isPartial()
                                ? 'border-white/[0.22] bg-canvas text-ink-secondary hover:border-white/40'
                                : 'border-white/[0.12] bg-canvas text-transparent hover:border-white/30'
                          }`}
                          style={
                            isDone()
                              ? {
                                  'background-color': accentColor(),
                                  color: HabitAppearance.getContrastTextColor(accentColor()),
                                }
                              : undefined
                          }
                        >
                          <Show when={isPartial()}>
                            <span
                              aria-hidden="true"
                              class="absolute inset-x-0 bottom-0 opacity-25 transition-all"
                              style={{
                                height: `${partialPct()}%`,
                                'background-color': accentColor(),
                              }}
                            />
                          </Show>
                          <CheckIcon class="relative z-10 h-5 w-5" />
                        </button>

                        <div class="min-w-0 flex-1">
                          <div class="flex items-start gap-2.5">
                            <HabitBadge appearanceRaw={habit.color} size="sm" />
                            <p
                              class={`line-clamp-2 text-sm font-medium break-words transition-colors ${
                                isDone() ? 'text-ink-subtle line-through' : 'text-ink'
                              }`}
                              title={habit.name}
                            >
                              {habit.name}
                            </p>
                          </div>
                          <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-subtle">
                            <Show when={activeTarget() !== null}>
                              <span
                                class={`font-mono tabular-nums ${
                                  isDone() ? 'text-accent-soft' : 'text-ink-secondary'
                                }`}
                              >
                                {HabitSchedule.formatNumericValue(currentValue())}/
                                {HabitSchedule.formatNumericValue(activeTarget()!)}
                                {habit.unit ? ` ${habit.unit}` : ''}
                              </span>
                              <span aria-hidden="true">·</span>
                            </Show>
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
                                  weekly().isComplete ? 'text-accent-soft' : ''
                                }`}
                              >
                                {weekly().isComplete
                                  ? `Week complete (${weekly().completedDays}/${weekly().scheduledDays})`
                                  : `${weekly().completedDays}/${weekly().scheduledDays} this week`}
                              </span>
                            </Show>
                            <Show when={flexStatus()?.mustDoToday}>
                              <span aria-hidden="true">·</span>
                              <span class="font-mono text-warning tabular-nums">
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
                              <span
                                class="line-clamp-2 max-w-full break-words text-ink-muted"
                                title={existingNote()}
                              >
                                {existingNote()}
                              </span>
                            </Show>
                          </div>
                          <Show
                            when={
                              activeSchedule().weeklyTarget !== null || assignedSlots().length > 0
                            }
                          >
                            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Show when={activeSchedule().weeklyTarget !== null}>
                                <span
                                  class="inline-flex items-center rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-ink-secondary tabular-nums"
                                  aria-label="Flexible weekly schedule"
                                >
                                  {activeSchedule().weeklyTarget}× / week
                                </span>
                              </Show>
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

                        <button
                          type="button"
                          onClick={() => openNoteEditor(habit)}
                          aria-expanded={isNoteOpen()}
                          aria-label={`Day note for ${habit.name}`}
                          class={`flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors ${
                            existingNote() || isNoteOpen()
                              ? 'bg-accent/10 text-accent-soft'
                              : 'text-ink-subtle hover:bg-white/[0.05] hover:text-ink'
                          }`}
                        >
                          <NoteIcon class="h-4 w-4" />
                        </button>
                      </div>

                      <Show when={activeTarget() !== null}>
                        <div class="px-5 pb-3.5 pl-[4.75rem]">
                          <MeasuredQuickControls
                            habitName={habit.name}
                            accentColor={accentColor()}
                            unit={habit.unit}
                            value={currentValue()}
                            target={activeTarget()!}
                            onIncrement={(delta) =>
                              props.onIncrementCheckinValue(habit.id, props.todayDay, delta)
                            }
                            onSetValue={(val) =>
                              props.onSetCheckinValue(habit.id, props.todayDay, val)
                            }
                          />
                        </div>
                      </Show>

                      <Show when={isNoteOpen()}>
                        <div class="flex items-center gap-2.5 px-5 pt-1 pb-4">
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
                            class="h-10 flex-1 rounded-xl border border-white/[0.1] bg-canvas px-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveNote(habit.id)}
                            class="h-10 shrink-0 cursor-pointer rounded-xl bg-accent px-4 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
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

        <div class="space-y-6 lg:col-span-5">
          <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface">
            <div class="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <h2 class="font-display text-base font-semibold text-ink">Tasks Due &amp; Overdue</h2>
              <span class="font-mono text-xs text-ink-subtle tabular-nums">
                {partitionedTasks().overdue.length + partitionedTasks().dueToday.length} open
              </span>
            </div>

            <form
              onSubmit={(e) => void handleQuickTaskSubmit(e)}
              class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3.5"
            >
              <input
                type="text"
                value={quickTaskTitle()}
                onInput={(e) => setQuickTaskTitle(e.currentTarget.value)}
                placeholder="Quick task due today..."
                class="h-10 flex-1 rounded-xl border border-white/[0.1] bg-canvas px-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={addingTask() || quickTaskTitle().trim() === ''}
                class="h-10 shrink-0 cursor-pointer rounded-xl bg-accent px-4 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                Add
              </button>
            </form>

            <Show
              when={partitionedTasks().overdue.length > 0 || partitionedTasks().dueToday.length > 0}
              fallback={
                <div class="px-6 py-10 text-center">
                  <p class="text-sm text-ink-subtle">
                    No tasks due today or overdue. Add one above or manage all tasks in the Tasks
                    view.
                  </p>
                </div>
              }
            >
              <ul class="divide-y divide-white/[0.06]">
                <For each={partitionedTasks().overdue}>
                  {(task) => {
                    const taskSlots = createMemo(() =>
                      (task.reminderSlotIds ?? [])
                        .map((id) => activeSlotMap().get(id))
                        .filter((s): s is ReminderSlot => Boolean(s))
                        .sort(
                          (a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label)
                        )
                    );
                    return (
                      <li class="flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-white/[0.02]">
                        <button
                          type="button"
                          onClick={() => void props.onToggleTask(task)}
                          aria-label={`Complete task ${task.title}`}
                          class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-danger/40 bg-canvas text-transparent transition-colors hover:border-danger"
                        >
                          <CheckIcon class="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onOpenEditTask(task)}
                          class="min-w-0 flex-1 cursor-pointer py-0.5 text-left"
                        >
                          <p
                            class="line-clamp-2 text-sm font-medium break-words text-ink"
                            title={task.title}
                          >
                            {task.title}
                          </p>
                          <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-danger-soft">
                            <AlertIcon class="h-3.5 w-3.5 shrink-0 text-danger" />
                            <span class="font-mono tabular-nums">
                              Overdue ·{' '}
                              {CivilCalendar.formatShortDate(task.dueDay ?? props.todayDay)}
                            </span>
                            <Show when={task.repeatable}>
                              <span aria-hidden="true" class="text-ink-faint">
                                ·
                              </span>
                              <span class="inline-flex items-center gap-1 text-accent-soft">
                                <RepeatIcon class="h-3 w-3" />
                                Repeats
                              </span>
                            </Show>
                          </div>
                          <Show when={taskSlots().length > 0}>
                            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <For each={taskSlots()}>
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
                        </button>
                      </li>
                    );
                  }}
                </For>

                <For each={partitionedTasks().dueToday}>
                  {(task) => {
                    const taskSlots = createMemo(() =>
                      (task.reminderSlotIds ?? [])
                        .map((id) => activeSlotMap().get(id))
                        .filter((s): s is ReminderSlot => Boolean(s))
                        .sort(
                          (a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label)
                        )
                    );
                    return (
                      <li class="flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-white/[0.02]">
                        <button
                          type="button"
                          onClick={() => void props.onToggleTask(task)}
                          aria-label={`Complete task ${task.title}`}
                          class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/[0.12] bg-canvas text-transparent transition-colors hover:border-white/30"
                        >
                          <CheckIcon class="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onOpenEditTask(task)}
                          class="min-w-0 flex-1 cursor-pointer py-0.5 text-left"
                        >
                          <p
                            class="line-clamp-2 text-sm font-medium break-words text-ink"
                            title={task.title}
                          >
                            {task.title}
                          </p>
                          <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">
                            <span>Due today</span>
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
                              <span class="line-clamp-2 max-w-full break-words" title={task.note}>
                                {task.note}
                              </span>
                            </Show>
                          </div>
                          <Show when={taskSlots().length > 0}>
                            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <For each={taskSlots()}>
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
                        </button>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
          </section>

          {/* Collapsible Goals / No Due Date list */}
          <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface">
            <button
              type="button"
              onClick={() => props.onToggleGoalsExpanded()}
              aria-expanded={props.goalsExpanded}
              class="flex w-full cursor-pointer items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-white/[0.02]"
            >
              <div class="flex min-w-0 items-center gap-2.5">
                <h2 class="truncate font-display text-base font-semibold text-ink">
                  Goals · No Due Date
                </h2>
              </div>
              <div class="flex shrink-0 items-center gap-2.5">
                <span class="font-mono text-xs text-ink-subtle tabular-nums">
                  {noDateTasks().length} open
                </span>
                <ChevronDownIcon
                  class={`h-4 w-4 text-ink-subtle transition-transform duration-150 ${
                    props.goalsExpanded ? '' : '-rotate-90'
                  }`}
                />
              </div>
            </button>

            <Show when={props.goalsExpanded}>
              <div class="border-t border-white/[0.06]">
                <form
                  onSubmit={(e) => void handleQuickGoalSubmit(e)}
                  class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3.5"
                >
                  <input
                    type="text"
                    value={quickGoalTitle()}
                    onInput={(e) => setQuickGoalTitle(e.currentTarget.value)}
                    placeholder="Add a goal (no due date)..."
                    class="h-10 flex-1 rounded-xl border border-white/[0.1] bg-canvas px-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={addingGoal() || quickGoalTitle().trim() === ''}
                    class="h-10 shrink-0 cursor-pointer rounded-xl border border-white/[0.08] bg-surface-elevated px-4 text-xs font-medium text-ink transition-colors hover:bg-surface-hover disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>

                <Show
                  when={noDateTasks().length > 0}
                  fallback={
                    <div class="px-6 py-7 text-center">
                      <p class="text-xs text-ink-subtle">
                        No dateless goals yet. Add one above for things without a fixed deadline.
                      </p>
                    </div>
                  }
                >
                  <ul class="divide-y divide-white/[0.06]">
                    <For each={noDateTasks()}>
                      {(task) => {
                        const taskSlots = createMemo(() =>
                          (task.reminderSlotIds ?? [])
                            .map((id) => activeSlotMap().get(id))
                            .filter((s): s is ReminderSlot => Boolean(s))
                            .sort(
                              (a, b) =>
                                a.time.localeCompare(b.time) || a.label.localeCompare(b.label)
                            )
                        );
                        return (
                          <li class="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]">
                            <button
                              type="button"
                              onClick={() => void props.onToggleTask(task)}
                              aria-label={`Complete goal ${task.title}`}
                              class="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/[0.12] bg-canvas text-transparent transition-colors hover:border-white/30"
                            >
                              <CheckIcon class="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => props.onOpenEditTask(task)}
                              class="min-w-0 flex-1 cursor-pointer py-0.5 text-left"
                            >
                              <p
                                class="line-clamp-2 text-sm font-medium break-words text-ink"
                                title={task.title}
                              >
                                {task.title}
                              </p>
                              <Show when={task.note || task.repeatable}>
                                <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">
                                  <Show when={task.repeatable}>
                                    <span class="inline-flex items-center gap-1 text-accent-soft">
                                      <RepeatIcon class="h-3 w-3" />
                                      Repeats
                                    </span>
                                    <Show when={task.note}>
                                      <span aria-hidden="true" class="text-ink-faint">
                                        ·
                                      </span>
                                    </Show>
                                  </Show>
                                  <Show when={task.note}>
                                    <span
                                      class="line-clamp-2 max-w-full break-words"
                                      title={task.note}
                                    >
                                      {task.note}
                                    </span>
                                  </Show>
                                </div>
                              </Show>
                              <Show when={taskSlots().length > 0}>
                                <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <For each={taskSlots()}>
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
                            </button>

                            <button
                              type="button"
                              onClick={() => void props.onScheduleTaskToday(task)}
                              title="Schedule for today"
                              class="h-8 shrink-0 cursor-pointer rounded-lg border border-white/[0.08] bg-canvas px-2.5 text-[11px] font-medium whitespace-nowrap text-ink-muted transition-colors hover:bg-surface-elevated hover:text-accent-soft"
                            >
                              Today
                            </button>
                          </li>
                        );
                      }}
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

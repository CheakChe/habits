import { For, JSX, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { DomainSnapshot, Habit, HabitCheckin } from '../../types/domain';
import { CivilCalendar } from '../../utils/civil-calendar';
import { DayCellClassifier, DayCellTone } from '../../utils/date-range';
import { HabitAppearance } from '../../utils/habit-appearance';
import { HabitSchedule } from '../../utils/habit-schedule';
import { StreakCalculator } from '../../utils/streak-calculator';
import { TaskAnalytics } from '../../utils/task-analytics';
import { MeasuredQuickControls } from '../controls/MeasuredQuickControls';
import { HabitBadge } from '../HabitBadge';
import {
  ArchiveIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  NoteIcon,
  RepeatIcon,
} from '../Icons';

interface HistoryCalendarPanelProps {
  snapshot: DomainSnapshot;
  targetHabits: Habit[];
  habitFilter: 'all' | number[];
  todayDay: number;
  timeZone: string;
  viewYear: number;
  viewMonth: number;
  selectedDay: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (dayIndex: number) => void;
  onChangeHabitFilter: (filter: 'all' | number[]) => void;
  onToggleCheckin: (habitId: number, dayIndex: number, nextDone: boolean) => Promise<void>;
  onSetCheckinValue: (habitId: number, dayIndex: number, value: number) => Promise<void>;
  onIncrementCheckinValue: (habitId: number, dayIndex: number, delta: number) => Promise<void>;
  onSaveNote: (habitId: number, dayIndex: number, text: string) => Promise<void>;
}

function calendarTileClass(tone: DayCellTone, isSelected: boolean): string {
  if (isSelected) {
    return 'bg-accent/25 border-accent text-white';
  }
  switch (tone) {
    case 'complete':
      return 'bg-accent/15 border-accent/40 text-ink hover:bg-accent/25';
    case 'missed-slight':
      return 'bg-cal-missed-1/20 border-danger/25 text-danger-lighter hover:bg-cal-missed-1/30';
    case 'missed-moderate':
      return 'bg-cal-missed-2/30 border-danger/40 text-danger-lighter hover:bg-cal-missed-2/40';
    case 'missed-heavy':
      return 'bg-heat-3/40 border-danger/55 text-danger-pale hover:bg-heat-3/50';
    case 'missed-all':
      return 'bg-danger-hover/35 border-danger/75 text-danger-pale hover:bg-danger-hover/45';
    case 'today-open':
      return 'bg-cal-today/55 border-danger/40 text-ink hover:bg-cal-today/75';
    case 'unscheduled':
    case 'future':
    default:
      return 'bg-canvas border-white/[0.06] text-ink-muted hover:border-white/20';
  }
}

export function HistoryCalendarPanel(props: HistoryCalendarPanelProps): JSX.Element {
  const [editingNoteHabitId, setEditingNoteHabitId] = createSignal<number | null>(null);
  const [noteDraft, setNoteDraft] = createSignal('');

  createEffect(() => {
    void props.selectedDay;
    setEditingNoteHabitId(null);
  });

  const checkinIndex = createMemo(() => {
    const map = new Map<string, HabitCheckin>();
    for (const c of props.snapshot.checkins) {
      map.set(`${c.habitId}:${c.dayIndex}`, c);
    }
    return map;
  });

  const noteIndex = createMemo(() => {
    const map = new Map<string, string>();
    for (const n of props.snapshot.notes) {
      map.set(`${n.habitId}:${n.dayIndex}`, n.text);
    }
    return map;
  });

  const monthGrid = createMemo(() => CivilCalendar.getMonthDays(props.viewYear, props.viewMonth));

  const monthDayStats = createMemo(() => {
    const days = monthGrid().days;
    if (days.length === 0) return new Map<number, { scheduled: number; done: number }>();
    return StreakCalculator.getPeriodDayStats(
      props.targetHabits,
      props.snapshot.checkins,
      days[0],
      Math.min(days[days.length - 1], props.todayDay),
      props.todayDay
    );
  });

  const selectedDayHabits = createMemo(() =>
    props.targetHabits.filter((h) => h.startDay <= props.selectedDay).sort((a, b) => a.id - b.id)
  );

  const selectedDayTasks = createMemo(() =>
    TaskAnalytics.tasksForDay(props.snapshot.tasks, props.selectedDay, props.timeZone)
  );

  const selectedDayTasksCount = createMemo(() => {
    const d = selectedDayTasks();
    return d.done.length + d.notDone.length + d.archived.length + d.dueOpen.length;
  });

  return (
    <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
      <section class="space-y-5 rounded-2xl border border-white/[0.08] bg-surface p-4 sm:p-6 lg:col-span-7">
        <div class="flex items-center justify-between">
          <h2 class="font-display text-base font-semibold text-ink">
            {CivilCalendar.formatMonthYear(props.viewYear, props.viewMonth)}
          </h2>
          <div class="flex items-center gap-1">
            <button
              type="button"
              onClick={() => props.onPrevMonth()}
              aria-label="Previous month"
              class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl text-ink-subtle transition-colors hover:bg-white/[0.06] hover:text-ink"
            >
              <ChevronLeftIcon class="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => props.onNextMonth()}
              aria-label="Next month"
              class="flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl text-ink-subtle transition-colors hover:bg-white/[0.06] hover:text-ink"
            >
              <ChevronRightIcon class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div class="grid grid-cols-7 gap-1 text-center sm:gap-1.5">
          <For each={[0, 1, 2, 3, 4, 5, 6]}>
            {(bit) => (
              <div class="py-1 text-[11px] font-medium text-ink-dim">
                {CivilCalendar.weekdayShortLabel(bit)}
              </div>
            )}
          </For>

          <For each={Array.from({ length: monthGrid().leadingEmpty })}>{() => <div />}</For>

          <For each={monthGrid().days}>
            {(dayIndex) => {
              const local = CivilCalendar.toLocalDate(dayIndex);
              const isFuture = () => dayIndex > props.todayDay;
              const isSelected = () => dayIndex === props.selectedDay;

              const stats = () => {
                if (isFuture()) return { scheduled: 0, done: 0 };
                return monthDayStats().get(dayIndex) ?? { scheduled: 0, done: 0 };
              };

              const tone = createMemo(() =>
                DayCellClassifier.classify(
                  dayIndex,
                  props.todayDay,
                  stats().scheduled,
                  stats().done
                )
              );

              return (
                <button
                  type="button"
                  disabled={isFuture()}
                  onClick={() => {
                    props.onSelectDay(dayIndex);
                    setEditingNoteHabitId(null);
                  }}
                  class={`flex h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border font-mono text-xs tabular-nums transition-colors disabled:cursor-default disabled:opacity-30 ${calendarTileClass(
                    tone(),
                    isSelected()
                  )}`}
                >
                  <span>{local.day}</span>
                  <Show when={stats().scheduled > 0 && !isFuture()}>
                    <span
                      class={`text-[9px] ${
                        tone() === 'complete'
                          ? 'text-accent-tint'
                          : tone().startsWith('missed')
                            ? 'text-danger-soft'
                            : 'text-ink-subtle'
                      }`}
                    >
                      {stats().done}/{stats().scheduled}
                    </span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </section>

      <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface lg:col-span-5">
        <div class="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div>
            <h2 class="font-display text-base font-semibold text-ink">
              {props.selectedDay === props.todayDay
                ? 'Today'
                : CivilCalendar.formatShortDate(props.selectedDay)}
            </h2>
            <p class="text-xs text-ink-subtle">{CivilCalendar.formatFullDate(props.selectedDay)}</p>
          </div>
        </div>

        <Show
          when={selectedDayHabits().length > 0}
          fallback={
            <div class="space-y-3 px-6 py-10 text-center">
              <p class="text-sm text-ink-subtle">
                {props.habitFilter !== 'all' && props.targetHabits.length === 0
                  ? 'No habits selected in filter.'
                  : 'No habits were active on this date.'}
              </p>
              <Show when={props.habitFilter !== 'all'}>
                <button
                  type="button"
                  onClick={() => props.onChangeHabitFilter('all')}
                  class="h-9 cursor-pointer rounded-xl border border-white/[0.08] bg-surface-elevated px-3.5 text-xs font-medium text-ink transition-colors hover:bg-surface-hover"
                >
                  Show All Habits
                </button>
              </Show>
            </div>
          }
        >
          <ul class="divide-y divide-white/[0.06]">
            <For each={selectedDayHabits()}>
              {(habit) => {
                const checkinEntry = () => checkinIndex().get(`${habit.id}:${props.selectedDay}`);
                const activeTarget = () =>
                  HabitSchedule.getAtDay(habit, props.selectedDay).dailyTarget;
                const currentValue = () =>
                  HabitSchedule.getCheckinValueForDay(habit, checkinEntry(), props.selectedDay);
                const isDone = () =>
                  HabitSchedule.isCheckinDoneForDay(habit, checkinEntry(), props.selectedDay);
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
                const scheduleStatusLabel = () => {
                  const day = props.selectedDay;
                  const sched = HabitSchedule.getAtDay(habit, day);
                  const valPrefix =
                    sched.dailyTarget !== null
                      ? `${HabitSchedule.formatNumericValue(currentValue())}/${HabitSchedule.formatNumericValue(sched.dailyTarget)}${habit.unit ? ` ${habit.unit}` : ''} · `
                      : '';
                  if (sched.weeklyTarget !== null) {
                    const weekStart = CivilCalendar.startOfWeek(day);
                    const weekEnd = weekStart + 6;
                    const segs = HabitSchedule.getSegmentsInRange(
                      habit,
                      Math.max(habit.startDay, weekStart),
                      weekEnd
                    );
                    const activeSeg =
                      segs.find((s) => day >= s.start && day <= s.end) ?? segs[segs.length - 1];
                    const evalDay =
                      day <= props.todayDay
                        ? Math.min(activeSeg ? activeSeg.end : weekEnd, props.todayDay)
                        : day;
                    const wk = StreakCalculator.calculateWeeklyProgress(
                      habit,
                      props.snapshot.checkins,
                      evalDay
                    );
                    const flexLabel = wk.isComplete
                      ? `Flexible (${wk.completedDays}/${wk.scheduledDays} wk complete)`
                      : `Flexible (${wk.completedDays}/${wk.scheduledDays} wk)`;
                    const eligibleMask = sched.weekdays & 0x7f || 0x7f;
                    return (
                      valPrefix +
                      (CivilCalendar.isScheduled(eligibleMask, day)
                        ? flexLabel
                        : `Off-schedule day · ${flexLabel}`)
                    );
                  }
                  return (
                    valPrefix +
                    (CivilCalendar.isScheduled(sched.weekdays, day)
                      ? 'Scheduled'
                      : 'Off-schedule day')
                  );
                };
                const noteText = () => noteIndex().get(`${habit.id}:${props.selectedDay}`) ?? '';
                const isEditingNote = () => editingNoteHabitId() === habit.id;

                return (
                  <li class="space-y-2.5 px-5 py-3.5">
                    <div class="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          void props.onToggleCheckin(habit.id, props.selectedDay, !isDone())
                        }
                        aria-pressed={isDone()}
                        aria-label={`Toggle ${habit.name} for ${CivilCalendar.formatShortDate(props.selectedDay)}`}
                        class={`relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border transition-colors ${
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
                        <CheckIcon class="relative z-10 h-4 w-4" />
                      </button>

                      <div class="min-w-0 flex-1">
                        <div class="flex items-start gap-2">
                          <HabitBadge appearanceRaw={habit.color} size="xs" />
                          <p
                            class="line-clamp-2 text-sm font-medium break-words text-ink"
                            title={habit.name}
                          >
                            {habit.name}
                          </p>
                        </div>
                        <p
                          class="line-clamp-2 font-mono text-xs break-words text-ink-subtle tabular-nums"
                          title={
                            noteText() && !isEditingNote()
                              ? `${scheduleStatusLabel()} · ${noteText()}`
                              : scheduleStatusLabel()
                          }
                        >
                          {scheduleStatusLabel()}
                          {noteText() && !isEditingNote() ? ` · ${noteText()}` : ''}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (isEditingNote()) {
                            setEditingNoteHabitId(null);
                          } else {
                            setNoteDraft(noteText());
                            setEditingNoteHabitId(habit.id);
                          }
                        }}
                        aria-label={`Edit note for ${habit.name}`}
                        class={`flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl transition-colors ${
                          noteText() || isEditingNote()
                            ? 'bg-accent/10 text-accent-soft'
                            : 'text-ink-subtle hover:bg-white/[0.05] hover:text-ink'
                        }`}
                      >
                        <NoteIcon class="h-4 w-4" />
                      </button>
                    </div>

                    <Show when={activeTarget() !== null || currentValue() > 0}>
                      <div class="pl-[3.25rem]">
                        <MeasuredQuickControls
                          habitName={habit.name}
                          accentColor={accentColor()}
                          unit={habit.unit}
                          value={currentValue()}
                          target={activeTarget() ?? Math.max(1, currentValue())}
                          onIncrement={(delta) =>
                            props.onIncrementCheckinValue(habit.id, props.selectedDay, delta)
                          }
                          onSetValue={(val) =>
                            props.onSetCheckinValue(habit.id, props.selectedDay, val)
                          }
                        />
                      </div>
                    </Show>

                    <Show when={isEditingNote()}>
                      <div class="flex items-center gap-2">
                        <input
                          type="text"
                          value={noteDraft()}
                          onInput={(e) => setNoteDraft(e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void props
                                .onSaveNote(habit.id, props.selectedDay, noteDraft())
                                .then(() => setEditingNoteHabitId(null));
                            }
                          }}
                          placeholder="Day note..."
                          autofocus
                          class="h-9 flex-1 rounded-xl border border-white/[0.1] bg-canvas px-3 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void props
                              .onSaveNote(habit.id, props.selectedDay, noteDraft())
                              .then(() => setEditingNoteHabitId(null))
                          }
                          class="h-9 cursor-pointer rounded-xl bg-accent px-3.5 text-xs font-medium text-white hover:bg-accent-hover"
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

        <div class="border-t border-white/[0.06]">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-6 py-3">
            <span class="text-xs font-medium text-ink-muted">Tasks</span>
            <span class="font-mono text-[11px] text-ink-subtle tabular-nums">
              {selectedDayTasksCount() === 0
                ? 'None on this day'
                : `${selectedDayTasks().done.length} done${
                    selectedDayTasks().notDone.length > 0
                      ? ` · ${selectedDayTasks().notDone.length} not done`
                      : ''
                  }${
                    selectedDayTasks().archived.length > 0
                      ? ` · ${selectedDayTasks().archived.length} arch`
                      : ''
                  }${
                    selectedDayTasks().dueOpen.length > 0
                      ? ` · ${selectedDayTasks().dueOpen.length} due`
                      : ''
                  }`}
            </span>
          </div>

          <Show when={selectedDayTasksCount() > 0}>
            <ul class="divide-y divide-white/[0.06]">
              <For each={selectedDayTasks().done}>
                {(task) => {
                  const doneDay = () =>
                    task.completedDay ??
                    CivilCalendar.fromTimestamp(task.updatedAt, props.timeZone);
                  const timingHint = () => {
                    if (task.dueDay === null) return 'Goal';
                    return doneDay() <= task.dueDay ? 'On time' : 'Late';
                  };
                  return (
                    <li class="flex items-center gap-3 px-5 py-2.5">
                      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/20 text-accent-tint">
                        <CheckIcon class="h-3.5 w-3.5" />
                      </span>
                      <div class="min-w-0 flex-1">
                        <p
                          class="line-clamp-2 text-xs font-medium break-words text-ink-muted line-through"
                          title={task.title}
                        >
                          {task.title}
                        </p>
                        <p class="line-clamp-2 text-[11px] break-words text-ink-dim">
                          Done · {timingHint()}
                          {task.repeatable ? ' · Repeats' : ''}
                          {task.note ? ` · ${task.note}` : ''}
                        </p>
                      </div>
                    </li>
                  );
                }}
              </For>

              <For each={selectedDayTasks().notDone}>
                {(task) => (
                  <li class="flex items-center gap-3 px-5 py-2.5">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger-soft">
                      <CloseIcon class="h-3.5 w-3.5" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p
                        class="line-clamp-2 text-xs font-medium break-words text-ink-secondary"
                        title={task.title}
                      >
                        {task.title}
                      </p>
                      <p class="line-clamp-2 text-[11px] break-words text-danger-soft/80">
                        Not Done
                        {task.note ? ` · ${task.note}` : ''}
                      </p>
                    </div>
                  </li>
                )}
              </For>

              <For each={selectedDayTasks().archived}>
                {(task) => (
                  <li class="flex items-center gap-3 px-5 py-2.5">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-surface-elevated text-ink-subtle">
                      <ArchiveIcon class="h-3.5 w-3.5" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p
                        class="line-clamp-2 text-xs font-medium break-words text-ink-subtle"
                        title={task.title}
                      >
                        {task.title}
                      </p>
                      <p class="line-clamp-2 text-[11px] break-words text-ink-dim">
                        Archived
                        {task.note ? ` · ${task.note}` : ''}
                      </p>
                    </div>
                  </li>
                )}
              </For>

              <For each={selectedDayTasks().dueOpen}>
                {(task) => (
                  <li class="flex items-center gap-3 px-5 py-2.5">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/[0.15] bg-canvas">
                      <span class="h-1.5 w-1.5 rounded-full bg-accent" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p
                        class="line-clamp-2 text-xs font-medium break-words text-ink"
                        title={task.title}
                      >
                        {task.title}
                      </p>
                      <div class="flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-ink-subtle">
                        <span class="shrink-0">Open · Due</span>
                        <Show when={task.repeatable}>
                          <span aria-hidden="true" class="shrink-0">
                            ·
                          </span>
                          <RepeatIcon class="h-3 w-3 shrink-0 text-accent-soft" />
                        </Show>
                        <Show when={task.note}>
                          <span class="line-clamp-2 max-w-full break-words">· {task.note}</span>
                        </Show>
                      </div>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </section>
    </div>
  );
}

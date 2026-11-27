import { Habit, HabitNote } from '../../types/domain';
import { CivilCalendar } from '../civil-calendar';
import { HabitSchedule } from '../habit-schedule';
import { NoteInsightEntry, NoteKeywordStat, NotesInsightsSummary } from './types';

const STOP_WORDS = new Set([
  // English
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'has',
  'had',
  'was',
  'were',
  'are',
  'but',
  'not',
  'you',
  'your',
  'all',
  'can',
  'just',
  'very',
  'more',
  'out',
  'too',
  'day',
  'days',
  'today',
  'did',
  'done',
  'into',
  'after',
  'before',
  'about',
  'only',
  'then',
  'than',
  'when',
  'what',
  'why',
  'how',
  'some',
  'much',
  // Russian
  'это',
  'как',
  'так',
  'для',
  'что',
  'или',
  'при',
  'без',
  'под',
  'над',
  'про',
  'уже',
  'еще',
  'ещё',
  'был',
  'была',
  'были',
  'было',
  'быть',
  'все',
  'всё',
  'очень',
  'только',
  'день',
  'дня',
  'дней',
  'сегодня',
  'вчера',
  'после',
  'перед',
  'если',
  'когда',
  'чтобы',
  'меня',
  'мне',
  'мой',
  'моя',
  'мои',
  'свой',
  'своя',
  'него',
  'неё',
  'них',
  'тоже',
  'тут',
  'там',
  'раз',
  'два',
  'три',
  'надо',
  'нужно',
  'можно',
  'нет',
  'даже',
]);

export function computeNotesInsights(
  habits: Habit[],
  targetHabitIds: Set<number>,
  notes: HabitNote[],
  doneByHabit: Map<number, Set<number>>,
  startDay: number,
  endDay: number
): NotesInsightsSummary {
  const habitById = new Map<number, Habit>();
  for (const h of habits) habitById.set(h.id, h);

  let notesOnDoneDays = 0;
  let notesOnMissedDays = 0;
  let notesOnUnscheduledDays = 0;
  const keywordMap = new Map<string, { count: number; missedCount: number; doneCount: number }>();
  const entries: NoteInsightEntry[] = [];

  for (const note of notes) {
    if (!targetHabitIds.has(note.habitId)) continue;
    if (note.dayIndex < startDay || note.dayIndex > endDay) continue;
    const trimmed = note.text.trim();
    if (!trimmed) continue;

    const habit = habitById.get(note.habitId);
    if (!habit) continue;

    const doneSet = doneByHabit.get(habit.id) ?? new Set<number>();
    const isDone = doneSet.has(note.dayIndex);
    const sched = HabitSchedule.getAtDay(habit, note.dayIndex);
    const isScheduled =
      sched.weeklyTarget !== null
        ? CivilCalendar.isScheduled(sched.weekdays & 0x7f || 0x7f, note.dayIndex)
        : CivilCalendar.isScheduled(sched.weekdays, note.dayIndex);

    let status: NoteInsightEntry['status'];
    if (isDone) {
      status = 'done';
      notesOnDoneDays += 1;
    } else if (isScheduled) {
      status = 'missed';
      notesOnMissedDays += 1;
    } else {
      status = 'unscheduled';
      notesOnUnscheduledDays += 1;
    }

    entries.push({
      habitId: habit.id,
      habitName: habit.name,
      habitColor: habit.color,
      dayIndex: note.dayIndex,
      text: trimmed,
      status,
    });

    const tokens = trimmed.toLowerCase().match(/#?[\p{L}\p{N}_]{3,}/gu);
    if (tokens) {
      const seenInNote = new Set<string>();
      for (const clean of tokens) {
        if (STOP_WORDS.has(clean) || seenInNote.has(clean)) continue;
        seenInNote.add(clean);
        const stat = keywordMap.get(clean) ?? {
          count: 0,
          missedCount: 0,
          doneCount: 0,
        };
        stat.count += 1;
        if (status === 'missed') stat.missedCount += 1;
        else if (status === 'done') stat.doneCount += 1;
        keywordMap.set(clean, stat);
      }
    }
  }

  entries.sort((a, b) => b.dayIndex - a.dayIndex || a.habitId - b.habitId);

  const topKeywords: NoteKeywordStat[] = Array.from(keywordMap.entries())
    .map(([word, stat]) => ({ word, ...stat }))
    .filter((item) => item.count >= 2 || entries.length <= 4)
    .sort((a, b) => b.count - a.count || b.missedCount - a.missedCount)
    .slice(0, 8);

  return {
    totalNotes: entries.length,
    notesOnDoneDays,
    notesOnMissedDays,
    notesOnUnscheduledDays,
    topKeywords,
    entries,
  };
}

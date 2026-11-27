import { For, JSX, Show, createMemo, createSignal } from 'solid-js';
import { AdvancedAnalyticsReport, AdvancedNotesFilter } from '../../../utils/advanced-analytics';
import { CivilCalendar } from '../../../utils/civil-calendar';
import { HabitBadge } from '../../HabitBadge';

interface NotesInsightsSectionProps {
  report: AdvancedAnalyticsReport;
  notesFilter: AdvancedNotesFilter;
  onChangeNotesFilter: (filter: AdvancedNotesFilter) => void;
  onInspectDayInCalendar: (dayIndex: number) => void;
}

export function NotesInsightsSection(props: NotesInsightsSectionProps): JSX.Element {
  const [selectedKeyword, setSelectedKeyword] = createSignal<string | null>(null);

  const filteredNotes = createMemo(() => {
    const kw = selectedKeyword();
    return props.report.notesInsights.entries.filter((entry) => {
      if (props.notesFilter === 'missed' && entry.status !== 'missed') return false;
      if (props.notesFilter === 'done' && entry.status !== 'done') return false;
      if (kw && !entry.text.toLowerCase().includes(kw)) return false;
      return true;
    });
  });

  return (
    <section class="overflow-hidden rounded-2xl border border-white/[0.08] bg-surface">
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-4 sm:items-center sm:px-6">
        <div>
          <h2 class="font-display text-base font-semibold text-ink">
            Habit Notes &amp; Reflections
          </h2>
          <p class="font-mono text-xs text-ink-subtle tabular-nums">
            {props.report.notesInsights.totalNotes} notes ·{' '}
            {props.report.notesInsights.notesOnDoneDays} on done days ·{' '}
            {props.report.notesInsights.notesOnMissedDays} on missed days
          </p>
        </div>

        <div class="inline-flex items-center rounded-xl border border-white/[0.08] bg-canvas p-0.5">
          <For
            each={
              [
                { id: 'all', label: 'All' },
                { id: 'missed', label: 'Missed days' },
                { id: 'done', label: 'Done days' },
              ] as const
            }
          >
            {(opt) => (
              <button
                type="button"
                onClick={() => props.onChangeNotesFilter(opt.id)}
                class={`shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                  props.notesFilter === opt.id
                    ? 'bg-surface-elevated text-ink'
                    : 'text-ink-subtle hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={props.report.notesInsights.topKeywords.length > 0}>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-white/[0.06] px-4 py-3 text-xs sm:px-6">
          <span class="text-ink-dim">Top terms:</span>
          <For each={props.report.notesInsights.topKeywords}>
            {(kw) => (
              <button
                type="button"
                onClick={() => setSelectedKeyword((prev) => (prev === kw.word ? null : kw.word))}
                class={`cursor-pointer font-mono tabular-nums transition-colors ${
                  selectedKeyword() === kw.word
                    ? 'text-accent-soft underline'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {kw.word} ({kw.count})
              </button>
            )}
          </For>
          <Show when={selectedKeyword()}>
            <button
              type="button"
              onClick={() => setSelectedKeyword(null)}
              class="ml-auto cursor-pointer text-[11px] text-ink-subtle underline hover:text-ink"
            >
              Clear term
            </button>
          </Show>
        </div>
      </Show>

      <Show
        when={filteredNotes().length > 0}
        fallback={
          <div class="px-4 py-10 text-center sm:px-6">
            <p class="text-sm text-ink-subtle">
              {props.report.notesInsights.totalNotes === 0
                ? 'No habit notes recorded in this period.'
                : 'No notes match the current filter.'}
            </p>
          </div>
        }
      >
        <ul class="max-h-96 divide-y divide-white/[0.06] overflow-y-auto">
          <For each={filteredNotes()}>
            {(entry) => (
              <li>
                <button
                  type="button"
                  onClick={() => props.onInspectDayInCalendar(entry.dayIndex)}
                  class="flex w-full cursor-pointer items-start justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02] sm:px-6"
                >
                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <HabitBadge appearanceRaw={entry.habitColor} size="xs" />
                      <span class="font-medium text-ink">{entry.habitName}</span>
                      <span class="text-ink-dim">·</span>
                      <span class="font-mono text-ink-subtle">
                        {CivilCalendar.formatShortDateWithYear(entry.dayIndex)}
                      </span>
                      <span class="text-ink-dim">·</span>
                      <span
                        class={`font-mono ${
                          entry.status === 'done'
                            ? 'text-accent-soft'
                            : entry.status === 'missed'
                              ? 'text-danger-soft'
                              : 'text-ink-subtle'
                        }`}
                      >
                        {entry.status === 'done'
                          ? 'Done'
                          : entry.status === 'missed'
                            ? 'Missed'
                            : 'Rest day'}
                      </span>
                    </div>
                    <p class="text-xs break-words text-ink-secondary">{entry.text}</p>
                  </div>
                  <span class="shrink-0 text-[11px] text-accent-soft">Inspect</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

import { JSX } from 'solid-js';
import {
  AdvancedAnalyticsReport,
  AdvancedHeatmapMode,
  AdvancedNotesFilter,
} from '../../utils/advanced-analytics';
import { CrossDomainHeatmapSection } from './advanced/CrossDomainHeatmapSection';
import { NotesInsightsSection } from './advanced/NotesInsightsSection';
import { ResilienceSection } from './advanced/ResilienceSection';
import { TaskVelocityForecastSection } from './advanced/TaskVelocityForecastSection';

interface HistoryAdvancedPanelProps {
  report: AdvancedAnalyticsReport;
  effectiveRangeStart: number;
  effectiveRangeEnd: number;
  rangeLabel: string;
  selectedDay: number;
  heatmapMode: AdvancedHeatmapMode;
  notesFilter: AdvancedNotesFilter;
  onChangeHeatmapMode: (mode: AdvancedHeatmapMode) => void;
  onChangeNotesFilter: (filter: AdvancedNotesFilter) => void;
  onSelectDay: (dayIndex: number) => void;
  onInspectDayInCalendar: (dayIndex: number) => void;
  onSelectHabitFilter: (filter: 'all' | number[]) => void;
}

export function HistoryAdvancedPanel(props: HistoryAdvancedPanelProps): JSX.Element {
  return (
    <div class="space-y-8">
      <ResilienceSection
        report={props.report}
        effectiveRangeStart={props.effectiveRangeStart}
        effectiveRangeEnd={props.effectiveRangeEnd}
        rangeLabel={props.rangeLabel}
        onSelectHabitFilter={props.onSelectHabitFilter}
      />

      <TaskVelocityForecastSection report={props.report} rangeLabel={props.rangeLabel} />

      <CrossDomainHeatmapSection
        report={props.report}
        selectedDay={props.selectedDay}
        heatmapMode={props.heatmapMode}
        onChangeHeatmapMode={props.onChangeHeatmapMode}
        onSelectDay={props.onSelectDay}
        onInspectDayInCalendar={props.onInspectDayInCalendar}
      />

      <NotesInsightsSection
        report={props.report}
        notesFilter={props.notesFilter}
        onChangeNotesFilter={props.onChangeNotesFilter}
        onInspectDayInCalendar={props.onInspectDayInCalendar}
      />
    </div>
  );
}

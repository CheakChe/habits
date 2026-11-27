import { DayCellTone } from '../../utils/date-range';

export function heatmapSquareClass(tone: DayCellTone): string {
  switch (tone) {
    case 'complete':
      return 'bg-accent';
    case 'missed-slight':
      return 'bg-heat-1';
    case 'missed-moderate':
      return 'bg-heat-2';
    case 'missed-heavy':
      return 'bg-heat-3';
    case 'missed-all':
      return 'bg-danger';
    case 'today-open':
      return 'bg-heat-today border border-danger/40';
    case 'unscheduled':
    case 'future':
    default:
      return 'bg-surface-heat border border-white/[0.06]';
  }
}

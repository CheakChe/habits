import { DomainSnapshot } from '../types/domain';
import { CivilCalendar } from './civil-calendar';

export type DateRangePresetId =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'prev_week'
  | 'last_7'
  | 'this_month'
  | 'prev_month'
  | 'last_30'
  | '3_months'
  | 'last_90'
  | '6_months'
  | 'last_180'
  | 'this_year'
  | 'prev_year'
  | 'last_365'
  | 'all_time'
  | 'custom';

export interface DateRangePresetOption {
  id: DateRangePresetId;
  label: string;
}

export const DATE_RANGE_PRESETS: DateRangePresetOption[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This Week' },
  { id: 'prev_week', label: 'Previous Week' },
  { id: 'last_7', label: 'Last 7 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'prev_month', label: 'Previous Month' },
  { id: 'last_30', label: 'Last 30 Days' },
  { id: '3_months', label: '3 Months' },
  { id: 'last_90', label: 'Last 90 Days' },
  { id: '6_months', label: '6 Months' },
  { id: 'last_180', label: 'Last 180 Days' },
  { id: 'this_year', label: 'This Year' },
  { id: 'prev_year', label: 'Previous Year' },
  { id: 'last_365', label: 'Last 365 Days' },
  { id: 'all_time', label: 'All Time' },
  { id: 'custom', label: 'Custom' },
];

export interface ResolvedDateRange {
  preset: DateRangePresetId;
  startDay: number;
  endDay: number;
  label: string;
}

export type DayCellTone =
  | 'future'
  | 'unscheduled'
  | 'today-open'
  | 'missed-all'
  | 'missed-heavy'
  | 'missed-moderate'
  | 'missed-slight'
  | 'complete';

export class DateRangeResolver {
  public static findEarliestActivityDay(
    snapshot: DomainSnapshot,
    todayDay: number,
    timeZone?: string
  ): number {
    let earliest: number | null = null;
    const consider = (day: number) => {
      if (earliest === null || day < earliest) {
        earliest = day;
      }
    };

    for (const h of snapshot.habits) {
      consider(h.startDay);
    }
    for (const c of snapshot.checkins) {
      consider(c.dayIndex);
    }
    for (const t of snapshot.tasks) {
      if (t.deletedAt !== null) continue;
      if (t.completedDay !== null) {
        consider(t.completedDay);
      } else {
        consider(CivilCalendar.fromTimestamp(t.createdAt, timeZone));
      }
    }

    if (earliest === null) {
      return todayDay - 29;
    }
    return Math.min(earliest, todayDay);
  }

  public static resolve(
    preset: DateRangePresetId,
    todayDay: number,
    options?: {
      customStartDay?: number;
      customEndDay?: number;
      snapshot?: DomainSnapshot;
      timeZone?: string;
    }
  ): ResolvedDateRange {
    const local = CivilCalendar.toLocalDate(todayDay);
    const label =
      DATE_RANGE_PRESETS.find((p) => p.id === preset)?.label ?? 'Custom';

    switch (preset) {
      case 'today':
        return { preset, startDay: todayDay, endDay: todayDay, label };

      case 'yesterday':
        return {
          preset,
          startDay: todayDay - 1,
          endDay: todayDay - 1,
          label,
        };

      case 'this_week': {
        const weekStart = CivilCalendar.startOfWeek(todayDay);
        return { preset, startDay: weekStart, endDay: todayDay, label };
      }

      case 'prev_week': {
        const weekStart = CivilCalendar.startOfWeek(todayDay);
        return {
          preset,
          startDay: weekStart - 7,
          endDay: weekStart - 1,
          label,
        };
      }

      case 'last_7':
        return { preset, startDay: todayDay - 6, endDay: todayDay, label };

      case 'this_month': {
        const monthStart = CivilCalendar.fromLocalDate(local.year, local.month, 1);
        return { preset, startDay: monthStart, endDay: todayDay, label };
      }

      case 'prev_month': {
        const thisMonthStart = CivilCalendar.fromLocalDate(local.year, local.month, 1);
        const prevYear = local.month === 1 ? local.year - 1 : local.year;
        const prevMonth = local.month === 1 ? 12 : local.month - 1;
        const prevMonthStart = CivilCalendar.fromLocalDate(prevYear, prevMonth, 1);
        return {
          preset,
          startDay: prevMonthStart,
          endDay: thisMonthStart - 1,
          label,
        };
      }

      case 'last_30':
        return { preset, startDay: todayDay - 29, endDay: todayDay, label };

      case '3_months':
        return {
          preset,
          startDay: CivilCalendar.addMonths(todayDay, -3),
          endDay: todayDay,
          label,
        };

      case 'last_90':
        return { preset, startDay: todayDay - 89, endDay: todayDay, label };

      case '6_months':
        return {
          preset,
          startDay: CivilCalendar.addMonths(todayDay, -6),
          endDay: todayDay,
          label,
        };

      case 'last_180':
        return { preset, startDay: todayDay - 179, endDay: todayDay, label };

      case 'this_year':
        return {
          preset,
          startDay: CivilCalendar.fromLocalDate(local.year, 1, 1),
          endDay: todayDay,
          label,
        };

      case 'prev_year':
        return {
          preset,
          startDay: CivilCalendar.fromLocalDate(local.year - 1, 1, 1),
          endDay: CivilCalendar.fromLocalDate(local.year - 1, 12, 31),
          label,
        };

      case 'last_365':
        return { preset, startDay: todayDay - 364, endDay: todayDay, label };

      case 'all_time': {
        const startDay = options?.snapshot
          ? DateRangeResolver.findEarliestActivityDay(
              options.snapshot,
              todayDay,
              options.timeZone
            )
          : todayDay - 29;
        return { preset, startDay, endDay: todayDay, label };
      }

      case 'custom': {
        const rawStart = options?.customStartDay ?? todayDay - 29;
        const rawEnd = options?.customEndDay ?? todayDay;
        return {
          preset,
          startDay: Math.min(rawStart, rawEnd),
          endDay: Math.max(rawStart, rawEnd),
          label,
        };
      }
    }
  }

  public static formatRangeLabel(startDay: number, endDay: number): string {
    if (startDay === endDay) {
      return CivilCalendar.formatShortDateWithYear(startDay);
    }
    const s = CivilCalendar.toLocalDate(startDay);
    const e = CivilCalendar.toLocalDate(endDay);
    if (s.year === e.year) {
      return `${CivilCalendar.formatShortDate(startDay)} – ${CivilCalendar.formatShortDateWithYear(endDay)}`;
    }
    return `${CivilCalendar.formatShortDateWithYear(startDay)} – ${CivilCalendar.formatShortDateWithYear(endDay)}`;
  }
}

export class DayCellClassifier {
  public static classify(
    dayIndex: number,
    todayDay: number,
    scheduled: number,
    done: number
  ): DayCellTone {
    if (dayIndex > todayDay) {
      return 'future';
    }
    if (scheduled <= 0) {
      return 'unscheduled';
    }
    if (done >= scheduled) {
      return 'complete';
    }
    if (dayIndex === todayDay && done === 0) {
      return 'today-open';
    }
    if (done <= 0) {
      return 'missed-all';
    }
    const ratio = done / scheduled;
    if (ratio < 0.35) {
      return 'missed-heavy';
    }
    if (ratio < 0.7) {
      return 'missed-moderate';
    }
    return 'missed-slight';
  }
}

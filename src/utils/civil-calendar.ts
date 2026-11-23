const MS_PER_DAY = 86_400_000;

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_NAMES_FULL = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

const WEEKDAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export class CivilCalendar {
  /**
   * Returns civil dayIndex (days since 1970-01-01) for `now` in the given IANA timezone
   * (e.g. 'UTC', 'Europe/Kyiv', or 'local'/undefined for device local timezone).
   */
  public static todayDayIndex(now: Date = new Date(), timeZone?: string): number {
    return CivilCalendar.fromTimestamp(now.getTime(), timeZone);
  }

  /**
   * Converts a local civil date (1-indexed month & day) to integer dayIndex since 1970-01-01.
   */
  public static fromLocalDate(year: number, month: number, day: number): number {
    const utcMs = Date.UTC(year, month - 1, day);
    return Math.floor(utcMs / MS_PER_DAY);
  }

  /**
   * Converts a Unix ms timestamp into a civil dayIndex using device local timezone
   * (when timeZone is omitted or 'local') or an explicit IANA timezone such as 'UTC'.
   */
  public static fromTimestamp(timestampMs: number, timeZone?: string): number {
    const d = new Date(timestampMs);
    if (!timeZone || timeZone === 'local') {
      return CivilCalendar.fromLocalDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    if (timeZone.toUpperCase() === 'UTC') {
      return CivilCalendar.fromLocalDate(
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate()
      );
    }
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const year = Number(parts.find((p) => p.type === 'year')?.value);
      const month = Number(parts.find((p) => p.type === 'month')?.value);
      const day = Number(parts.find((p) => p.type === 'day')?.value);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        return CivilCalendar.fromLocalDate(year, month, day);
      }
    } catch {
      // Fallback to UTC if an unsupported timezone string is provided.
    }
    return CivilCalendar.fromLocalDate(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate()
    );
  }

  /**
   * Converts integer dayIndex back to local civil { year, month (1-12), day (1-31) }.
   */
  public static toLocalDate(dayIndex: number): { year: number; month: number; day: number } {
    const d = new Date(dayIndex * MS_PER_DAY);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
    };
  }

  public static shiftDays(dayIndex: number, deltaDays: number): number {
    return dayIndex + deltaDays;
  }

  public static addMonths(dayIndex: number, deltaMonths: number): number {
    const { year, month, day } = CivilCalendar.toLocalDate(dayIndex);
    const totalMonths = year * 12 + (month - 1) + deltaMonths;
    const targetYear = Math.floor(totalMonths / 12);
    const targetMonth = ((totalMonths % 12) + 12) % 12 + 1;
    const nextMonthYear = targetMonth === 12 ? targetYear + 1 : targetYear;
    const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1;
    const daysInTargetMonth =
      CivilCalendar.fromLocalDate(nextMonthYear, nextMonth, 1) -
      CivilCalendar.fromLocalDate(targetYear, targetMonth, 1);
    const clampedDay = Math.min(day, daysInTargetMonth);
    return CivilCalendar.fromLocalDate(targetYear, targetMonth, clampedDay);
  }

  /**
   * Returns weekday bit index: 0 = Monday .. 6 = Sunday.
   * 1970-01-01 (dayIndex 0) was Thursday (bit 3).
   */
  public static weekdayBit(dayIndex: number): number {
    return (((dayIndex + 3) % 7) + 7) % 7;
  }

  public static isScheduled(weekdaysMask: number, dayIndex: number): boolean {
    const bit = CivilCalendar.weekdayBit(dayIndex);
    return (weekdaysMask & (1 << bit)) !== 0;
  }

  public static countScheduledDays(weekdaysMask: number): number {
    const mask = weekdaysMask & 0x7f;
    let count = 0;
    for (let bit = 0; bit < 7; bit++) {
      if ((mask & (1 << bit)) !== 0) {
        count += 1;
      }
    }
    return count;
  }

  public static countScheduledInRange(
    weekdaysMask: number,
    startDay: number,
    endDay: number
  ): number {
    if (endDay < startDay) return 0;
    const mask = weekdaysMask & 0x7f;
    if (mask === 0) return 0;
    if (mask === 0x7f) return endDay - startDay + 1;
    let count = 0;
    for (let d = startDay; d <= endDay; d++) {
      if (CivilCalendar.isScheduled(mask, d)) {
        count += 1;
      }
    }
    return count;
  }

  public static weekdayShortLabel(bit: number): string {
    return WEEKDAY_NAMES_SHORT[bit] ?? '';
  }

  public static weekdayFullLabel(bit: number): string {
    return WEEKDAY_NAMES_FULL[bit] ?? '';
  }

  public static formatShortDate(dayIndex: number): string {
    const { month, day } = CivilCalendar.toLocalDate(dayIndex);
    return `${MONTH_NAMES_SHORT[month - 1]} ${day}`;
  }

  public static formatShortDateWithYear(dayIndex: number): string {
    const { year, month, day } = CivilCalendar.toLocalDate(dayIndex);
    return `${MONTH_NAMES_SHORT[month - 1]} ${day}, ${year}`;
  }

  public static formatFullDate(dayIndex: number): string {
    const { year, month, day } = CivilCalendar.toLocalDate(dayIndex);
    const weekday = WEEKDAY_NAMES_FULL[CivilCalendar.weekdayBit(dayIndex)];
    return `${weekday}, ${MONTH_NAMES_SHORT[month - 1]} ${day}, ${year}`;
  }

  public static formatMonthYear(year: number, month: number): string {
    return `${MONTH_NAMES_FULL[month - 1]} ${year}`;
  }

  public static toInputDateValue(dayIndex: number): string {
    const { year, month, day } = CivilCalendar.toLocalDate(dayIndex);
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }

  public static fromInputDateValue(value: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return CivilCalendar.fromLocalDate(year, month, day);
  }

  public static getMonthDays(year: number, month: number): { leadingEmpty: number; days: number[] } {
    const firstDay = CivilCalendar.fromLocalDate(year, month, 1);
    const nextMonthYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextFirstDay = CivilCalendar.fromLocalDate(nextMonthYear, nextMonth, 1);
    const totalDays = nextFirstDay - firstDay;
    const leadingEmpty = CivilCalendar.weekdayBit(firstDay);
    const days: number[] = [];
    for (let i = 0; i < totalDays; i++) {
      days.push(firstDay + i);
    }
    return { leadingEmpty, days };
  }

  public static startOfWeek(dayIndex: number): number {
    return dayIndex - CivilCalendar.weekdayBit(dayIndex);
  }

  public static isValidTimeZone(timeZone: string): boolean {
    if (timeZone === 'UTC' || timeZone === 'local') return true;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return true;
    } catch {
      return false;
    }
  }

  public static getDeviceTimeZone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }

  public static getAvailableTimeZones(): string[] {
    const fallback = [
      'UTC',
      'Europe/London',
      'Europe/Berlin',
      'Europe/Kyiv',
      'Europe/Warsaw',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Asia/Dubai',
      'Asia/Almaty',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Australia/Sydney',
    ];
    try {
      const intlAny = Intl as unknown as {
        supportedValuesOf?: (key: string) => string[];
      };
      if (typeof intlAny.supportedValuesOf === 'function') {
        const zones = intlAny.supportedValuesOf('timeZone');
        const withoutUtc = zones.filter((z) => z !== 'UTC');
        return ['UTC', ...withoutUtc];
      }
    } catch {
      // ignore and return fallback list
    }
    return fallback;
  }

  public static formatClockInTimeZone(now: Date, timeZone: string): string {
    const effectiveZone =
      !timeZone || timeZone === 'local' ? CivilCalendar.getDeviceTimeZone() : timeZone;
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: effectiveZone,
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);
    } catch {
      return now.toISOString().slice(0, 16).replace('T', ' ');
    }
  }
}

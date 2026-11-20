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
   * Returns local civil dayIndex (days since 1970-01-01) using device local year, month, day.
   */
  public static todayDayIndex(now: Date = new Date()): number {
    return CivilCalendar.fromLocalDate(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate()
    );
  }

  /**
   * Converts a local civil date (1-indexed month & day) to integer dayIndex since 1970-01-01.
   */
  public static fromLocalDate(year: number, month: number, day: number): number {
    const utcMs = Date.UTC(year, month - 1, day);
    return Math.floor(utcMs / MS_PER_DAY);
  }

  /**
   * Converts a Unix ms timestamp into a local civil dayIndex using device timezone.
   */
  public static fromTimestamp(timestampMs: number): number {
    const d = new Date(timestampMs);
    return CivilCalendar.fromLocalDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
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
}

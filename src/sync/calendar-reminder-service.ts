import { DomainSnapshot, SessionMode } from '../types/domain';
import { ReminderPreferences } from '../utils/reminder-planner';
import {
  CalendarSyncApplyResult,
  CalendarSyncExecutor,
  CalendarSyncPlan,
} from './calendar-sync-executor';

export type { CalendarSyncApplyResult, CalendarSyncPlan };

export class CalendarReminderService {
  private readonly executor: CalendarSyncExecutor;

  constructor(executor: CalendarSyncExecutor = new CalendarSyncExecutor()) {
    this.executor = executor;
  }

  public async syncRemoteCalendarId(
    mode: SessionMode | null,
    accessToken: string | null,
    localCalendarId: string | null,
    trackerTimeZone: string,
    localPrefs?: Pick<
      ReminderPreferences,
      'taskReminderSlotId' | 'horizonDays' | 'calendarEnabled'
    > & {
      timeZoneUpdatedAt?: number;
    }
  ): Promise<{
    calendarId: string | null;
    timeZone: string | null;
    timeZoneUpdatedAt?: number;
    taskReminderSlotId?: string | null;
    horizonDays?: number;
    calendarEnabled?: boolean;
    updatedAt?: number;
  } | null> {
    return this.executor.syncRemoteCalendarId(
      mode,
      accessToken,
      localCalendarId,
      trackerTimeZone,
      localPrefs
    );
  }

  public async prepareSyncPlan(
    mode: SessionMode | null,
    accessToken: string | null,
    snapshot: DomainSnapshot,
    todayDay: number,
    prefs: ReminderPreferences,
    trackerTimeZone: string
  ): Promise<CalendarSyncPlan> {
    return this.executor.prepareSyncPlan(
      mode,
      accessToken,
      snapshot,
      todayDay,
      prefs,
      trackerTimeZone
    );
  }

  public async applySyncPlan(
    mode: SessionMode | null,
    accessToken: string | null,
    plan: CalendarSyncPlan,
    prefs?: Pick<ReminderPreferences, 'taskReminderSlotId' | 'horizonDays' | 'calendarEnabled'> & {
      timeZoneUpdatedAt?: number;
    }
  ): Promise<CalendarSyncApplyResult> {
    return this.executor.applySyncPlan(mode, accessToken, plan, prefs);
  }

  public async deleteReminderCalendar(
    mode: SessionMode | null,
    accessToken: string | null,
    calendarId: string
  ): Promise<void> {
    await this.executor.deleteReminderCalendar(mode, accessToken, calendarId);
  }
}

import { DomainSnapshot, SessionMode } from '../types/domain';
import { Helpers, NonRetryableError } from '../utils/helpers';
import {
  DesiredReminderEvent,
  ReminderPlanner,
  ReminderPreferences,
} from '../utils/reminder-planner';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const SECONDARY_CALENDAR_SUMMARY = 'Habits Reminders';
const SECONDARY_CALENDAR_DESCRIPTION =
  'Smart daily reminders managed by Habits tracker. Completed days are cleared automatically.';

export interface ExistingReminderEvent {
  id: string;
  dayIndex: number | null;
  summary: string;
  signature: string | null;
  startDateTime: string | null;
}

export interface CalendarSyncPlan {
  calendarId: string | null;
  willCreateCalendar: boolean;
  willUpdateCalendarTz: boolean;
  timeZone: string;
  todayDay: number;
  todayCleared: boolean;
  toCreate: DesiredReminderEvent[];
  toUpdate: { existingId: string; desired: DesiredReminderEvent }[];
  toDelete: { existingId: string; summary: string; dayIndex: number | null }[];
  unchangedCount: number;
  targetSignature: string;
  desiredEvents: DesiredReminderEvent[];
}

export interface CalendarSyncApplyResult {
  calendarId: string;
  timeZone: string;
  created: number;
  updated: number;
  deleted: number;
  targetSignature: string;
}

function mapHttpError(status: number, bodyText: string, action: string): Error {
  const details = bodyText.slice(0, 180);
  if (status === 401) {
    return new NonRetryableError(
      'Google authorization expired. Click Reconnect Drive/Google and try again.'
    );
  }
  if (status === 403) {
    if (/insufficient|permission|scope/i.test(bodyText)) {
      return new NonRetryableError(
        'Google Calendar permission is missing. Reconnect your Google account to grant Calendar access.'
      );
    }
    if (/rateLimitExceeded|userRateLimitExceeded|quota/i.test(bodyText)) {
      return new Error(`Google Calendar rate limit reached while ${action}. Retrying...`);
    }
    return new NonRetryableError(
      `Google Calendar denied access (${status}): ${details || action}`
    );
  }
  if (status === 404 || status === 410) {
    return new NonRetryableError(`Google Calendar resource not found (${status}) during ${action}.`);
  }
  if (status === 429 || status >= 500) {
    return new Error(`Google Calendar temporary error (${status}) while ${action}.`);
  }
  return new NonRetryableError(
    `Google Calendar error (${status}) while ${action}: ${details}`
  );
}

interface GoogleCalendarResource {
  id?: string;
  timeZone?: string;
}

interface GoogleEventListResponse {
  items?: Array<{
    id?: string;
    status?: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
    extendedProperties?: {
      private?: Record<string, string>;
    };
  }>;
}

export class CalendarReminderService {
  private authHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }

  private assertAuthorized(mode: SessionMode | null, accessToken: string | null): string {
    if (mode !== 'google') {
      throw new NonRetryableError('Google Calendar reminders require Google Sign-In mode.');
    }
    if (!accessToken) {
      throw new NonRetryableError(
        'Google authorization expired. Click Reconnect Drive/Google and try again.'
      );
    }
    return accessToken;
  }

  private async fetchCalendarMeta(
    accessToken: string,
    calendarId: string
  ): Promise<GoogleCalendarResource | null> {
    const res = await fetch(
      `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}`,
      { headers: this.authHeaders(accessToken) }
    );
    if (res.status === 404 || res.status === 410) {
      return null;
    }
    if (!res.ok) {
      throw mapHttpError(res.status, await res.text(), 'checking reminders calendar');
    }
    return (await res.json()) as GoogleCalendarResource;
  }

  private async listCalendarEvents(
    accessToken: string,
    calendarId: string
  ): Promise<ExistingReminderEvent[]> {
    const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&maxResults=250`;
    const res = await Helpers.withRetry(async () => {
      const response = await fetch(url, {
        headers: this.authHeaders(accessToken),
      });
      if (!response.ok) {
        throw mapHttpError(response.status, await response.text(), 'listing reminder events');
      }
      return response;
    });

    const data = (await res.json()) as GoogleEventListResponse;
    const events: ExistingReminderEvent[] = [];
    for (const item of data.items ?? []) {
      if (!item.id || item.status === 'cancelled') continue;
      const priv = item.extendedProperties?.private;
      const rawDay = priv?.habitsDayIndex;
      const parsedDay =
        rawDay !== undefined && /^-?\d+$/.test(rawDay) ? Number(rawDay) : null;
      events.push({
        id: item.id,
        dayIndex: parsedDay,
        summary: item.summary ?? 'Habits Reminder',
        signature: priv?.habitsSignature ?? null,
        startDateTime: item.start?.dateTime ?? item.start?.date ?? null,
      });
    }
    return events;
  }

  public async prepareSyncPlan(
    mode: SessionMode | null,
    accessToken: string | null,
    snapshot: DomainSnapshot,
    todayDay: number,
    prefs: ReminderPreferences,
    trackerTimeZone: string
  ): Promise<CalendarSyncPlan> {
    const token = this.assertAuthorized(mode, accessToken);
    const timeZone = ReminderPlanner.resolveCalendarTimeZone(trackerTimeZone);
    const desiredEvents = ReminderPlanner.buildDesiredEvents(
      snapshot,
      todayDay,
      prefs,
      trackerTimeZone
    );
    const targetSignature = ReminderPlanner.computeStateSignature(
      snapshot,
      todayDay,
      prefs,
      trackerTimeZone
    );

    let resolvedCalendarId = prefs.calendarId;
    let willCreateCalendar = false;
    let willUpdateCalendarTz = false;
    let existingEvents: ExistingReminderEvent[] = [];

    if (resolvedCalendarId) {
      const meta = await Helpers.withRetry(() =>
        this.fetchCalendarMeta(token, resolvedCalendarId!)
      );
      if (!meta || !meta.id) {
        resolvedCalendarId = null;
        willCreateCalendar = true;
      } else {
        willUpdateCalendarTz = meta.timeZone !== timeZone;
        existingEvents = await this.listCalendarEvents(token, resolvedCalendarId);
      }
    } else {
      willCreateCalendar = true;
    }

    const desiredByDay = new Map<number, DesiredReminderEvent>();
    for (const desired of desiredEvents) {
      desiredByDay.set(desired.dayIndex, desired);
    }

    const toDelete: CalendarSyncPlan['toDelete'] = [];
    const toUpdate: CalendarSyncPlan['toUpdate'] = [];
    const matchedDays = new Set<number>();
    let unchangedCount = 0;
    let todayCleared = false;

    for (const existing of existingEvents) {
      if (
        existing.dayIndex === null ||
        existing.dayIndex < todayDay ||
        matchedDays.has(existing.dayIndex)
      ) {
        toDelete.push({
          existingId: existing.id,
          summary: existing.summary,
          dayIndex: existing.dayIndex,
        });
        continue;
      }

      const desired = desiredByDay.get(existing.dayIndex);
      if (!desired) {
        if (existing.dayIndex === todayDay) {
          todayCleared = true;
        }
        toDelete.push({
          existingId: existing.id,
          summary: existing.summary,
          dayIndex: existing.dayIndex,
        });
        continue;
      }

      matchedDays.add(existing.dayIndex);
      if (existing.signature === desired.signature) {
        unchangedCount += 1;
      } else {
        toUpdate.push({ existingId: existing.id, desired });
      }
    }

    const toCreate: DesiredReminderEvent[] = [];
    for (const desired of desiredEvents) {
      if (!matchedDays.has(desired.dayIndex)) {
        toCreate.push(desired);
      }
    }

    const pendingToday = ReminderPlanner.getTodayPendingSummary(snapshot, todayDay);
    if (pendingToday.totalPendingCount === 0 && !desiredByDay.has(todayDay)) {
      todayCleared = true;
    }

    return {
      calendarId: resolvedCalendarId,
      willCreateCalendar,
      willUpdateCalendarTz,
      timeZone,
      todayDay,
      todayCleared,
      toCreate,
      toUpdate,
      toDelete,
      unchangedCount,
      targetSignature,
      desiredEvents,
    };
  }

  private buildEventBody(desired: DesiredReminderEvent): Record<string, unknown> {
    return {
      summary: desired.summary,
      description: desired.description,
      start: {
        dateTime: desired.startDateTime,
        timeZone: desired.timeZone,
      },
      end: {
        dateTime: desired.endDateTime,
        timeZone: desired.timeZone,
      },
      transparency: 'transparent',
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 0 }],
      },
      extendedProperties: {
        private: {
          habitsSource: 'habits',
          habitsDayIndex: String(desired.dayIndex),
          habitsSignature: desired.signature,
        },
      },
    };
  }

  public async applySyncPlan(
    mode: SessionMode | null,
    accessToken: string | null,
    plan: CalendarSyncPlan
  ): Promise<CalendarSyncApplyResult> {
    const token = this.assertAuthorized(mode, accessToken);
    let calendarId = plan.calendarId;

    if (!calendarId || plan.willCreateCalendar) {
      const createdCalRes = await Helpers.withRetry(async () => {
        const res = await fetch(`${CALENDAR_API_BASE}/calendars`, {
          method: 'POST',
          headers: {
            ...this.authHeaders(token),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: SECONDARY_CALENDAR_SUMMARY,
            description: SECONDARY_CALENDAR_DESCRIPTION,
            timeZone: plan.timeZone,
          }),
        });
        if (!res.ok) {
          throw mapHttpError(res.status, await res.text(), 'creating reminders calendar');
        }
        return res;
      });
      const createdCal = (await createdCalRes.json()) as GoogleCalendarResource;
      if (!createdCal.id) {
        throw new NonRetryableError('Google Calendar did not return a calendar ID.');
      }
      calendarId = createdCal.id;
    } else if (plan.willUpdateCalendarTz) {
      await Helpers.withRetry(async () => {
        const res = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId!)}`,
          {
            method: 'PATCH',
            headers: {
              ...this.authHeaders(token),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ timeZone: plan.timeZone }),
          }
        );
        if (!res.ok) {
          throw mapHttpError(res.status, await res.text(), 'updating calendar timezone');
        }
        return res;
      });
    }

    let deleted = 0;
    for (const item of plan.toDelete) {
      await Helpers.withRetry(async () => {
        const res = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId!)}/events/${encodeURIComponent(item.existingId)}`,
          {
            method: 'DELETE',
            headers: this.authHeaders(token),
          }
        );
        if (res.status === 404 || res.status === 410) {
          return res;
        }
        if (!res.ok) {
          throw mapHttpError(res.status, await res.text(), 'removing reminder event');
        }
        return res;
      });
      deleted += 1;
    }

    let updated = 0;
    for (const item of plan.toUpdate) {
      await Helpers.withRetry(async () => {
        const res = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId!)}/events/${encodeURIComponent(item.existingId)}`,
          {
            method: 'PATCH',
            headers: {
              ...this.authHeaders(token),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(this.buildEventBody(item.desired)),
          }
        );
        if (!res.ok) {
          throw mapHttpError(res.status, await res.text(), 'updating reminder event');
        }
        return res;
      });
      updated += 1;
    }

    let created = 0;
    for (const desired of plan.toCreate) {
      await Helpers.withRetry(async () => {
        const res = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId!)}/events`,
          {
            method: 'POST',
            headers: {
              ...this.authHeaders(token),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(this.buildEventBody(desired)),
          }
        );
        if (!res.ok) {
          throw mapHttpError(res.status, await res.text(), 'creating reminder event');
        }
        return res;
      });
      created += 1;
    }

    return {
      calendarId,
      timeZone: plan.timeZone,
      created,
      updated,
      deleted,
      targetSignature: plan.targetSignature,
    };
  }

  public async deleteReminderCalendar(
    mode: SessionMode | null,
    accessToken: string | null,
    calendarId: string
  ): Promise<void> {
    const token = this.assertAuthorized(mode, accessToken);
    if (!calendarId.trim()) return;

    await Helpers.withRetry(async () => {
      const res = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}`,
        {
          method: 'DELETE',
          headers: this.authHeaders(token),
        }
      );
      if (res.status === 404 || res.status === 410) {
        return res;
      }
      if (!res.ok) {
        throw mapHttpError(res.status, await res.text(), 'deleting reminders calendar');
      }
      return res;
    });
  }
}

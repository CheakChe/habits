import { DomainSnapshot, SessionMode } from '../types/domain';
import { Helpers, NonRetryableError } from '../utils/helpers';
import {
  DesiredReminderEvent,
  ReminderPlanner,
  ReminderPreferences,
} from '../utils/reminder-planner';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const REMOTE_REMINDER_META_FILENAME = 'habits-reminders.json';
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
  duplicateCalendarIds: string[];
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
  duplicatesRemoved: number;
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
  summary?: string;
  description?: string;
  timeZone?: string;
  deleted?: boolean;
}

interface GoogleCalendarListResponse {
  items?: GoogleCalendarResource[];
  nextPageToken?: string;
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

interface DriveMetaFileEntry {
  id: string;
  modifiedTime?: string;
}

interface RemoteReminderMeta {
  calendarId: string | null;
  timeZone?: string | null;
  reminderTime?: string;
  horizonDays?: number;
  calendarEnabled?: boolean;
  knownCalendarIds?: string[];
  updatedAt?: number;
}

interface RemoteReminderMetaState {
  fileId: string | null;
  duplicateFileIds: string[];
  meta: RemoteReminderMeta | null;
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

  private async findRemoteMetaFiles(token: string): Promise<DriveMetaFileEntry[]> {
    const query = encodeURIComponent(
      `name='${REMOTE_REMINDER_META_FILENAME}' and trashed=false`
    );
    const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${query}&fields=files(id,modifiedTime)&pageSize=20`;

    return Helpers.withRetry(async () => {
      const response = await fetch(url, {
        headers: this.authHeaders(token),
      });
      if (response.status === 401) {
        throw mapHttpError(401, await response.text(), 'reading synced reminder config');
      }
      if (response.status === 403 || response.status === 404) {
        return [];
      }
      if (!response.ok) {
        throw mapHttpError(response.status, await response.text(), 'reading synced reminder config');
      }
      const data = (await response.json()) as { files?: DriveMetaFileEntry[] };
      return [...(data.files ?? [])].sort((a, b) => {
        const ta = a.modifiedTime ? Date.parse(a.modifiedTime) : 0;
        const tb = b.modifiedTime ? Date.parse(b.modifiedTime) : 0;
        if (tb !== ta) return tb - ta;
        return a.id.localeCompare(b.id);
      });
    });
  }

  private async readRemoteReminderMeta(token: string): Promise<RemoteReminderMetaState> {
    const files = await this.findRemoteMetaFiles(token);
    if (files.length === 0) {
      return { fileId: null, duplicateFileIds: [], meta: null };
    }

    const primaryFileId = files[0].id;
    const duplicateFileIds = files.slice(1).map((f) => f.id);
    const url = `${DRIVE_FILES_URL}/${encodeURIComponent(primaryFileId)}?alt=media`;

    const meta = await Helpers.withRetry(async () => {
      const response = await fetch(url, {
        headers: this.authHeaders(token),
      });
      if (response.status === 401) {
        throw mapHttpError(401, await response.text(), 'downloading synced reminder config');
      }
      if (response.status === 403 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw mapHttpError(
          response.status,
          await response.text(),
          'downloading synced reminder config'
        );
      }
      const rawText = await response.text();
      try {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        const calendarId =
          typeof parsed.calendarId === 'string' && parsed.calendarId.trim().length > 0
            ? parsed.calendarId.trim()
            : null;
        const knownCalendarIds = Array.isArray(parsed.knownCalendarIds)
          ? parsed.knownCalendarIds.filter(
              (id): id is string => typeof id === 'string' && id.trim().length > 0
            )
          : undefined;
        return {
          calendarId,
          timeZone: typeof parsed.timeZone === 'string' ? parsed.timeZone : null,
          reminderTime:
            typeof parsed.reminderTime === 'string'
              ? ReminderPlanner.normalizeTime(parsed.reminderTime)
              : undefined,
          horizonDays:
            typeof parsed.horizonDays === 'number'
              ? ReminderPlanner.normalizeHorizonDays(parsed.horizonDays)
              : undefined,
          calendarEnabled:
            typeof parsed.calendarEnabled === 'boolean' ? parsed.calendarEnabled : undefined,
          knownCalendarIds,
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : undefined,
        } satisfies RemoteReminderMeta;
      } catch {
        return null;
      }
    });

    return {
      fileId: primaryFileId,
      duplicateFileIds,
      meta,
    };
  }

  private buildMultipartJsonBody(
    boundary: string,
    fileMetadata: Record<string, unknown>,
    payload: string
  ): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(
      `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(fileMetadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${payload}\r\n` +
        `--${boundary}--`
    );
  }

  private async writeRemoteReminderMetaBestEffort(
    token: string,
    meta: RemoteReminderMeta,
    existingState?: RemoteReminderMetaState
  ): Promise<void> {
    try {
      const state = existingState ?? (await this.readRemoteReminderMeta(token));
      const payload = JSON.stringify(meta);

      const uploadOnce = async (targetFileId: string | null): Promise<Response> => {
        const boundary = `habits_rem_meta_${Date.now().toString(36)}`;
        const fileMetadata = targetFileId
          ? { name: REMOTE_REMINDER_META_FILENAME, mimeType: 'application/json' }
          : {
              name: REMOTE_REMINDER_META_FILENAME,
              parents: ['appDataFolder'],
              mimeType: 'application/json',
            };
        const bodyBytes = this.buildMultipartJsonBody(boundary, fileMetadata, payload);
        const url = targetFileId
          ? `${DRIVE_UPLOAD_URL}/${encodeURIComponent(targetFileId)}?uploadType=multipart`
          : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
        const method = targetFileId ? 'PATCH' : 'POST';

        return Helpers.withRetry(async () => {
          const res = await fetch(url, {
            method,
            headers: {
              ...this.authHeaders(token),
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: bodyBytes as unknown as BodyInit,
          });
          if (res.status === 401) {
            throw mapHttpError(401, await res.text(), 'saving synced reminder config');
          }
          if (res.status === 403 || res.status === 404) {
            return res;
          }
          if (!res.ok) {
            throw mapHttpError(res.status, await res.text(), 'saving synced reminder config');
          }
          return res;
        });
      };

      let res = await uploadOnce(state.fileId);
      if (res.status === 404 && state.fileId) {
        res = await uploadOnce(null);
      }

      if (res.ok) {
        for (const dupFileId of state.duplicateFileIds) {
          await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(dupFileId)}`, {
            method: 'DELETE',
            headers: this.authHeaders(token),
          }).catch(() => undefined);
        }
      }
    } catch (err) {
      if (err instanceof NonRetryableError && /expired/i.test(err.message)) {
        throw err;
      }
    }
  }

  public async syncRemoteCalendarId(
    mode: SessionMode | null,
    accessToken: string | null,
    localCalendarId: string | null,
    trackerTimeZone: string,
    localPrefs?: Pick<ReminderPreferences, 'reminderTime' | 'horizonDays' | 'calendarEnabled'>
  ): Promise<{
    calendarId: string;
    timeZone: string | null;
    reminderTime?: string;
    horizonDays?: number;
    calendarEnabled?: boolean;
    updatedAt?: number;
  } | null> {
    if (mode !== 'google' || !accessToken) return null;
    try {
      const state = await this.readRemoteReminderMeta(accessToken);
      const remoteCalId = state.meta?.calendarId ?? null;

      if (remoteCalId) {
        const remoteCalMeta = await Helpers.withRetry(() =>
          this.fetchCalendarMeta(accessToken, remoteCalId)
        );
        if (remoteCalMeta && !remoteCalMeta.deleted && remoteCalMeta.id) {
          if (localCalendarId && localCalendarId !== remoteCalMeta.id) {
            const localMeta = await Helpers.withRetry(() =>
              this.fetchCalendarMeta(accessToken, localCalendarId)
            );
            const existingKnown = state.meta?.knownCalendarIds ?? [];
            if (
              localMeta &&
              !localMeta.deleted &&
              localMeta.id &&
              !existingKnown.includes(localMeta.id)
            ) {
              await this.writeRemoteReminderMetaBestEffort(
                accessToken,
                {
                  ...state.meta,
                  calendarId: remoteCalMeta.id,
                  timeZone: remoteCalMeta.timeZone ?? state.meta?.timeZone ?? null,
                  knownCalendarIds: [...existingKnown, localMeta.id],
                  updatedAt: Date.now(),
                },
                state
              );
            }
          }
          return {
            calendarId: remoteCalMeta.id,
            timeZone: remoteCalMeta.timeZone ?? state.meta?.timeZone ?? null,
            reminderTime: state.meta?.reminderTime,
            horizonDays: state.meta?.horizonDays,
            calendarEnabled: state.meta?.calendarEnabled,
            updatedAt: state.meta?.updatedAt,
          };
        }
      }

      if (localCalendarId) {
        const localCalMeta = await Helpers.withRetry(() =>
          this.fetchCalendarMeta(accessToken, localCalendarId)
        );
        if (localCalMeta && !localCalMeta.deleted && localCalMeta.id) {
          const resolvedTz =
            localCalMeta.timeZone ?? ReminderPlanner.resolveCalendarTimeZone(trackerTimeZone);
          const now = Date.now();
          await this.writeRemoteReminderMetaBestEffort(
            accessToken,
            {
              calendarId: localCalMeta.id,
              timeZone: resolvedTz,
              ...(localPrefs
                ? {
                    reminderTime: localPrefs.reminderTime,
                    horizonDays: localPrefs.horizonDays,
                    calendarEnabled: localPrefs.calendarEnabled,
                  }
                : {}),
              updatedAt: now,
            },
            state
          );
          return {
            calendarId: localCalMeta.id,
            timeZone: resolvedTz,
            ...(localPrefs
              ? {
                  reminderTime: localPrefs.reminderTime,
                  horizonDays: localPrefs.horizonDays,
                  calendarEnabled: localPrefs.calendarEnabled,
                }
              : {}),
            updatedAt: now,
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async listAppCalendars(accessToken: string): Promise<GoogleCalendarResource[]> {
    const matched: GoogleCalendarResource[] = [];
    let pageToken: string | undefined;

    do {
      const qs = new URLSearchParams({
        minAccessRole: 'owner',
        maxResults: '250',
      });
      if (pageToken) {
        qs.set('pageToken', pageToken);
      }
      const url = `${CALENDAR_API_BASE}/users/me/calendarList?${qs.toString()}`;
      const res = await Helpers.withRetry(async () => {
        const response = await fetch(url, {
          headers: this.authHeaders(accessToken),
        });
        if (response.status === 401) {
          throw mapHttpError(401, await response.text(), 'listing app calendars');
        }
        if (response.status === 403) {
          return response;
        }
        if (!response.ok) {
          throw mapHttpError(response.status, await response.text(), 'listing app calendars');
        }
        return response;
      });

      if (res.status === 403) {
        return [];
      }

      const data = (await res.json()) as GoogleCalendarListResponse;
      for (const item of data.items ?? []) {
        if (!item.id || item.deleted) continue;
        if (
          item.summary === SECONDARY_CALENDAR_SUMMARY ||
          item.description === SECONDARY_CALENDAR_DESCRIPTION
        ) {
          matched.push(item);
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    return matched.sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
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

    const [remoteState, appCalendars] = await Promise.all([
      this.readRemoteReminderMeta(token),
      this.listAppCalendars(token),
    ]);

    const appCalendarById = new Map<string, GoogleCalendarResource>();
    for (const cal of appCalendars) {
      if (cal.id) appCalendarById.set(cal.id, cal);
    }

    const candidateIds: string[] = [];
    const addCandidate = (id: string | null | undefined) => {
      if (!id) return;
      const trimmed = id.trim();
      if (trimmed && !candidateIds.includes(trimmed)) {
        candidateIds.push(trimmed);
      }
    };

    // Priority: shared Drive appDataFolder ID -> sorted calendarList entries -> localStorage ID
    addCandidate(remoteState.meta?.calendarId);
    for (const cal of appCalendars) {
      addCandidate(cal.id);
    }
    addCandidate(prefs.calendarId);
    for (const extraId of remoteState.meta?.knownCalendarIds ?? []) {
      addCandidate(extraId);
    }

    const liveCalendars: GoogleCalendarResource[] = [];
    for (const candidateId of candidateIds) {
      const fromList = appCalendarById.get(candidateId);
      if (fromList) {
        liveCalendars.push(fromList);
        continue;
      }
      const meta = await Helpers.withRetry(() =>
        this.fetchCalendarMeta(token, candidateId)
      );
      if (meta && !meta.deleted && meta.id) {
        liveCalendars.push(meta);
      }
    }

    const resolvedMeta = liveCalendars[0] ?? null;
    const resolvedCalendarId = resolvedMeta?.id ?? null;
    const willCreateCalendar = resolvedCalendarId === null;
    const willUpdateCalendarTz =
      resolvedMeta !== null && resolvedMeta.timeZone !== timeZone;
    const duplicateCalendarIds = liveCalendars
      .slice(1)
      .map((c) => c.id)
      .filter((id): id is string => Boolean(id) && id !== resolvedCalendarId);

    const existingEvents = resolvedCalendarId
      ? await this.listCalendarEvents(token, resolvedCalendarId)
      : [];

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
      duplicateCalendarIds,
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
    plan: CalendarSyncPlan,
    prefs?: Pick<ReminderPreferences, 'reminderTime' | 'horizonDays' | 'calendarEnabled'>
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

    let duplicatesRemoved = 0;
    for (const dupId of plan.duplicateCalendarIds) {
      if (!dupId || dupId === calendarId) continue;
      await this.deleteCalendarResource(token, dupId);
      duplicatesRemoved += 1;
    }

    await this.writeRemoteReminderMetaBestEffort(token, {
      calendarId,
      timeZone: plan.timeZone,
      ...(prefs
        ? {
            reminderTime: prefs.reminderTime,
            horizonDays: prefs.horizonDays,
            calendarEnabled: true,
          }
        : {}),
      updatedAt: Date.now(),
    });

    return {
      calendarId,
      timeZone: plan.timeZone,
      created,
      updated,
      deleted,
      duplicatesRemoved,
      targetSignature: plan.targetSignature,
    };
  }

  private async deleteCalendarResource(
    token: string,
    calendarId: string
  ): Promise<void> {
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

  public async deleteReminderCalendar(
    mode: SessionMode | null,
    accessToken: string | null,
    calendarId: string
  ): Promise<void> {
    const token = this.assertAuthorized(mode, accessToken);
    if (!calendarId.trim()) return;

    await this.deleteCalendarResource(token, calendarId);
    await this.writeRemoteReminderMetaBestEffort(token, {
      calendarId: null,
      timeZone: null,
      updatedAt: Date.now(),
    });
  }
}

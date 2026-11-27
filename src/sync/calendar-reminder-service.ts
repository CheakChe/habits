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
  slotId: string | null;
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
    return new NonRetryableError(`Google Calendar denied access (${status}): ${details || action}`);
  }
  if (status === 404 || status === 410) {
    return new NonRetryableError(
      `Google Calendar resource not found (${status}) during ${action}.`
    );
  }
  if (status === 429 || status >= 500) {
    return new Error(`Google Calendar temporary error (${status}) while ${action}.`);
  }
  return new NonRetryableError(`Google Calendar error (${status}) while ${action}: ${details}`);
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
  nextPageToken?: string;
}

interface DriveMetaFileEntry {
  id: string;
  modifiedTime?: string;
}

interface RemoteReminderMeta {
  calendarId: string | null;
  timeZone?: string | null;
  timeZoneUpdatedAt?: number;
  taskReminderSlotId?: string | null;
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
    const res = await fetch(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}`, {
      headers: this.authHeaders(accessToken),
    });
    if (res.status === 404 || res.status === 410) {
      return null;
    }
    if (!res.ok) {
      throw mapHttpError(res.status, await res.text(), 'checking reminders calendar');
    }
    return (await res.json()) as GoogleCalendarResource;
  }

  private async findRemoteMetaFiles(token: string): Promise<DriveMetaFileEntry[]> {
    const query = encodeURIComponent(`name='${REMOTE_REMINDER_META_FILENAME}' and trashed=false`);
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
        throw mapHttpError(
          response.status,
          await response.text(),
          'reading synced reminder config'
        );
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
          timeZoneUpdatedAt:
            typeof parsed.timeZoneUpdatedAt === 'number' ? parsed.timeZoneUpdatedAt : undefined,
          taskReminderSlotId:
            parsed.taskReminderSlotId !== undefined
              ? ReminderPlanner.normalizeTaskReminderSlotId(parsed.taskReminderSlotId)
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
    if (mode !== 'google' || !accessToken) return null;
    try {
      const state = await this.readRemoteReminderMeta(accessToken);
      const remoteCalId = state.meta?.calendarId ?? null;
      const localTz = ReminderPlanner.resolveCalendarTimeZone(trackerTimeZone);
      const localTzUpdatedAt = localPrefs?.timeZoneUpdatedAt ?? 0;
      const remoteTz =
        state.meta?.timeZone && state.meta.timeZone.trim() ? state.meta.timeZone.trim() : null;
      const remoteTzUpdatedAt =
        typeof state.meta?.timeZoneUpdatedAt === 'number'
          ? state.meta.timeZoneUpdatedAt
          : remoteTz
            ? (state.meta?.updatedAt ?? 0)
            : 0;

      // Determine winning timezone: remote wins if newer; local wins if newer (or remote unset and local non-UTC/explicit).
      let winningTz = remoteTz ?? localTz;
      let winningTzUpdatedAt = remoteTzUpdatedAt;
      let tzChangedLocallyNeedsPush = false;

      if (remoteTz && remoteTzUpdatedAt > localTzUpdatedAt) {
        winningTz = remoteTz;
        winningTzUpdatedAt = remoteTzUpdatedAt;
      } else if (
        localTzUpdatedAt > remoteTzUpdatedAt ||
        (!remoteTz && (localTz !== 'UTC' || localTzUpdatedAt > 0))
      ) {
        winningTz = localTz;
        winningTzUpdatedAt = localTzUpdatedAt > 0 ? localTzUpdatedAt : Date.now();
        tzChangedLocallyNeedsPush = true;
      }

      if (remoteCalId) {
        const remoteCalMeta = await Helpers.withRetry(() =>
          this.fetchCalendarMeta(accessToken, remoteCalId)
        );
        if (remoteCalMeta && !remoteCalMeta.deleted && remoteCalMeta.id) {
          let needsRemoteWrite = tzChangedLocallyNeedsPush;
          let nextKnown = state.meta?.knownCalendarIds ?? [];

          if (localCalendarId && localCalendarId !== remoteCalMeta.id) {
            const localMeta = await Helpers.withRetry(() =>
              this.fetchCalendarMeta(accessToken, localCalendarId)
            );
            if (
              localMeta &&
              !localMeta.deleted &&
              localMeta.id &&
              !nextKnown.includes(localMeta.id)
            ) {
              nextKnown = [...nextKnown, localMeta.id];
              needsRemoteWrite = true;
            }
          }

          const effectiveTz = remoteTz ? winningTz : (remoteCalMeta.timeZone ?? winningTz);
          const now = Date.now();
          if (needsRemoteWrite) {
            await this.writeRemoteReminderMetaBestEffort(
              accessToken,
              {
                ...state.meta,
                calendarId: remoteCalMeta.id,
                timeZone: effectiveTz,
                timeZoneUpdatedAt: winningTzUpdatedAt,
                ...(nextKnown.length > 0 ? { knownCalendarIds: nextKnown } : {}),
                updatedAt: now,
              },
              state
            );
          }

          return {
            calendarId: remoteCalMeta.id,
            timeZone: effectiveTz,
            timeZoneUpdatedAt: winningTzUpdatedAt,
            taskReminderSlotId: state.meta?.taskReminderSlotId,
            horizonDays: state.meta?.horizonDays,
            calendarEnabled: state.meta?.calendarEnabled,
            updatedAt: needsRemoteWrite ? now : state.meta?.updatedAt,
          };
        }
      }

      if (localCalendarId) {
        const localCalMeta = await Helpers.withRetry(() =>
          this.fetchCalendarMeta(accessToken, localCalendarId)
        );
        if (localCalMeta && !localCalMeta.deleted && localCalMeta.id) {
          const resolvedTz = tzChangedLocallyNeedsPush
            ? winningTz
            : (localCalMeta.timeZone ?? winningTz);
          const resolvedTzUpdatedAt = winningTzUpdatedAt > 0 ? winningTzUpdatedAt : Date.now();
          const now = Date.now();
          await this.writeRemoteReminderMetaBestEffort(
            accessToken,
            {
              calendarId: localCalMeta.id,
              timeZone: resolvedTz,
              timeZoneUpdatedAt: resolvedTzUpdatedAt,
              ...(localPrefs
                ? {
                    taskReminderSlotId: localPrefs.taskReminderSlotId,
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
            timeZoneUpdatedAt: resolvedTzUpdatedAt,
            ...(localPrefs
              ? {
                  taskReminderSlotId: localPrefs.taskReminderSlotId,
                  horizonDays: localPrefs.horizonDays,
                  calendarEnabled: localPrefs.calendarEnabled,
                }
              : {}),
            updatedAt: now,
          };
        }
      }

      // Even without a created Calendar yet, sync chosen timeZone between devices via Drive
      if (tzChangedLocallyNeedsPush) {
        const now = Date.now();
        await this.writeRemoteReminderMetaBestEffort(
          accessToken,
          {
            ...state.meta,
            calendarId: null,
            timeZone: winningTz,
            timeZoneUpdatedAt: winningTzUpdatedAt,
            updatedAt: now,
          },
          state
        );
        return {
          calendarId: null,
          timeZone: winningTz,
          timeZoneUpdatedAt: winningTzUpdatedAt,
          taskReminderSlotId: state.meta?.taskReminderSlotId,
          horizonDays: state.meta?.horizonDays,
          calendarEnabled: state.meta?.calendarEnabled,
          updatedAt: now,
        };
      }

      if (remoteTz) {
        return {
          calendarId: null,
          timeZone: remoteTz,
          timeZoneUpdatedAt: remoteTzUpdatedAt,
          taskReminderSlotId: state.meta?.taskReminderSlotId,
          horizonDays: state.meta?.horizonDays,
          calendarEnabled: state.meta?.calendarEnabled,
          updatedAt: state.meta?.updatedAt,
        };
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
    const events: ExistingReminderEvent[] = [];
    let pageToken: string | undefined;

    do {
      const qs = new URLSearchParams({
        singleEvents: 'true',
        maxResults: '250',
      });
      if (pageToken) {
        qs.set('pageToken', pageToken);
      }
      const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${qs.toString()}`;
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
      for (const item of data.items ?? []) {
        if (!item.id || item.status === 'cancelled') continue;
        const priv = item.extendedProperties?.private;
        const rawDay = priv?.habitsDayIndex;
        const parsedDay = rawDay !== undefined && /^-?\d+$/.test(rawDay) ? Number(rawDay) : null;
        const rawSlotId = priv?.habitsSlotId;
        const slotId =
          typeof rawSlotId === 'string' && rawSlotId.trim().length > 0 ? rawSlotId.trim() : null;
        events.push({
          id: item.id,
          dayIndex: parsedDay,
          slotId,
          summary: item.summary ?? 'Habits Reminder',
          signature: priv?.habitsSignature ?? null,
          startDateTime: item.start?.dateTime ?? item.start?.date ?? null,
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

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
      const meta = await Helpers.withRetry(() => this.fetchCalendarMeta(token, candidateId));
      if (meta && !meta.deleted && meta.id) {
        liveCalendars.push(meta);
      }
    }

    const resolvedMeta = liveCalendars[0] ?? null;
    const resolvedCalendarId = resolvedMeta?.id ?? null;
    const willCreateCalendar = resolvedCalendarId === null;
    const willUpdateCalendarTz = resolvedMeta !== null && resolvedMeta.timeZone !== timeZone;
    const duplicateCalendarIds = liveCalendars
      .slice(1)
      .map((c) => c.id)
      .filter((id): id is string => Boolean(id) && id !== resolvedCalendarId);

    const existingEvents = resolvedCalendarId
      ? await this.listCalendarEvents(token, resolvedCalendarId)
      : [];

    const desiredByKey = new Map<string, DesiredReminderEvent>();
    let hasDesiredToday = false;
    for (const desired of desiredEvents) {
      desiredByKey.set(`${desired.dayIndex}:${desired.slotId}`, desired);
      if (desired.dayIndex === todayDay) {
        hasDesiredToday = true;
      }
    }

    const toDelete: CalendarSyncPlan['toDelete'] = [];
    const toUpdate: CalendarSyncPlan['toUpdate'] = [];
    const matchedKeys = new Set<string>();
    let unchangedCount = 0;
    let deletedTodayEvent = false;

    for (const existing of existingEvents) {
      if (existing.dayIndex === null || existing.slotId === null || existing.dayIndex < todayDay) {
        if (existing.dayIndex === todayDay && !hasDesiredToday) {
          deletedTodayEvent = true;
        }
        toDelete.push({
          existingId: existing.id,
          summary: existing.summary,
          dayIndex: existing.dayIndex,
        });
        continue;
      }

      const key = `${existing.dayIndex}:${existing.slotId}`;
      if (matchedKeys.has(key)) {
        toDelete.push({
          existingId: existing.id,
          summary: existing.summary,
          dayIndex: existing.dayIndex,
        });
        continue;
      }

      const desired = desiredByKey.get(key);
      if (!desired) {
        if (existing.dayIndex === todayDay) {
          deletedTodayEvent = true;
        }
        toDelete.push({
          existingId: existing.id,
          summary: existing.summary,
          dayIndex: existing.dayIndex,
        });
        continue;
      }

      matchedKeys.add(key);
      if (existing.signature === desired.signature) {
        unchangedCount += 1;
      } else {
        toUpdate.push({ existingId: existing.id, desired });
      }
    }

    const toCreate: DesiredReminderEvent[] = [];
    for (const desired of desiredEvents) {
      const key = `${desired.dayIndex}:${desired.slotId}`;
      if (!matchedKeys.has(key)) {
        toCreate.push(desired);
      }
    }

    const pendingToday = ReminderPlanner.getTodayPendingSummary(snapshot, todayDay);
    const todayCleared =
      !hasDesiredToday && (deletedTodayEvent || pendingToday.totalPendingCount === 0);

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
          habitsSlotId: desired.slotId,
          habitsSignature: desired.signature,
        },
      },
    };
  }

  public async applySyncPlan(
    mode: SessionMode | null,
    accessToken: string | null,
    plan: CalendarSyncPlan,
    prefs?: Pick<ReminderPreferences, 'taskReminderSlotId' | 'horizonDays' | 'calendarEnabled'> & {
      timeZoneUpdatedAt?: number;
    }
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
      const targetCalendarId = calendarId;
      await Helpers.withRetry(async () => {
        const res = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(targetCalendarId)}`,
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

    const activeCalendarId = calendarId;

    let deleted = 0;
    for (const item of plan.toDelete) {
      await Helpers.withRetry(async () => {
        const res = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(activeCalendarId)}/events/${encodeURIComponent(item.existingId)}`,
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
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(activeCalendarId)}/events/${encodeURIComponent(item.existingId)}`,
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
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(activeCalendarId)}/events`,
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

    const now = Date.now();
    await this.writeRemoteReminderMetaBestEffort(token, {
      calendarId,
      timeZone: plan.timeZone,
      timeZoneUpdatedAt:
        prefs?.timeZoneUpdatedAt && prefs.timeZoneUpdatedAt > 0 ? prefs.timeZoneUpdatedAt : now,
      ...(prefs
        ? {
            taskReminderSlotId: prefs.taskReminderSlotId,
            horizonDays: prefs.horizonDays,
            calendarEnabled: true,
          }
        : {}),
      updatedAt: now,
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

  private async deleteCalendarResource(token: string, calendarId: string): Promise<void> {
    if (!calendarId.trim()) return;

    await Helpers.withRetry(async () => {
      const res = await fetch(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}`, {
        method: 'DELETE',
        headers: this.authHeaders(token),
      });
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
    const existingState = await this.readRemoteReminderMeta(token).catch(() => ({
      fileId: null,
      duplicateFileIds: [] as string[],
      meta: null,
    }));
    await this.writeRemoteReminderMetaBestEffort(
      token,
      {
        ...existingState.meta,
        calendarId: null,
        updatedAt: Date.now(),
      },
      existingState.fileId ? existingState : undefined
    );
  }
}

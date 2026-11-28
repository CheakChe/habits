import { DomainSnapshot, SessionMode } from '../types/domain';
import { Helpers } from '../utils/helpers';
import {
  DesiredReminderEvent,
  ReminderPlanner,
  ReminderPreferences,
} from '../utils/reminder-planner';
import { CalendarApiClient, GoogleCalendarResource } from './calendar-api-client';

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

export class CalendarSyncExecutor {
  private readonly api: CalendarApiClient;

  constructor(api: CalendarApiClient = new CalendarApiClient()) {
    this.api = api;
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
      const state = await this.api.readRemoteReminderMeta(accessToken);
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
          this.api.fetchCalendarMeta(accessToken, remoteCalId)
        );
        if (remoteCalMeta && !remoteCalMeta.deleted && remoteCalMeta.id) {
          let needsRemoteWrite = tzChangedLocallyNeedsPush;
          let nextKnown = state.meta?.knownCalendarIds ?? [];

          if (localCalendarId && localCalendarId !== remoteCalMeta.id) {
            const localMeta = await Helpers.withRetry(() =>
              this.api.fetchCalendarMeta(accessToken, localCalendarId)
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
            await this.api.writeRemoteReminderMetaBestEffort(
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
          this.api.fetchCalendarMeta(accessToken, localCalendarId)
        );
        if (localCalMeta && !localCalMeta.deleted && localCalMeta.id) {
          const resolvedTz = tzChangedLocallyNeedsPush
            ? winningTz
            : (localCalMeta.timeZone ?? winningTz);
          const resolvedTzUpdatedAt = winningTzUpdatedAt > 0 ? winningTzUpdatedAt : Date.now();
          const now = Date.now();
          await this.api.writeRemoteReminderMetaBestEffort(
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
        await this.api.writeRemoteReminderMetaBestEffort(
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

  public async prepareSyncPlan(
    mode: SessionMode | null,
    accessToken: string | null,
    snapshot: DomainSnapshot,
    todayDay: number,
    prefs: ReminderPreferences,
    trackerTimeZone: string
  ): Promise<CalendarSyncPlan> {
    const token = this.api.assertAuthorized(mode, accessToken);
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
      this.api.readRemoteReminderMeta(token),
      this.api.listAppCalendars(token),
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
      const meta = await Helpers.withRetry(() => this.api.fetchCalendarMeta(token, candidateId));
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
      ? await this.api.listCalendarEvents(token, resolvedCalendarId)
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

  public async applySyncPlan(
    mode: SessionMode | null,
    accessToken: string | null,
    plan: CalendarSyncPlan,
    prefs?: Pick<ReminderPreferences, 'taskReminderSlotId' | 'horizonDays' | 'calendarEnabled'> & {
      timeZoneUpdatedAt?: number;
    }
  ): Promise<CalendarSyncApplyResult> {
    const token = this.api.assertAuthorized(mode, accessToken);
    let calendarId = plan.calendarId;

    if (!calendarId || plan.willCreateCalendar) {
      calendarId = await this.api.createCalendar(token, plan.timeZone);
    } else if (plan.willUpdateCalendarTz) {
      await this.api.updateCalendarTimeZone(token, calendarId, plan.timeZone);
    }

    const activeCalendarId = calendarId;

    let deleted = 0;
    for (const item of plan.toDelete) {
      await this.api.deleteEvent(token, activeCalendarId, item.existingId);
      deleted += 1;
    }

    let updated = 0;
    for (const item of plan.toUpdate) {
      await this.api.updateEvent(token, activeCalendarId, item.existingId, item.desired);
      updated += 1;
    }

    let created = 0;
    for (const desired of plan.toCreate) {
      await this.api.createEvent(token, activeCalendarId, desired);
      created += 1;
    }

    let duplicatesRemoved = 0;
    for (const dupId of plan.duplicateCalendarIds) {
      if (!dupId || dupId === calendarId) continue;
      await this.api.deleteCalendarResource(token, dupId);
      duplicatesRemoved += 1;
    }

    const now = Date.now();
    await this.api.writeRemoteReminderMetaBestEffort(token, {
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

  public async deleteReminderCalendar(
    mode: SessionMode | null,
    accessToken: string | null,
    calendarId: string
  ): Promise<void> {
    const token = this.api.assertAuthorized(mode, accessToken);
    if (!calendarId.trim()) return;

    await this.api.deleteCalendarResource(token, calendarId);
    const existingState = await this.api.readRemoteReminderMeta(token).catch(() => ({
      fileId: null,
      duplicateFileIds: [] as string[],
      meta: null,
    }));
    await this.api.writeRemoteReminderMetaBestEffort(
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

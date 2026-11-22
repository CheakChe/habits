import assert from 'node:assert/strict';
import test from 'node:test';
import { CalendarReminderService } from '../src/sync/calendar-reminder-service';
import { DomainSnapshot } from '../src/types/domain';
import { CivilCalendar } from '../src/utils/civil-calendar';
import { NonRetryableError } from '../src/utils/helpers';
import {
  DEFAULT_REMINDER_PREFERENCES,
  ReminderPlanner,
  ReminderPreferences,
} from '../src/utils/reminder-planner';

// 2026-11-16 is a Monday -> dayIndex computed via CivilCalendar
const MONDAY_DAY = CivilCalendar.fromLocalDate(2026, 11, 16);
const TUESDAY_DAY = MONDAY_DAY + 1;
const WEDNESDAY_DAY = MONDAY_DAY + 2;

function makeSnapshot(overrides?: Partial<DomainSnapshot>): DomainSnapshot {
  return {
    habits: overrides?.habits ?? [],
    checkins: overrides?.checkins ?? [],
    notes: overrides?.notes ?? [],
    tasks: overrides?.tasks ?? [],
  };
}

function makePrefs(overrides?: Partial<ReminderPreferences>): ReminderPreferences {
  return {
    ...DEFAULT_REMINDER_PREFERENCES,
    ...overrides,
  };
}

test('ReminderPlanner normalizes reminder time, horizon days, and stored preferences', () => {
  assert.equal(ReminderPlanner.normalizeTime('9:05'), '09:05');
  assert.equal(ReminderPlanner.normalizeTime(' 23:59 '), '23:59');
  assert.equal(ReminderPlanner.normalizeTime('24:00'), '20:00');
  assert.equal(ReminderPlanner.normalizeTime('12:60'), '20:00');
  assert.equal(ReminderPlanner.normalizeTime(null), '20:00');

  assert.equal(ReminderPlanner.normalizeHorizonDays(1), 1);
  assert.equal(ReminderPlanner.normalizeHorizonDays(0), 1);
  assert.equal(ReminderPlanner.normalizeHorizonDays(Number.NaN), 3);
  assert.equal(ReminderPlanner.normalizeHorizonDays(99), 7);
  assert.equal(ReminderPlanner.normalizeHorizonDays(-5), 1);
  assert.equal(ReminderPlanner.normalizeHorizonDays('3'), 3);

  const normalized = ReminderPlanner.normalizePreferences({
    badgeEnabled: false,
    calendarEnabled: true,
    reminderTime: '7:30',
    horizonDays: 10,
    calendarId: '  cal-123  ',
    calendarTimeZone: ' Europe/Moscow ',
    lastSyncedSignature: 'sig-1',
    lastSyncedAt: 1700000000000,
  });
  assert.deepEqual(normalized, {
    badgeEnabled: false,
    calendarEnabled: true,
    reminderTime: '07:30',
    horizonDays: 7,
    calendarId: 'cal-123',
    calendarTimeZone: 'Europe/Moscow',
    lastSyncedSignature: 'sig-1',
    lastSyncedAt: 1700000000000,
  });

  assert.deepEqual(ReminderPlanner.normalizePreferences(null), DEFAULT_REMINDER_PREFERENCES);
});

test('ReminderPlanner getTodayPendingSummary counts remaining scheduled habits, flexible weekly targets, and open due/overdue tasks', () => {
  const snapshot = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Daily Run',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: MONDAY_DAY - 5,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 2,
        name: 'Evening Read',
        color: '#22C55E',
        weekdays: 127,
        weeklyTarget: null,
        startDay: MONDAY_DAY - 5,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 3,
        name: 'Gym 2x/wk',
        color: '#F59E0B',
        weekdays: 127,
        weeklyTarget: 2,
        startDay: MONDAY_DAY - 7,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 4,
        name: 'Swim 1x/wk (already met)',
        color: '#06B6D4',
        weekdays: 127,
        weeklyTarget: 1,
        startDay: MONDAY_DAY - 7,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    checkins: [
      { habitId: 1, dayIndex: TUESDAY_DAY, done: true, updatedAt: 2000 }, // Daily Run done today
      { habitId: 3, dayIndex: MONDAY_DAY, done: true, updatedAt: 2000 }, // Gym 1/2 done this week -> still needed
      { habitId: 4, dayIndex: MONDAY_DAY, done: true, updatedAt: 2000 }, // Swim 1/1 done this week -> met!
    ],
    tasks: [
      {
        id: 10,
        title: 'Overdue Invoice',
        note: '',
        dueDay: MONDAY_DAY,
        done: false,
        repeatable: false,
        status: 'open',
        completedDay: null,
        deletedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 11,
        title: 'Pay Rent',
        note: '',
        dueDay: TUESDAY_DAY,
        done: false,
        repeatable: false,
        status: 'open',
        completedDay: null,
        deletedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 12,
        title: 'Future Task',
        note: '',
        dueDay: WEDNESDAY_DAY,
        done: false,
        repeatable: false,
        status: 'open',
        completedDay: null,
        deletedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 13,
        title: 'Done Task',
        note: '',
        dueDay: TUESDAY_DAY,
        done: true,
        repeatable: false,
        status: 'done',
        completedDay: TUESDAY_DAY,
        deletedAt: null,
        createdAt: 1000,
        updatedAt: 2000,
      },
      {
        id: 14,
        title: 'Deleted Task',
        note: '',
        dueDay: TUESDAY_DAY,
        done: false,
        repeatable: false,
        status: 'open',
        completedDay: null,
        deletedAt: 2000,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
  });

  const summary = ReminderPlanner.getTodayPendingSummary(snapshot, TUESDAY_DAY);
  assert.deepEqual(
    summary.unfinishedHabits.map((h) => h.id),
    [2, 3]
  );
  assert.deepEqual(
    summary.overdueTasks.map((t) => t.id),
    [10]
  );
  assert.deepEqual(
    summary.dueTodayTasks.map((t) => t.id),
    [11]
  );
  assert.equal(summary.unfinishedHabitsCount, 2);
  assert.equal(summary.openTasksCount, 2);
  assert.equal(summary.totalPendingCount, 4);
});

test('ReminderPlanner buildDesiredEvents omits today when complete, handles cross-midnight times, and plans future horizon days', () => {
  const snapshot = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Meditate',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: MONDAY_DAY,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    checkins: [{ habitId: 1, dayIndex: MONDAY_DAY, done: true, updatedAt: 2000 }],
    tasks: [
      {
        id: 2,
        title: 'Submit tax form',
        note: '',
        dueDay: WEDNESDAY_DAY,
        done: false,
        repeatable: false,
        status: 'open',
        completedDay: null,
        deletedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  });

  const events = ReminderPlanner.buildDesiredEvents(
    snapshot,
    MONDAY_DAY,
    { reminderTime: '23:55', horizonDays: 3 },
    'Europe/Berlin'
  );

  // Monday (today) is complete, so NO event should exist for MONDAY_DAY
  assert.deepEqual(
    events.map((e) => e.dayIndex),
    [TUESDAY_DAY, WEDNESDAY_DAY]
  );

  // Cross-midnight end time must roll into next day cleanly
  const tueEvent = events[0];
  assert.equal(tueEvent.dateStr, '2026-11-17');
  assert.equal(tueEvent.startDateTime, '2026-11-17T23:55:00');
  assert.equal(tueEvent.endDateTime, '2026-11-18T00:10:00');
  assert.equal(tueEvent.timeZone, 'Europe/Berlin');
  assert.match(tueEvent.summary, /1 habit planned/);

  const wedEvent = events[1];
  assert.match(wedEvent.summary, /1 habit & 1 task planned/);
  assert.match(wedEvent.description, /Submit tax form/);

  const sig1 = ReminderPlanner.computeStateSignature(
    snapshot,
    MONDAY_DAY,
    { reminderTime: '23:55', horizonDays: 3 },
    'Europe/Berlin'
  );
  const sig2 = ReminderPlanner.computeStateSignature(
    snapshot,
    MONDAY_DAY,
    { reminderTime: '21:00', horizonDays: 3 },
    'Europe/Berlin'
  );
  assert.notEqual(sig1, sig2);
});

test('ReminderPlanner syncAppBadge sets positive counts, clears on zero/null, and falls back safely', async (t) => {
  const prevNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() => {
    if (prevNavigatorDesc) {
      Object.defineProperty(globalThis, 'navigator', prevNavigatorDesc);
    } else {
      delete (globalThis as Record<string, unknown>).navigator;
    }
  });

  const calls: Array<{ fn: string; arg?: number }> = [];
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      setAppBadge: async (n?: number) => {
        calls.push({ fn: 'set', arg: n });
      },
      clearAppBadge: async () => {
        calls.push({ fn: 'clear' });
      },
    },
    configurable: true,
    writable: true,
  });

  assert.equal(ReminderPlanner.isAppBadgeSupported(), true);
  assert.equal(await ReminderPlanner.syncAppBadge(5), true);
  assert.equal(await ReminderPlanner.syncAppBadge(0), true);
  assert.equal(await ReminderPlanner.syncAppBadge(null), true);

  assert.deepEqual(calls, [{ fn: 'set', arg: 5 }, { fn: 'clear' }, { fn: 'clear' }]);

  // Fallback to setAppBadge(0) when clearAppBadge is absent and errors are swallowed
  const callsNoClear: Array<{ fn: string; arg?: number }> = [];
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      setAppBadge: async (n?: number) => {
        callsNoClear.push({ fn: 'set', arg: n });
      },
    },
    configurable: true,
    writable: true,
  });
  assert.equal(await ReminderPlanner.syncAppBadge(0), true);
  assert.deepEqual(callsNoClear, [{ fn: 'set', arg: 0 }]);

  // Throwing badge API does not crash callers
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      setAppBadge: async () => {
        throw new Error('Blocked in iframe');
      },
    },
    configurable: true,
    writable: true,
  });
  assert.equal(await ReminderPlanner.syncAppBadge(3), false);
});

test('ReminderPlanner inspects and requests Notification permission for iOS App Badging safely', async (t) => {
  const originalNotification = globalThis.Notification;
  t.after(() => {
    if (originalNotification === undefined) {
      delete (globalThis as { Notification?: unknown }).Notification;
    } else {
      Object.defineProperty(globalThis, 'Notification', {
        value: originalNotification,
        configurable: true,
        writable: true,
      });
    }
  });

  delete (globalThis as { Notification?: unknown }).Notification;
  assert.equal(ReminderPlanner.getNotificationPermission(), 'unsupported');
  assert.equal(await ReminderPlanner.requestBadgePermission(), 'unsupported');

  let currentPerm: NotificationPermission = 'default';
  Object.defineProperty(globalThis, 'Notification', {
    value: {
      get permission() {
        return currentPerm;
      },
      requestPermission: async () => {
        currentPerm = 'granted';
        return currentPerm;
      },
    },
    configurable: true,
    writable: true,
  });

  assert.equal(ReminderPlanner.getNotificationPermission(), 'default');
  assert.equal(await ReminderPlanner.requestBadgePermission(), 'granted');
  assert.equal(ReminderPlanner.getNotificationPermission(), 'granted');
});

test('CalendarReminderService enforces google auth and prepares/applies initial calendar creation + event cleanup', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const service = new CalendarReminderService();
  const snap = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Read',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: MONDAY_DAY,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  });
  const prefs = makePrefs({ calendarEnabled: true, horizonDays: 2, reminderTime: '19:30' });

  await assert.rejects(
    () => service.prepareSyncPlan('guest', 'tok', snap, MONDAY_DAY, prefs, 'UTC'),
    (err: unknown) => err instanceof NonRetryableError && /Google Sign-In/i.test(err.message)
  );
  await assert.rejects(
    () => service.prepareSyncPlan('google', null, snap, MONDAY_DAY, prefs, 'UTC'),
    (err: unknown) => err instanceof NonRetryableError && /expired/i.test(err.message)
  );

  const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    calls.push({ method, url, body });

    if (method === 'GET' && url.includes('/drive/v3/files')) {
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    }
    if (method === 'POST' && url.includes('/upload/drive/v3/files')) {
      return new Response(JSON.stringify({ id: 'drive-rem-meta-1' }), { status: 200 });
    }
    if (method === 'GET' && url.includes('/users/me/calendarList')) {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    if (method === 'POST' && url.endsWith('/calendars')) {
      return new Response(JSON.stringify({ id: 'cal-created-1', timeZone: 'UTC' }), {
        status: 200,
      });
    }
    if (method === 'POST' && url.includes('/calendars/cal-created-1/events')) {
      return new Response(JSON.stringify({ id: `ev-${calls.length}` }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  // Plan with missing calendarId & empty calendarList triggers willCreateCalendar = true
  const initialPlan = await service.prepareSyncPlan(
    'google',
    'tok-1',
    snap,
    MONDAY_DAY,
    prefs,
    'UTC'
  );
  assert.equal(initialPlan.willCreateCalendar, true);
  assert.equal(initialPlan.duplicateCalendarIds.length, 0);
  assert.equal(initialPlan.toCreate.length, 2);
  assert.equal(initialPlan.toDelete.length, 0);

  // Applying initial plan creates secondary calendar then creates 2 popup events
  const applied = await service.applySyncPlan('google', 'tok-1', initialPlan);
  assert.equal(applied.calendarId, 'cal-created-1');
  assert.equal(applied.created, 2);
  assert.equal(applied.updated, 0);
  assert.equal(applied.deleted, 0);
  assert.equal(applied.duplicatesRemoved, 0);

  const postCalls = calls.filter((c) => c.method === 'POST');
  assert.equal(postCalls[0].body?.summary, 'Habits Reminders');
  assert.equal(postCalls[1].body?.transparency, 'transparent');
  assert.deepEqual(postCalls[1].body?.reminders, {
    useDefault: false,
    overrides: [{ method: 'popup', minutes: 0 }],
  });
});

test('CalendarReminderService deletes stale/completed events, updates changed days, keeps matching signatures, and supports calendar deletion', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  // Today (TUESDAY_DAY) has habit 1 already completed -> today's event MUST be deleted!
  // Past event (MONDAY_DAY) MUST also be deleted.
  // Tomorrow (WEDNESDAY_DAY) exists with an outdated signature -> MUST be updated.
  const snap = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Read',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: MONDAY_DAY,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    checkins: [{ habitId: 1, dayIndex: TUESDAY_DAY, done: true, updatedAt: 5000 }],
  });

  const prefs = makePrefs({
    calendarEnabled: true,
    calendarId: 'cal-xyz',
    horizonDays: 2, // TUESDAY_DAY + WEDNESDAY_DAY
    reminderTime: '20:00',
  });

  const requests: Array<{ method: string; url: string }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    requests.push({ method, url });

    if (method === 'GET' && url.includes('/drive/v3/files')) {
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    }
    if (method === 'POST' && url.includes('/upload/drive/v3/files')) {
      return new Response(JSON.stringify({ id: 'drive-rem-meta-1' }), { status: 200 });
    }
    if (method === 'GET' && url.includes('/users/me/calendarList')) {
      return new Response(
        JSON.stringify({
          items: [{ id: 'cal-xyz', summary: 'Habits Reminders', timeZone: 'UTC' }],
        }),
        { status: 200 }
      );
    }
    if (method === 'GET' && url.endsWith('/calendars/cal-xyz')) {
      return new Response(JSON.stringify({ id: 'cal-xyz', timeZone: 'UTC' }), { status: 200 });
    }
    if (method === 'GET' && url.includes('/calendars/cal-xyz/events')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'ev-past',
              summary: 'Past',
              extendedProperties: {
                private: { habitsDayIndex: String(MONDAY_DAY), habitsSignature: 'old' },
              },
            },
            {
              id: 'ev-today-completed',
              summary: 'Habits — 1 habit left today',
              extendedProperties: {
                private: { habitsDayIndex: String(TUESDAY_DAY), habitsSignature: 'today-sig' },
              },
            },
            {
              id: 'ev-wed-stale',
              summary: 'Habits — stale',
              extendedProperties: {
                private: { habitsDayIndex: String(WEDNESDAY_DAY), habitsSignature: 'stale-sig' },
              },
            },
            {
              id: 'ev-cancelled',
              status: 'cancelled',
              extendedProperties: {
                private: { habitsDayIndex: String(WEDNESDAY_DAY) },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (method === 'DELETE' && url.includes('/events/ev-past')) {
      return new Response(null, { status: 204 });
    }
    if (method === 'DELETE' && url.includes('/events/ev-today-completed')) {
      return new Response(null, { status: 404 }); // idempotent delete
    }
    if (method === 'PATCH' && url.includes('/events/ev-wed-stale')) {
      return new Response(JSON.stringify({ id: 'ev-wed-stale' }), { status: 200 });
    }
    if (method === 'DELETE' && url.endsWith('/calendars/cal-xyz')) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  const service = new CalendarReminderService();
  const plan = await service.prepareSyncPlan('google', 'tok-2', snap, TUESDAY_DAY, prefs, 'UTC');

  assert.equal(plan.willCreateCalendar, false);
  assert.equal(plan.todayCleared, true);
  assert.deepEqual(
    plan.toDelete.map((d) => d.existingId),
    ['ev-past', 'ev-today-completed']
  );
  assert.equal(plan.toUpdate.length, 1);
  assert.equal(plan.toUpdate[0].existingId, 'ev-wed-stale');
  assert.equal(plan.toCreate.length, 0);

  const applied = await service.applySyncPlan('google', 'tok-2', plan);
  assert.equal(applied.deleted, 2);
  assert.equal(applied.updated, 1);
  assert.equal(applied.created, 0);
  assert.equal(applied.duplicatesRemoved, 0);

  await service.deleteReminderCalendar('google', 'tok-2', 'cal-xyz');
  assert.ok(requests.some((r) => r.method === 'DELETE' && r.url.endsWith('/calendars/cal-xyz')));

  // 401 unauthorized maps immediately to NonRetryableError without retrying
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    return new Response('Unauthorized', { status: 401 });
  }) as typeof fetch;
  await assert.rejects(
    () => service.prepareSyncPlan('google', 'tok-bad', snap, TUESDAY_DAY, prefs, 'UTC'),
    (err: unknown) => err instanceof NonRetryableError && /expired/i.test(err.message)
  );
  // 401 unauthorized maps immediately to NonRetryableError without retrying (1 call per parallel preflight request)
  assert.equal(attempts, 2);
});

test('CalendarReminderService reuses existing secondary calendar on a second device and removes duplicates', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const snap = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Stretch',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: MONDAY_DAY,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  });

  // Case 1: calendarList accessible and returns 2 calendars while local device has calendarId = null
  const prefs = makePrefs({
    calendarEnabled: true,
    calendarId: null,
    horizonDays: 1,
    reminderTime: '20:00',
  });

  const deletedCalendarUrls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.includes('/drive/v3/files')) {
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    }
    if (method === 'POST' && url.includes('/upload/drive/v3/files')) {
      return new Response(JSON.stringify({ id: 'drive-rem-meta-1' }), { status: 200 });
    }
    if (method === 'GET' && url.includes('/users/me/calendarList')) {
      return new Response(
        JSON.stringify({
          items: [
            { id: 'cal-b-dup', summary: 'Habits Reminders', timeZone: 'UTC' },
            { id: 'cal-a-primary', summary: 'Habits Reminders', timeZone: 'UTC' },
            { id: 'personal', summary: 'Personal', timeZone: 'UTC' },
          ],
        }),
        { status: 200 }
      );
    }
    if (method === 'GET' && url.includes('/calendars/cal-a-primary/events')) {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    if (method === 'POST' && url.includes('/calendars/cal-a-primary/events')) {
      return new Response(JSON.stringify({ id: 'ev-1' }), { status: 200 });
    }
    if (method === 'DELETE' && url.endsWith('/calendars/cal-b-dup')) {
      deletedCalendarUrls.push(url);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  const service = new CalendarReminderService();
  const plan = await service.prepareSyncPlan('google', 'tok-device-2', snap, TUESDAY_DAY, prefs, 'UTC');

  assert.equal(plan.willCreateCalendar, false);
  assert.equal(plan.calendarId, 'cal-a-primary');
  assert.deepEqual(plan.duplicateCalendarIds, ['cal-b-dup']);
  assert.equal(plan.toCreate.length, 1);

  const applied = await service.applySyncPlan('google', 'tok-device-2', plan);
  assert.equal(applied.calendarId, 'cal-a-primary');
  assert.equal(applied.created, 1);
  assert.equal(applied.duplicatesRemoved, 1);
  assert.equal(deletedCalendarUrls.length, 1);
});

test('CalendarReminderService discovers calendarId via Drive appDataFolder when calendarList returns 403 and removes device duplicate', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const snap = makeSnapshot({
    habits: [
      {
        id: 1,
        name: 'Meditate',
        color: '#3B82F6',
        weekdays: 127,
        weeklyTarget: null,
        startDay: MONDAY_DAY,
        archivedAt: null,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  });

  // Phone previously created cal-phone locally, while PC published cal-pc to Drive appDataFolder
  const phonePrefs = makePrefs({
    calendarEnabled: true,
    calendarId: 'cal-phone',
    horizonDays: 1,
    reminderTime: '20:00',
  });

  let savedMetaBody = '';
  const deletedCalendars: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.includes('/users/me/calendarList')) {
      // Realistic behavior under calendar.app.created scope alone
      return new Response('Forbidden', { status: 403 });
    }
    if (method === 'GET' && url.includes('/drive/v3/files?spaces=appDataFolder')) {
      return new Response(
        JSON.stringify({ files: [{ id: 'meta-file-1', modifiedTime: '2026-11-22T00:00:00Z' }] }),
        { status: 200 }
      );
    }
    if (method === 'GET' && url.endsWith('/drive/v3/files/meta-file-1?alt=media')) {
      return new Response(JSON.stringify({ calendarId: 'cal-pc', timeZone: 'UTC' }), {
        status: 200,
      });
    }
    if (method === 'PATCH' && url.includes('/upload/drive/v3/files/meta-file-1')) {
      savedMetaBody = typeof init?.body === 'string' ? init.body : '';
      return new Response(JSON.stringify({ id: 'meta-file-1' }), { status: 200 });
    }
    if (method === 'GET' && url.endsWith('/calendars/cal-pc')) {
      return new Response(JSON.stringify({ id: 'cal-pc', timeZone: 'UTC' }), { status: 200 });
    }
    if (method === 'GET' && url.endsWith('/calendars/cal-phone')) {
      return new Response(JSON.stringify({ id: 'cal-phone', timeZone: 'UTC' }), { status: 200 });
    }
    if (method === 'GET' && url.includes('/calendars/cal-pc/events')) {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    if (method === 'POST' && url.includes('/calendars/cal-pc/events')) {
      return new Response(JSON.stringify({ id: 'ev-1' }), { status: 200 });
    }
    if (method === 'DELETE' && url.endsWith('/calendars/cal-phone')) {
      deletedCalendars.push('cal-phone');
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  const service = new CalendarReminderService();
  const plan = await service.prepareSyncPlan(
    'google',
    'tok-phone',
    snap,
    TUESDAY_DAY,
    phonePrefs,
    'UTC'
  );

  assert.equal(plan.willCreateCalendar, false);
  assert.equal(plan.calendarId, 'cal-pc');
  assert.deepEqual(plan.duplicateCalendarIds, ['cal-phone']);

  const applied = await service.applySyncPlan('google', 'tok-phone', plan);
  assert.equal(applied.calendarId, 'cal-pc');
  assert.equal(applied.duplicatesRemoved, 1);
  assert.deepEqual(deletedCalendars, ['cal-phone']);
  assert.match(savedMetaBody, /"calendarId":"cal-pc"/);
});

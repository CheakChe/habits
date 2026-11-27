import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager, WORKSPACE_SCOPES } from '../src/auth/session-manager';

function createMemoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & {
  dump(): Record<string, string>;
} {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

test('SessionManager uses GIS token client, caches token only in RAM, tracks expiry, and remembers email', async () => {
  const storage = createMemoryStorage();
  let now = 1_000_000;
  const requests: Array<{ prompt?: string; hint?: string }> = [];
  let initScope = '';

  const manager = new SessionManager({
    oauthClientId: 'test-client-id.apps.googleusercontent.com',
    storage,
    nowFn: () => now,
    fetchFn: () =>
      Promise.resolve(
        new Response(JSON.stringify({ user: { emailAddress: 'alex@example.com' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      ),
    getGisOAuth2: () => ({
      initTokenClient(config) {
        initScope = config.scope;
        return {
          requestAccessToken(override = {}) {
            requests.push({ prompt: override.prompt, hint: override.hint });
            config.callback({
              access_token: 'gis-access-token-1',
              expires_in: 3600,
              scope: WORKSPACE_SCOPES.join(' '),
            });
          },
        };
      },
      hasGrantedAllScopes() {
        return true;
      },
    }),
  });

  assert.equal(manager.isUsingGis(), true);
  assert.equal(manager.hasAccessToken(), false);

  const token = await manager.signInWithGoogle({ interactiveAccountPicker: true });
  assert.equal(token, 'gis-access-token-1');
  assert.equal(initScope, WORKSPACE_SCOPES.join(' '));
  assert.equal(requests[0].prompt, 'select_account');
  assert.equal(manager.hasAccessToken(), true);
  assert.equal(manager.getAccessToken(), 'gis-access-token-1');
  assert.equal(manager.getAccountEmail(), 'alex@example.com');
  assert.equal(manager.getRememberedMode(), 'google');

  // Verify token is NEVER persisted in localStorage
  const persisted = storage.dump();
  assert.equal(persisted.habits_session_mode, 'google');
  assert.equal(persisted.habits_google_email, 'alex@example.com');
  assert.equal(
    Object.values(persisted).some((v) => v.includes('gis-access-token-1')),
    false
  );

  // Subsequent silent reconnect uses hint and empty prompt
  manager.clearAccessTokenOnly();
  assert.equal(manager.hasAccessToken(), false);
  await manager.signInWithGoogle({ interactiveAccountPicker: false });
  assert.deepEqual(requests[1], { prompt: '', hint: 'alex@example.com' });

  // Token automatically invalidates after expires_in - 60s
  now += 3600 * 1000;
  assert.equal(manager.hasAccessToken(), false);
  assert.equal(manager.getAccessToken(), null);
});

test('SessionManager retries with consent prompt when GIS returns interaction_required or missing scopes', async () => {
  const storage = createMemoryStorage();
  storage.setItem('habits_session_mode', 'google');
  storage.setItem('habits_google_email', 'alex@example.com');

  const prompts: Array<string | undefined> = [];
  let attempt = 0;

  const manager = new SessionManager({
    oauthClientId: 'test-client-id.apps.googleusercontent.com',
    storage,
    fetchFn: () => Promise.resolve(new Response('{}', { status: 200 })),
    getGisOAuth2: () => ({
      initTokenClient(config) {
        return {
          requestAccessToken(override = {}) {
            prompts.push(override.prompt);
            attempt += 1;
            if (attempt === 1) {
              config.callback({ error: 'interaction_required' });
              return;
            }
            if (attempt === 2) {
              config.callback({
                access_token: 'partial-token',
                expires_in: 3600,
                scope: WORKSPACE_SCOPES[0],
              });
              return;
            }
            config.callback({
              access_token: 'full-token',
              expires_in: 3600,
              scope: WORKSPACE_SCOPES.join(' '),
            });
          },
        };
      },
      hasGrantedAllScopes(resp) {
        return Boolean(resp.scope?.includes(WORKSPACE_SCOPES[1]));
      },
    }),
  });

  const token = await manager.signInWithGoogle();
  assert.equal(token, 'full-token');
  assert.deepEqual(prompts, ['', 'consent', 'consent']);

  await manager.clearSessionAndReturnToEntry();
  assert.equal(manager.hasAccessToken(), false);
  assert.equal(manager.getAccountEmail(), null);
  assert.equal(manager.getRememberedMode(), null);
});

test('SessionManager handles missing clientId, concurrent sign-in, superseded request, and GIS error callbacks', async () => {
  // Missing oauthClientId
  const noClient = new SessionManager({ oauthClientId: '   ', storage: createMemoryStorage() });
  assert.equal(noClient.isUsingGis(), false);
  await assert.rejects(() => noClient.signInWithGoogle(), /not configured/i);

  // Concurrent signInWithGoogle shares inFlightSignIn promise
  let requestCount = 0;
  let capturedCallback: ((resp: { access_token?: string; expires_in?: number }) => void) | null =
    null;
  const authEvents: Array<{ hasToken: boolean; email: string | null }> = [];

  const concurrentMgr = new SessionManager({
    oauthClientId: 'client-1',
    storage: createMemoryStorage(),
    fetchFn: () => Promise.resolve(new Response('fail', { status: 500 })),
    getGisOAuth2: () => ({
      initTokenClient(config) {
        return {
          requestAccessToken() {
            requestCount += 1;
            capturedCallback = config.callback;
          },
        };
      },
      hasGrantedAllScopes: () => true,
    }),
  });
  const unsub = concurrentMgr.subscribeAuthChanges((state) => authEvents.push(state));

  const p1 = concurrentMgr.signInWithGoogle();
  const p2 = concurrentMgr.signInWithGoogle();
  assert.equal(requestCount, 1);
  capturedCallback!({ access_token: 'tok-shared', expires_in: 120 });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, 'tok-shared');
  assert.equal(r2, 'tok-shared');
  assert.equal(concurrentMgr.getTokenExpiresAt() > 0, true);
  assert.equal(concurrentMgr.getAccountEmail(), null);
  assert.equal(authEvents.length, 1);
  assert.deepEqual(authEvents[0], { hasToken: true, email: null });

  concurrentMgr.chooseGuest();
  assert.equal(concurrentMgr.getRememberedMode(), 'guest');
  assert.equal(concurrentMgr.hasAccessToken(), false);
  assert.equal(concurrentMgr.getTokenExpiresAt(), 0);
  unsub();
  concurrentMgr.clearAccessTokenOnly();
  assert.equal(authEvents.length, 2); // unsubscribed before clearAccessTokenOnly

  // Error callbacks: access_denied, generic error, popup_closed, popup_failed_to_open, generic error_callback, thrown requestAccessToken
  let nextMode:
    | 'access_denied'
    | 'generic_error'
    | 'popup_closed'
    | 'popup_blocked'
    | 'err_cb_msg'
    | 'throw'
    | 'empty_token'
    | 'partial_scopes' = 'access_denied';

  const errMgr = new SessionManager({
    oauthClientId: 'client-err',
    storage: createMemoryStorage(),
    fetchFn: () => Promise.reject(new Error('network error')),
    getGisOAuth2: () => ({
      initTokenClient(config) {
        return {
          requestAccessToken() {
            if (nextMode === 'throw') {
              throw new Error('launch boom');
            }
            if (nextMode === 'access_denied') {
              config.callback({ error: 'access_denied' });
              return;
            }
            if (nextMode === 'generic_error') {
              config.callback({ error: 'server_error', error_description: 'Upstream failure' });
              return;
            }
            if (nextMode === 'popup_closed') {
              config.error_callback?.({ type: 'popup_closed' });
              return;
            }
            if (nextMode === 'popup_blocked') {
              config.error_callback?.({ type: 'popup_failed_to_open' });
              return;
            }
            if (nextMode === 'err_cb_msg') {
              config.error_callback?.({ type: 'unknown', message: 'Popup crashed' });
              return;
            }
            if (nextMode === 'empty_token') {
              config.callback({ expires_in: 3600 });
              return;
            }
            config.callback({ access_token: 'partial', expires_in: 3600, scope: 'only-one' });
          },
        };
      },
      hasGrantedAllScopes: () => false,
    }),
  });

  await assert.rejects(() => errMgr.signInWithGoogle(), /denied or cancelled/i);
  nextMode = 'generic_error';
  await assert.rejects(() => errMgr.signInWithGoogle(), /Upstream failure/);
  nextMode = 'popup_closed';
  await assert.rejects(() => errMgr.signInWithGoogle(), /was cancelled/i);
  nextMode = 'popup_blocked';
  await assert.rejects(() => errMgr.signInWithGoogle(), /popup was blocked/i);
  nextMode = 'err_cb_msg';
  await assert.rejects(() => errMgr.signInWithGoogle(), /Popup crashed/);
  nextMode = 'throw';
  await assert.rejects(() => errMgr.signInWithGoogle(), /launch boom/);
  nextMode = 'empty_token';
  await assert.rejects(() => errMgr.signInWithGoogle(), /Could not obtain Google Workspace/i);
  nextMode = 'partial_scopes';
  await assert.rejects(
    () => errMgr.signInWithGoogle(),
    /Both Google Drive app-folder and Google Calendar permissions/i
  );
});

test('SessionManager tolerates storage exceptions, missing GIS after script load, and defaultLoadGisScript DOM lifecycle', async (t) => {
  const brokenStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
    getItem() {
      throw new Error('storage disabled');
    },
    setItem() {
      throw new Error('quota exceeded');
    },
    removeItem() {
      throw new Error('storage disabled');
    },
  };

  const mgrBroken = new SessionManager({
    oauthClientId: 'client-2',
    storage: brokenStorage,
    loadGisScript: () => Promise.resolve(),
    getGisOAuth2: () => null,
  });
  assert.equal(mgrBroken.getRememberedMode(), null);
  assert.equal(mgrBroken.getAccountEmail(), null);
  mgrBroken.setRememberedMode('guest');
  mgrBroken.chooseGuest();
  await assert.rejects(() => mgrBroken.signInWithGoogle(), /failed to initialize/i);

  // Stub minimal document & window to exercise defaultLoadGisScript success & error
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const prevWin = (globalThis as Record<string, unknown>).window;
  t.after(() => {
    if (prevDoc === undefined) delete (globalThis as Record<string, unknown>).document;
    else Object.defineProperty(globalThis, 'document', { value: prevDoc, configurable: true });
    if (prevWin === undefined) delete (globalThis as Record<string, unknown>).window;
    else Object.defineProperty(globalThis, 'window', { value: prevWin, configurable: true });
  });

  const listeners = new Map<string, Array<() => void>>();
  let appendedScript: Record<string, unknown> | null = null;
  const fakeScript = {
    src: '',
    async: false,
    defer: false,
    addEventListener(type: string, fn: () => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type: string, fn: () => void) {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((f) => f !== fn)
      );
    },
  };

  const fakeWindow: Record<string, unknown> = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    google: undefined,
  };

  Object.defineProperty(globalThis, 'window', {
    value: fakeWindow,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: {
      querySelector: () => null,
      createElement: () => fakeScript,
      head: {
        appendChild(el: Record<string, unknown>) {
          appendedScript = el;
        },
      },
    },
    configurable: true,
    writable: true,
  });

  const mgrLoadErr = new SessionManager({
    oauthClientId: 'client-dom',
    storage: createMemoryStorage(),
  });
  const errPromise = mgrLoadErr.signInWithGoogle();
  assert.ok(appendedScript);
  for (const fn of listeners.get('error') ?? []) fn();
  await assert.rejects(() => errPromise, /Could not load Google Identity Services script/);

  // Now simulate successful script load
  listeners.clear();
  const mgrLoadOk = new SessionManager({
    oauthClientId: 'client-dom-ok',
    storage: createMemoryStorage(),
    fetchFn: () => Promise.resolve(new Response('{}', { status: 200 })),
  });
  const okPromise = mgrLoadOk.signInWithGoogle();
  fakeWindow.google = {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          callback: (r: { access_token: string; expires_in: number }) => void;
        }) {
          return {
            requestAccessToken() {
              config.callback({ access_token: 'dom-tok', expires_in: 600 });
            },
          };
        },
        hasGrantedAllScopes: () => true,
      },
    },
  };
  for (const fn of listeners.get('load') ?? []) fn();
  const tok = await okPromise;
  assert.equal(tok, 'dom-tok');
});

test('SessionManager handles defaultLoadGisScript 10s timeout (both reject and recovery), superseded requestGisToken, and fetchDriveUserEmail timeouts/errors', async (t) => {
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const prevWin = (globalThis as Record<string, unknown>).window;
  t.after(() => {
    if (prevDoc === undefined) delete (globalThis as Record<string, unknown>).document;
    else Object.defineProperty(globalThis, 'document', { value: prevDoc, configurable: true });
    if (prevWin === undefined) delete (globalThis as Record<string, unknown>).window;
    else Object.defineProperty(globalThis, 'window', { value: prevWin, configurable: true });
  });

  // 1. defaultLoadGisScript 10s timeout: rejects if GIS did not initialize, resolves if it appeared by timeout tick
  const listeners = new Map<string, Array<() => void>>();
  let scheduledTimeoutCb: (() => void) | null = null;
  let scheduledDelay = 0;

  const fakeScript = {
    src: '',
    async: false,
    defer: false,
    addEventListener(type: string, fn: () => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type: string, fn: () => void) {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((f) => f !== fn)
      );
    },
  };

  const fakeWindow: Record<string, unknown> = {
    setTimeout(fn: () => void, ms: number) {
      scheduledTimeoutCb = fn;
      scheduledDelay = ms;
      return 123;
    },
    clearTimeout() {
      scheduledTimeoutCb = null;
    },
    google: undefined,
  };

  Object.defineProperty(globalThis, 'window', {
    value: fakeWindow,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: {
      querySelector: () => null,
      createElement: () => fakeScript,
      head: { appendChild: () => {} },
    },
    configurable: true,
    writable: true,
  });

  const fireTimeout = () => {
    const cb = scheduledTimeoutCb;
    assert.ok(cb);
    cb();
  };

  const timeoutMgr = new SessionManager({
    oauthClientId: 'client-timeout',
    storage: createMemoryStorage(),
  });
  const timeoutPromise = timeoutMgr.signInWithGoogle();
  assert.equal(scheduledDelay, 10000);
  fireTimeout();
  await assert.rejects(() => timeoutPromise, /Timed out waiting for Google Identity Services/);

  // Recovery when window.google.accounts.oauth2 becomes defined right as the 10s timer fires
  listeners.clear();
  scheduledTimeoutCb = null;
  const recoveryMgr = new SessionManager({
    oauthClientId: 'client-recovery',
    storage: createMemoryStorage(),
    fetchFn: () =>
      Promise.resolve(
        new Response(JSON.stringify({ user: { emailAddress: 'recovered@example.com' } }), {
          status: 200,
        })
      ),
  });
  const recoveryPromise = recoveryMgr.signInWithGoogle();
  fakeWindow.google = {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          callback: (r: { access_token: string; expires_in: number }) => void;
        }) {
          return {
            requestAccessToken() {
              config.callback({ access_token: 'recovered-tok', expires_in: 600 });
            },
          };
        },
        hasGrantedAllScopes: () => true,
      },
    },
  };
  fireTimeout();
  assert.equal(await recoveryPromise, 'recovered-tok');
  assert.equal(recoveryMgr.getAccountEmail(), 'recovered@example.com');

  // 2. Parallel/overlapping requestGisToken supersedes earlier pending attempt
  let lastCallback: ((r: { access_token: string; expires_in: number }) => void) | null = null;
  const fakeOAuth2 = {
    initTokenClient(config: {
      callback: (r: { access_token: string; expires_in: number }) => void;
    }) {
      return {
        requestAccessToken() {
          lastCallback = config.callback;
        },
      };
    },
    hasGrantedAllScopes: () => true,
  };
  const supersededMgr = new SessionManager({
    oauthClientId: 'client-superseded',
    storage: createMemoryStorage(),
    getGisOAuth2: () => fakeOAuth2,
  });
  const reqToken = supersededMgr as unknown as {
    requestGisToken: (
      oauth2: typeof fakeOAuth2,
      cfg: { prompt?: string }
    ) => Promise<{
      access_token?: string;
    }>;
  };
  const firstAttempt = reqToken.requestGisToken(fakeOAuth2, { prompt: '' });
  const secondAttempt = reqToken.requestGisToken(fakeOAuth2, { prompt: 'select_account' });
  await assert.rejects(() => firstAttempt, /Superseded by a newer Google sign-in attempt/);
  lastCallback!({ access_token: 'second-wins', expires_in: 300 });
  const secondResult = await secondAttempt;
  assert.equal(secondResult.access_token, 'second-wins');

  // 3. fetchDriveUserEmail resilience: 2500ms abort timeout, non-OK HTTP, and invalid JSON fallback
  const prevSetTimeout = globalThis.setTimeout;
  const prevClearTimeout = globalThis.clearTimeout;
  t.after(() => {
    globalThis.setTimeout = prevSetTimeout;
    globalThis.clearTimeout = prevClearTimeout;
  });

  // 3a. 2500ms abort timeout triggers AbortController.abort(), sign-in still succeeds
  let sawAbortSignal = false;
  let capturedAbortTimerDelay = 0;
  globalThis.setTimeout = ((fn: () => void, delay?: number) => {
    if (delay === 2500) {
      capturedAbortTimerDelay = delay;
      queueMicrotask(fn);
      return 999 as unknown as ReturnType<typeof setTimeout>;
    }
    return prevSetTimeout(fn, delay);
  }) as typeof setTimeout;

  const storageAbort = createMemoryStorage();
  storageAbort.setItem('habits_google_email', 'fallback@example.com');
  const abortMgr = new SessionManager({
    oauthClientId: 'client-abort',
    storage: storageAbort,
    fetchFn: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          sawAbortSignal = true;
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      }),
    getGisOAuth2: () => ({
      initTokenClient(config) {
        return {
          requestAccessToken() {
            config.callback({ access_token: 'tok-abort-ok', expires_in: 600 });
          },
        };
      },
      hasGrantedAllScopes: () => true,
    }),
  });
  const abortTok = await abortMgr.signInWithGoogle();
  assert.equal(abortTok, 'tok-abort-ok');
  assert.equal(capturedAbortTimerDelay, 2500);
  assert.equal(sawAbortSignal, true);
  assert.equal(abortMgr.getAccountEmail(), 'fallback@example.com');

  // Restore real timers for 3b and 3c
  globalThis.setTimeout = prevSetTimeout;

  // 3b. Non-OK HTTP status preserves null email without failing sign-in
  const nonOkMgr = new SessionManager({
    oauthClientId: 'client-nonok',
    storage: createMemoryStorage(),
    fetchFn: () => Promise.resolve(new Response('Forbidden', { status: 403 })),
    getGisOAuth2: () => ({
      initTokenClient(config) {
        return {
          requestAccessToken() {
            config.callback({ access_token: 'tok-nonok', expires_in: 600 });
          },
        };
      },
      hasGrantedAllScopes: () => true,
    }),
  });
  assert.equal(await nonOkMgr.signInWithGoogle(), 'tok-nonok');
  assert.equal(nonOkMgr.getAccountEmail(), null);

  // 3c. Invalid JSON body preserves fallback email without failing sign-in
  const storageJson = createMemoryStorage();
  storageJson.setItem('habits_google_email', 'cached@example.com');
  const invalidJsonMgr = new SessionManager({
    oauthClientId: 'client-json',
    storage: storageJson,
    fetchFn: () => Promise.resolve(new Response('{invalid-json', { status: 200 })),
    getGisOAuth2: () => ({
      initTokenClient(config) {
        return {
          requestAccessToken() {
            config.callback({ access_token: 'tok-badjson', expires_in: 600 });
          },
        };
      },
      hasGrantedAllScopes: () => true,
    }),
  });
  assert.equal(await invalidJsonMgr.signInWithGoogle(), 'tok-badjson');
  assert.equal(invalidJsonMgr.getAccountEmail(), 'cached@example.com');
});

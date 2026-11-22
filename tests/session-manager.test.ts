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
    firebaseConfig: null,
    storage,
    nowFn: () => now,
    fetchFn: async () =>
      new Response(JSON.stringify({ user: { emailAddress: 'alex@example.com' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
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
    firebaseConfig: null,
    storage,
    fetchFn: async () => new Response('{}', { status: 200 }),
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

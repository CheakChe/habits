import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { FakeIndexedDBFactory } from '../helpers/fake-indexeddb';

describe('App integration', () => {
  const prevIndexedDB = globalThis.indexedDB;

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: new FakeIndexedDBFactory(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: prevIndexedDB,
      configurable: true,
      writable: true,
    });
  });

  it('starts at EntryView, enters Guest mode, navigates tabs, and creates a habit', async () => {
    render(() => <App />);

    // Starts on EntryView when no mode is remembered
    const guestBtn = screen.getByRole('button', { name: /continue as guest/i });
    fireEvent.click(guestBtn);

    // Wait for IndexedDB init & Today view
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^today$/i })).toBeInTheDocument()
    );

    // Create a habit via Today -> New Habit modal
    fireEvent.click(screen.getByRole('button', { name: /create first habit/i }));
    expect(screen.getByRole('dialog', { name: /new habit/i })).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText(/^name$/i), { target: { value: 'Stretch' } });
    fireEvent.click(screen.getByRole('button', { name: /create habit/i }));

    await waitFor(() => expect(screen.getByText('Stretch')).toBeInTheDocument());

    // Switch between top nav tabs: Habits, Tasks, Progress
    const nav = screen.getByRole('navigation', { name: /primary navigation/i });
    fireEvent.click(nav.querySelectorAll('button')[1]); // Habits
    expect(screen.getByRole('heading', { name: /^habits$/i })).toBeInTheDocument();

    fireEvent.click(nav.querySelectorAll('button')[2]); // Tasks
    expect(screen.getByRole('heading', { name: /^tasks$/i })).toBeInTheDocument();

    fireEvent.click(nav.querySelectorAll('button')[3]); // Progress
    expect(screen.getByRole('heading', { name: /^progress$/i })).toBeInTheDocument();

    // Open Account & Mode modal from header Guest Mode button
    fireEvent.click(screen.getByRole('button', { name: /guest mode/i }));
    expect(screen.getByRole('dialog', { name: /workspace & sync mode/i })).toBeInTheDocument();
  });

  it('boots in remembered Google mode, renders Google controls, creates tasks, switches Progress subtabs, and handles mobile nav', async () => {
    localStorage.setItem('habits_session_mode', 'google');
    localStorage.setItem('habits_google_email', 'alex@example.com');

    render(() => <App />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^today$/i })).toBeInTheDocument()
    );

    // Google header and sub-header bar
    expect(screen.getByText(/google mode \(alex@example\.com\)/i)).toBeInTheDocument();
    const driveBtn = screen.getByRole('button', { name: /reconnect drive/i });

    // Right-click Reconnect Drive opens Account & Mode modal
    fireEvent.contextMenu(driveBtn);
    expect(screen.getByRole('dialog', { name: /workspace & sync mode/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close modal/i }));

    // Open Reminders modal from sub-header
    fireEvent.click(screen.getByRole('button', { name: /^reminders$/i }));
    expect(screen.getByRole('dialog', { name: /reminders & app badge/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close modal/i }));

    // Use Tasks tab -> create a task -> complete it
    const mobileNav = screen.getByRole('navigation', { name: /mobile navigation/i });
    const mobileButtons = mobileNav.querySelectorAll('button');
    fireEvent.click(mobileButtons[2]); // Tasks
    expect(screen.getByRole('heading', { name: /^tasks$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /new task/i }));
    const taskDialog = screen.getByRole('dialog', { name: /new task/i });
    fireEvent.input(within(taskDialog).getByLabelText(/^title$/i), {
      target: { value: 'Ship v2' },
    });
    fireEvent.click(within(taskDialog).getByRole('button', { name: /^create task$/i }));
    await waitFor(() => expect(screen.getByText('Ship v2')).toBeInTheDocument());

    // Switch to Progress -> Charts & Advanced
    fireEvent.click(mobileButtons[3]); // Progress
    expect(screen.getByRole('heading', { name: /^progress$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /charts/i }));
    expect(screen.getByRole('heading', { name: /consistency trend/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /advanced/i }));
    expect(screen.getByText(/habit resilience & behavior/i)).toBeInTheDocument();

    // Switch to Habits & Today via mobile nav
    fireEvent.click(mobileButtons[1]);
    expect(screen.getByRole('heading', { name: /^habits$/i })).toBeInTheDocument();
    fireEvent.click(mobileButtons[0]);
    expect(screen.getByRole('heading', { name: /^today$/i })).toBeInTheDocument();

    // Clicking Reconnect Drive without OAuth configured displays error sync banner and can be dismissed
    fireEvent.click(screen.getByRole('button', { name: /reconnect drive/i }));
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(/google sign-in is not configured/i);
    fireEvent.click(within(banner).getByRole('button', { name: /dismiss message/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('supports Google sign-in, Drive upload, Version History inspect/restore, Calendar sync, and sign-out', async () => {
    let savedSnapshotBytes: Uint8Array = new Uint8Array();
    let driveFileCreated = false;
    let createdCalendar = false;

    const extractMultipartBytes = async (
      body: BodyInit | null | undefined
    ): Promise<Uint8Array> => {
      const buf: Uint8Array | null =
        body instanceof Uint8Array
          ? body
          : body instanceof Blob
            ? new Uint8Array(await body.arrayBuffer())
            : null;
      if (buf) {
        const marker = new TextEncoder().encode('application/octet-stream\r\n\r\n');
        const endMarker = new TextEncoder().encode('\r\n--');
        let startIdx = -1;
        for (let i = 0; i <= buf.length - marker.length; i++) {
          let match = true;
          for (let j = 0; j < marker.length; j++) {
            if (buf[i + j] !== marker[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            startIdx = i + marker.length;
            break;
          }
        }
        let endIdx = buf.length;
        for (let i = buf.length - endMarker.length; i >= Math.max(0, startIdx); i--) {
          let match = true;
          for (let j = 0; j < endMarker.length; j++) {
            if (buf[i + j] !== endMarker[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            endIdx = i;
            break;
          }
        }
        if (startIdx >= 0 && endIdx > startIdx) {
          return buf.slice(startIdx, endIdx);
        }
      }
      return new Uint8Array([1]);
    };

    vi.stubGlobal('__GOOGLE_OAUTH_CLIENT_ID__', 'test-client.apps.googleusercontent.com');
    const mockedFetch: typeof fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const method = init?.method ?? 'GET';

        if (url.includes('oauth2/v3/userinfo')) {
          return new Response(JSON.stringify({ email: 'sam@example.com' }), { status: 200 });
        }
        if (method === 'GET' && url.includes('/drive/v3/files?spaces=appDataFolder')) {
          if (url.includes('habits-reminders.json')) {
            return new Response(JSON.stringify({ files: [] }), { status: 200 });
          }
          return new Response(
            JSON.stringify({
              files: driveFileCreated
                ? [
                    {
                      id: 'drive-f1',
                      modifiedTime: '2026-11-25T10:00:00Z',
                      version: '2',
                      size: String(savedSnapshotBytes.byteLength),
                    },
                  ]
                : [],
            }),
            { status: 200 }
          );
        }
        if (url.includes('/upload/drive/v3/files')) {
          if (method === 'POST' && !url.includes('habits-reminders')) {
            const bodyText =
              init?.body instanceof Uint8Array
                ? new TextDecoder().decode(init.body)
                : init?.body instanceof Blob
                  ? await init.body.text()
                  : typeof init?.body === 'string'
                    ? init.body
                    : '';
            if (bodyText.includes('habits-reminders.json')) {
              return new Response(JSON.stringify({ id: 'meta-1' }), { status: 200 });
            }
            savedSnapshotBytes = await extractMultipartBytes(init?.body);
            driveFileCreated = true;
            return new Response(
              JSON.stringify({
                id: 'drive-f1',
                modifiedTime: '2026-11-25T10:00:00Z',
                version: '2',
              }),
              { status: 200 }
            );
          }
          if (method === 'PATCH') {
            savedSnapshotBytes = await extractMultipartBytes(init?.body);
            return new Response(
              JSON.stringify({
                id: 'drive-f1',
                modifiedTime: '2026-11-25T10:01:00Z',
                version: '3',
              }),
              { status: 200 }
            );
          }
          return new Response(JSON.stringify({ id: 'meta-1' }), { status: 200 });
        }
        if (method === 'GET' && url.endsWith('/drive/v3/files/drive-f1?alt=media')) {
          return new Response(new Uint8Array(savedSnapshotBytes), { status: 200 });
        }
        if (method === 'GET' && url.includes('/drive/v3/files/drive-f1/revisions?')) {
          return new Response(
            JSON.stringify({
              revisions: [
                {
                  id: 'rev-1',
                  modifiedTime: '2026-11-25T10:00:00Z',
                  size: String(savedSnapshotBytes.byteLength),
                  keepForever: true,
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (
          method === 'GET' &&
          url.includes('/drive/v3/files/drive-f1/revisions/rev-1?alt=media')
        ) {
          return new Response(new Uint8Array(savedSnapshotBytes), { status: 200 });
        }
        if (method === 'PATCH' && url.includes('/revisions/rev-1')) {
          return new Response(JSON.stringify({ id: 'rev-1', keepForever: true }), { status: 200 });
        }
        if (method === 'GET' && url.includes('/users/me/calendarList')) {
          return new Response(
            JSON.stringify({
              items: createdCalendar
                ? [{ id: 'cal-1', summary: 'Habits Reminders', timeZone: 'UTC' }]
                : [],
            }),
            { status: 200 }
          );
        }
        if (method === 'POST' && url.endsWith('/calendar/v3/calendars')) {
          createdCalendar = true;
          return new Response(
            JSON.stringify({ id: 'cal-1', summary: 'Habits Reminders', timeZone: 'UTC' }),
            { status: 200 }
          );
        }
        if (method === 'GET' && url.includes('/calendars/cal-1/events')) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        if (method === 'POST' && url.includes('/calendars/cal-1/events')) {
          return new Response(JSON.stringify({ id: 'ev-1' }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }
    );
    vi.stubGlobal('fetch', mockedFetch);

    Object.defineProperty(window, 'google', {
      configurable: true,
      writable: true,
      value: {
        accounts: {
          oauth2: {
            hasGrantedAllScopes: () => true,
            initTokenClient: (config: { callback: (res: unknown) => void }) => ({
              requestAccessToken: () => {
                config.callback({
                  access_token: 'tok-live',
                  expires_in: 3600,
                  scope:
                    'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/calendar.app.created',
                });
              },
            }),
          },
        },
      },
    });

    try {
      render(() => <App />);

      // Sign in via EntryView -> Sign in with Google
      fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^sync drive$/i })).toBeInTheDocument()
      );

      // Add a habit first, then upload snapshot via Sync Drive -> SyncConfirmModal
      fireEvent.click(screen.getByRole('button', { name: /create first habit/i }));
      const habitDialog = screen.getByRole('dialog', { name: /new habit/i });
      fireEvent.input(within(habitDialog).getByLabelText(/^name$/i), {
        target: { value: 'Cloud Walk' },
      });
      fireEvent.click(within(habitDialog).getByRole('button', { name: /create habit/i }));
      await waitFor(() => expect(screen.getByText('Cloud Walk')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /^sync drive$/i }));
      const syncModal = await screen.findByRole('dialog', {
        name: /create google drive snapshot/i,
      });
      fireEvent.click(within(syncModal).getByRole('button', { name: /upload snapshot/i }));
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/snapshot uploaded to google drive/i)
      );
      fireEvent.click(screen.getByRole('button', { name: /dismiss message/i }));

      // Open Version History -> Inspect -> Restore
      fireEvent.click(screen.getByRole('button', { name: /version history/i }));
      const revModal = await screen.findByRole('dialog', { name: /drive version history/i });
      await waitFor(() => expect(within(revModal).getByText(/rev #rev-1/i)).toBeInTheDocument());
      fireEvent.click(within(revModal).getByRole('button', { name: /^inspect$/i }));
      await waitFor(() =>
        expect(within(revModal).getByText(/revision #rev-1 contents/i)).toBeInTheDocument()
      );
      fireEvent.click(within(revModal).getByRole('button', { name: /restore this version/i }));
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/restored drive version/i)
      );

      // Open Reminders -> add a slot -> prepare & confirm Calendar sync
      fireEvent.click(screen.getByRole('button', { name: /^reminders/i }));
      const remModal = await screen.findByRole('dialog', { name: /reminders & app badge/i });
      fireEvent.input(within(remModal).getByLabelText(/new reminder slot label/i), {
        target: { value: 'Morning' },
      });
      fireEvent.click(within(remModal).getByRole('button', { name: /add slot/i }));
      await waitFor(() => expect(within(remModal).getByText(/1 slot/i)).toBeInTheDocument());

      fireEvent.click(within(remModal).getByRole('button', { name: /review & sync calendar/i }));
      const confirmCalBtn = await within(remModal).findByRole('button', {
        name: /confirm calendar update/i,
      });
      fireEvent.click(confirmCalBtn);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/google calendar updated/i)
      );
      fireEvent.click(within(remModal).getByRole('button', { name: /^close$/i }));

      // Brand wordmark click navigates back to Today from Habits tab
      const nav = screen.getByRole('navigation', { name: /primary navigation/i });
      fireEvent.click(nav.querySelectorAll('button')[1]);
      expect(screen.getByRole('heading', { name: /^habits$/i })).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: /^habits$/i })[0]);
      expect(screen.getByRole('heading', { name: /^today$/i })).toBeInTheDocument();

      // Switch Account or Mode returns to EntryView
      fireEvent.click(screen.getByRole('button', { name: /account & mode/i }));
      const accModal = screen.getByRole('dialog', { name: /workspace & sync mode/i });
      fireEvent.click(within(accModal).getByRole('button', { name: /switch account or mode/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /continue as guest/i })).toBeInTheDocument()
      );
    } finally {
      vi.unstubAllGlobals();
      delete (window as { google?: unknown }).google;
    }
  });

  it('persists sequential +1 / +5 measured habit increments in TodayView', async () => {
    render(() => <App />);

    fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^today$/i })).toBeInTheDocument()
    );

    // Create a measured habit with target 10 cups
    fireEvent.click(screen.getByRole('button', { name: /create first habit/i }));
    const habitDialog = screen.getByRole('dialog', { name: /new habit/i });
    fireEvent.input(within(habitDialog).getByLabelText(/^name$/i), { target: { value: 'Water' } });
    fireEvent.click(within(habitDialog).getByRole('button', { name: /^measured$/i }));
    fireEvent.input(within(habitDialog).getByLabelText(/^target$/i), { target: { value: '10' } });
    fireEvent.input(within(habitDialog).getByLabelText(/unit \(optional\)/i), {
      target: { value: 'cups' },
    });
    fireEvent.click(within(habitDialog).getByRole('button', { name: /create habit/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Water')).toBeInTheDocument();
    expect(screen.getByText('0/10 cups')).toBeInTheDocument();

    // Perform sequential +1, +5, +1, +5 increments
    fireEvent.click(screen.getByRole('button', { name: /add 1 cups to water/i }));
    await waitFor(() => expect(screen.getByText('1/10 cups')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add 5 cups to water/i }));
    await waitFor(() => expect(screen.getByText('6/10 cups')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add 1 cups to water/i }));
    await waitFor(() => expect(screen.getByText('7/10 cups')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add 5 cups to water/i }));
    await waitFor(() => expect(screen.getByText('12/10 cups')).toBeInTheDocument());

    // Target reached => main completion toggle marks habit done
    expect(screen.getByRole('button', { name: /reset water to 0/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('updates Progress charts reactively when toggling habit filter and switching timezone', async () => {
    render(() => <App />);

    fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^today$/i })).toBeInTheDocument()
    );

    // Create two habits: Alpha and Beta
    fireEvent.click(screen.getByRole('button', { name: /create first habit/i }));
    let dialog = screen.getByRole('dialog', { name: /new habit/i });
    fireEvent.input(within(dialog).getByLabelText(/^name$/i), { target: { value: 'Alpha' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /create habit/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Alpha')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /new habit/i }));
    dialog = screen.getByRole('dialog', { name: /new habit/i });
    fireEvent.input(within(dialog).getByLabelText(/^name$/i), { target: { value: 'Beta' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /create habit/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Beta')).toBeInTheDocument();

    // Mark Alpha done today
    fireEvent.click(screen.getByRole('button', { name: /mark alpha as done/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mark alpha as not done/i })).toBeInTheDocument()
    );

    // Navigate to Progress -> Charts
    const nav = screen.getByRole('navigation', { name: /primary navigation/i });
    fireEvent.click(nav.querySelectorAll('button')[3]);
    expect(screen.getByRole('heading', { name: /^progress$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /charts/i }));
    expect(screen.getByRole('heading', { name: /consistency trend/i })).toBeInTheDocument();

    // Filter out Beta via habit filter multiselect
    fireEvent.click(screen.getByRole('button', { name: /filter by habits/i }));
    const listbox = screen.getByRole('listbox', { name: /filter by habits/i });
    fireEvent.click(within(listbox).getByRole('option', { name: /beta/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /filter by habits/i })).toHaveTextContent(
        /^alpha$/i
      )
    );

    // Close habit filter and open Date Range & Timezone picker
    fireEvent.keyDown(document, { key: 'Escape' });
    const rangeTrigger = screen.getByRole('button', { name: /last 30 days/i });
    fireEvent.click(rangeTrigger);
    const rangeDialog = screen.getByRole('dialog', { name: /choose date range and timezone/i });
    fireEvent.click(within(rangeDialog).getByRole('button', { name: /all zones/i }));
    fireEvent.input(within(rangeDialog).getByPlaceholderText(/search iana timezone/i), {
      target: { value: 'America/New_York' },
    });
    fireEvent.click(within(rangeDialog).getByRole('button', { name: 'America/New_York' }));

    await waitFor(() => expect(rangeTrigger).toHaveTextContent(/new york/i));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('heading', { name: /consistency trend/i })).toBeInTheDocument();
  });

  it('renders a clear error banner when IndexedDB fails to open on boot without crashing', async () => {
    const failingFactory = {
      open() {
        const req: Record<string, unknown> = {
          result: null,
          error: new Error('Failed to open local IndexedDB: permission denied'),
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null,
        };
        queueMicrotask(() => {
          if (typeof req.onerror === 'function') {
            (req.onerror as (ev: Event) => void)(new Event('error'));
          }
        });
        return req as unknown as IDBOpenDBRequest;
      },
    };

    Object.defineProperty(globalThis, 'indexedDB', {
      value: failingFactory,
      configurable: true,
      writable: true,
    });

    render(() => <App />);
    fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }));

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(/failed to open local indexeddb/i);
    expect(screen.getByRole('heading', { name: /^today$/i })).toBeInTheDocument();
  });
});

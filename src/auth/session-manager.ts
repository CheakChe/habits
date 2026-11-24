import { SessionMode } from '../types/domain';

const SESSION_MODE_KEY = 'habits_session_mode';
const SESSION_EMAIL_KEY = 'habits_google_email';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/calendar.app.created',
] as const;

export interface SessionAuthState {
  hasToken: boolean;
  email: string | null;
}

export interface SignInOptions {
  interactiveAccountPicker?: boolean;
}

export interface SessionManagerDependencies {
  oauthClientId?: string | null;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  fetchFn?: typeof fetch;
  getGisOAuth2?: () => GisOAuth2 | null;
  loadGisScript?: () => Promise<void>;
  nowFn?: () => number;
}

type GisOAuth2 = NonNullable<NonNullable<NonNullable<Window['google']>['accounts']>['oauth2']>;

interface PendingGisRequest {
  resolve: (response: GisTokenResponse) => void;
  reject: (err: Error) => void;
}

export class SessionManager {
  private readonly oauthClientId: string | null;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  private readonly fetchFn: typeof fetch;
  private readonly getGisOAuth2Fn: () => GisOAuth2 | null;
  private readonly loadGisScriptFn: () => Promise<void>;
  private readonly nowFn: () => number;

  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;
  private rememberedEmail: string | null = null;
  private inFlightSignIn: Promise<string> | null = null;
  private gisTokenClient: GisTokenClient | null = null;
  private pendingGisRequest: PendingGisRequest | null = null;
  private authListeners = new Set<(state: SessionAuthState) => void>();

  constructor(deps: SessionManagerDependencies = {}) {
    this.storage =
      deps.storage !== undefined
        ? deps.storage
        : typeof localStorage !== 'undefined'
          ? localStorage
          : null;
    this.fetchFn =
      deps.fetchFn ??
      (typeof fetch !== 'undefined'
        ? fetch.bind(globalThis)
        : ((() => {
            throw new Error('fetch is not available');
          }) as typeof fetch));
    this.nowFn = deps.nowFn ?? (() => Date.now());
    this.getGisOAuth2Fn =
      deps.getGisOAuth2 ??
      (() => (typeof window !== 'undefined' ? (window.google?.accounts?.oauth2 ?? null) : null));
    this.loadGisScriptFn = deps.loadGisScript ?? (() => SessionManager.defaultLoadGisScript());

    const buildClientId =
      deps.oauthClientId !== undefined
        ? deps.oauthClientId
        : typeof __GOOGLE_OAUTH_CLIENT_ID__ !== 'undefined' && __GOOGLE_OAUTH_CLIENT_ID__
          ? __GOOGLE_OAUTH_CLIENT_ID__
          : null;

    this.oauthClientId =
      buildClientId && buildClientId.trim().length > 0 ? buildClientId.trim() : null;

    this.rememberedEmail = this.readRememberedEmail();
  }

  public isUsingGis(): boolean {
    return this.oauthClientId !== null;
  }

  public getRememberedMode(): SessionMode | null {
    try {
      const value = this.storage?.getItem(SESSION_MODE_KEY);
      if (value === 'guest' || value === 'google') {
        return value;
      }
      return null;
    } catch {
      return null;
    }
  }

  public setRememberedMode(mode: SessionMode | null): void {
    try {
      if (!this.storage) return;
      if (mode === null) {
        this.storage.removeItem(SESSION_MODE_KEY);
      } else {
        this.storage.setItem(SESSION_MODE_KEY, mode);
      }
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }

  private readRememberedEmail(): string | null {
    try {
      const value = this.storage?.getItem(SESSION_EMAIL_KEY)?.trim();
      return value ? value : null;
    } catch {
      return null;
    }
  }

  private writeRememberedEmail(email: string | null): void {
    this.rememberedEmail = email;
    try {
      if (!this.storage) return;
      if (!email) {
        this.storage.removeItem(SESSION_EMAIL_KEY);
      } else {
        this.storage.setItem(SESSION_EMAIL_KEY, email);
      }
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }

  private notifyAuthListeners(): void {
    const state: SessionAuthState = {
      hasToken: this.hasAccessToken(),
      email: this.rememberedEmail,
    };
    for (const listener of this.authListeners) {
      listener(state);
    }
  }

  public subscribeAuthChanges(onAuthUpdate: (state: SessionAuthState) => void): () => void {
    this.authListeners.add(onAuthUpdate);

    return () => {
      this.authListeners.delete(onAuthUpdate);
    };
  }

  public getAccessToken(): string | null {
    return this.hasAccessToken() ? this.cachedAccessToken : null;
  }

  public getTokenExpiresAt(): number {
    return this.hasAccessToken() ? this.tokenExpiresAt : 0;
  }

  public hasAccessToken(): boolean {
    if (!this.cachedAccessToken || this.cachedAccessToken.length === 0) {
      return false;
    }
    if (this.tokenExpiresAt > 0 && this.nowFn() >= this.tokenExpiresAt) {
      this.cachedAccessToken = null;
      this.tokenExpiresAt = 0;
      return false;
    }
    return true;
  }

  public getAccountEmail(): string | null {
    return this.rememberedEmail;
  }

  public chooseGuest(): void {
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
    this.writeRememberedEmail(null);
    this.setRememberedMode('guest');
    this.notifyAuthListeners();
  }

  public async signInWithGoogle(options: SignInOptions = {}): Promise<string> {
    if (this.inFlightSignIn) {
      return this.inFlightSignIn;
    }

    const task = this.executeSignInWithGoogle(options).finally(() => {
      if (this.inFlightSignIn === task) {
        this.inFlightSignIn = null;
      }
    });
    this.inFlightSignIn = task;
    return task;
  }

  private async executeSignInWithGoogle(options: SignInOptions): Promise<string> {
    if (this.oauthClientId) {
      return this.signInWithGis(options);
    }
    throw new Error(
      'Google Sign-In is not configured in this build. Continue as Guest or provide VITE_GOOGLE_OAUTH_CLIENT_ID during build.'
    );
  }

  private async signInWithGis(options: SignInOptions): Promise<string> {
    // Keep requestTokenClient synchronous inside the user click whenever gsi/client is already loaded.
    let oauth2 = this.getGisOAuth2Fn();
    if (!oauth2) {
      await this.loadGisScriptFn();
      oauth2 = this.getGisOAuth2Fn();
    }
    if (!oauth2) {
      throw new Error(
        'Google Identity Services failed to initialize. Please check your connection and try again.'
      );
    }

    const hintEmail = options.interactiveAccountPicker ? null : this.rememberedEmail;
    const initialPrompt: '' | 'select_account' =
      options.interactiveAccountPicker && !hintEmail ? 'select_account' : '';

    let tokenResponse: GisTokenResponse;
    try {
      tokenResponse = await this.requestGisToken(oauth2, {
        prompt: initialPrompt,
        ...(hintEmail ? { hint: hintEmail } : {}),
      });
    } catch (err) {
      if (err instanceof GisInteractionRequiredError) {
        tokenResponse = await this.requestGisToken(oauth2, {
          prompt: hintEmail ? 'consent' : 'select_account',
          ...(hintEmail ? { hint: hintEmail } : {}),
        });
      } else {
        throw err;
      }
    }

    if (!tokenResponse.access_token) {
      throw new Error('Could not obtain Google Workspace access permission.');
    }

    if (
      typeof oauth2.hasGrantedAllScopes === 'function' &&
      !oauth2.hasGrantedAllScopes(tokenResponse, WORKSPACE_SCOPES[0], WORKSPACE_SCOPES[1])
    ) {
      tokenResponse = await this.requestGisToken(oauth2, {
        prompt: 'consent',
        ...(hintEmail ? { hint: hintEmail } : {}),
      });
      if (
        !tokenResponse.access_token ||
        !oauth2.hasGrantedAllScopes(tokenResponse, WORKSPACE_SCOPES[0], WORKSPACE_SCOPES[1])
      ) {
        throw new Error(
          'Both Google Drive app-folder and Google Calendar permissions are required.'
        );
      }
    }

    const expiresInSec = Number(tokenResponse.expires_in) || 3600;
    this.cachedAccessToken = tokenResponse.access_token;
    this.tokenExpiresAt = this.nowFn() + Math.max(30, expiresInSec - 60) * 1000;
    this.setRememberedMode('google');

    const resolvedEmail = await this.fetchDriveUserEmail(tokenResponse.access_token);
    if (resolvedEmail) {
      this.writeRememberedEmail(resolvedEmail);
    }
    this.notifyAuthListeners();
    return tokenResponse.access_token;
  }

  private getOrCreateTokenClient(oauth2: GisOAuth2): GisTokenClient {
    if (this.gisTokenClient) {
      return this.gisTokenClient;
    }
    if (!this.oauthClientId) {
      throw new Error('Missing Google OAuth Client ID.');
    }
    this.gisTokenClient = oauth2.initTokenClient({
      client_id: this.oauthClientId,
      scope: WORKSPACE_SCOPES.join(' '),
      callback: (response: GisTokenResponse) => {
        const pending = this.pendingGisRequest;
        this.pendingGisRequest = null;
        if (!pending) return;

        if (response.error) {
          if (
            response.error === 'interaction_required' ||
            response.error === 'consent_required' ||
            response.error === 'login_required'
          ) {
            pending.reject(new GisInteractionRequiredError(response.error));
            return;
          }
          if (response.error === 'access_denied') {
            pending.reject(new Error('Google access permission was denied or cancelled.'));
            return;
          }
          pending.reject(
            new Error(response.error_description || `Google sign-in error: ${response.error}`)
          );
          return;
        }
        pending.resolve(response);
      },
      error_callback: (err: GisTokenClientError) => {
        const pending = this.pendingGisRequest;
        this.pendingGisRequest = null;
        if (!pending) return;

        if (err.type === 'popup_closed') {
          pending.reject(new Error('Google sign-in was cancelled.'));
          return;
        }
        if (err.type === 'popup_failed_to_open') {
          pending.reject(
            new Error(
              'Google sign-in popup was blocked by your browser. Allow popups and try again.'
            )
          );
          return;
        }
        pending.reject(new Error(err.message || 'Google sign-in failed.'));
      },
    });
    return this.gisTokenClient;
  }

  private requestGisToken(
    oauth2: GisOAuth2,
    overrideConfig: GisOverridableTokenClientConfig
  ): Promise<GisTokenResponse> {
    const client = this.getOrCreateTokenClient(oauth2);
    if (this.pendingGisRequest) {
      this.pendingGisRequest.reject(new Error('Superseded by a newer Google sign-in attempt.'));
      this.pendingGisRequest = null;
    }
    return new Promise<GisTokenResponse>((resolve, reject) => {
      this.pendingGisRequest = { resolve, reject };
      try {
        client.requestAccessToken(overrideConfig);
      } catch (err) {
        this.pendingGisRequest = null;
        reject(err instanceof Error ? err : new Error('Failed to launch Google sign-in.'));
      }
    });
  }

  private async fetchDriveUserEmail(accessToken: string): Promise<string | null> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId =
      controller && typeof setTimeout !== 'undefined'
        ? setTimeout(() => controller.abort(), 2500)
        : null;
    try {
      const res = await this.fetchFn(
        'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          ...(controller ? { signal: controller.signal } : {}),
        }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { user?: { emailAddress?: string } };
      const email = data?.user?.emailAddress?.trim();
      return email || null;
    } catch {
      return null;
    } finally {
      if (timeoutId !== null && typeof clearTimeout !== 'undefined') {
        clearTimeout(timeoutId);
      }
    }
  }

  public async clearSessionAndReturnToEntry(): Promise<void> {
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
    this.writeRememberedEmail(null);
    this.setRememberedMode(null);
    this.notifyAuthListeners();
  }

  public clearAccessTokenOnly(): void {
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
    this.notifyAuthListeners();
  }

  private static defaultLoadGisScript(): Promise<void> {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Document is not available.'));
    }
    if (window.google?.accounts?.oauth2) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
      const script = existing ?? document.createElement('script');

      const cleanup = () => {
        script.removeEventListener('load', handleLoad);
        script.removeEventListener('error', handleError);
        window.clearTimeout(timeoutId);
      };

      const handleLoad = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error('Could not load Google Identity Services script.'));
      };

      const timeoutId = window.setTimeout(() => {
        cleanup();
        if (window.google?.accounts?.oauth2) {
          resolve();
        } else {
          reject(new Error('Timed out waiting for Google Identity Services.'));
        }
      }, 10000);

      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);

      if (!existing) {
        script.src = GIS_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    });
  }
}

class GisInteractionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GisInteractionRequiredError';
  }
}

import { Accessor, Setter, createSignal } from 'solid-js';
import { SessionManager } from '../../auth/session-manager';
import { SessionMode } from '../../types/domain';

export interface AuthSliceDeps {
  session: SessionManager;
  onResetSyncState: () => void;
  onClearSyncBanner: () => void;
  onSyncErrorBanner: (text: string) => void;
}

export interface AuthSlice {
  mode: Accessor<SessionMode | null>;
  hasGoogleToken: Accessor<boolean>;
  googleEmail: Accessor<string | null>;
  isSigningIn: Accessor<boolean>;
  authError: Accessor<string | null>;
  accountModalOpen: Accessor<boolean>;
  setAccountModalOpen: Setter<boolean>;
  start: () => void;
  dispose: () => void;
  selectGuest: () => void;
  selectGoogle: () => Promise<void>;
  reconnectGoogle: () => Promise<void>;
  switchToEntry: () => Promise<void>;
  ensureGoogleToken: () => Promise<boolean>;
  handleAuthError: (msg: string) => void;
}

function isAuthErrorMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('authorization') ||
    lower.includes('permission') ||
    lower.includes('expired') ||
    lower.includes('401') ||
    lower.includes('403')
  );
}

export function createAuthSlice(deps: AuthSliceDeps): AuthSlice {
  const [mode, setMode] = createSignal<SessionMode | null>(deps.session.getRememberedMode());
  const [hasGoogleToken, setHasGoogleToken] = createSignal(deps.session.hasAccessToken());
  const [googleEmail, setGoogleEmail] = createSignal<string | null>(deps.session.getAccountEmail());
  const [isSigningIn, setIsSigningIn] = createSignal(false);
  const [authError, setAuthError] = createSignal<string | null>(null);
  const [accountModalOpen, setAccountModalOpen] = createSignal(false);

  let unsubscribeAuth: (() => void) | null = null;
  let tokenExpiryTimer: number | null = null;

  const clearTokenExpiryTimer = (): void => {
    if (tokenExpiryTimer !== null) {
      window.clearTimeout(tokenExpiryTimer);
      tokenExpiryTimer = null;
    }
  };

  const scheduleTokenExpiryTimer = (): void => {
    clearTokenExpiryTimer();
    const expiresAt = deps.session.getTokenExpiresAt();
    if (!expiresAt) return;
    const delayMs = Math.max(0, expiresAt - Date.now());
    tokenExpiryTimer = window.setTimeout(() => {
      tokenExpiryTimer = null;
      setHasGoogleToken(deps.session.hasAccessToken());
    }, delayMs + 50);
  };

  const start = (): void => {
    unsubscribeAuth = deps.session.subscribeAuthChanges((state) => {
      setHasGoogleToken(state.hasToken);
      setGoogleEmail(state.email);
      if (state.hasToken) {
        scheduleTokenExpiryTimer();
      } else {
        clearTokenExpiryTimer();
      }
    });
  };

  const dispose = (): void => {
    if (unsubscribeAuth) {
      unsubscribeAuth();
      unsubscribeAuth = null;
    }
    clearTokenExpiryTimer();
  };

  const selectGuest = (): void => {
    clearTokenExpiryTimer();
    deps.session.chooseGuest();
    deps.onResetSyncState();
    setAuthError(null);
    setHasGoogleToken(false);
    setGoogleEmail(null);
    deps.onClearSyncBanner();
    setMode('guest');
  };

  const selectGoogle = async (): Promise<void> => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await deps.session.signInWithGoogle({
        interactiveAccountPicker: !deps.session.getAccountEmail(),
      });
      setHasGoogleToken(deps.session.hasAccessToken());
      setGoogleEmail(deps.session.getAccountEmail());
      scheduleTokenExpiryTimer();
      setMode('google');
      deps.onClearSyncBanner();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const reconnectGoogle = async (): Promise<void> => {
    deps.onClearSyncBanner();
    try {
      await deps.session.signInWithGoogle({ interactiveAccountPicker: false });
      setHasGoogleToken(deps.session.hasAccessToken());
      setGoogleEmail(deps.session.getAccountEmail());
      scheduleTokenExpiryTimer();
    } catch (err) {
      deps.onSyncErrorBanner(
        err instanceof Error ? err.message : 'Could not reconnect Google account.'
      );
    }
  };

  const switchToEntry = async (): Promise<void> => {
    clearTokenExpiryTimer();
    await deps.session.clearSessionAndReturnToEntry();
    deps.onResetSyncState();
    setHasGoogleToken(false);
    setGoogleEmail(null);
    deps.onClearSyncBanner();
    setMode(null);
  };

  const ensureGoogleToken = async (): Promise<boolean> => {
    if (deps.session.hasAccessToken()) return true;
    await reconnectGoogle();
    return deps.session.hasAccessToken();
  };

  const handleAuthError = (msg: string): void => {
    if (isAuthErrorMessage(msg)) {
      deps.session.clearAccessTokenOnly();
      setHasGoogleToken(false);
    }
  };

  return {
    mode,
    hasGoogleToken,
    googleEmail,
    isSigningIn,
    authError,
    accountModalOpen,
    setAccountModalOpen,
    start,
    dispose,
    selectGuest,
    selectGoogle,
    reconnectGoogle,
    switchToEntry,
    ensureGoogleToken,
    handleAuthError,
  };
}

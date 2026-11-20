import { initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { SessionMode } from '../types/domain';

const SESSION_MODE_KEY = 'habits_session_mode';
const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export class SessionManager {
  private readonly auth: Auth | null;
  private readonly provider: GoogleAuthProvider | null;
  private cachedAccessToken: string | null = null;
  private isSigningIn = false;

  constructor() {
    const config = typeof __FIREBASE_CONFIG__ !== 'undefined' ? __FIREBASE_CONFIG__ : null;
    if (config && config.apiKey && config.authDomain && config.projectId) {
      const app = initializeApp(config);
      this.auth = getAuth(app);
      this.provider = new GoogleAuthProvider();
      this.provider.addScope(DRIVE_APPDATA_SCOPE);
    } else {
      this.auth = null;
      this.provider = null;
    }
  }

  public getRememberedMode(): SessionMode | null {
    try {
      const value = localStorage.getItem(SESSION_MODE_KEY);
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
      if (mode === null) {
        localStorage.removeItem(SESSION_MODE_KEY);
      } else {
        localStorage.setItem(SESSION_MODE_KEY, mode);
      }
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }

  public subscribeAuthChanges(onTokenLost: () => void): () => void {
    if (!this.auth) {
      return () => {};
    }
    return onAuthStateChanged(this.auth, (user) => {
      if (!user && !this.isSigningIn) {
        this.cachedAccessToken = null;
        onTokenLost();
      }
    });
  }

  public getAccessToken(): string | null {
    return this.cachedAccessToken;
  }

  public hasAccessToken(): boolean {
    return this.cachedAccessToken !== null && this.cachedAccessToken.length > 0;
  }

  public chooseGuest(): void {
    this.cachedAccessToken = null;
    this.setRememberedMode('guest');
  }

  public async signInWithGoogle(): Promise<string> {
    if (!this.auth || !this.provider) {
      throw new Error(
        'Google Sign-In is not configured in this build. Continue as Guest or provide FIREBASE_CONFIG_JSON during build.'
      );
    }
    this.isSigningIn = true;
    try {
      const result = await signInWithPopup(this.auth, this.provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Could not obtain Google Drive access permission.');
      }
      this.cachedAccessToken = credential.accessToken;
      this.setRememberedMode('google');
      return credential.accessToken;
    } finally {
      this.isSigningIn = false;
    }
  }

  public async clearSessionAndReturnToEntry(): Promise<void> {
    this.cachedAccessToken = null;
    this.setRememberedMode(null);
    if (this.auth) {
      try {
        await signOut(this.auth);
      } catch {
        // Safe fallback if already signed out
      }
    }
  }

  public clearAccessTokenOnly(): void {
    this.cachedAccessToken = null;
  }
}

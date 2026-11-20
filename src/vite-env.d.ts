/// <reference types="vite/client" />

interface FirebaseClientConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  storageBucket?: string;
  messagingSenderId?: string;
  oAuthClientId?: string;
}

declare const __FIREBASE_CONFIG__: FirebaseClientConfig | null;

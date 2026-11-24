/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GisTokenClientError {
  type?: 'popup_failed_to_open' | 'popup_closed' | 'unknown_error' | string;
  message?: string;
}

interface GisOverridableTokenClientConfig {
  prompt?: '' | 'none' | 'consent' | 'select_account';
  hint?: string;
  state?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: GisOverridableTokenClientConfig) => void;
}

interface GisTokenClientConfig {
  client_id: string;
  scope: string;
  hint?: string;
  callback: (response: GisTokenResponse) => void;
  error_callback?: (error: GisTokenClientError) => void;
}

interface Window {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: GisTokenClientConfig) => GisTokenClient;
        hasGrantedAllScopes?: (
          tokenResponse: GisTokenResponse,
          firstScope: string,
          ...restScopes: string[]
        ) => boolean;
        revoke?: (accessToken: string, done?: () => void) => void;
      };
    };
  };
}

declare const __GOOGLE_OAUTH_CLIENT_ID__: string | null;

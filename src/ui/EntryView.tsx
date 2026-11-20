import { JSX, Show } from 'solid-js';
import { DriveIcon, ShieldIcon } from './Icons';

interface EntryViewProps {
  onSelectGuest: () => void;
  onSelectGoogle: () => Promise<void>;
  isSigningIn: boolean;
  error: string | null;
}

export function EntryView(props: EntryViewProps): JSX.Element {
  return (
    <div class="min-h-screen bg-[#0A0B0E] text-[#F5F7FA] flex flex-col justify-between px-6 py-10">
      <header class="max-w-5xl w-full mx-auto flex items-center justify-between">
        <span class="font-display text-lg font-semibold tracking-tight text-[#F5F7FA]">
          Habits
        </span>
        <span class="text-xs text-[#8E95A5]">Local-first tracker</span>
      </header>

      <main class="max-w-5xl w-full mx-auto my-auto py-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div class="lg:col-span-7 space-y-6">
          <h1 class="font-display text-4xl sm:text-5xl font-semibold tracking-[-0.025em] leading-[1.1] text-[#F5F7FA]">
            Build daily momentum without friction.
          </h1>
          <p class="text-base sm:text-lg text-[#9AA1B1] leading-relaxed max-w-xl">
            Track scheduled habits, daily notes, tasks, and long-term streaks directly in your browser. Choose whether to keep everything strictly local or sync compact binary snapshots across devices via Google Drive.
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 max-w-xl">
            <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-5 space-y-2">
              <div class="flex items-center gap-2.5 text-sm font-medium text-[#F5F7FA]">
                <DriveIcon class="w-4 h-4 text-[#60A5FA]" />
                <span>Instant IndexedDB Store</span>
              </div>
              <p class="text-xs text-[#8E95A5] leading-relaxed">
                Every check-in and note saves locally in milliseconds and works completely offline.
              </p>
            </div>
            <div class="rounded-2xl bg-[#14161B] border border-white/[0.08] p-5 space-y-2">
              <div class="flex items-center gap-2.5 text-sm font-medium text-[#F5F7FA]">
                <ShieldIcon class="w-4 h-4 text-[#22C55E]" />
                <span>Private App-Folder Sync</span>
              </div>
              <p class="text-xs text-[#8E95A5] leading-relaxed">
                Google mode stores a single binary snapshot inside your hidden Drive app data folder.
              </p>
            </div>
          </div>
        </div>

        <div class="lg:col-span-5">
          <div class="rounded-3xl bg-[#14161B] border border-white/[0.08] p-7 sm:p-8 space-y-6">
            <div class="space-y-1.5">
              <h2 class="font-display text-xl font-semibold text-[#F5F7FA]">
                Choose how to start
              </h2>
              <p class="text-sm text-[#8E95A5]">
                Your choice is remembered on this device and can be changed anytime.
              </p>
            </div>

            <Show when={props.error}>
              {(err) => (
                <div
                  role="alert"
                  class="rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/25 px-4 py-3 text-xs text-[#FCA5A5]"
                >
                  {err()}
                </div>
              )}
            </Show>

            <div class="space-y-3">
              <button
                type="button"
                onClick={() => void props.onSelectGoogle()}
                disabled={props.isSigningIn}
                class="gsi-material-button w-full"
              >
                <div class="gsi-material-button-state" />
                <div class="gsi-material-button-content-wrapper">
                  <div class="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span class="gsi-material-button-contents">
                    {props.isSigningIn ? 'Signing in...' : 'Sign in with Google'}
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => props.onSelectGuest()}
                disabled={props.isSigningIn}
                class="w-full h-11 rounded-full bg-[#1C1F26] hover:bg-[#252933] border border-white/[0.08] text-sm font-medium text-[#F5F7FA] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>Continue as Guest</span>
              </button>
            </div>

            <p class="text-xs text-[#8E95A5] leading-relaxed">
              Guest mode never makes network requests. Google mode requests permission solely for the app&apos;s private Drive configuration folder.
            </p>
          </div>
        </div>
      </main>

      <footer class="max-w-5xl w-full mx-auto text-xs text-[#6B7280] flex items-center justify-between">
        <span>Habits</span>
        <span>Offline-capable IndexedDB persistence</span>
      </footer>
    </div>
  );
}

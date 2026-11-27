import { JSX, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { CloseIcon, InstallAppIcon, WifiOffIcon } from './Icons';
import { useBodyScrollLock } from './scroll-lock';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = createSignal<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = createSignal(false);
  const [isIOS, setIsIOS] = createSignal(false);

  onMount(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    onCleanup(() => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    });
  });

  const install = async (): Promise<boolean> => {
    const evt = deferredPrompt();
    if (!evt) return false;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: () => deferredPrompt() !== null,
    isInstalled,
    isIOS,
    install,
  };
}

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
}

export function PWAInstallButton(props: PWAInstallButtonProps): JSX.Element {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = createSignal(false);

  useBodyScrollLock(showIOSGuide);

  createEffect(() => {
    if (!showIOSGuide()) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        setShowIOSGuide(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  const buttonClass = () =>
    props.variant === 'full'
      ? 'w-full h-11 rounded-xl bg-surface-elevated hover:bg-surface-hover border border-white/[0.08] text-sm font-medium text-ink inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
      : 'h-9 px-3 rounded-xl bg-surface hover:bg-surface-elevated border border-white/[0.08] text-xs font-medium text-ink inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer';

  return (
    <Show when={!isInstalled() && (isInstallable() || isIOS())}>
      <Show
        when={isInstallable()}
        fallback={
          <>
            <button type="button" onClick={() => setShowIOSGuide(true)} class={buttonClass()}>
              <InstallAppIcon class="h-3.5 w-3.5 text-accent-soft" />
              <span>Install App</span>
            </button>

            <Show when={showIOSGuide()}>
              <Portal>
                <div
                  class="fixed inset-0 z-[60] flex items-end justify-center overscroll-none bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="ios-install-title"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setShowIOSGuide(false);
                  }}
                >
                  <div class="max-h-modal w-full space-y-4 overflow-y-auto overscroll-contain rounded-t-3xl border border-white/[0.08] bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-3xl sm:pb-6">
                    <div class="flex items-center justify-between">
                      <h3
                        id="ios-install-title"
                        class="font-display text-base font-semibold text-ink"
                      >
                        Install on iPhone / iPad
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowIOSGuide(false)}
                        aria-label="Close instructions"
                        class="flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-full text-ink-subtle hover:bg-white/[0.06] hover:text-ink"
                      >
                        <CloseIcon class="h-4 w-4" />
                      </button>
                    </div>
                    <ol class="list-inside list-decimal space-y-2.5 text-xs leading-relaxed text-ink-secondary">
                      <li>
                        Tap the <strong class="text-ink">Share</strong> button in Safari&apos;s
                        toolbar (or inside the <strong class="text-ink">···</strong> menu).
                      </li>
                      <li>
                        Scroll down and tap <strong class="text-ink">Add to Home Screen</strong>.
                      </li>
                    </ol>
                    <button
                      type="button"
                      onClick={() => setShowIOSGuide(false)}
                      class="h-10 w-full cursor-pointer rounded-xl bg-accent text-xs font-medium text-white transition-colors hover:bg-accent-hover"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </Portal>
            </Show>
          </>
        }
      >
        <button type="button" onClick={() => void install()} class={buttonClass()}>
          <InstallAppIcon class="h-3.5 w-3.5 text-accent-soft" />
          <span>Install App</span>
        </button>
      </Show>
    </Show>
  );
}

export function OfflineBanner(): JSX.Element {
  const [isOnline, setIsOnline] = createSignal(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  onMount(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    onCleanup(() => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    });
  });

  return (
    <Show when={!isOnline()}>
      <div
        role="status"
        class="flex items-center gap-2.5 rounded-2xl border border-warning/25 bg-warning/10 px-4 py-2.5 text-xs text-warning-soft"
      >
        <WifiOffIcon class="h-4 w-4 shrink-0" />
        <span>Offline Mode — Local IndexedDB changes are saved automatically.</span>
      </div>
    </Show>
  );
}

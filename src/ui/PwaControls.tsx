import { JSX, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { CloseIcon, InstallAppIcon, WifiOffIcon } from './Icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    createSignal<BeforeInstallPromptEvent | null>(null);
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

  const buttonClass = () =>
    props.variant === 'full'
      ? 'w-full h-11 rounded-xl bg-[#1C1F26] hover:bg-[#252933] border border-white/[0.08] text-sm font-medium text-[#F5F7FA] inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
      : 'h-9 px-3 rounded-xl bg-[#14161B] hover:bg-[#1C1F26] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer';

  return (
    <Show when={!isInstalled() && (isInstallable() || isIOS())}>
      <Show
        when={isInstallable()}
        fallback={
          <>
            <button
              type="button"
              onClick={() => setShowIOSGuide(true)}
              class={buttonClass()}
            >
              <InstallAppIcon class="w-3.5 h-3.5 text-[#60A5FA]" />
              <span>Install App</span>
            </button>

            <Show when={showIOSGuide()}>
              <div
                class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ios-install-title"
              >
                <div class="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#14161B] border border-white/[0.08] p-6 space-y-4">
                  <div class="flex items-center justify-between">
                    <h3
                      id="ios-install-title"
                      class="font-display text-base font-semibold text-[#F5F7FA]"
                    >
                      Install on iPhone / iPad
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowIOSGuide(false)}
                      aria-label="Close instructions"
                      class="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-[#8E95A5] hover:text-[#F5F7FA] hover:bg-white/[0.06] cursor-pointer"
                    >
                      <CloseIcon class="w-4 h-4" />
                    </button>
                  </div>
                  <ol class="text-xs text-[#C8CDD8] space-y-2 leading-relaxed list-decimal list-inside">
                    <li>
                      Tap the <strong class="text-[#F5F7FA]">Share</strong> button in
                      Safari&apos;s toolbar.
                    </li>
                    <li>
                      Scroll down and tap{' '}
                      <strong class="text-[#F5F7FA]">Add to Home Screen</strong>.
                    </li>
                  </ol>
                  <button
                    type="button"
                    onClick={() => setShowIOSGuide(false)}
                    class="w-full h-10 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </Show>
          </>
        }
      >
        <button type="button" onClick={() => void install()} class={buttonClass()}>
          <InstallAppIcon class="w-3.5 h-3.5 text-[#60A5FA]" />
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
        class="rounded-2xl px-4 py-2.5 bg-[#F59E0B]/10 border border-[#F59E0B]/25 text-xs text-[#FCD34D] flex items-center gap-2.5"
      >
        <WifiOffIcon class="w-4 h-4 shrink-0" />
        <span>Offline Mode — Local IndexedDB changes are saved automatically.</span>
      </div>
    </Show>
  );
}

import { deviceLocale } from '../../../locales/runtime';
/** Registers the offline service worker in production builds served over HTTPS (or localhost). */
export function registerServiceWorker(notify: (text: string) => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) notify('A new version is ready. Close and reopen the game to update.');
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(deviceLocale() === 'en' ? './sw.js' : './sw.js?lang=' + encodeURIComponent(deviceLocale())).catch((e) => console.warn('Service worker registration failed', e));
  });
  if (document.readyState === 'complete') {
    navigator.serviceWorker.register(deviceLocale() === 'en' ? './sw.js' : './sw.js?lang=' + encodeURIComponent(deviceLocale())).catch((e) => console.warn('Service worker registration failed', e));
  }
}

/** What `updateWebApp` found. */
type WebUpdateResult = 'reloading' | 'current' | 'timeout' | 'unavailable';

/**
 * "Update Kagemura" on the web (client re-audit item 11): a bare reload could keep the same
 * build (the service worker serves its cache) and loop. Ask the worker to check for a new build,
 * wait until it is installed (or `timeoutMs`), then reload. When the server has nothing newer,
 * say so instead of reloading into the same version. `beforeReload` saves the village first.
 */
export async function updateWebApp(beforeReload: () => Promise<unknown>, note: (text: string) => void, timeoutMs = 45_000): Promise<WebUpdateResult> {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  const reg = sw ? await sw.getRegistration().catch(() => undefined) : undefined;
  if (!reg) {
    // No offline copy (development, private mode): a reload fetches the newest page.
    await beforeReload().catch(() => undefined);
    location.reload();
    return 'reloading';
  }
  note('Checking for the new version…');
  try {
    await reg.update();
  } catch {
    return 'timeout'; // offline or the server did not answer
  }
  const incoming = reg.installing ?? reg.waiting;
  if (!incoming) return 'current';
  note('Downloading the new version…');
  const ready = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    const check = () => {
      if (incoming.state === 'installed' || incoming.state === 'activated' || incoming.state === 'activating') {
        clearTimeout(timer);
        resolve(true);
      } else if (incoming.state === 'redundant') {
        clearTimeout(timer);
        resolve(false);
      }
    };
    incoming.addEventListener('statechange', check);
    check();
  });
  if (!ready) return 'timeout';
  note('Restarting…');
  await beforeReload().catch(() => undefined);
  // The new worker takes over (it calls skipWaiting); reload once it controls the page, or soon anyway.
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 3000);
    sw!.addEventListener('controllerchange', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
    incoming.postMessage?.({ type: 'skipWaiting' });
  });
  location.reload();
  return 'reloading';
}

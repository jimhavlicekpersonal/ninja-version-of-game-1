/** Registers the offline service worker in production builds served over HTTPS (or localhost). */
export function registerServiceWorker(notify: (text: string) => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) notify('A new version is ready. Close and reopen the game to update.');
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker registration failed', e));
  });
  if (document.readyState === 'complete') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker registration failed', e));
  }
}

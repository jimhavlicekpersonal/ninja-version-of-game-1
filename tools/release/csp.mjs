// Beast Mode SEC-10 (F2): the web game's Content-Security-Policy, built from the final index.html (vite.config.ts
// `cspMeta`) and checked by tests/backend/csp.test.ts. Plain ES module so the config and the tests share it.
import { createHash } from 'node:crypto';

/**
 * The policy for one built page: every inline script's SHA-256, the game's own origin, the server
 * (VITE_SERVER_URL), Sentry (VITE_SENTRY_DSN's host) and the Google and Apple sign-in hosts.
 * @param {string} html
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function cspContent(html, env) {
  const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  const origin = (u) => {
    try {
      return u ? new URL(u.trim()).origin : '';
    } catch {
      return '';
    }
  };
  const sentry = origin(env.VITE_SENTRY_DSN ? env.VITE_SENTRY_DSN.replace(/\/\/[^@/]*@/, '//') : undefined);
  const connect = ["'self'", origin(env.VITE_SERVER_URL), sentry, 'https://oauth2.googleapis.com', 'https://accounts.google.com', 'https://appleid.apple.com'].filter(Boolean);
  return [
    "default-src 'self'",
    `script-src 'self' ${[...new Set(hashes)].join(' ')} https://accounts.google.com/gsi/client https://appleid.cdn-apple.com`,
    `connect-src ${[...new Set(connect)].join(' ')}`,
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    'frame-src https://accounts.google.com https://appleid.apple.com',
    "media-src 'self' data: blob:",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'none'",
  ].join('; ');
}


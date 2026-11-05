/**
 * Outbound HTTP with a deadline (state-of-the-game report, section 5 step 2,
 * backend A10). Google Play, FCM, the sign-in key sets and Play Games were
 * called with a bare `fetch`: a stalled endpoint kept a request handler (and
 * its socket) waiting forever. `timedFetch` aborts the request, and the
 * reading of its body, after `ms`, and keeps any signal the caller passes.
 */

/** Long enough for a slow store API, short enough that a player's request does not hang. */
export const OUTBOUND_TIMEOUT_MS = 10_000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Statuses whose responses cannot carry a body (the Response constructor refuses one). */
const NULL_BODY = new Set([101, 204, 205, 304]);

/** `f`, with the whole exchange (headers and body) inside `ms`. */
export function timedFetch(f: FetchLike, ms = OUTBOUND_TIMEOUT_MS): FetchLike {
  return async (url, init = {}) => {
    const ctrl = new AbortController();
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return 'the server';
      }
    })();
    const timer = setTimeout(() => ctrl.abort(new Error(`No answer from ${host} within ${ms} ms.`)), ms);
    const outer = init.signal;
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true });
    }
    try {
      const res = await f(url, { ...init, signal: ctrl.signal });
      // Read the body inside the deadline too: a stalled body is the same hang as a stalled header.
      const body = NULL_BODY.has(res.status) ? null : await res.arrayBuffer();
      return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch (e) {
      if (ctrl.signal.aborted && ctrl.signal.reason instanceof Error) throw ctrl.signal.reason;
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };
}

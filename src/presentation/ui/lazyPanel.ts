/**
 * Panels loaded on first use (quality 31): Alliance, Friends, Settings and the Codex sit in their own
 * chunks. A failed load must not stick: `??=` on the import promise kept a rejected promise for the
 * whole session, so after one network failure, or after an update had replaced the old chunk files,
 * the panel never opened again and said nothing. `lazyPanel` forgets a failed load (the next tap
 * tries again) and reports it once per attempt.
 */

/** A load function that is retried after a failure; resolves to null when the load failed. */
export function lazyPanel<T>(load: () => Promise<T>, onError: (error: unknown) => void): () => Promise<T | null> {
  let pending: Promise<T> | null = null;
  return () => {
    const attempt = (pending ??= load());
    return attempt.then(
      (v) => v,
      (e: unknown) => {
        if (pending === attempt) pending = null;
        onError(e);
        return null;
      },
    );
  };
}

/**
 * Whether a failed dynamic import looks like a game that was updated under the open page: the browser
 * is online but the chunk it asked for is gone (Chrome "Failed to fetch dynamically imported module",
 * Safari "Importing a module script failed", Firefox "error loading dynamically imported module", Vite's
 * preload helper "Unable to preload CSS"). Offline the same errors are just the connection.
 */
export function staleChunkError(error: unknown, online: boolean): boolean {
  if (!online) return false;
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|Unable to preload|ChunkLoadError/i.test(text);
}

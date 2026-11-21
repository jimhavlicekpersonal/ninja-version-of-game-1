/** Beast Mode 2026-11-21 STB-05 / OPS-08: crash reports carry context; opt-in sessions give release health a denominator. */
import { describe, expect, it } from 'vitest';
import { CrashReporter } from '../../src/backend/analytics/crashReports';

const DSN = 'https://key@o1.ingest.sentry.io/42';

function reporter(enabled = true) {
  const posts: string[] = [];
  let on = enabled;
  const r = new CrashReporter({ dsn: DSN, release: 'kagemura@0.1.0+abc', dist: 'web', environment: 'web', enabled: () => on, context: () => ({ scene: 'battle', battle: 'true', quality: 'low', renderer: 'canvas', lastCommand: 'train' }), post: (_u, b) => posts.push(b), now: () => 1_000_000 });
  return { r, posts, set: (v: boolean) => (on = v) };
}
const items = (body: string) => body.trim().split('\n').map((l) => JSON.parse(l));

describe('STB-05 / OPS-08', () => {
  it('a report carries the context as tags', () => {
    const { r, posts } = reporter();
    r.report(new Error('boom'), { kind: 'error' });
    const event = items(posts[0])[2];
    expect(event.tags).toMatchObject({ scene: 'battle', battle: 'true', quality: 'low', renderer: 'canvas', lastCommand: 'train', kind: 'error', side: 'client' });
  });

  it('a session starts with the same release, counts errors, ends exited or crashed, and carries no user id', () => {
    const { r, posts } = reporter();
    r.startSession();
    r.report(new Error('x'));
    r.endSession('crashed');
    const sessions = posts.map(items).filter((i) => i[1].type === 'session').map((i) => i[2]);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ init: true, status: 'ok', attrs: { release: 'kagemura@0.1.0+abc', environment: 'web' } });
    expect(sessions[1]).toMatchObject({ init: false, status: 'crashed', errors: 1 });
    for (const s of sessions) expect(s.did).toBeUndefined();
  });

  it('nothing is posted while crash reports are off', () => {
    const { r, posts } = reporter(false);
    r.startSession();
    r.report(new Error('x'));
    r.endSession('exited');
    expect(posts).toHaveLength(0);
  });
});

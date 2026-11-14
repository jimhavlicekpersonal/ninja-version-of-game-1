/**
 * Error codes (2026-11-14, GUI request "server messages are English sentences"): every player-facing server
 * error and moderation notice carries a stable code from the `srv.*` catalog (locales/en/messages.json) with
 * its parameters, next to the English older games show; the game renders the code in the player's language
 * and falls back to matching the English when a server sends none.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import english from '../../../locales/en/messages.json';
import spanish from '../../../locales/compiled/es.json';
import chinese from '../../../locales/compiled/zh-Hans.json';
import { messageParts, partsText, rememberServerMessage, sourceText } from '../../../locales/runtime';
import { REPORT_REASONS, Routes, type ErrorBody } from '../../../src/backend/net/protocol';
import { ServerError } from '../../../src/backend/net/ports';
import { setup } from './httpHarness';

const ROOT = join(__dirname, '../../..');
const STAFF = 'staff-token-0123456789-abcdefgh';
const serverFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? (d.name === 'rules' || d.name === 'migrations' ? [] : serverFiles(`${dir}/${d.name}`)) : d.name.endsWith('.ts') ? [`${dir}/${d.name}`] : [],
  );
const sources = Object.fromEntries(serverFiles('server').map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
const codes = Object.keys(english).filter((k) => k.startsWith('srv.')).map((k) => k.slice(4));

describe('the error code catalog', () => {
  it('every error the server throws goes through core/errors.ts: a code, or staff-only English', () => {
    const raw = Object.entries(sources).filter(([f, s]) => f !== 'server/core/errors.ts' && /new ApiError\(/.test(s)).map(([f]) => f);
    expect(raw).toEqual([]);
    // Staff-only English stays in the admin API and the staff halves of reports, deletion requests, complaints and store webhooks.
    const staff = Object.entries(sources).filter(([f, s]) => f !== 'server/core/errors.ts' && /staffError\(/.test(s)).map(([f]) => f).sort();
    expect(staff).toEqual(['server/app.ts', 'server/core/account.ts', 'server/core/admin.ts', 'server/core/complaints.ts', 'server/core/moderation.ts', 'server/core/purchases.ts']);
  });

  it('codes are unique and every one is used by the server', () => {
    const text = readFileSync(join(ROOT, 'locales/en/messages.json'), 'utf8');
    const keys = [...text.matchAll(/^\s*"(srv\.[^"]+)":/gm)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(keys.length);
    const all = Object.values(sources).join('\n');
    const unused = codes.filter((c) => c !== 'join' && !c.startsWith('moderation.rule.') && !all.includes(`'${c}'`));
    expect(unused).toEqual([]);
    // The report reasons' words come from the catalog (`REASON_TEXT`), one code per reason.
    expect(codes.filter((c) => c.startsWith('moderation.rule.')).map((c) => c.slice(16)).sort()).toEqual([...REPORT_REASONS].sort());
  });

  it('the English the server sends is the catalog English with the parameters filled in', () => {
    expect(partsText([{ key: 'gang.max_members', params: { max: 30 } }], 'en')).toBe('A Gang has at most 30 members.');
    expect(partsText([{ key: 'rate.player', params: { seconds: 1 } }], 'en')).toBe('Too many requests. Try again in 1 second.');
    expect(partsText([{ key: 'chat.muted_hours', params: { hours: 2, until: 'Sat, 14 Nov 2026 10:00:00 GMT' } }, { key: 'moderation.appeal' }], 'en')).toBe(
      'A moderator paused your chat for 2 more hours (until Sat, 14 Nov 2026 10:00:00 GMT). If you think this was a mistake, contact support from Settings → Privacy and help with your Player ID, and we will look again.',
    );
    // Languages written without spaces join sentences without one.
    expect(partsText([{ key: 'signin.first' }, { key: 'moderation.appeal' }], 'zh-Hans', chinese)).not.toMatch(/。 /);
  });
});

describe('error bodies and notices over HTTP', () => {
  it('a refusal carries key, params and the following sentences; the English message is unchanged', async () => {
    const s = setup({ adminTokens: { mod: STAFF } });
    const none = await s.call('GET', Routes.me);
    expect(none.status).toBe(401);
    expect(none.body).toEqual({ error: 'unauthorized', message: 'Unknown or missing player token.', key: 'auth.unknown_token' } satisfies ErrorBody);

    const bob = await s.register('Bob Codes');
    expect((await s.call('POST', `/admin/v1/players/${bob.playerId}/ban`, STAFF, { hours: 24, reason: 'Rule 7, repeated' })).status).toBe(200);
    const banned = await s.call('GET', Routes.me, bob.token);
    expect(banned.status).toBe(403);
    const until = new Date(s.now() + 24 * 3_600_000).toUTCString();
    expect(banned.body).toEqual({
      error: 'banned',
      message: `This account is suspended from online play until ${until}: Rule 7, repeated. Your village on this device is not affected. If you think this was a mistake, contact support from Settings → Privacy and help with your Player ID, and we will look again.`,
      key: 'auth.banned_reason',
      params: { until, reason: 'Rule 7, repeated' },
      more: [{ key: 'moderation.appeal' }],
    });

    // The game shows the codes in the player's language, wherever the English travels as a plain string.
    const body = banned.body as ErrorBody;
    const e = new ServerError(403, body.error, body.message, messageParts([{ key: body.key!, params: body.params }, ...(body.more ?? [])]));
    expect(e.parts?.[0].key).toBe('auth.banned_reason');
    const es = sourceText(e.message, 'es', spanish);
    expect(es).toContain('Rule 7, repeated'); // staff-written: kept as written
    expect(es).not.toBe(e.message);
    expect(es).toBe(partsText(e.parts!, 'es', spanish));
    expect(sourceText(e.message, 'en')).toBe(e.message);

    // Lift the ban: the suspension notice is kept with its codes.
    s.advance(60_000);
    await s.call('POST', `/admin/v1/players/${bob.playerId}/ban`, STAFF, { hours: 0 });
    const notices = (await s.call('GET', Routes.notices, bob.token)).body.notices as { text: string; parts?: { key: string }[] }[];
    expect(notices.map((n) => n.parts?.map((p) => p.key))).toEqual([['moderation.unsuspended'], ['moderation.suspended', 'moderation.appeal']]);
    for (const n of notices) expect(n.text).toBe(partsText(n.parts!, 'en'));
  });

  it('unknown codes from a newer server, or no codes from an older one, fall back to matching the English', () => {
    expect(messageParts([{ key: 'from.the.future' }])).toBeUndefined();
    expect(messageParts([{ key: 'signin.first', params: { x: { nested: true } } }])).toEqual([{ key: 'signin.first' }]);
    const legacy = 'Sign in on this device first.';
    expect(sourceText(legacy, 'es', spanish)).toBe(spanish['server.sign_in_on_this_device_first_13cf1bc575']);
    rememberServerMessage('Totally new English', [{ key: 'from.the.future' }]);
    expect(sourceText('Totally new English', 'es', spanish)).toBe('Totally new English');
  });
});

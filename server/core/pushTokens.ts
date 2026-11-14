import availability from '../../locales/availability.json';
/** Devices that receive server push (roadmap step 40): register, update choices, stop. */
import type { PushTokenRequest } from '../../src/backend/net/protocol';
import type { Player } from '../repo';
import { type ServerContext } from './context';
import { fail } from './errors';
import { checkPushAllowed } from './compliance';

export async function putPushToken(ctx: ServerContext, me: Player, body: Partial<PushTokenRequest> | undefined): Promise<{ ok: true; enabled: boolean }> {
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!/^[A-Za-z0-9:_\-.]{16,4096}$/.test(token)) throw fail(400, 'bad_request', 'push.bad_token');
  if (body?.platform !== 'ios' && body?.platform !== 'android') throw fail(400, 'bad_request', 'push.bad_platform');
  // Compliance switches 2026-11-14 (C04): no push token is kept for an under-13 player.
  await checkPushAllowed(ctx, me);
  const known = new Set(ctx.data.notifications.types.map((t) => t.id));
  const types = Array.isArray(body.types) ? [...new Set(body.types.map(String).filter((t) => known.has(t)))] : [];
  const tz = Number(body.tzOffsetMinutes);
  if (!Number.isInteger(tz) || Math.abs(tz) > 14 * 60) throw fail(400, 'bad_request', 'push.bad_zone');
  const locale = typeof body.locale === 'string' && (availability as Record<string, {ready: boolean}>)[body.locale]?.ready ? body.locale : 'en';
  await ctx.repo.putPushToken({ locale, token, playerId: me.id, platform: body.platform, types, tzOffsetMinutes: tz, updatedAt: ctx.now() });
  return { ok: true, enabled: ctx.push.enabled };
}

export async function deletePushToken(ctx: ServerContext, me: Player, token: unknown): Promise<{ ok: true }> {
  const t = String(token ?? '');
  if ((await ctx.repo.pushTokensOf(me.id)).some((x) => x.token === t)) await ctx.repo.removePushToken(t);
  return { ok: true };
}

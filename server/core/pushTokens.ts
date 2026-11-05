/** Devices that receive server push (roadmap step 40): register, update choices, stop. */
import type { PushTokenRequest } from '../../src/backend/net/protocol';
import type { Player } from '../repo';
import { ApiError, type ServerContext } from './context';

export async function putPushToken(ctx: ServerContext, me: Player, body: Partial<PushTokenRequest> | undefined): Promise<{ ok: true; enabled: boolean }> {
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!/^[A-Za-z0-9:_\-.]{16,4096}$/.test(token)) throw new ApiError(400, 'bad_request', 'Not a push token.');
  if (body?.platform !== 'ios' && body?.platform !== 'android') throw new ApiError(400, 'bad_request', 'Unknown platform.');
  const known = new Set(ctx.data.notifications.types.map((t) => t.id));
  const types = Array.isArray(body.types) ? [...new Set(body.types.map(String).filter((t) => known.has(t)))] : [];
  const tz = Number(body.tzOffsetMinutes);
  if (!Number.isInteger(tz) || Math.abs(tz) > 14 * 60) throw new ApiError(400, 'bad_request', 'Bad time zone.');
  await ctx.repo.putPushToken({ token, playerId: me.id, platform: body.platform, types, tzOffsetMinutes: tz, updatedAt: ctx.now() });
  return { ok: true, enabled: ctx.push.enabled };
}

export async function deletePushToken(ctx: ServerContext, me: Player, token: unknown): Promise<{ ok: true }> {
  const t = String(token ?? '');
  if ((await ctx.repo.pushTokensOf(me.id)).some((x) => x.token === t)) await ctx.repo.removePushToken(t);
  return { ok: true };
}

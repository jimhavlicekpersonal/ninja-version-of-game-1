/** Postgres purchases, refunds, push tokens and the power leaderboards (`PurchaseStore`). */
import { STATE_NOTICES } from '../notices';
import type { Player, PurchaseRow, PushToken } from '../types';
import type { PurchaseStore } from '../ports';
import { num, toPlayer, toPurchase } from './rows';
import { PgBase } from './base';

export class PgPurchases extends PgBase implements PurchaseStore {
  async addPurchase(p: PurchaseRow): Promise<boolean> {
    const r = await this.db.query(
      `insert into purchases (store, transaction_id, player_id, product_id, cents, at, environment, status, refunded_at, ref, held_on_server, storefront, currency, price_micros, device)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict do nothing`,
      [p.store, p.transactionId, p.playerId, p.productId, p.cents, p.at, p.environment, p.status, p.refundedAt, p.ref, p.heldOnServer, p.storefront ?? null, p.currency ?? null, p.priceMicros ?? null, p.device ?? null],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async getPurchase(store: string, transactionId: string): Promise<PurchaseRow | null> {
    const r = await this.rows('select * from purchases where store = $1 and transaction_id = $2', [store, transactionId]);
    return r[0] ? toPurchase(r[0]) : null;
  }

  async purchaseByRef(store: string, ref: string): Promise<PurchaseRow | null> {
    const r = await this.rows('select * from purchases where store = $1 and ref = $2 order by at limit 1', [store, ref]);
    return r[0] ? toPurchase(r[0]) : null;
  }

  async purchasesOf(playerId: string, limit: number): Promise<PurchaseRow[]> {
    return (await this.rows('select * from purchases where player_id = $1 order by at desc limit $2', [playerId, limit])).map(toPurchase);
  }

  async storefrontPurchases(storefronts: string[], before: number): Promise<PurchaseRow[]> {
    const want = storefronts.map((f) => f.toUpperCase());
    return (await this.rows('select * from purchases where upper(storefront) = any($1::text[]) and at <= $2 order by at', [want, before])).map(toPurchase);
  }

  async setPurchaseStatus(store: string, transactionId: string, status: PurchaseRow['status'], at: number): Promise<boolean> {
    const r = await this.db.query(
      `update purchases set status = $3, refunded_at = case when $3 = 'refunded' then $4::bigint else null end where store = $1 and transaction_id = $2 and status <> $3`,
      [store, transactionId, status, at],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async spentCents(playerId: string, since: number, now: number): Promise<number> {
    const r = await this.rows(
      `select coalesce((select sum(cents) from purchases where player_id = $1 and status = 'credited' and at >= $2), 0)
            + coalesce((select sum(cents) from purchase_intents where player_id = $1 and not used and coalesce(hold_until, at + 1800000) > $3), 0) as cents`,
      [playerId, since, now],
    );
    return num(r[0]?.cents);
  }

  async linkedPurchases(playerId: string, devices: string[], since: number): Promise<PurchaseRow[]> {
    const r = await this.rows(
      `select * from purchases p where p.at >= $3 and (
         p.player_id = $1
         or (cardinality($2::text[]) > 0 and p.device = any($2::text[]))
         or (cardinality($2::text[]) > 0 and p.player_id in (select v.player_id from villages v where v.device_seqs ?| $2::text[])))
       order by p.at desc limit 500`,
      [playerId, devices, since],
    );
    return r.map(toPurchase);
  }

  async testCentsSince(since: number): Promise<number> {
    const r = await this.rows(`select coalesce(sum(cents), 0) as cents from purchases where environment <> 'Production' and at >= $1`, [since]);
    return num(r[0]?.cents);
  }

  async noteStoreNotification(n: { id: string; store: string; ref: string | null; type: string; signedAt: number; receivedAt: number }): Promise<{ duplicate: boolean; newerAt: number | null }> {
    const ins = await this.db.query('insert into store_notifications (id, store, ref, type, signed_at, received_at) values ($1,$2,$3,$4,$5,$6) on conflict do nothing', [n.id, n.store, n.ref, n.type, n.signedAt, n.receivedAt]);
    if (!ins.rowCount) return { duplicate: true, newerAt: null };
    if (!n.ref) return { duplicate: false, newerAt: null };
    const r = await this.rows(`select max(signed_at) as at from store_notifications where store = $1 and ref = $2 and id <> $3 and type = any($4::text[])`, [n.store, n.ref, n.id, [...STATE_NOTICES]]);
    return { duplicate: false, newerAt: r[0]?.at == null ? null : num(r[0].at) };
  }

  async putPushToken(t: Omit<PushToken, 'day' | 'sent'>): Promise<void> {
    await this.db.query(
      `insert into push_tokens (token, player_id, platform, types, tz_offset_minutes, updated_at, locale) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (token) do update set player_id = excluded.player_id, platform = excluded.platform, types = excluded.types,
         tz_offset_minutes = excluded.tz_offset_minutes, updated_at = excluded.updated_at, locale = excluded.locale,
         day = case when push_tokens.player_id = excluded.player_id then push_tokens.day else 0 end,
         sent = case when push_tokens.player_id = excluded.player_id then push_tokens.sent else 0 end`,
      [t.token, t.playerId, t.platform, t.types, t.tzOffsetMinutes, t.updatedAt, t.locale ?? 'en'],
    );
  }

  async pushTokensOf(playerId: string): Promise<PushToken[]> {
    return (await this.rows('select * from push_tokens where player_id = $1 order by updated_at', [playerId])).map((r) => ({
      token: String(r.token),
      playerId: String(r.player_id),
      platform: String(r.platform) as PushToken['platform'],
      types: (r.types as string[] | null) ?? [],
      tzOffsetMinutes: num(r.tz_offset_minutes),
      locale: String(r.locale ?? 'en'),
      updatedAt: num(r.updated_at),
      day: num(r.day),
      sent: num(r.sent),
    }));
  }

  async removePushToken(token: string): Promise<void> {
    await this.db.query('delete from push_tokens where token = $1', [token]);
  }

  async countPush(token: string, day: number): Promise<void> {
    await this.db.query('update push_tokens set sent = case when day = $2 then sent + 1 else 1 end, day = $2 where token = $1', [token, day]);
  }

  async playersByIds(ids: string[]): Promise<Player[]> {
    if (!ids.length) return [];
    const r = (await this.rows('select * from players where id = any($1::text[])', [ids])).map(toPlayer);
    const byId = new Map(r.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is Player => Boolean(p));
  }

  async topByPower(limit: number, minBattles: number, beta: number): Promise<Player[]> {
    return (await this.rows('select * from players where base is not null and banned_until = 0 and attack_battles >= $2 order by attack_rating + $3 * (greatest(hall_level, 1) - 1) desc, created_at asc limit $1', [limit, minBattles, beta])).map(toPlayer);
  }

  async powerValues(minBattles: number, beta: number): Promise<number[]> {
    const r = await this.rows('select attack_rating + $2 * (greatest(hall_level, 1) - 1) as power from players where base is not null and banned_until = 0 and attack_battles >= $1', [minBattles, beta]);
    return r.map((x) => Number(x.power));
  }

  async powerRankOf(power: number, minBattles: number, beta: number): Promise<number> {
    const r = await this.rows('select count(*) as n from players where base is not null and banned_until = 0 and attack_battles >= $2 and attack_rating + $3 * (greatest(hall_level, 1) - 1) > $1', [power, minBattles, beta]);
    return 1 + num(r[0]?.n);
  }

  async rankedPlayers(): Promise<{ id: string; trophies: number; createdAt: number }[]> {
    return (await this.rows('select id, trophies, created_at from players where base is not null and banned_until = 0')).map((r) => ({ id: String(r.id), trophies: num(r.trophies), createdAt: num(r.created_at) }));
  }
}

/** Postgres play statistics, purchase intents, age answers, import holds and complaints (`OpsStore`). */
import type { StatsInstallSummary, StatsDailyRow, PurchaseIntent, ImportHold, Complaint } from '../types';
import type { OpsStore } from '../ports';
import { num, strOrNull } from './rows';
import { PgBase, dbOf } from './base';

export class PgOps extends PgBase implements OpsStore {

  async addStatsEvents(install: string, build: string, arm: string, events: import('../../../src/backend/net/stats').StatsEvent[], receivedAt: number): Promise<number> {
    if (!events.length) return 0;
    // One statement for the batch (at most STATS_MAX_BATCH rows): arrays unnested side by side.
    const r = await this.db.query(
      `insert into stats_events (install, day, name, at, props, build, arm, received_at)
       select $1, (e.at / 86400000)::int, e.name, e.at, e.props, $2, $3, $4
       from unnest($5::text[], $6::bigint[], $7::jsonb[]) as e(name, at, props)`,
      [install, build, arm, receivedAt, events.map((e) => e.name), events.map((e) => e.at), events.map((e) => JSON.stringify(e.props))],
    );
    return r.rowCount ?? events.length;
  }

  async deleteStats(install: string): Promise<number> {
    return (await this.db.query('delete from stats_events where install = $1', [install])).rowCount ?? 0;
  }

  async statsInstalls(fromDay: number, toDay: number): Promise<StatsInstallSummary[]> {
    // Only recent events are read; an id that also sent something before the window is not new in it.
    const rows = await this.rows(
      `select install, (array_agg(arm order by at))[1] as arm, min(day) as first_day, min(at) as first_at,
              array_agg(distinct day) as days,
              bool_or(name = 'tutorial_step' and props->>'done' = 'true') as tutorial_done,
              min(at) filter (where name = 'raid_end') as first_raid,
              min(at) filter (where name = 'purchase') as first_purchase
       from stats_events w where day >= $1
       group by install
       having min(day) <= $2 and not exists (select 1 from stats_events o where o.install = w.install and o.day < $1)`,
      [fromDay, toDay],
    );
    return rows.map((r) => ({
      install: String(r.install),
      arm: String(r.arm ?? ''),
      firstDay: num(r.first_day),
      firstAt: num(r.first_at),
      days: ((r.days as unknown[]) ?? []).map(num).sort((a, b) => a - b),
      tutorialDone: r.tutorial_done === true,
      firstRaidAt: r.first_raid === null || r.first_raid === undefined ? null : num(r.first_raid),
      firstPurchaseAt: r.first_purchase === null || r.first_purchase === undefined ? null : num(r.first_purchase),
    }));
  }

  async putStatsDaily(fromDay: number, toDay: number, rows: StatsDailyRow[]): Promise<void> {
    await this.repo.transaction(async (tx) => {
      const db = dbOf(tx);
      await db.query('delete from stats_daily where day between $1 and $2', [fromDay, toDay]);
      for (const r of rows)
        await db.query(
          `insert into stats_daily (day, arm, installs, d1, d7, d30, tutorial_done, raided7, payers7, computed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [r.day, r.arm, r.installs, r.d1, r.d7, r.d30, r.tutorialDone, r.raided7, r.payers7, r.computedAt],
        );
    });
  }

  async statsDaily(fromDay: number, toDay: number): Promise<StatsDailyRow[]> {
    return (await this.rows('select * from stats_daily where day between $1 and $2 order by day, arm', [fromDay, toDay])).map((r) => ({
      day: num(r.day),
      arm: String(r.arm),
      installs: num(r.installs),
      d1: num(r.d1),
      d7: num(r.d7),
      d30: num(r.d30),
      tutorialDone: num(r.tutorial_done),
      raided7: num(r.raided7),
      payers7: num(r.payers7),
      computedAt: num(r.computed_at),
    }));
  }

  async pruneStats(before: number): Promise<number> {
    return (await this.db.query('delete from stats_events where received_at < $1', [before])).rowCount ?? 0;
  }

  async addIntent(i: PurchaseIntent): Promise<void> {
    await this.db.query('insert into purchase_intents (id, player_id, product_id, cents, at, used, hold_until, device) values ($1,$2,$3,$4,$5,$6,$7,$8)', [i.id, i.playerId, i.productId, i.cents, i.at, i.used, i.holdUntil, i.device ?? null]);
  }

  async getIntent(id: string): Promise<PurchaseIntent | null> {
    const r = await this.rows('select * from purchase_intents where id = $1', [id]);
    return r[0] ? { id: String(r[0].id), playerId: String(r[0].player_id), productId: String(r[0].product_id), cents: num(r[0].cents), at: num(r[0].at), used: Boolean(r[0].used), holdUntil: r[0].hold_until == null ? num(r[0].at) + 1_800_000 : num(r[0].hold_until), device: strOrNull(r[0].device) } : null;
  }

  async useIntent(id: string): Promise<void> {
    await this.db.query('update purchase_intents set used = true where id = $1', [id]);
  }

  async holdIntent(id: string, playerId: string, holdUntil: number): Promise<boolean> {
    const r = await this.db.query('update purchase_intents set hold_until = $3 where id = $1 and player_id = $2 and not used and hold_until is distinct from $3', [id, playerId, holdUntil]);
    return (r.rowCount ?? 0) > 0;
  }

  async getAgeGroup(playerId: string): Promise<{ under18: boolean; at: number } | null> {
    const r = await this.rows('select under18, at from player_age where player_id = $1', [playerId]);
    return r[0] ? { under18: Boolean(r[0].under18), at: num(r[0].at) } : null;
  }

  async resolveImportHold(id: string, playerId: string): Promise<boolean> {
    const r = await this.db.query(`update import_holds set status = 'resolved' where id = $1 and player_id = $2 and status = 'held'`, [id, playerId]);
    return (r.rowCount ?? 0) > 0;
  }

  async addComplaint(c: Complaint): Promise<void> {
    await this.db.query('insert into complaints (id, at, subject, reason, contact, player_id, status, resolved_at, resolution) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [c.id, c.at, c.subject, c.reason, c.contact, c.playerId, c.status, c.resolvedAt, c.resolution]);
  }

  async complaints(status: 'open' | 'all', limit: number): Promise<Complaint[]> {
    const r = await this.rows(`select * from complaints where ($1 = 'all' or status = 'open') order by at limit $2`, [status, limit]);
    return r.map((x) => ({ id: String(x.id), at: num(x.at), subject: String(x.subject), reason: String(x.reason), contact: strOrNull(x.contact), playerId: strOrNull(x.player_id), status: String(x.status) as Complaint['status'], resolvedAt: x.resolved_at == null ? null : num(x.resolved_at), resolution: strOrNull(x.resolution) }));
  }

  async resolveComplaint(id: string, resolution: string, at: number): Promise<boolean> {
    const r = await this.db.query(`update complaints set status = 'done', resolution = $2, resolved_at = $3 where id = $1 and status = 'open'`, [id, resolution, at]);
    return (r.rowCount ?? 0) > 0;
  }

  async addImportHold(h: ImportHold): Promise<void> {
    await this.db.query('insert into import_holds (id, player_id, at, jade, premium, purchases, status) values ($1,$2,$3,$4,$5,$6,$7)', [h.id, h.playerId, h.at, h.jade, h.premium, JSON.stringify(h.purchases), h.status]);
  }

  async importHoldsOf(playerId: string): Promise<ImportHold[]> {
    return (await this.rows('select * from import_holds where player_id = $1 order by at desc', [playerId])).map((r) => ({
      id: String(r.id),
      playerId: String(r.player_id),
      at: num(r.at),
      jade: num(r.jade),
      premium: Boolean(r.premium),
      purchases: (r.purchases as string[]) ?? [],
      status: r.status === 'resolved' ? 'resolved' : 'held',
    }));
  }

  async setAgeGroup(playerId: string, under18: boolean | null, at: number): Promise<void> {
    if (under18 === null) await this.db.query('delete from player_age where player_id = $1', [playerId]);
    else await this.db.query('insert into player_age (player_id, under18, at) values ($1,$2,$3) on conflict (player_id) do update set under18 = excluded.under18, at = excluded.at', [playerId, under18, at]);
  }}

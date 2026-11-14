/** Postgres Gangs and Gang Wars (part of `SocialStore`). */
import type { Rating } from '../../../src/gameplay/sim/rating';
import type { Squad, SquadMember, SquadInvite, GangWar, GangWarAttack, GangRelay, GangQueueEntry, Report } from '../types';
import { type Row, num, strOrNull } from './rows';
import { PgBase, dbOf } from './base';

const toSquadMember = (x: Row): SquadMember => ({ playerId: String(x.player_id), squadId: String(x.squad_id), role: x.role === 'leader' ? 'leader' : 'member', joinedAt: num(x.joined_at) });
const toSquadInvite = (x: Row): SquadInvite => ({ id: String(x.id), squadId: String(x.squad_id), fromId: String(x.from_id), toId: String(x.to_id), at: num(x.at) });
const toWar = (x: Row): GangWar => ({ ...(x.record as GangWar), rated: Boolean(x.rated) });
const toRelay = (x: Row): GangRelay => ({ warId: String(x.war_id), side: x.side === 'b' ? 'b' : 'a', target: num(x.target), damage: (x.damage as Record<string, number>) ?? {}, stars: num(x.stars), destruction: num(x.destruction), strikes: num(x.strikes), lastBy: strOrNull(x.last_by), holder: strOrNull(x.holder), holdUntil: num(x.hold_until) });

export class PgGangs extends PgBase {
  async getSquad(id: string): Promise<Squad | null> {
    const r = await this.rows('select * from squads where id = $1', [id]);
    return r[0] ? { id: String(r[0].id), name: String(r[0].name), createdAt: num(r[0].created_at), ...(r[0].rating ? { rating: r[0].rating as Rating } : {}) } : null;
  }
  async updateSquad(id: string, patch: Partial<Pick<Squad, 'name' | 'rating'>>): Promise<void> {
    if (patch.name !== undefined) await this.db.query('update squads set name = $2 where id = $1', [id, patch.name]);
    if (patch.rating !== undefined) await this.db.query('update squads set rating = $2 where id = $1', [id, JSON.stringify(patch.rating)]);
  }
  async deleteSquad(id: string): Promise<void> {
    await this.repo.transaction(async (tx) => {
      const q = (sql: string, vals: unknown[]) => dbOf(tx).query(sql, vals);
      await q('delete from squad_invites where squad_id = $1', [id]);
      await q('delete from squad_members where squad_id = $1', [id]);
      await q('delete from squads where id = $1', [id]);
    });
  }
  async squadMembers(squadId: string): Promise<SquadMember[]> {
    return (await this.rows('select * from squad_members where squad_id = $1 order by joined_at, player_id', [squadId])).map(toSquadMember);
  }
  async squadOf(playerId: string): Promise<SquadMember | null> {
    const r = await this.rows('select * from squad_members where player_id = $1', [playerId]);
    return r[0] ? toSquadMember(r[0]) : null;
  }
  async addSquadMember(m: SquadMember): Promise<boolean> {
    const r = await this.db.query('insert into squad_members (player_id, squad_id, role, joined_at) values ($1, $2, $3, $4) on conflict (player_id) do nothing', [m.playerId, m.squadId, m.role, m.joinedAt]);
    return (r.rowCount ?? 0) > 0;
  }
  async removeSquadMember(playerId: string): Promise<void> {
    await this.db.query('delete from squad_members where player_id = $1', [playerId]);
  }
  async setSquadRole(playerId: string, role: SquadMember['role']): Promise<void> {
    await this.db.query('update squad_members set role = $2 where player_id = $1', [playerId, role]);
  }
  async addSquadInvite(i: SquadInvite): Promise<void> {
    await this.db.query('insert into squad_invites (id, squad_id, from_id, to_id, at) values ($1, $2, $3, $4, $5)', [i.id, i.squadId, i.fromId, i.toId, i.at]);
  }
  async getSquadInvite(id: string): Promise<SquadInvite | null> {
    const r = await this.rows('select * from squad_invites where id = $1', [id]);
    return r[0] ? toSquadInvite(r[0]) : null;
  }
  async squadInvitesTo(playerId: string, since: number): Promise<SquadInvite[]> {
    return (await this.rows('select * from squad_invites where to_id = $1 and at > $2 order by at', [playerId, since])).map(toSquadInvite);
  }
  async squadInvitesFrom(squadId: string, since: number): Promise<SquadInvite[]> {
    return (await this.rows('select * from squad_invites where squad_id = $1 and at > $2 order by at', [squadId, since])).map(toSquadInvite);
  }
  async deleteSquadInvite(id: string): Promise<void> {
    await this.db.query('delete from squad_invites where id = $1', [id]);
  }
  async deleteSquadInvitesTo(playerId: string): Promise<void> {
    await this.db.query('delete from squad_invites where to_id = $1', [playerId]);
  }
  async deleteSquadInvitesFrom(squadId: string): Promise<void> {
    await this.db.query('delete from squad_invites where squad_id = $1', [squadId]);
  }

  // Gang Wars (roadmap steps 65-66): the war (both rosters with their bases) is one jsonb record.
  async createWar(w: GangWar): Promise<void> {
    await this.db.query('insert into squad_wars (id, created_at, ends_at, squad_a, squad_b, rated, record) values ($1, $2, $3, $4, $5, $6, $7)', [w.id, w.createdAt, w.endsAt, w.a.squadId, w.b.squadId, w.rated, JSON.stringify(w)]);
  }
  async getWar(id: string): Promise<GangWar | null> {
    const r = await this.rows('select * from squad_wars where id = $1', [id]);
    return r[0] ? toWar(r[0]) : null;
  }
  async activeWars(now: number, limit: number): Promise<GangWar[]> {
    return (await this.rows('select * from squad_wars where ends_at > $1 order by ends_at limit $2', [now, limit])).map(toWar);
  }
  async updateWar(id: string, patch: Partial<Pick<GangWar, 'a' | 'b' | 'notified'>>): Promise<void> {
    await this.db.query('update squad_wars set record = record || $2::jsonb where id = $1', [id, JSON.stringify(patch)]);
  }
  async markWarRated(id: string): Promise<boolean> {
    const r = await this.db.query('update squad_wars set rated = true where id = $1 and not rated', [id]);
    return (r.rowCount ?? 0) > 0;
  }
  async activeWarOf(squadId: string, now: number): Promise<GangWar | null> {
    const r = await this.rows('select * from squad_wars where (squad_a = $1 or squad_b = $1) and ends_at > $2 order by created_at desc limit 1', [squadId, now]);
    return r[0] ? toWar(r[0]) : null;
  }
  async warsOf(squadId: string, limit: number): Promise<GangWar[]> {
    return (await this.rows('select * from squad_wars where squad_a = $1 or squad_b = $1 order by created_at desc limit $2', [squadId, limit])).map(toWar);
  }
  async addWarAttack(a: GangWarAttack): Promise<void> {
    await this.db.query('insert into squad_war_attacks (id, war_id, side, attacker_id, target, relay, stars, destruction, at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [a.id, a.warId, a.side, a.attackerId, a.target, a.relay, a.stars, a.destruction, a.at]);
  }
  async warAttacks(warId: string): Promise<GangWarAttack[]> {
    const r = await this.rows('select * from squad_war_attacks where war_id = $1 order by at', [warId]);
    return r.map((x) => ({ id: String(x.id), warId: String(x.war_id), side: x.side === 'b' ? 'b' : 'a', attackerId: String(x.attacker_id), target: num(x.target), relay: Boolean(x.relay), stars: num(x.stars), destruction: num(x.destruction), at: num(x.at) }));
  }
  async getRelay(warId: string, side: 'a' | 'b', target: number): Promise<GangRelay | null> {
    const r = await this.rows('select * from squad_war_relays where war_id = $1 and side = $2 and target = $3', [warId, side, target]);
    return r[0] ? toRelay(r[0]) : null;
  }
  async holdRelay(warId: string, side: 'a' | 'b', target: number, playerId: string, until: number, now: number): Promise<boolean> {
    // One statement: create the row, or take it if it is free (or already ours, or the hold ran out).
    const r = await this.db.query(
      `insert into squad_war_relays (war_id, side, target, holder, hold_until) values ($1, $2, $3, $4, $5)
       on conflict (war_id, side, target) do update set holder = excluded.holder, hold_until = excluded.hold_until
       where squad_war_relays.holder is null or squad_war_relays.holder = excluded.holder or squad_war_relays.hold_until <= $6`,
      [warId, side, target, playerId, until, now],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async putRelay(x: GangRelay): Promise<void> {
    await this.db.query(
      `insert into squad_war_relays (war_id, side, target, damage, stars, destruction, strikes, last_by, holder, hold_until) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (war_id, side, target) do update set damage = excluded.damage, stars = excluded.stars, destruction = excluded.destruction, strikes = excluded.strikes, last_by = excluded.last_by, holder = excluded.holder, hold_until = excluded.hold_until`,
      [x.warId, x.side, x.target, JSON.stringify(x.damage), x.stars, x.destruction, x.strikes, x.lastBy, x.holder, x.holdUntil],
    );
  }
  async enqueueGang(e: GangQueueEntry): Promise<boolean> {
    const r = await this.db.query('insert into squad_war_queue (squad_id, size, queued_at, record) values ($1, $2, $3, $4) on conflict (squad_id) do nothing', [e.squadId, e.size, e.queuedAt, JSON.stringify(e)]);
    return (r.rowCount ?? 0) > 0;
  }
  async dequeueGang(squadId: string): Promise<boolean> {
    const r = await this.db.query('delete from squad_war_queue where squad_id = $1', [squadId]);
    return (r.rowCount ?? 0) > 0;
  }
  async queuedGang(squadId: string): Promise<GangQueueEntry | null> {
    const r = await this.rows('select record from squad_war_queue where squad_id = $1', [squadId]);
    return r[0] ? (r[0].record as GangQueueEntry) : null;
  }
  async gangQueue(size: number): Promise<GangQueueEntry[]> {
    return (await this.rows('select record from squad_war_queue where size = $1 order by queued_at limit 200', [size])).map((x) => x.record as GangQueueEntry);
  }
  async addGangClaim(warId: string, playerId: string, outcome: string, at: number): Promise<boolean> {
    const r = await this.db.query('insert into squad_war_claims (war_id, player_id, outcome, at) values ($1, $2, $3, $4) on conflict do nothing', [warId, playerId, outcome, at]);
    return (r.rowCount ?? 0) > 0;
  }
  async gangClaimed(warId: string, playerId: string): Promise<boolean> {
    return (await this.rows('select 1 from squad_war_claims where war_id = $1 and player_id = $2', [warId, playerId])).length > 0;
  }

  async addReport(r: Report): Promise<boolean> {
    // The partial unique index (reporter, target, message) where open makes a repeat a no-op.
    const res = await this.db.query(
      `insert into reports (id, at, reporter_id, kind, target_id, target_name, message_id, grove_id, text, reason, note, status, resolved_at, resolution)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict do nothing`,
      [r.id, r.at, r.reporterId, r.kind, r.targetId, r.targetName, r.messageId, r.groveId, r.text, r.reason, r.note, r.status, r.resolvedAt, r.resolution],
    );
    return (res.rowCount ?? 0) > 0;
  }
}

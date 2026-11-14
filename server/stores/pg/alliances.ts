/** Postgres Alliances (groves): members, chat, reports and blocks, troop requests and donations, Grove Raids (part of `SocialStore`). */
import type { Player, Grove, GroveSummaryRow, GroveMember, ChatRow, Report, Block, TroopRequest, Donation, RaidPairing, RaidAttack, RaidClaim } from '../types';
import { num, toPlayer, toGrove, toSummary, toMember, toChat, toReport, toBlock, toRequest, toDonation, toPairing, toRaidAttack, toClaim, GROVE_SUMMARY } from './rows';
import { PgBase, dbOf } from './base';

export class PgAlliances extends PgBase {

  // names and friends (roadmap step 59)
  async playerByNameKey(key: string): Promise<Player | null> {
    const r = await this.rows('select * from players where name_key = $1', [key]);
    return r[0] ? toPlayer(r[0]) : null;
  }

  async createGrove(g: Grove): Promise<void> {
    await this.db.query('insert into groves (id, name, color, created_at) values ($1,$2,$3,$4)', [g.id, g.name, g.color, g.createdAt]);
  }

  async getGrove(id: string): Promise<Grove | null> {
    const r = await this.rows('select * from groves where id = $1', [id]);
    return r[0] ? toGrove(r[0]) : null;
  }

  async listGroves(query: string, limit: number): Promise<GroveSummaryRow[]> {
    const r = await this.rows(`${GROVE_SUMMARY} where ($1 = '' or position(lower($1) in lower(g.name)) > 0) group by g.id order by g.created_at limit $2`, [query.trim(), limit]);
    return r.map(toSummary);
  }

  async members(groveId: string): Promise<GroveMember[]> {
    return (await this.rows('select * from grove_members where grove_id = $1 order by joined_at', [groveId])).map(toMember);
  }

  async getMembership(playerId: string): Promise<GroveMember | null> {
    const r = await this.rows('select * from grove_members where player_id = $1', [playerId]);
    return r[0] ? toMember(r[0]) : null;
  }

  async addMember(m: GroveMember): Promise<boolean> {
    const r = await this.db.query('insert into grove_members (player_id, grove_id, role, joined_at, xp) values ($1,$2,$3,$4,$5) on conflict (player_id) do nothing', [
      m.playerId,
      m.groveId,
      m.role,
      m.joinedAt,
      m.xp,
    ]);
    return (r.rowCount ?? 0) > 0;
  }

  async removeMember(groveId: string, playerId: string): Promise<void> {
    await this.db.query('delete from grove_members where grove_id = $1 and player_id = $2', [groveId, playerId]);
  }

  async updateMember(groveId: string, playerId: string, patch: Partial<Pick<GroveMember, 'role' | 'xp'>>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (patch.role !== undefined) sets.push(`role = $${vals.push(patch.role)}`);
    if (patch.xp !== undefined) sets.push(`xp = $${vals.push(patch.xp)}`);
    if (!sets.length) return;
    vals.push(groveId, playerId);
    await this.db.query(`update grove_members set ${sets.join(', ')} where grove_id = $${vals.length - 1} and player_id = $${vals.length}`, vals);
  }

  async addChat(row: Omit<ChatRow, 'seq'>): Promise<ChatRow> {
    const r = await this.rows('insert into grove_chat (id, grove_id, at, player_id, name, text, kind, preset_id) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *', [
      row.id,
      row.groveId,
      row.at,
      row.playerId,
      row.name,
      row.text,
      row.kind,
      row.presetId ?? null,
    ]);
    return toChat(r[0]);
  }

  async chatAfter(groveId: string, afterSeq: number, limit: number): Promise<ChatRow[]> {
    const r = await this.rows('select * from grove_chat where grove_id = $1 and seq > $2 and not hidden order by seq desc limit $3', [groveId, afterSeq, limit]);
    return r.map(toChat).reverse();
  }

  async getChat(id: string): Promise<ChatRow | null> {
    const r = await this.rows('select * from grove_chat where id = $1', [id]);
    return r[0] ? toChat(r[0]) : null;
  }

  async setChatHidden(id: string, hidden: boolean): Promise<void> {
    await this.db.query('update grove_chat set hidden = $2 where id = $1', [id, hidden]);
  }

  async hiddenChatIds(groveId: string, lastN: number): Promise<string[]> {
    const r = await this.rows('select id from (select id, hidden from grove_chat where grove_id = $1 order by seq desc limit $2) x where hidden', [groveId, lastN]);
    return r.map((x) => String(x.id));
  }

  async reports(status: 'open' | 'all', limit: number): Promise<Report[]> {
    return (await this.rows(`select * from reports where ($1 = 'all' or status = 'open') order by at limit $2`, [status, limit])).map(toReport);
  }

  async getReport(id: string): Promise<Report | null> {
    const r = await this.rows('select * from reports where id = $1', [id]);
    return r[0] ? toReport(r[0]) : null;
  }

  async openReportsOn(messageId: string): Promise<Report[]> {
    return (await this.rows(`select * from reports where message_id = $1 and status = 'open' order by at`, [messageId])).map(toReport);
  }

  async resolveReport(id: string, status: 'actioned' | 'dismissed', resolution: string, at: number): Promise<boolean> {
    const r = await this.db.query(`update reports set status = $2, resolution = $3, resolved_at = $4 where id = $1 and status = 'open'`, [id, status, resolution, at]);
    return (r.rowCount ?? 0) > 0;
  }

  async addBlock(b: Block): Promise<void> {
    await this.db.query(
      `insert into blocks (player_id, blocked_id, blocked_name, at) values ($1,$2,$3,$4)
       on conflict (player_id, blocked_id) do update set blocked_name = excluded.blocked_name, at = excluded.at`,
      [b.playerId, b.blockedId, b.blockedName, b.at],
    );
  }

  async removeBlock(playerId: string, blockedId: string): Promise<void> {
    await this.db.query('delete from blocks where player_id = $1 and blocked_id = $2', [playerId, blockedId]);
  }

  async blocksOf(playerId: string): Promise<Block[]> {
    return (await this.rows('select * from blocks where player_id = $1 order by at desc', [playerId])).map(toBlock);
  }

  async recentChatCount(playerId: string, since: number): Promise<number> {
    const r = await this.rows(`select count(*) as n from grove_chat where player_id = $1 and at > $2 and kind = 'chat'`, [playerId, since]);
    return num(r[0]?.n);
  }

  async addRequest(q: TroopRequest): Promise<void> {
    await this.db.query('insert into troop_requests (id, grove_id, player_id, name, at, size, filled, open) values ($1,$2,$3,$4,$5,$6,$7,$8)', [
      q.id,
      q.groveId,
      q.playerId,
      q.name,
      q.at,
      q.size,
      q.filled,
      q.open,
    ]);
  }

  async getRequest(id: string): Promise<TroopRequest | null> {
    const r = await this.rows('select * from troop_requests where id = $1', [id]);
    return r[0] ? toRequest(r[0]) : null;
  }

  async openRequests(groveId: string, since: number): Promise<TroopRequest[]> {
    return (await this.rows('select * from troop_requests where grove_id = $1 and open and at > $2 order by at', [groveId, since])).map(toRequest);
  }

  async lastRequestAt(playerId: string): Promise<number> {
    const r = await this.rows('select coalesce(max(at), 0) as at from troop_requests where player_id = $1', [playerId]);
    return num(r[0]?.at);
  }

  async closeRequestsOf(playerId: string): Promise<void> {
    await this.db.query('update troop_requests set open = false where player_id = $1 and open', [playerId]);
  }

  async fillRequest(id: string, housing: number): Promise<TroopRequest | null> {
    // One statement, so two donors cannot overfill a request.
    const r = await this.rows(
      `update troop_requests set filled = filled + $2, open = (filled + $2 < size)
       where id = $1 and open and filled + $2 <= size returning *`,
      [id, housing],
    );
    return r[0] ? toRequest(r[0]) : null;
  }

  async addDonation(d: Donation): Promise<void> {
    await this.db.query(
      `insert into donations (id, request_id, grove_id, from_id, from_name, to_id, troop, count, level, at, delivered)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [d.id, d.requestId, d.groveId, d.fromId, d.fromName, d.toId, d.troop, d.count, d.level, d.at, d.delivered],
    );
  }

  async undelivered(playerId: string): Promise<Donation[]> {
    return (await this.rows('select * from donations where to_id = $1 and not delivered order by at', [playerId])).map(toDonation);
  }

  async markDelivered(playerId: string, ids: string[]): Promise<void> {
    await this.db.query('update donations set delivered = true where to_id = $1 and id = any($2::text[])', [playerId, ids]);
  }

  async getPairing(week: number, groveId: string): Promise<RaidPairing | null> {
    const r = await this.rows('select * from raid_pairings where week = $1 and grove_id = $2', [week, groveId]);
    return r[0] ? toPairing(r[0]) : null;
  }

  async createPairings(pairs: RaidPairing[]): Promise<boolean> {
    const taken = new Error('pairing taken');
    try {
      return await this.repo.transaction(async (tx) => {
        for (const p of pairs) {
          const r = await dbOf(tx).query(
            `insert into raid_pairings (week, grove_id, opponent_grove_id, opponent_name, bot_seed, roster, our_size, our_hall, created_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing`,
            [p.week, p.groveId, p.opponentGroveId, p.opponentName, p.botSeed, JSON.stringify(p.roster), p.ourSize, p.ourHall, p.createdAt],
          );
          // Either Grove already paired this week: undo both sides.
          if ((r.rowCount ?? 0) === 0) throw taken;
        }
        return true;
      });
    } catch (e) {
      if (e === taken) return false;
      throw e;
    }
  }

  async unpairedGroves(week: number, activeSince: number, limit: number): Promise<GroveSummaryRow[]> {
    const r = await this.rows(
      `${GROVE_SUMMARY}
       where not exists (select 1 from raid_pairings rp where rp.week = $1 and rp.grove_id = g.id)
       group by g.id having coalesce(max(p.last_seen_at), 0) >= $2 order by g.created_at limit $3`,
      [week, activeSince, limit],
    );
    return r.map(toSummary);
  }

  async addRaidAttack(a: RaidAttack): Promise<void> {
    await this.db.query('insert into raid_attacks (id, week, grove_id, attacker_id, target, stars, destruction, at) values ($1,$2,$3,$4,$5,$6,$7,$8)', [
      a.id,
      a.week,
      a.groveId,
      a.attackerId,
      a.target,
      a.stars,
      a.destruction,
      a.at,
    ]);
  }

  async raidAttacks(week: number, groveId: string): Promise<RaidAttack[]> {
    return (await this.rows('select * from raid_attacks where week = $1 and grove_id = $2 order by at', [week, groveId])).map(toRaidAttack);
  }

  async addClaim(c: RaidClaim): Promise<boolean> {
    const r = await this.db.query('insert into raid_claims (week, player_id, grove_id, outcome, at) values ($1,$2,$3,$4,$5) on conflict do nothing', [
      c.week,
      c.playerId,
      c.groveId,
      c.outcome,
      c.at,
    ]);
    return (r.rowCount ?? 0) > 0;
  }

  async getClaim(week: number, playerId: string): Promise<RaidClaim | null> {
    const r = await this.rows('select * from raid_claims where week = $1 and player_id = $2', [week, playerId]);
    return r[0] ? toClaim(r[0]) : null;
  }}

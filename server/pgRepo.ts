/** Postgres storage adapter for the Repo port (tables in schema.sql). Bases and battle records are JSONB. */
import pg from 'pg';
import type {
  AttackRecord,
  ChatRow,
  Donation,
  EligibilityRules,
  Grove,
  GroveMember,
  GroveSummaryRow,
  OpponentQuery,
  Player,
  PlayerPatch,
  RaidAttack,
  RaidClaim,
  RaidPairing,
  Region,
  RegionClaim,
  Repo,
  Ticket,
  TournamentScoreRow,
  TroopRequest,
} from './repo';

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const strOrNull = (v: unknown) => (v === null || v === undefined ? null : String(v));

const toPlayer = (r: Row): Player => ({
  id: String(r.id),
  name: String(r.name),
  tokenHash: String(r.token_hash),
  trophies: num(r.trophies),
  hallLevel: num(r.hall_level),
  shieldUntil: num(r.shield_until),
  base: (r.base as Player['base']) ?? null,
  groveId: strOrNull(r.grove_id),
  createdAt: num(r.created_at),
  updatedAt: num(r.updated_at),
  lastSeenAt: num(r.last_seen_at),
  pvpOptIn: Boolean(r.pvp_opt_in),
  rating: r.rating === undefined ? undefined : num(r.rating),
  defenseRating: r.defense_rating === undefined ? undefined : num(r.defense_rating),
  ratedGames: num(r.rated_games),
  ratingSeason: r.rating_season === undefined ? undefined : num(r.rating_season),
  lastSeason: (r.last_season as Player['lastSeason']) ?? null,
  regionId: strOrNull(r.region_id),
  faction: strOrNull(r.faction),
  ownerKey: strOrNull(r.owner_key),
  combatRating: r.combat_rating === null || r.combat_rating === undefined ? null : num(r.combat_rating),
});

/** SQL for the defender eligibility rules; `$n` placeholders start at `first`. */
function eligibilitySql(rules: EligibilityRules, first: number): { sql: string; vals: unknown[] } {
  return {
    sql: ` and (p.hall_level >= $${first} or (p.hall_level >= $${first + 1} and p.pvp_opt_in))
           and (select count(*) from attacks a where a.defender_id = p.id and a.at > $${first + 2}) < $${first + 3}`,
    vals: [rules.pvpStandardHall, rules.pvpMinHall, rules.attacksSince, rules.maxAttacks],
  };
}

const toTicket = (r: Row): Ticket => {
  const t: Ticket = {
    id: String(r.id),
    kind: r.kind === 'raid' ? 'raid' : 'pvp',
    attackerId: String(r.attacker_id),
    defenderId: strOrNull(r.defender_id),
    defenderName: String(r.defender_name ?? ''),
    base: r.base as Ticket['base'],
    defenderTrophies: num(r.defender_trophies),
    createdAt: num(r.created_at),
    expiresAt: num(r.expires_at),
    used: Boolean(r.used),
  };
  if (r.week !== null && r.week !== undefined) t.week = num(r.week);
  if (r.grove_id !== null && r.grove_id !== undefined) t.groveId = String(r.grove_id);
  if (r.target !== null && r.target !== undefined) t.target = num(r.target);
  if (r.settlement !== null && r.settlement !== undefined) t.settlement = String(r.settlement);
  if (r.army_cap !== null && r.army_cap !== undefined) t.armyCap = r.army_cap as Ticket['armyCap'];
  return t;
};

const toAttack = (r: Row): AttackRecord => ({ ...(r.record as AttackRecord), id: String(r.id) });
const toGrove = (r: Row): Grove => ({ id: String(r.id), name: String(r.name), color: String(r.color), createdAt: num(r.created_at) });
const toSummary = (r: Row): GroveSummaryRow => ({ ...toGrove(r), members: num(r.members), averageTrophies: Math.round(num(r.average_trophies)), lastActiveAt: num(r.last_active_at) });
const toMember = (r: Row): GroveMember => ({ groveId: String(r.grove_id), playerId: String(r.player_id), role: r.role as GroveMember['role'], joinedAt: num(r.joined_at), xp: num(r.xp) });
const toChat = (r: Row): ChatRow => ({
  seq: num(r.seq),
  id: String(r.id),
  groveId: String(r.grove_id),
  at: num(r.at),
  playerId: strOrNull(r.player_id),
  name: strOrNull(r.name),
  text: String(r.text),
  kind: r.kind as ChatRow['kind'],
});
const toRequest = (r: Row): TroopRequest => ({
  id: String(r.id),
  groveId: String(r.grove_id),
  playerId: String(r.player_id),
  name: String(r.name),
  at: num(r.at),
  size: num(r.size),
  filled: num(r.filled),
  open: Boolean(r.open),
});
const toDonation = (r: Row): Donation => ({
  id: String(r.id),
  requestId: String(r.request_id),
  groveId: String(r.grove_id),
  fromId: String(r.from_id),
  fromName: String(r.from_name),
  toId: String(r.to_id),
  troop: String(r.troop),
  count: num(r.count),
  level: num(r.level),
  at: num(r.at),
  delivered: Boolean(r.delivered),
});
const toPairing = (r: Row): RaidPairing => ({
  week: num(r.week),
  groveId: String(r.grove_id),
  opponentGroveId: strOrNull(r.opponent_grove_id),
  opponentName: String(r.opponent_name),
  botSeed: num(r.bot_seed),
  roster: r.roster as RaidPairing['roster'],
  ourSize: num(r.our_size),
  ourHall: num(r.our_hall),
  createdAt: num(r.created_at),
});
const toRaidAttack = (r: Row): RaidAttack => ({
  id: String(r.id),
  week: num(r.week),
  groveId: String(r.grove_id),
  attackerId: String(r.attacker_id),
  target: num(r.target),
  stars: num(r.stars),
  destruction: num(r.destruction),
  at: num(r.at),
});
const toClaimRow = (r: Row): RegionClaim => ({ regionId: String(r.region_id), settlement: String(r.settlement), playerId: String(r.player_id), name: String(r.name), since: num(r.since) });
const toClaim = (r: Row): RaidClaim => ({ week: num(r.week), playerId: String(r.player_id), groveId: String(r.grove_id), outcome: r.outcome as RaidClaim['outcome'], at: num(r.at) });

/** Groves with their member count, average trophies and last activity. */
const GROVE_SUMMARY = `
  select g.*, count(p.id) as members, coalesce(avg(p.trophies), 0) as average_trophies, coalesce(max(p.last_seen_at), 0) as last_active_at
  from groves g join grove_members m on m.grove_id = g.id join players p on p.id = m.player_id`;

export class PgRepo implements Repo {
  constructor(private readonly pool: pg.Pool) {}

  static fromUrl(url: string): PgRepo {
    return new PgRepo(new pg.Pool({ connectionString: url, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined }));
  }

  async migrate(schemaSql: string): Promise<void> {
    await this.pool.query(schemaSql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async rows(sql: string, vals: unknown[] = []): Promise<Row[]> {
    return (await this.pool.query(sql, vals)).rows as Row[];
  }

  // ------------------------------------------------------------ players

  async createPlayer(p: Player): Promise<void> {
    await this.pool.query(
      `insert into players (id, name, token_hash, trophies, hall_level, shield_until, base, grove_id, created_at, updated_at, last_seen_at, region_id, pvp_opt_in, faction, owner_key)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [p.id, p.name, p.tokenHash, p.trophies, p.hallLevel, p.shieldUntil, p.base ? JSON.stringify(p.base) : null, p.groveId, p.createdAt, p.updatedAt, p.lastSeenAt, p.regionId ?? null, Boolean(p.pvpOptIn), p.faction ?? null, p.ownerKey ?? null],
    );
  }

  async playerByTokenHash(hash: string): Promise<Player | null> {
    const r = await this.rows('select * from players where token_hash = $1', [hash]);
    return r[0] ? toPlayer(r[0]) : null;
  }

  async getPlayer(id: string): Promise<Player | null> {
    const r = await this.rows('select * from players where id = $1', [id]);
    return r[0] ? toPlayer(r[0]) : null;
  }

  async updatePlayer(id: string, patch: PlayerPatch): Promise<void> {
    const cols: Record<string, string> = {
      name: 'name',
      trophies: 'trophies',
      hallLevel: 'hall_level',
      shieldUntil: 'shield_until',
      base: 'base',
      groveId: 'grove_id',
      updatedAt: 'updated_at',
      lastSeenAt: 'last_seen_at',
      pvpOptIn: 'pvp_opt_in',
      rating: 'rating',
      defenseRating: 'defense_rating',
      ratedGames: 'rated_games',
      ratingSeason: 'rating_season',
      lastSeason: 'last_season',
      regionId: 'region_id',
      faction: 'faction',
      ownerKey: 'owner_key',
      combatRating: 'combat_rating',
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, col] of Object.entries(cols)) {
      if (!(k in patch)) continue;
      const v = (patch as Record<string, unknown>)[k];
      vals.push((k === 'base' || k === 'lastSeason') && v !== null && v !== undefined ? JSON.stringify(v) : v);
      sets.push(`${col} = $${vals.length}`);
    }
    if (!sets.length) return;
    vals.push(id);
    await this.pool.query(`update players set ${sets.join(', ')} where id = $${vals.length}`, vals);
  }

  async findOpponents(q: OpponentQuery): Promise<Player[]> {
    const el = q.eligibility ? eligibilitySql(q.eligibility, 9) : { sql: '', vals: [] as unknown[] };
    if (q.excludeOwnerKey) {
      el.vals = [...el.vals, q.excludeOwnerKey];
      el.sql += ` and (p.owner_key is null or p.owner_key <> $${8 + el.vals.length})`;
    }
    const r = await this.rows(
      `select * from players p
       where p.base is not null and p.shield_until <= $1
         and p.hall_level between $2 and $3 and p.trophies between $4 and $5
         and not (p.id = any($6::text[]))
         and not exists (select 1 from tickets t where t.defender_id = p.id and not t.used and t.created_at > $7)${el.sql}
       order by random() limit $8`,
      [q.now, q.minHall, q.maxHall, Number.isFinite(q.minTrophies) ? q.minTrophies : -2147483648, Number.isFinite(q.maxTrophies) ? q.maxTrophies : 2147483647, q.excludeIds, q.lockedSince, q.limit, ...el.vals],
    );
    return r.map(toPlayer);
  }

  async topPlayers(limit: number): Promise<Player[]> {
    return (await this.rows('select * from players where base is not null order by trophies desc, created_at asc limit $1', [limit])).map(toPlayer);
  }

  async rankOf(trophies: number): Promise<number> {
    const r = await this.rows('select count(*) as n from players where base is not null and trophies > $1', [trophies]);
    return 1 + num(r[0]?.n);
  }

  // ------------------------------------------------------------ tickets and attacks

  async createTicket(t: Ticket): Promise<void> {
    await this.pool.query(
      `insert into tickets (id, kind, attacker_id, defender_id, defender_name, base, defender_trophies, created_at, expires_at, used, week, grove_id, target, settlement, army_cap)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13,$14)`,
      [t.id, t.kind, t.attackerId, t.defenderId, t.defenderName, JSON.stringify(t.base), t.defenderTrophies, t.createdAt, t.expiresAt, t.week ?? null, t.groveId ?? null, t.target ?? null, t.settlement ?? null, t.armyCap ? JSON.stringify(t.armyCap) : null],
    );
  }

  async getTicket(id: string): Promise<Ticket | null> {
    const r = await this.rows('select * from tickets where id = $1', [id]);
    return r[0] ? toTicket(r[0]) : null;
  }

  async useTicket(id: string): Promise<boolean> {
    const r = await this.pool.query('update tickets set used = true where id = $1 and used = false', [id]);
    return (r.rowCount ?? 0) > 0;
  }

  async addAttack(a: AttackRecord): Promise<void> {
    await this.pool.query('insert into attacks (id, at, attacker_id, defender_id, record) values ($1,$2,$3,$4,$5)', [a.id, a.at, a.attackerId, a.defenderId, JSON.stringify(a)]);
  }

  async defensesFor(defenderId: string, since: number, limit: number): Promise<AttackRecord[]> {
    const r = await this.rows('select id, record from attacks where defender_id = $1 and at > $2 order by at desc limit $3', [defenderId, since, limit]);
    return r.map(toAttack).reverse();
  }

  async recentTargets(attackerId: string, since: number): Promise<string[]> {
    return (await this.rows('select defender_id from attacks where attacker_id = $1 and at > $2', [attackerId, since])).map((x) => String(x.defender_id));
  }

  // ------------------------------------------------------------ groves

  async createGrove(g: Grove): Promise<void> {
    await this.pool.query('insert into groves (id, name, color, created_at) values ($1,$2,$3,$4)', [g.id, g.name, g.color, g.createdAt]);
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
    const r = await this.pool.query('insert into grove_members (player_id, grove_id, role, joined_at, xp) values ($1,$2,$3,$4,$5) on conflict (player_id) do nothing', [
      m.playerId,
      m.groveId,
      m.role,
      m.joinedAt,
      m.xp,
    ]);
    return (r.rowCount ?? 0) > 0;
  }

  async removeMember(groveId: string, playerId: string): Promise<void> {
    await this.pool.query('delete from grove_members where grove_id = $1 and player_id = $2', [groveId, playerId]);
  }

  async updateMember(groveId: string, playerId: string, patch: Partial<Pick<GroveMember, 'role' | 'xp'>>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (patch.role !== undefined) sets.push(`role = $${vals.push(patch.role)}`);
    if (patch.xp !== undefined) sets.push(`xp = $${vals.push(patch.xp)}`);
    if (!sets.length) return;
    vals.push(groveId, playerId);
    await this.pool.query(`update grove_members set ${sets.join(', ')} where grove_id = $${vals.length - 1} and player_id = $${vals.length}`, vals);
  }

  // ------------------------------------------------------------ chat

  async addChat(row: Omit<ChatRow, 'seq'>): Promise<ChatRow> {
    const r = await this.rows('insert into grove_chat (id, grove_id, at, player_id, name, text, kind) values ($1,$2,$3,$4,$5,$6,$7) returning *', [
      row.id,
      row.groveId,
      row.at,
      row.playerId,
      row.name,
      row.text,
      row.kind,
    ]);
    return toChat(r[0]);
  }

  async chatAfter(groveId: string, afterSeq: number, limit: number): Promise<ChatRow[]> {
    const r = await this.rows('select * from grove_chat where grove_id = $1 and seq > $2 order by seq desc limit $3', [groveId, afterSeq, limit]);
    return r.map(toChat).reverse();
  }

  async recentChatCount(playerId: string, since: number): Promise<number> {
    const r = await this.rows(`select count(*) as n from grove_chat where player_id = $1 and at > $2 and kind = 'chat'`, [playerId, since]);
    return num(r[0]?.n);
  }

  // ------------------------------------------------------------ troop requests and donations

  async addRequest(q: TroopRequest): Promise<void> {
    await this.pool.query('insert into troop_requests (id, grove_id, player_id, name, at, size, filled, open) values ($1,$2,$3,$4,$5,$6,$7,$8)', [
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
    await this.pool.query('update troop_requests set open = false where player_id = $1 and open', [playerId]);
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
    await this.pool.query(
      `insert into donations (id, request_id, grove_id, from_id, from_name, to_id, troop, count, level, at, delivered)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [d.id, d.requestId, d.groveId, d.fromId, d.fromName, d.toId, d.troop, d.count, d.level, d.at, d.delivered],
    );
  }

  async undelivered(playerId: string): Promise<Donation[]> {
    return (await this.rows('select * from donations where to_id = $1 and not delivered order by at', [playerId])).map(toDonation);
  }

  async markDelivered(playerId: string, ids: string[]): Promise<void> {
    await this.pool.query('update donations set delivered = true where to_id = $1 and id = any($2::text[])', [playerId, ids]);
  }

  // ------------------------------------------------------------ grove raids

  async getPairing(week: number, groveId: string): Promise<RaidPairing | null> {
    const r = await this.rows('select * from raid_pairings where week = $1 and grove_id = $2', [week, groveId]);
    return r[0] ? toPairing(r[0]) : null;
  }

  async createPairings(pairs: RaidPairing[]): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      for (const p of pairs) {
        const r = await client.query(
          `insert into raid_pairings (week, grove_id, opponent_grove_id, opponent_name, bot_seed, roster, our_size, our_hall, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing`,
          [p.week, p.groveId, p.opponentGroveId, p.opponentName, p.botSeed, JSON.stringify(p.roster), p.ourSize, p.ourHall, p.createdAt],
        );
        if ((r.rowCount ?? 0) === 0) {
          await client.query('rollback');
          return false;
        }
      }
      await client.query('commit');
      return true;
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
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
    await this.pool.query('insert into raid_attacks (id, week, grove_id, attacker_id, target, stars, destruction, at) values ($1,$2,$3,$4,$5,$6,$7,$8)', [
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
    const r = await this.pool.query('insert into raid_claims (week, player_id, grove_id, outcome, at) values ($1,$2,$3,$4,$5) on conflict do nothing', [
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
  }

  // ------------------------------------------------------------ Shadow Clans (protocol 4)

  async isLocked(defenderId: string, since: number): Promise<boolean> {
    const r = await this.rows('select 1 from tickets where defender_id = $1 and not used and created_at > $2 limit 1', [defenderId, since]);
    return r.length > 0;
  }

  async countEligible(q: Pick<OpponentQuery, 'minHall' | 'maxHall' | 'now' | 'lockedSince'> & { eligibility: EligibilityRules }): Promise<number> {
    const el = eligibilitySql(q.eligibility, 5);
    const r = await this.rows(
      `select count(*) as n from players p
       where p.base is not null and p.shield_until <= $1 and p.hall_level between $2 and $3
         and not exists (select 1 from tickets t where t.defender_id = p.id and not t.used and t.created_at > $4)${el.sql}`,
      [q.now, q.minHall, q.maxHall, q.lockedSince, ...el.vals],
    );
    return num(r[0]?.n);
  }

  async countActive(minHall: number, maxHall: number, since: number): Promise<number> {
    const r = await this.rows('select count(*) as n from players where base is not null and hall_level between $1 and $2 and last_seen_at >= $3', [minHall, maxHall, since]);
    return num(r[0]?.n);
  }

  async attacksOnSince(defenderId: string, since: number): Promise<number> {
    const r = await this.rows('select count(*) as n from attacks where defender_id = $1 and at > $2', [defenderId, since]);
    return num(r[0]?.n);
  }

  async attacksSince(since: number): Promise<number> {
    const r = await this.rows('select count(*) as n from attacks where at > $1', [since]);
    return num(r[0]?.n);
  }

  async ticketsSince(since: number): Promise<{ human: number; bot: number }> {
    const r = await this.rows("select count(*) filter (where defender_id is not null) as human, count(*) filter (where defender_id is null) as bot from tickets where kind = 'pvp' and created_at > $1", [since]);
    return { human: num(r[0]?.human), bot: num(r[0]?.bot) };
  }

  async ratingBoard(board: 'rank' | 'defense', limit: number): Promise<Player[]> {
    const col = board === 'rank' ? 'rating' : 'defense_rating';
    return (await this.rows(`select * from players where rated_games > 0 order by ${col} desc, created_at asc limit $1`, [limit])).map(toPlayer);
  }

  async ratingRankOf(board: 'rank' | 'defense', value: number): Promise<number> {
    const col = board === 'rank' ? 'rating' : 'defense_rating';
    const r = await this.rows(`select count(*) as n from players where rated_games > 0 and ${col} > $1`, [value]);
    return 1 + num(r[0]?.n);
  }

  async latestRegion(): Promise<Region | null> {
    const r = await this.rows('select * from regions order by created_at desc, id desc limit 1');
    return r[0] ? { id: String(r[0].id), name: String(r[0].name), seed: num(r[0].seed), createdAt: num(r[0].created_at) } : null;
  }

  async createRegion(g: Region): Promise<void> {
    await this.pool.query('insert into regions (id, name, seed, created_at) values ($1,$2,$3,$4) on conflict (id) do nothing', [g.id, g.name, g.seed, g.createdAt]);
  }

  async getRegion(id: string): Promise<Region | null> {
    const r = await this.rows('select * from regions where id = $1', [id]);
    return r[0] ? { id: String(r[0].id), name: String(r[0].name), seed: num(r[0].seed), createdAt: num(r[0].created_at) } : null;
  }

  async regionPlayers(id: string): Promise<number> {
    const r = await this.rows('select count(*) as n from players where region_id = $1', [id]);
    return num(r[0]?.n);
  }

  async factionMembers(clan: string): Promise<Player[]> {
    return (await this.rows('select * from players where faction = $1', [clan])).map(toPlayer);
  }

  async winsSince(playerIds: string[], since: number): Promise<Record<string, number>> {
    if (!playerIds.length) return {};
    const r = await this.rows("select attacker_id, count(*) as n from attacks where at > $1 and attacker_id = any($2::text[]) and (record->'result'->>'stars')::int >= 1 group by attacker_id", [since, playerIds]);
    return Object.fromEntries(r.map((x) => [String(x.attacker_id), num(x.n)]));
  }

  async factionTerms(clan: string): Promise<{ season: number; playerId: string }[]> {
    return (await this.rows('select season, player_id from faction_terms where clan = $1', [clan])).map((x) => ({ season: num(x.season), playerId: String(x.player_id) }));
  }

  async recordFactionTerm(clan: string, season: number, playerId: string): Promise<void> {
    await this.pool.query('insert into faction_terms (clan, season, player_id) values ($1,$2,$3) on conflict (clan, season) do nothing', [clan, season, playerId]);
  }

  async saveTournamentScore(row: TournamentScoreRow): Promise<number> {
    const r = await this.rows(
      `insert into tournament_scores (tournament, player_id, idx, score, at) values ($1,$2,$3,$4,$5)
       on conflict (tournament, player_id, idx) do update set score = greatest(tournament_scores.score, excluded.score),
         at = case when excluded.score > tournament_scores.score then excluded.at else tournament_scores.at end
       returning score`,
      [row.tournament, row.playerId, row.index, row.score, row.at],
    );
    return num(r[0]?.score);
  }

  async tournamentTotals(tournament: number, limit: number): Promise<{ playerId: string; name: string; score: number }[]> {
    const r = await this.rows(
      `select s.player_id, p.name, sum(s.score) as score from tournament_scores s join players p on p.id = s.player_id
       where s.tournament = $1 group by s.player_id, p.name order by score desc, s.player_id asc limit $2`,
      [tournament, limit],
    );
    return r.map((x) => ({ playerId: String(x.player_id), name: String(x.name), score: num(x.score) }));
  }

  async tournamentTotal(tournament: number, playerId: string): Promise<number> {
    const r = await this.rows('select coalesce(sum(score), 0) as n from tournament_scores where tournament = $1 and player_id = $2', [tournament, playerId]);
    return num(r[0]?.n);
  }

  async tournamentRankOf(tournament: number, total: number): Promise<number> {
    const r = await this.rows('select count(*) as n from (select player_id, sum(score) as t from tournament_scores where tournament = $1 group by player_id) x where x.t > $2', [tournament, total]);
    return 1 + num(r[0]?.n);
  }

  async addSearch(playerId: string, hall: number, at: number): Promise<void> {
    await this.pool.query('insert into searches (player_id, hall, at) values ($1,$2,$3)', [playerId, hall, at]);
  }

  async searchesSince(minHall: number, maxHall: number, since: number): Promise<number> {
    const r = await this.rows('select count(*) as n from searches where at > $1 and hall between $2 and $3', [since, minHall, maxHall]);
    return num(r[0]?.n);
  }

  async regionClaims(regionId: string): Promise<RegionClaim[]> {
    return (await this.rows('select * from region_claims where region_id = $1', [regionId])).map(toClaimRow);
  }

  async claimSettlement(c: RegionClaim): Promise<RegionClaim> {
    await this.pool.query('insert into region_claims (region_id, settlement, player_id, name, since) values ($1,$2,$3,$4,$5) on conflict (region_id, settlement) do nothing', [c.regionId, c.settlement, c.playerId, c.name, c.since]);
    const r = await this.rows('select * from region_claims where region_id = $1 and settlement = $2', [c.regionId, c.settlement]);
    return toClaimRow(r[0]);
  }

  async transferClaim(regionId: string, settlement: string, fromId: string, to: { playerId: string; name: string; since: number }): Promise<boolean> {
    const r = await this.pool.query('update region_claims set player_id = $4, name = $5, since = $6 where region_id = $1 and settlement = $2 and player_id = $3', [regionId, settlement, fromId, to.playerId, to.name, to.since]);
    return (r.rowCount ?? 0) > 0;
  }

  async releaseClaim(regionId: string, settlement: string, playerId: string): Promise<void> {
    await this.pool.query('delete from region_claims where region_id = $1 and settlement = $2 and player_id = $3', [regionId, settlement, playerId]);
  }

  async setFactionTarget(clan: string, week: number, target: string, by: string): Promise<void> {
    await this.pool.query('insert into faction_targets (clan, week, target, by_player) values ($1,$2,$3,$4) on conflict (clan, week) do update set target = excluded.target, by_player = excluded.by_player', [clan, week, target, by]);
  }

  async factionTarget(clan: string, week: number): Promise<string | null> {
    const r = await this.rows('select target from faction_targets where clan = $1 and week = $2', [clan, week]);
    return r[0] ? String(r[0].target) : null;
  }

  async recentStars(playerId: string, limit: number): Promise<number[]> {
    const r = await this.rows("select (record->'result'->>'stars')::int as stars from attacks where attacker_id = $1 order by at desc limit $2", [playerId, limit]);
    return r.map((x) => num(x.stars));
  }

  async ratedSince(since: number): Promise<{ expected: number; score: number }[]> {
    const r = await this.rows("select (record->>'expected')::float as expected, (record->>'score')::float as score from attacks where at > $1 and record ? 'expected' and record ? 'score'", [since]);
    return r.map((x) => ({ expected: num(x.expected), score: num(x.score) }));
  }

  async participation(since: number): Promise<{ active: number; inAlliance: number; inFaction: number }> {
    const r = await this.rows('select count(*) as active, count(grove_id) as alliance, count(faction) as faction from players where last_seen_at >= $1', [since]);
    return { active: num(r[0]?.active), inAlliance: num(r[0]?.alliance), inFaction: num(r[0]?.faction) };
  }

  async claimsFromWeek(week: number): Promise<RaidClaim[]> {
    return (await this.rows('select * from raid_claims where week >= $1', [week])).map(toClaim);
  }

  async territoryOf(playerIds: string[]): Promise<number> {
    if (!playerIds.length) return 0;
    const r = await this.rows('select count(*) as n from region_claims where player_id = any($1::text[])', [playerIds]);
    return num(r[0]?.n);
  }
}

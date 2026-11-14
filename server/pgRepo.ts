/** Postgres storage adapter for the Repo port (tables in server/migrations/). Bases and battle records are JSONB. */
import { pgPoolSettings, pgTls, type PgPoolSettings } from './config';
import pg from 'pg';
import { contentHash } from './contentHash';
import type { Rating } from '../src/gameplay/sim/rating';
import { isAgeBand, type AgeBand } from '../src/gameplay/sim/age';
import { migrationStatus, runMigrations, type MigrationStatus } from './migrate';
import { migrations } from './migrations';
import { DELETED_PLAYER, NameTakenError, nameNoticePatterns, STATE_NOTICES } from './repo';
import type {
  AttackRecord,
  Block,
  DuelChallenge,
  DuelRecord,
  DuelTally,
  FriendRequest,
  GangQueueEntry,
  GangRelay,
  GangWar,
  GangWarAttack,
  Squad,
  SquadInvite,
  SquadMember,
  ChatRow,
  DeletionRequest,
  Donation,
  Grove,
  GroveMember,
  GroveSummaryRow,
  IdentityLink,
  PlayerNotice,
  OpponentQuery,
  Player,
  PlayerPatch,
  PruneCutoffs,
  PruneResult,
  PurchaseIntent,
  ImportHold,
  PurchaseRow,
  PushToken,
  RaidAttack,
  StaffAction,
  StatsDailyRow,
  StatsInstallSummary,
  RaidClaim,
  LedgerEntry,
  CommandLogRow,
  RaidPairing,
  Report,
  Repo,
  VillageRow,
  Ticket,
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
  mutedUntil: num(r.muted_until),
  muteReason: strOrNull(r.mute_reason),
  bannedUntil: num(r.banned_until),
  banReason: strOrNull(r.ban_reason),
  ...(num(r.attack_rated_at) > 0 || num(r.base_rated_at) > 0
    ? {
        ratings: {
          attack: { rating: num(r.attack_rating), rd: num(r.attack_rd), battles: num(r.attack_battles), at: num(r.attack_rated_at) },
          base: { rating: num(r.base_rating), rd: num(r.base_rd), battles: num(r.base_battles), at: num(r.base_rated_at) },
        },
      }
    : {}),
  ...(num(r.honor_loss_day) >= 0 ? { honorLoss: { day: num(r.honor_loss_day), lost: num(r.honor_lost) } } : {}),
  ...(r.name_key !== null && r.name_key !== undefined ? { nameKey: String(r.name_key) } : {}),
  previousName: strOrNull(r.previous_name),
  nameChangedAt: num(r.name_changed_at),
  freeRenames: num(r.free_renames),
  findable: (r.findable === 'nobody' || r.findable === 'friends_of_friends' ? r.findable : 'everyone') as Player['findable'],
  showOnline: r.show_online !== false,
  friendCode: strOrNull(r.friend_code),
  staff: r.staff === true,
  duelBase: (r.duel_base as Player['duelBase']) ?? null,
  squadLeftAt: num(r.squad_left_at),
  rulesVersion: num(r.rules_version),
  rulesAcceptedAt: num(r.rules_accepted_at),
});

/** Postgres said a unique key (name or friend code) is already used. */
const isUniqueClash = (e: unknown) => (e as { code?: string })?.code === '23505' && /name_key|friend_code/.test(String((e as { constraint?: string }).constraint ?? (e as Error).message));

const toTicket = (r: Row): Ticket => {
  const t: Ticket = {
    id: String(r.id),
    kind: r.kind === 'raid' ? 'raid' : r.kind === 'duel' ? 'duel' : r.kind === 'war' ? 'war' : 'pvp',
    attackerId: String(r.attacker_id),
    defenderId: strOrNull(r.defender_id),
    defenderName: String(r.defender_name ?? ''),
    // From base_versions; tickets made before step 11 carry their own copy.
    base: (r.stored_base ?? r.base) as Ticket['base'],
    defenderTrophies: num(r.defender_trophies),
    createdAt: num(r.created_at),
    expiresAt: num(r.expires_at),
    used: Boolean(r.used),
  };
  if (r.seed !== null && r.seed !== undefined) t.seed = num(r.seed);
  if (r.scout_seed !== null && r.scout_seed !== undefined) t.scoutSeed = num(r.scout_seed);
  if (r.rules !== null && r.rules !== undefined) t.rules = num(r.rules);
  if (r.challenge_id !== null && r.challenge_id !== undefined) t.challengeId = String(r.challenge_id);
  if (r.war_id !== null && r.war_id !== undefined) t.warId = String(r.war_id);
  if (r.relay !== null && r.relay !== undefined) t.relay = Boolean(r.relay);
  if (r.start_damage !== null && r.start_damage !== undefined) t.startDamage = r.start_damage as Record<string, number>;
  if (r.data_version !== null && r.data_version !== undefined) t.dataVersion = String(r.data_version);
  if (r.week !== null && r.week !== undefined) t.week = num(r.week);
  if (r.grove_id !== null && r.grove_id !== undefined) t.groveId = String(r.grove_id);
  if (r.target !== null && r.target !== undefined) t.target = num(r.target);
  if (r.response !== null && r.response !== undefined) t.response = r.response;
  if (r.started_at !== null && r.started_at !== undefined) t.startedAt = num(r.started_at);
  if (r.stake !== null && r.stake !== undefined) t.stake = num(r.stake);
  if (r.failures) t.failures = num(r.failures);
  return t;
};

// From base_versions; records made before step 11 carry their own copy in `record.base`.
const toAttack = (r: Row): AttackRecord => {
  const rec = r.record as AttackRecord;
  return { ...rec, base: (r.stored_base as AttackRecord['base'] | null) ?? rec.base, id: String(r.id) };
};

/**
 * A statement prefix that stores a base version once ($1 = hash, $2 = base,
 * $3 = time): new content is inserted, known content only has its last use
 * refreshed (so retention never removes a base that was just used again).
 */
const PUT_BASE = `with put_base as (
  insert into base_versions (hash, base, created_at, last_used_at) values ($1, $2, $3, $3)
  on conflict (hash) do update set last_used_at = greatest(base_versions.last_used_at, excluded.last_used_at)
)`;
const toGrove = (r: Row): Grove => ({ id: String(r.id), name: String(r.name), color: String(r.color), createdAt: num(r.created_at) });
const toSummary = (r: Row): GroveSummaryRow => ({ ...toGrove(r), members: num(r.members), averageTrophies: Math.round(num(r.average_trophies)), lastActiveAt: num(r.last_active_at) });
const toMember = (r: Row): GroveMember => ({ groveId: String(r.grove_id), playerId: String(r.player_id), role: r.role as GroveMember['role'], joinedAt: num(r.joined_at), xp: num(r.xp) });
const toChat = (r: Row): ChatRow => ({
  ...(r.preset_id == null ? {} : { presetId: num(r.preset_id) }),
  seq: num(r.seq),
  id: String(r.id),
  groveId: String(r.grove_id),
  at: num(r.at),
  playerId: strOrNull(r.player_id),
  name: strOrNull(r.name),
  text: String(r.text),
  kind: r.kind as ChatRow['kind'],
  hidden: Boolean(r.hidden),
});
const toReport = (r: Row): Report => ({
  id: String(r.id),
  at: num(r.at),
  reporterId: String(r.reporter_id),
  kind: r.kind as Report['kind'],
  targetId: String(r.target_id),
  targetName: String(r.target_name),
  messageId: strOrNull(r.message_id),
  groveId: strOrNull(r.grove_id),
  text: strOrNull(r.text),
  reason: r.reason as Report['reason'],
  note: String(r.note ?? ''),
  status: r.status as Report['status'],
  resolvedAt: r.resolved_at === null || r.resolved_at === undefined ? null : num(r.resolved_at),
  resolution: strOrNull(r.resolution),
});
const toVillage = (r: Row): VillageRow => ({
  playerId: String(r.player_id),
  file: r.file,
  revision: num(r.revision),
  seq: num(r.seq),
  at: num(r.at),
  stateHash: String(r.state_hash),
  createdAt: num(r.created_at),
  updatedAt: num(r.updated_at),
  ...(r.device_seqs ? { deviceSeqs: r.device_seqs as Record<string, number> } : {}),
});
const toLedger = (r: Row): LedgerEntry => ({ playerId: String(r.player_id), at: num(r.at), resource: String(r.resource), delta: num(r.delta), balance: num(r.balance), reason: String(r.reason), ref: strOrNull(r.ref) });
const toCommand = (r: Row): CommandLogRow => ({ playerId: String(r.player_id), seq: num(r.seq), at: num(r.at), clientAt: num(r.client_at), type: String(r.type), command: r.command, ok: Boolean(r.ok), error: strOrNull(r.error) });
let savepoints = 0;
const toBlock = (r: Row): Block => ({ playerId: String(r.player_id), blockedId: String(r.blocked_id), blockedName: String(r.blocked_name), at: num(r.at) });
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
const toDeletion = (r: Row): DeletionRequest => ({
  id: String(r.id),
  at: num(r.at),
  playerId: String(r.player_id),
  name: String(r.name),
  contact: String(r.contact),
  note: String(r.note),
  status: r.status as DeletionRequest['status'],
  resolvedAt: r.resolved_at === null || r.resolved_at === undefined ? null : num(r.resolved_at),
  resolution: strOrNull(r.resolution),
  verified: Boolean(r.verified),
});
const toClaim = (r: Row): RaidClaim => ({ week: num(r.week), playerId: String(r.player_id), groveId: String(r.grove_id), outcome: r.outcome as RaidClaim['outcome'], at: num(r.at) });

/** Groves with their member count, average trophies and last activity. */
const GROVE_SUMMARY = `
  select g.*, count(p.id) as members, coalesce(avg(p.trophies), 0) as average_trophies, coalesce(max(p.last_seen_at), 0) as last_active_at
  from groves g join grove_members m on m.grove_id = g.id join players p on p.id = m.player_id`;

export class PgRepo implements Repo {
  /** `client`: a connection inside a transaction (see `transaction`); otherwise queries use the pool. */
  constructor(
    private readonly pool: pg.Pool,
    private readonly client: pg.PoolClient | null = null,
  ) {}

  private get db(): pg.Pool | pg.PoolClient {
    return this.client ?? this.pool;
  }

  /**
   * Run `fn` in one transaction on one connection. Inside a transaction, a
   * nested one is a savepoint: if it throws, only its own writes are undone.
   */
  async transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    if (this.client) {
      const sp = `sp_${++savepoints}`;
      await this.client.query(`savepoint ${sp}`);
      try {
        const out = await fn(this);
        await this.client.query(`release savepoint ${sp}`);
        return out;
      } catch (e) {
        await this.client.query(`rollback to savepoint ${sp}`);
        throw e;
      }
    }
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const out = await fn(new PgRepo(this.pool, client));
      await client.query('commit');
      return out;
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * A pool for DATABASE_URL with the TLS and pool settings of server/config.ts
   * (`pgTls`, `pgPoolSettings`: PG_CA_CERT, PG_SSL_ALLOW_UNVERIFIED,
   * PG_POOL_MAX, PG_*_TIMEOUT_MS). Without `settings` (the migration tool) the
   * statement timeout is off, so a long migration is not cancelled.
   */
  static fromUrl(url: string, settings: PgPoolSettings = pgPoolSettings(process.env, { migrations: true }), env: Record<string, string | undefined> = process.env): PgRepo {
    const tls = pgTls(url, env);
    return new PgRepo(new pg.Pool({ ...settings, connectionString: tls.connectionString, ssl: tls.ssl || undefined }));
  }

  /** Connections in the pool (for the tk_db_pool_connections gauge, step 47). */
  poolStats(): { total: number; idle: number; waiting: number } {
    return { total: this.pool.totalCount, idle: this.pool.idleCount, waiting: this.pool.waitingCount };
  }

  /** Apply pending migrations (a release step: `npm run server:migrate`). Returns the names applied. */
  async migrate(log?: (msg: string) => void): Promise<string[]> {
    return runMigrations(this.pool, migrations, Date.now, log);
  }

  /** Applied and pending migrations, without changing the schema. */
  async migrationStatus(): Promise<MigrationStatus> {
    return migrationStatus(this.pool, migrations);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async rows(sql: string, vals: unknown[] = []): Promise<Row[]> {
    return (await this.db.query(sql, vals)).rows as Row[];
  }

  async ping(): Promise<void> {
    await this.db.query('select 1');
  }

  // ------------------------------------------------------------ players

  async createPlayer(p: Player): Promise<void> {
    await this.db.query(
      `insert into players (id, name, token_hash, trophies, hall_level, shield_until, base, grove_id, created_at, updated_at, last_seen_at, muted_until, name_key, free_renames)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [p.id, p.name, p.tokenHash, p.trophies, p.hallLevel, p.shieldUntil, p.base ? JSON.stringify(p.base) : null, p.groveId, p.createdAt, p.updatedAt, p.lastSeenAt, p.mutedUntil ?? 0, p.nameKey ?? null, p.freeRenames ?? 0],
    ).catch((e) => {
      throw isUniqueClash(e) ? new NameTakenError() : e;
    });
  }

  async playerByTokenHash(hash: string): Promise<Player | null> {
    const r = await this.rows('select * from players where token_hash = $1 or id = (select player_id from player_tokens where token_hash = $1) limit 1', [hash]);
    return r[0] ? toPlayer(r[0]) : null;
  }

  async addToken(playerId: string, tokenHash: string, at: number, label: string, provider?: string): Promise<void> {
    await this.db.query('insert into player_tokens (token_hash, player_id, created_at, label, provider) values ($1,$2,$3,$4,$5)', [tokenHash, playerId, at, label, provider ?? null]);
  }

  async linksOf(playerId: string): Promise<IdentityLink[]> {
    return (await this.rows('select * from identity_links where player_id = $1 order by linked_at', [playerId])).map((r) => ({ provider: String(r.provider), subject: String(r.subject), playerId: String(r.player_id), linkedAt: num(r.linked_at) }));
  }

  async playerByIdentity(provider: string, subject: string): Promise<string | null> {
    const r = await this.rows('select player_id from identity_links where provider = $1 and subject = $2', [provider, subject]);
    return r[0] ? String(r[0].player_id) : null;
  }

  async addLink(l: IdentityLink): Promise<boolean> {
    const r = await this.db.query('insert into identity_links (provider, subject, player_id, linked_at) values ($1,$2,$3,$4) on conflict do nothing', [l.provider, l.subject, l.playerId, l.linkedAt]);
    return (r.rowCount ?? 0) > 0;
  }

  async removeLink(playerId: string, provider: string): Promise<void> {
    await this.db.query('delete from identity_links where player_id = $1 and provider = $2', [playerId, provider]);
  }

  /**
   * The deployment this database belongs to (step 42): written by the first
   * server that starts on it, returned as stored afterwards.
   */
  async claimEnvironment(deploy: string): Promise<string> {
    await this.db.query(`insert into server_meta (key, value) values ('environment', $1) on conflict (key) do nothing`, [deploy]);
    const r = await this.rows(`select value from server_meta where key = 'environment'`, []);
    return String(r[0].value);
  }

  // ------------------------------------------------------------ staff tools (step 48)

  async searchPlayers(q: string, limit: number): Promise<Player[]> {
    const like = q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`) + '%';
    return (await this.rows('select * from players where id = $1 or lower(name) like $2 order by name limit $3', [q, like, limit])).map(toPlayer);
  }

  async addStaffAction(a: StaffAction): Promise<void> {
    await this.db.query('insert into staff_actions (id, at, actor, action, player_id, detail) values ($1,$2,$3,$4,$5,$6)', [a.id, a.at, a.actor, a.action, a.playerId, JSON.stringify(a.detail)]);
  }

  async staffActions(playerId: string | null, limit: number): Promise<StaffAction[]> {
    const r = await this.rows('select * from staff_actions where ($1::text is null or player_id = $1) order by at desc limit $2', [playerId, limit]);
    return r.map((x) => ({ id: String(x.id), at: num(x.at), actor: String(x.actor), action: String(x.action), playerId: strOrNull(x.player_id), detail: (x.detail as Record<string, unknown>) ?? {} }));
  }

  // ------------------------------------------------------------ purchases (Phase 4)

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

  async lockPurchases(playerId: string): Promise<void> {
    // Held until the transaction ends; every instance shares the database, so this is cross-instance.
    if (this.client) await this.client.query(`select pg_advisory_xact_lock(hashtextextended('purchases:' || $1, 0))`, [playerId]);
  }

  async claimJob(name: string, holder: string, now: number, leaseMs: number): Promise<boolean> {
    const r = await this.db.query(
      `insert into job_leases (name, holder, until) values ($1, $2, $3)
       on conflict (name) do update set holder = excluded.holder, until = excluded.until
       where job_leases.until <= $4 or job_leases.holder = excluded.holder
       returning name`,
      [name, holder, now + leaseMs, now],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async addStatsEvents(install: string, build: string, arm: string, events: import('../src/backend/net/stats').StatsEvent[], receivedAt: number): Promise<number> {
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
    await this.transaction(async (tx) => {
      const db = (tx as PgRepo).db;
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

  async lockPlayer(playerId: string): Promise<void> {
    if (this.client) await this.client.query(`select pg_advisory_xact_lock(hashtextextended('player:' || $1, 0))`, [playerId]);
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
  }

  // ------------------------------------------------------------ push (step 40)

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
      mutedUntil: 'muted_until',
      muteReason: 'mute_reason',
      bannedUntil: 'banned_until',
      banReason: 'ban_reason',
      nameKey: 'name_key',
      previousName: 'previous_name',
      nameChangedAt: 'name_changed_at',
      freeRenames: 'free_renames',
      findable: 'findable',
      showOnline: 'show_online',
      friendCode: 'friend_code',
      staff: 'staff',
      duelBase: 'duel_base',
      squadLeftAt: 'squad_left_at',
      rulesVersion: 'rules_version',
      rulesAcceptedAt: 'rules_accepted_at',
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, col] of Object.entries(cols)) {
      if (!(k in patch)) continue;
      const v = (patch as Record<string, unknown>)[k];
      vals.push((k === 'base' || k === 'duelBase') && v !== null && v !== undefined ? JSON.stringify(v) : v);
      sets.push(`${col} = $${vals.length}`);
    }
    const put = (col: string, v: unknown) => {
      vals.push(v);
      sets.push(col + ' = $' + vals.length);
    };
    if (patch.ratings) {
      const { attack: a, base: b } = patch.ratings;
      put('attack_rating', a.rating);
      put('attack_rd', a.rd);
      put('attack_battles', a.battles);
      put('attack_rated_at', a.at);
      put('base_rating', b.rating);
      put('base_rd', b.rd);
      put('base_battles', b.battles);
      put('base_rated_at', b.at);
    }
    if (patch.honorLoss) {
      put('honor_loss_day', patch.honorLoss.day);
      put('honor_lost', patch.honorLoss.lost);
    }
    if (!sets.length) return;
    vals.push(id);
    await this.db.query(`update players set ${sets.join(', ')} where id = $${vals.length}`, vals).catch((e) => {
      throw isUniqueClash(e) ? new NameTakenError() : e;
    });
  }

  // names and friends (roadmap step 59)
  async playerByNameKey(key: string): Promise<Player | null> {
    const r = await this.rows('select * from players where name_key = $1', [key]);
    return r[0] ? toPlayer(r[0]) : null;
  }
  async playerByFriendCode(code: string): Promise<Player | null> {
    const r = await this.rows('select * from players where friend_code = $1', [code]);
    return r[0] ? toPlayer(r[0]) : null;
  }
  async nameHold(key: string, now: number): Promise<{ playerId: string; until: number } | null> {
    const r = await this.rows('select player_id, until from name_holds where name_key = $1 and until > $2', [key, now]);
    return r[0] ? { playerId: String(r[0].player_id), until: num(r[0].until) } : null;
  }
  async holdName(key: string, playerId: string, until: number): Promise<void> {
    await this.db.query('insert into name_holds (name_key, player_id, until) values ($1, $2, $3) on conflict (name_key) do update set player_id = excluded.player_id, until = excluded.until', [key, playerId, until]);
  }
  async playersWithoutNameKey(limit: number): Promise<Player[]> {
    return (await this.rows('select * from players where name_key is null order by created_at, id limit $1', [limit])).map(toPlayer);
  }
  async addFriendship(a: string, b: string, at: number): Promise<void> {
    const [x, y] = a < b ? [a, b] : [b, a];
    await this.db.query('insert into friendships (a, b, since) values ($1, $2, $3) on conflict do nothing', [x, y, at]);
  }
  async removeFriendship(a: string, b: string): Promise<void> {
    const [x, y] = a < b ? [a, b] : [b, a];
    await this.db.query('delete from friendships where a = $1 and b = $2', [x, y]);
  }
  async friendsOf(playerId: string): Promise<{ id: string; since: number }[]> {
    const r = await this.rows('select case when a = $1 then b else a end as id, since from friendships where a = $1 or b = $1', [playerId]);
    return r.map((x) => ({ id: String(x.id), since: num(x.since) }));
  }
  async addFriendRequest(r: FriendRequest): Promise<void> {
    await this.db.query('insert into friend_requests (id, from_id, to_id, at) values ($1, $2, $3, $4)', [r.id, r.fromId, r.toId, r.at]);
  }
  async getFriendRequest(id: string): Promise<FriendRequest | null> {
    const r = await this.rows('select * from friend_requests where id = $1', [id]);
    return r[0] ? { id: String(r[0].id), fromId: String(r[0].from_id), toId: String(r[0].to_id), at: num(r[0].at) } : null;
  }
  async friendRequestsOf(playerId: string, since: number): Promise<FriendRequest[]> {
    const r = await this.rows('select * from friend_requests where (from_id = $1 or to_id = $1) and at > $2 order by at', [playerId, since]);
    return r.map((x) => ({ id: String(x.id), fromId: String(x.from_id), toId: String(x.to_id), at: num(x.at) }));
  }
  async deleteFriendRequest(id: string): Promise<void> {
    await this.db.query('delete from friend_requests where id = $1', [id]);
  }
  async deleteFriendRequestsBetween(a: string, b: string): Promise<void> {
    await this.db.query('delete from friend_requests where (from_id = $1 and to_id = $2) or (from_id = $2 and to_id = $1)', [a, b]);
  }
  async pruneFriendRequests(before: number): Promise<number> {
    const r = await this.db.query('delete from friend_requests where at < $1', [before]);
    return r.rowCount ?? 0;
  }

  // duels (roadmap step 62): the record (with its base) is one jsonb column; duels are few and kept 30 days.
  async addDuel(d: DuelRecord): Promise<void> {
    await this.db.query('insert into duels (id, at, attacker_id, defender_id, record) values ($1, $2, $3, $4, $5)', [d.id, d.at, d.attackerId, d.defenderId, JSON.stringify(d)]);
  }
  async duelsOf(playerId: string, since: number, limit: number): Promise<DuelRecord[]> {
    const r = await this.rows('select record from duels where (attacker_id = $1 or defender_id = $1) and at > $2 order by at desc limit $3', [playerId, since, limit]);
    return r.map((x) => x.record as DuelRecord);
  }
  async bumpDuelTally(attackerId: string, defenderId: string, won: boolean, stars: number, destruction: number): Promise<void> {
    await this.db.query(
      `insert into duel_tallies (attacker_id, defender_id, duels, wins, best_stars, best_destruction) values ($1, $2, 1, $3, $4, $5)
       on conflict (attacker_id, defender_id) do update set duels = duel_tallies.duels + 1, wins = duel_tallies.wins + excluded.wins,
         best_stars = greatest(duel_tallies.best_stars, excluded.best_stars), best_destruction = greatest(duel_tallies.best_destruction, excluded.best_destruction)`,
      [attackerId, defenderId, won ? 1 : 0, stars, destruction],
    );
  }
  async duelTallies(playerId: string): Promise<DuelTally[]> {
    const r = await this.rows('select * from duel_tallies where attacker_id = $1 or defender_id = $1', [playerId]);
    return r.map((x) => ({ attackerId: String(x.attacker_id), defenderId: String(x.defender_id), duels: num(x.duels), wins: num(x.wins), bestStars: num(x.best_stars), bestDestruction: num(x.best_destruction) }));
  }
  async addChallenge(c: DuelChallenge): Promise<void> {
    await this.db.query('insert into duel_challenges (id, from_id, to_id, created_at, expires_at, from_result, to_result) values ($1, $2, $3, $4, $5, $6, $7)', [c.id, c.fromId, c.toId, c.createdAt, c.expiresAt, c.fromResult ? JSON.stringify(c.fromResult) : null, c.toResult ? JSON.stringify(c.toResult) : null]);
  }
  private toChallenge = (x: Row): DuelChallenge => ({ id: String(x.id), fromId: String(x.from_id), toId: String(x.to_id), createdAt: num(x.created_at), expiresAt: num(x.expires_at), fromResult: (x.from_result as DuelChallenge['fromResult']) ?? null, toResult: (x.to_result as DuelChallenge['toResult']) ?? null });
  async getChallenge(id: string): Promise<DuelChallenge | null> {
    const r = await this.rows('select * from duel_challenges where id = $1', [id]);
    return r[0] ? this.toChallenge(r[0]) : null;
  }
  async challengesOf(playerId: string, since: number): Promise<DuelChallenge[]> {
    return (await this.rows('select * from duel_challenges where (from_id = $1 or to_id = $1) and created_at > $2 order by created_at desc', [playerId, since])).map(this.toChallenge);
  }
  async setChallengeResult(id: string, side: 'from' | 'to', r: { stars: number; destruction: number }): Promise<boolean> {
    const col = side === 'from' ? 'from_result' : 'to_result';
    const q = await this.db.query(`update duel_challenges set ${col} = $2 where id = $1 and ${col} is null`, [id, JSON.stringify(r)]);
    return (q.rowCount ?? 0) > 0;
  }
  async pruneDuels(before: number): Promise<number> {
    const a = await this.db.query('delete from duels where at < $1', [before]);
    const b = await this.db.query('delete from duel_challenges where expires_at < $1', [before]);
    return (a.rowCount ?? 0) + (b.rowCount ?? 0);
  }

  // Gangs (roadmap step 63)
  async createSquad(s: Squad): Promise<void> {
    await this.db.query('insert into squads (id, name, created_at, rating) values ($1, $2, $3, $4)', [s.id, s.name, s.createdAt, s.rating ? JSON.stringify(s.rating) : null]);
  }
  async getSquad(id: string): Promise<Squad | null> {
    const r = await this.rows('select * from squads where id = $1', [id]);
    return r[0] ? { id: String(r[0].id), name: String(r[0].name), createdAt: num(r[0].created_at), ...(r[0].rating ? { rating: r[0].rating as Rating } : {}) } : null;
  }
  async updateSquad(id: string, patch: Partial<Pick<Squad, 'name' | 'rating'>>): Promise<void> {
    if (patch.name !== undefined) await this.db.query('update squads set name = $2 where id = $1', [id, patch.name]);
    if (patch.rating !== undefined) await this.db.query('update squads set rating = $2 where id = $1', [id, JSON.stringify(patch.rating)]);
  }
  async deleteSquad(id: string): Promise<void> {
    await this.transaction(async (tx) => {
      const q = (sql: string, vals: unknown[]) => (tx as unknown as PgRepo).db.query(sql, vals);
      await q('delete from squad_invites where squad_id = $1', [id]);
      await q('delete from squad_members where squad_id = $1', [id]);
      await q('delete from squads where id = $1', [id]);
    });
  }
  private toMember = (x: Row): SquadMember => ({ playerId: String(x.player_id), squadId: String(x.squad_id), role: x.role === 'leader' ? 'leader' : 'member', joinedAt: num(x.joined_at) });
  async squadMembers(squadId: string): Promise<SquadMember[]> {
    return (await this.rows('select * from squad_members where squad_id = $1 order by joined_at, player_id', [squadId])).map(this.toMember);
  }
  async squadOf(playerId: string): Promise<SquadMember | null> {
    const r = await this.rows('select * from squad_members where player_id = $1', [playerId]);
    return r[0] ? this.toMember(r[0]) : null;
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
  private toInvite = (x: Row): SquadInvite => ({ id: String(x.id), squadId: String(x.squad_id), fromId: String(x.from_id), toId: String(x.to_id), at: num(x.at) });
  async addSquadInvite(i: SquadInvite): Promise<void> {
    await this.db.query('insert into squad_invites (id, squad_id, from_id, to_id, at) values ($1, $2, $3, $4, $5)', [i.id, i.squadId, i.fromId, i.toId, i.at]);
  }
  async getSquadInvite(id: string): Promise<SquadInvite | null> {
    const r = await this.rows('select * from squad_invites where id = $1', [id]);
    return r[0] ? this.toInvite(r[0]) : null;
  }
  async squadInvitesTo(playerId: string, since: number): Promise<SquadInvite[]> {
    return (await this.rows('select * from squad_invites where to_id = $1 and at > $2 order by at', [playerId, since])).map(this.toInvite);
  }
  async squadInvitesFrom(squadId: string, since: number): Promise<SquadInvite[]> {
    return (await this.rows('select * from squad_invites where squad_id = $1 and at > $2 order by at', [squadId, since])).map(this.toInvite);
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
  private toWar = (x: Row): GangWar => ({ ...(x.record as GangWar), rated: Boolean(x.rated) });
  async getWar(id: string): Promise<GangWar | null> {
    const r = await this.rows('select * from squad_wars where id = $1', [id]);
    return r[0] ? this.toWar(r[0]) : null;
  }
  async activeWars(now: number, limit: number): Promise<GangWar[]> {
    return (await this.rows('select * from squad_wars where ends_at > $1 order by ends_at limit $2', [now, limit])).map(this.toWar);
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
    return r[0] ? this.toWar(r[0]) : null;
  }
  async warsOf(squadId: string, limit: number): Promise<GangWar[]> {
    return (await this.rows('select * from squad_wars where squad_a = $1 or squad_b = $1 order by created_at desc limit $2', [squadId, limit])).map(this.toWar);
  }
  async addWarAttack(a: GangWarAttack): Promise<void> {
    await this.db.query('insert into squad_war_attacks (id, war_id, side, attacker_id, target, relay, stars, destruction, at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [a.id, a.warId, a.side, a.attackerId, a.target, a.relay, a.stars, a.destruction, a.at]);
  }
  async warAttacks(warId: string): Promise<GangWarAttack[]> {
    const r = await this.rows('select * from squad_war_attacks where war_id = $1 order by at', [warId]);
    return r.map((x) => ({ id: String(x.id), warId: String(x.war_id), side: x.side === 'b' ? 'b' : 'a', attackerId: String(x.attacker_id), target: num(x.target), relay: Boolean(x.relay), stars: num(x.stars), destruction: num(x.destruction), at: num(x.at) }));
  }
  private toRelay = (x: Row): GangRelay => ({ warId: String(x.war_id), side: x.side === 'b' ? 'b' : 'a', target: num(x.target), damage: (x.damage as Record<string, number>) ?? {}, stars: num(x.stars), destruction: num(x.destruction), strikes: num(x.strikes), lastBy: strOrNull(x.last_by), holder: strOrNull(x.holder), holdUntil: num(x.hold_until) });
  async getRelay(warId: string, side: 'a' | 'b', target: number): Promise<GangRelay | null> {
    const r = await this.rows('select * from squad_war_relays where war_id = $1 and side = $2 and target = $3', [warId, side, target]);
    return r[0] ? this.toRelay(r[0]) : null;
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

  async findOpponents(q: OpponentQuery): Promise<Player[]> {
    // Backend A19: no `order by random()` over the whole window (it read and sorted every ranked player in
    // the widest one). Two index walks from a pivot honor (players_match_trophies_idx, migration 0034), up
    // and down, each stopping after `limit` players; the nearest to the pivot are kept. The core moves the
    // pivot a little on each call, so repeated searches see different neighbours.
    const pivot = Math.round(Math.min(q.maxTrophies, Math.max(q.minTrophies, q.pivot ?? (q.minTrophies + q.maxTrophies) / 2)));
    const where = `p.base is not null and p.banned_until = 0 and p.shield_until <= $1
         and p.hall_level between $2 and $3 and p.trophies between $4 and $5
         and not (p.id = any($6::text[]))
         and ($7::bigint is null or not exists (select 1 from tickets t where t.defender_id = p.id and not t.used and t.created_at > $7))`;
    const r = await this.rows(
      `(select * from players p where ${where} and p.trophies >= $9 order by p.trophies asc limit $8)
       union all
       (select * from players p where ${where} and p.trophies < $9 order by p.trophies desc limit $8)`,
      [q.now, q.minHall, q.maxHall, q.minTrophies, q.maxTrophies, q.excludeIds, q.lockedSince, q.limit, pivot],
    );
    return r
      .map(toPlayer)
      .sort((a, b) => Math.abs(a.trophies - pivot) - Math.abs(b.trophies - pivot))
      .slice(0, q.limit);
  }

  async topPlayers(limit: number): Promise<Player[]> {
    return (await this.rows('select * from players where base is not null and banned_until = 0 order by trophies desc, created_at asc limit $1', [limit])).map(toPlayer);
  }

  async rankOf(trophies: number): Promise<number> {
    const r = await this.rows('select count(*) as n from players where base is not null and banned_until = 0 and trophies > $1', [trophies]);
    return 1 + num(r[0]?.n);
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

  // ------------------------------------------------------------ tickets and attacks

  async createTicket(t: Ticket): Promise<void> {
    // The base version and the ticket in one statement: retention never sees one without the other.
    await this.db.query(
      `${PUT_BASE}
       insert into tickets (base_hash, base, created_at, id, kind, attacker_id, defender_id, defender_name, defender_trophies, expires_at, used, week, grove_id, target, seed, rules, data_version, challenge_id, war_id, relay, start_damage, scout_seed)
       values ($1, null, $3, $4, $5, $6, $7, $8, $9, $10, false, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [contentHash(t.base), JSON.stringify(t.base), t.createdAt, t.id, t.kind, t.attackerId, t.defenderId, t.defenderName, t.defenderTrophies, t.expiresAt, t.week ?? null, t.groveId ?? null, t.target ?? null, t.seed ?? null, t.rules ?? null, t.dataVersion ?? null, t.challengeId ?? null, t.warId ?? null, t.relay ?? null, t.startDamage ? JSON.stringify(t.startDamage) : null, t.scoutSeed ?? null],
    );
  }

  async getTicket(id: string): Promise<Ticket | null> {
    const r = await this.rows('select t.*, b.base as stored_base from tickets t left join base_versions b on b.hash = t.base_hash where t.id = $1', [id]);
    return r[0] ? toTicket(r[0]) : null;
  }

  async useTicket(id: string, response?: unknown): Promise<boolean> {
    const r = await this.db.query('update tickets set used = true, response = coalesce($2::jsonb, response) where id = $1 and used = false', [id, response === undefined ? null : JSON.stringify(response)]);
    return (r.rowCount ?? 0) > 0;
  }

  async startTicket(id: string, at: number, stake?: number): Promise<boolean> {
    const r = await this.db.query('update tickets set stake = case when started_at is null then $3 else stake end, started_at = coalesce(started_at, $2) where id = $1 and used = false', [id, at, stake ?? null]);
    return (r.rowCount ?? 0) > 0;
  }

  async bumpTicketFailures(id: string): Promise<number> {
    const r = await this.rows('update tickets set failures = failures + 1 where id = $1 returning failures', [id]);
    return r[0] ? num(r[0].failures) : 0;
  }

  async openTickets(attackerId: string, kind: Ticket['kind']): Promise<Ticket[]> {
    const r = await this.rows('select t.*, b.base as stored_base from tickets t left join base_versions b on b.hash = t.base_hash where t.attacker_id = $1 and t.kind = $2 and not t.used order by t.created_at desc limit 50', [attackerId, kind]);
    return r.map(toTicket);
  }

  async expiredOpenTickets(kind: Ticket['kind'], before: number, limit: number): Promise<Ticket[]> {
    const r = await this.rows('select t.*, b.base as stored_base from tickets t left join base_versions b on b.hash = t.base_hash where t.kind = $1 and not t.used and t.expires_at < $2 order by t.expires_at limit $3', [kind, before, limit]);
    return r.map(toTicket);
  }

  async addRefundNotice(store: string, key: string, at: number, why: string): Promise<void> {
    await this.db.query('insert into refund_notices (store, key, at, why) values ($1,$2,$3,$4) on conflict do nothing', [store, key, at, why]);
  }

  async refundNotice(store: string, key: string): Promise<{ at: number; why: string } | null> {
    const r = await this.rows('select at, why from refund_notices where store = $1 and key = $2', [store, key]);
    return r[0] ? { at: num(r[0].at), why: String(r[0].why) } : null;
  }

  async addAttack(a: AttackRecord): Promise<void> {
    const { base, ...record } = a;
    await this.db.query(
      `${PUT_BASE}
       insert into attacks (base_hash, at, id, attacker_id, defender_id, record) values ($1, $3, $4, $5, $6, $7)`,
      [contentHash(base), JSON.stringify(base), a.at, a.id, a.attackerId, a.defenderId, JSON.stringify(record)],
    );
  }

  async defensesFor(defenderId: string, since: number, limit: number): Promise<AttackRecord[]> {
    const r = await this.rows(
      `select a.id, a.record, b.base as stored_base from attacks a left join base_versions b on b.hash = a.base_hash
       where a.defender_id = $1 and a.at > $2 order by a.at desc limit $3`,
      [defenderId, since, limit],
    );
    return r.map(toAttack).reverse();
  }

  async recentTargets(attackerId: string, since: number): Promise<string[]> {
    return (await this.rows('select defender_id from attacks where attacker_id = $1 and at > $2', [attackerId, since])).map((x) => String(x.defender_id));
  }

  /**
   * Backend A18: delete matching rows in short batches (by ctid), so no statement nears the statement
   * timeout however much has piled up; stops at `deadline` (the rest goes next run). Returns rows deleted.
   */
  private async batchDelete(table: string, where: string, params: unknown[], c: PruneCutoffs): Promise<number> {
    const size = Math.max(100, Math.floor(c.batchSize ?? 5000));
    let total = 0;
    for (;;) {
      const r = await this.db.query(`delete from ${table} where ctid = any(array(select ctid from ${table} where ${where} limit ${size}))`, params);
      const n = r.rowCount ?? 0;
      total += n;
      if (n < size || (c.deadline !== undefined && Date.now() > c.deadline)) return total;
    }
  }

  async prune(c: PruneCutoffs): Promise<PruneResult> {
    const attacks = await this.batchDelete('attacks', 'at < $1', [c.recordsBefore], c);
    const tickets = await this.batchDelete('tickets', 'created_at < $1 or (not used and expires_at < $2)', [c.recordsBefore, c.ticketsBefore ?? c.staleBefore], c);
    // last_used_at guards a base that a new ticket is referring to right now (its insert refreshes it).
    const bases = await this.batchDelete(
      'base_versions b',
      `b.last_used_at < $1
         and not exists (select 1 from tickets t where t.base_hash = b.hash)
         and not exists (select 1 from attacks a where a.base_hash = b.hash)`,
      [c.staleBefore],
      c,
    );
    const reports = c.resolvedReportsBefore === undefined ? 0 : await this.batchDelete('reports', `status <> 'open' and resolved_at < $1`, [c.resolvedReportsBefore], c);
    const commands = c.commandsBefore === undefined ? 0 : await this.batchDelete('command_log', 'at < $1', [c.commandsBefore], c);
    const idem = c.idempotencyBefore === undefined ? 0 : await this.batchDelete('idempotency_keys', 'created_at < $1', [c.idempotencyBefore], c);
    if (c.intentsBefore !== undefined) await this.batchDelete('purchase_intents', 'at < $1', [c.intentsBefore], c);
    if (c.deletionRequestsBefore !== undefined) await this.batchDelete('deletion_requests', `status <> 'open' and resolved_at < $1`, [c.deletionRequestsBefore], c);
    if (c.storeNotificationsBefore !== undefined) await this.batchDelete('store_notifications', 'received_at < $1', [c.storeNotificationsBefore], c);
    if (c.noncesBefore !== undefined) await this.batchDelete('auth_nonces', 'expires_at < $1', [c.noncesBefore], c);
    return { attacks, tickets, bases, reports, commands, idempotency: idem };
  }

  async dormantPlayers(seenBefore: number, maxKeep: number, limit: number): Promise<string[]> {
    const r = await this.rows(
      `select p.id from players p
       where p.last_seen_at < $1 and not p.staff and coalesce(p.banned_until, 0) = 0 and p.id <> $4
         and not exists (select 1 from purchases x where x.player_id = p.id)
         and not exists (select 1 from identity_links l where l.player_id = p.id)
         and (p.hall_level <= $2 or not exists (select 1 from villages v where v.player_id = p.id))
       order by p.last_seen_at limit $3`,
      [seenBefore, maxKeep, limit, DELETED_PLAYER.id],
    );
    return r.map((x) => String(x.id));
  }

  async getIdempotent(scope: string, key: string): Promise<{ status: number; body: unknown; fingerprint: string | null } | null> {
    const r = await this.rows('select status, body, fingerprint from idempotency_keys where scope = $1 and key = $2', [scope, key]);
    return r[0] ? { status: num(r[0].status), body: r[0].body ?? null, fingerprint: (r[0].fingerprint as string | null) ?? null } : null;
  }

  async putIdempotent(scope: string, key: string, status: number, body: unknown, at: number, fingerprint: string | null = null): Promise<void> {
    await this.db.query('insert into idempotency_keys (scope, key, status, body, created_at, fingerprint) values ($1,$2,$3,$4,$5,$6) on conflict do nothing', [scope, key, status, body === undefined ? null : JSON.stringify(body), at, fingerprint]);
  }

  async dropIdempotentScopes(scopes: string[]): Promise<number> {
    if (!scopes.length) return 0;
    return (await this.db.query('delete from idempotency_keys where scope = any($1::text[])', [scopes])).rowCount ?? 0;
  }

  // ------------------------------------------------------------ account deletion

  async deletePlayer(id: string, name: string, at: number): Promise<void> {
    const D = DELETED_PLAYER;
    await this.transaction(async (tx) => {
      const q = (sql: string, vals: unknown[]) => (tx as PgRepo).db.query(sql, vals);
      await q('delete from tickets where attacker_id = $1', [id]);
      await q('update tickets set defender_id = null where defender_id = $1', [id]);
      await q('delete from attacks where defender_id = $1', [id]);
      await q(`update attacks set attacker_id = $2, record = record || jsonb_build_object('attackerId', $2::text, 'attackerName', $3::text) where attacker_id = $1`, [id, D.id, D.name]);
      await q('delete from grove_members where player_id = $1', [id]);
      await q('delete from grove_chat where player_id = $1', [id]);
      // Legacy plain names and names wrapped in bidi isolates are both removed.
      const notices = nameNoticePatterns(name);
      await q(
        `delete from grove_chat where kind = 'system' and player_id is null
           and (text = any($1::text[]) or starts_with(text, $2) or starts_with(text, $3))`,
        [notices.exact, ...notices.prefixes],
      );
      const giftNote = ` to ${name}.`;
      await q(`update grove_chat set text = left(text, length(text) - length($1)) || $2 where kind = 'donation' and right(text, length($1)) = $1`, [giftNote, ` to ${D.name}.`]);
      await q('delete from donations where to_id = $1', [id]);
      await q('update donations set from_id = $2, from_name = $3 where from_id = $1', [id, D.id, D.name]);
      await q('delete from troop_requests where player_id = $1', [id]);
      await q('update raid_attacks set attacker_id = $2 where attacker_id = $1', [id, D.id]);
      await q('delete from raid_claims where player_id = $1', [id]);
      // War rosters keep the base (the war's score depends on it) under DELETED_PLAYER.
      await q(
        `update raid_pairings set roster = (
           select jsonb_agg(case when e->>'playerId' = $1
             then e || jsonb_build_object('playerId', null, 'name', $2::text, 'base', (e->'base') || jsonb_build_object('name', $2::text))
             else e end order by i)
           from jsonb_array_elements(roster) with ordinality as x(e, i))
         where roster @> jsonb_build_array(jsonb_build_object('playerId', $1::text))`,
        [id, D.name],
      );
      // Blocks either way and their own reports go; reports about them close, without the evidence text.
      await q('delete from blocks where player_id = $1 or blocked_id = $1', [id]);
      // Friends and requests go. Name holds stay, held by nobody (report section 5 step 7, backend A12): a
      // deleted player's names are not free at once for someone to pose as them (account.ts holds the current one).
      await q('delete from friendships where a = $1 or b = $1', [id]);
      await q('delete from friend_requests where from_id = $1 or to_id = $1', [id]);
      await q('update name_holds set player_id = $2 where player_id = $1', [id, D.id]);
      // Stored idempotent answers (a village import's answer holds the whole village) go with the account.
      await q(
        `delete from idempotency_keys where scope in (
           select left(token_hash, 32) from players where id = $1
           union select left(token_hash, 32) from player_tokens where player_id = $1)`,
        [id],
      );
      // Duels, tallies and challenges either way; Gang membership and invites (the core hands leadership over first).
      await q('delete from duels where attacker_id = $1 or defender_id = $1', [id]);
      await q('delete from duel_tallies where attacker_id = $1 or defender_id = $1', [id]);
      await q('delete from duel_challenges where from_id = $1 or to_id = $1', [id]);
      await q('delete from squad_members where player_id = $1', [id]);
      await q('delete from squad_invites where to_id = $1 or from_id = $1', [id]);
      // Gang War rosters keep the base (the war's score depends on it) without the player.
      for (const side of ['a', 'b']) {
        await q(
          `update squad_wars set record = jsonb_set(record, $3::text[], (
             select jsonb_agg(case when e->>'playerId' = $1 then e || jsonb_build_object('playerId', null, 'name', $2::text) else e end order by i)
             from jsonb_array_elements(record->$4->'roster') with ordinality as x(e, i)))
           where record->$4->'roster' @> jsonb_build_array(jsonb_build_object('playerId', $1::text))`,
          [id, D.name, `{${side},roster}`, side],
        );
      }
      await q('delete from squad_war_claims where player_id = $1', [id]);
      await q('delete from reports where reporter_id = $1', [id]);
      await q(
        `update reports set target_id = $2, target_name = $3, text = null,
           status = case when status = 'open' then 'dismissed' else status end,
           resolution = case when status = 'open' then 'Account deleted.' else resolution end,
           resolved_at = case when status = 'open' then $4 else resolved_at end
         where target_id = $1`,
        [id, D.id, D.name, at],
      );
      // A server-held village, its ledger and command log are only theirs.
      await q('delete from villages where player_id = $1', [id]);
      await q('delete from player_tokens where player_id = $1', [id]);
      await q('delete from identity_links where player_id = $1', [id]);
      await q('delete from purchase_intents where player_id = $1', [id]);
      await q('delete from player_age where player_id = $1', [id]);
      await q('delete from import_holds where player_id = $1', [id]);
      await q('delete from push_tokens where player_id = $1', [id]);
      // Purchase records are financial records (refunds, tax): kept, no longer tied to the player.
      await q('update purchases set player_id = $2 where player_id = $1', [id, D.id]);
      await q('delete from ledger where player_id = $1', [id]);
      await q('delete from command_log where player_id = $1', [id]);
      await q('delete from players where id = $1', [id]);
    });
  }

  async addDeletionRequest(r: DeletionRequest): Promise<void> {
    await this.db.query(
      'insert into deletion_requests (id, at, player_id, name, contact, note, status, resolved_at, resolution, verified) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [r.id, r.at, r.playerId, r.name, r.contact, r.note, r.status, r.resolvedAt, r.resolution, r.verified === true],
    );
  }

  // ------------------------------------------------------------ account protections (re-audit, migration 0024)

  async getAgeBand(playerId: string): Promise<{ band: AgeBand | null; under18: boolean; at: number } | null> {
    const r = await this.rows('select under18, band, at from player_age where player_id = $1', [playerId]);
    return r[0] ? { band: isAgeBand(r[0].band) ? r[0].band : null, under18: Boolean(r[0].under18), at: num(r[0].at) } : null;
  }

  async setAgeBand(playerId: string, band: AgeBand, at: number): Promise<void> {
    await this.db.query('insert into player_age (player_id, under18, band, at) values ($1,$2,$3,$4) on conflict (player_id) do update set under18 = excluded.under18, band = excluded.band, at = excluded.at', [playerId, band !== 'adult', band, at]);
  }

  async touchToken(tokenHash: string, at: number): Promise<void> {
    await this.db.query('update player_tokens set last_used_at = $2 where token_hash = $1', [tokenHash, at]);
  }

  async revokeTokens(playerId: string, provider: string, except?: string): Promise<number> {
    const r = await this.db.query('delete from player_tokens where player_id = $1 and provider = $2 and token_hash <> $3', [playerId, provider, except ?? '']);
    return r.rowCount ?? 0;
  }

  async revokeOtherTokens(playerId: string, keepHash: string): Promise<number> {
    // One statement: the kept token becomes the main one (if it was another device's) and every other token goes.
    const r = await this.rows(
      `with p as (select token_hash from players where id = $1),
       ok as (select 1 from p where p.token_hash = $2 or exists (select 1 from player_tokens where player_id = $1 and token_hash = $2)),
       del as (delete from player_tokens where player_id = $1 and exists (select 1 from ok) returning token_hash),
       upd as (update players set token_hash = $2 where id = $1 and token_hash <> $2 and exists (select 1 from ok) returning 1)
       select (select count(*) from del where token_hash <> $2) + (select count(*) from upd) as n`,
      [playerId, keepHash],
    );
    return num(r[0]?.n ?? 0);
  }

  async replaceToken(playerId: string, oldHash: string, newHash: string): Promise<boolean> {
    const main = await this.db.query('update players set token_hash = $3 where id = $1 and token_hash = $2', [playerId, oldHash, newHash]);
    if (main.rowCount) return true;
    const dev = await this.db.query('update player_tokens set token_hash = $3 where player_id = $1 and token_hash = $2', [playerId, oldHash, newHash]);
    return (dev.rowCount ?? 0) > 0;
  }

  async addNonce(nonce: string, expiresAt: number): Promise<void> {
    await this.db.query('insert into auth_nonces (nonce, expires_at) values ($1, $2) on conflict do nothing', [nonce, expiresAt]);
  }

  async useNonce(nonce: string, now: number): Promise<boolean> {
    const r = await this.db.query('delete from auth_nonces where nonce = $1 returning expires_at', [nonce]);
    return Boolean(r.rows[0]) && num((r.rows[0] as Row).expires_at) > now;
  }

  async pruneTokens(unusedBefore: number): Promise<number> {
    const r = await this.db.query('delete from player_tokens where coalesce(last_used_at, created_at) < $1', [unusedBefore]);
    return r.rowCount ?? 0;
  }

  async setLinkToken(provider: string, subject: string, refreshToken: string | null, clientId: string | null): Promise<void> {
    await this.db.query('update identity_links set refresh_token = $3, client_id = $4 where provider = $1 and subject = $2', [provider, subject, refreshToken, clientId]);
  }

  async linkTokensOf(playerId: string): Promise<{ provider: string; subject: string; refreshToken: string; clientId: string | null }[]> {
    return (await this.rows('select provider, subject, refresh_token, client_id from identity_links where player_id = $1 and refresh_token is not null', [playerId])).map((r) => ({ provider: String(r.provider), subject: String(r.subject), refreshToken: String(r.refresh_token), clientId: strOrNull(r.client_id) }));
  }

  async setDeletionCode(playerId: string, codeHash: string, at: number, expiresAt: number): Promise<void> {
    await this.db.query('insert into deletion_codes (player_id, code_hash, created_at, expires_at) values ($1,$2,$3,$4) on conflict (player_id) do update set code_hash = excluded.code_hash, created_at = excluded.created_at, expires_at = excluded.expires_at', [playerId, codeHash, at, expiresAt]);
  }

  async deletionCodeOf(playerId: string): Promise<{ codeHash: string; expiresAt: number } | null> {
    const r = await this.rows('select code_hash, expires_at from deletion_codes where player_id = $1', [playerId]);
    return r[0] ? { codeHash: String(r[0].code_hash), expiresAt: num(r[0].expires_at) } : null;
  }

  async clearDeletionCode(playerId: string): Promise<void> {
    await this.db.query('delete from deletion_codes where player_id = $1', [playerId]);
  }

  async addNotice(n: PlayerNotice): Promise<void> {
    // A notice for a player deleted meanwhile is dropped (no orphan rows).
    await this.db.query('insert into player_notices (id, player_id, at, kind, text, read) select $1,$2,$3,$4,$5,$6 where exists (select 1 from players where id = $2)', [n.id, n.playerId, n.at, n.kind, n.text, n.read]);
  }

  async noticesOf(playerId: string, limit: number): Promise<PlayerNotice[]> {
    return (await this.rows('select * from player_notices where player_id = $1 order by at desc limit $2', [playerId, limit])).map((r) => ({ id: String(r.id), playerId: String(r.player_id), at: num(r.at), kind: r.kind as PlayerNotice['kind'], text: String(r.text), read: Boolean(r.read) }));
  }

  async markNoticesRead(playerId: string, ids: string[]): Promise<void> {
    if (ids.length) await this.db.query('update player_notices set read = true where player_id = $1 and id = any($2::text[])', [playerId, ids]);
  }

  async deletionRequests(status: 'open' | 'all', limit: number): Promise<DeletionRequest[]> {
    return (await this.rows(`select * from deletion_requests where ($1 = 'all' or status = 'open') order by at limit $2`, [status, limit])).map(toDeletion);
  }

  async getDeletionRequest(id: string): Promise<DeletionRequest | null> {
    const r = await this.rows('select * from deletion_requests where id = $1', [id]);
    return r[0] ? toDeletion(r[0]) : null;
  }

  async resolveDeletionRequest(id: string, status: 'done' | 'rejected', resolution: string, at: number): Promise<boolean> {
    const r = await this.db.query(`update deletion_requests set status = $2, resolution = $3, resolved_at = $4 where id = $1 and status = 'open'`, [id, status, resolution, at]);
    return (r.rowCount ?? 0) > 0;
  }

  // ------------------------------------------------------------ server-owned villages (Phase 2)

  async getVillage(playerId: string, opts: { forUpdate?: boolean } = {}): Promise<VillageRow | null> {
    // A row lock only means something inside a transaction.
    const r = await this.rows(`select * from villages where player_id = $1${opts.forUpdate && this.client ? ' for update' : ''}`, [playerId]);
    return r[0] ? toVillage(r[0]) : null;
  }

  async createVillage(v: VillageRow): Promise<boolean> {
    const r = await this.db.query(
      `insert into villages (player_id, file, revision, seq, at, state_hash, created_at, updated_at)
       select $1, $2, $3, $4, $5, $6, $7, $8 where exists (select 1 from players where id = $1)
       on conflict (player_id) do nothing`,
      [v.playerId, JSON.stringify(v.file), v.revision, v.seq, v.at, v.stateHash, v.createdAt, v.updatedAt],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async saveVillage(v: VillageRow, expectedRevision: number, ledger: LedgerEntry[], commands: CommandLogRow[]): Promise<boolean> {
    const stale = new Error('stale revision');
    try {
      return await this.transaction(async (tx) => {
        const db = (tx as PgRepo).db;
        const r = await db.query(
          `update villages set file = $2, revision = $3, seq = $4, at = $5, state_hash = $6, updated_at = $7, device_seqs = coalesce($9::jsonb, device_seqs) where player_id = $1 and revision = $8`,
          [v.playerId, JSON.stringify(v.file), v.revision, v.seq, v.at, v.stateHash, v.updatedAt, expectedRevision, v.deviceSeqs ? JSON.stringify(v.deviceSeqs) : null],
        );
        if ((r.rowCount ?? 0) === 0) throw stale;
        // Backend A17: one statement for all the ledger lines and one for all the log lines of a batch
        // (they were one round trip per line: up to MAX_BATCH × resources inserts per command batch).
        if (ledger.length) {
          await db.query(
            `insert into ledger (player_id, at, resource, delta, balance, reason, ref)
             select * from unnest($1::text[], $2::bigint[], $3::text[], $4::bigint[], $5::bigint[], $6::text[], $7::text[])`,
            [ledger.map((l) => l.playerId), ledger.map((l) => l.at), ledger.map((l) => l.resource), ledger.map((l) => l.delta), ledger.map((l) => l.balance), ledger.map((l) => l.reason), ledger.map((l) => l.ref)],
          );
        }
        if (commands.length) {
          await db.query(
            `insert into command_log (player_id, seq, at, client_at, type, command, ok, error)
             select p, s, a, ca, t, c::jsonb, o, e from unnest($1::text[], $2::bigint[], $3::bigint[], $4::bigint[], $5::text[], $6::text[], $7::boolean[], $8::text[]) as x(p, s, a, ca, t, c, o, e)
             on conflict (player_id, seq) do update set at = excluded.at, client_at = excluded.client_at, type = excluded.type, command = excluded.command, ok = excluded.ok, error = excluded.error`,
            [commands.map((c) => c.playerId), commands.map((c) => c.seq), commands.map((c) => c.at), commands.map((c) => c.clientAt), commands.map((c) => c.type), commands.map((c) => JSON.stringify(c.command)), commands.map((c) => c.ok), commands.map((c) => c.error)],
          );
        }
        return true;
      });
    } catch (e) {
      if (e === stale) return false;
      throw e;
    }
  }

  async recordVillageCommands(v: Pick<VillageRow, 'playerId' | 'revision' | 'seq' | 'updatedAt' | 'deviceSeqs'>, expectedRevision: number, commands: CommandLogRow[]): Promise<boolean> {
    const stale = new Error('stale revision');
    try {
      return await this.transaction(async (tx) => {
        const db = (tx as PgRepo).db;
        const r = await db.query(`update villages set revision = $3, seq = $4, updated_at = $5, device_seqs = coalesce($6::jsonb, device_seqs) where player_id = $1 and revision = $2`, [
          v.playerId,
          expectedRevision,
          v.revision,
          v.seq,
          v.updatedAt,
          v.deviceSeqs ? JSON.stringify(v.deviceSeqs) : null,
        ]);
        if ((r.rowCount ?? 0) === 0) throw stale;
        if (commands.length) {
          // One statement for the whole batch (up to MAX_BATCH short lines).
          await db.query(
            `insert into command_log (player_id, seq, at, client_at, type, command, ok, error)
             select $1, s, a, ca, t, c::jsonb, o, e from unnest($2::bigint[], $3::bigint[], $4::bigint[], $5::text[], $6::text[], $7::boolean[], $8::text[]) as x(s, a, ca, t, c, o, e)
             on conflict (player_id, seq) do update set at = excluded.at, client_at = excluded.client_at, type = excluded.type, command = excluded.command, ok = excluded.ok, error = excluded.error`,
            [
              v.playerId,
              commands.map((c) => c.seq),
              commands.map((c) => c.at),
              commands.map((c) => c.clientAt),
              commands.map((c) => c.type),
              commands.map((c) => JSON.stringify(c.command)),
              commands.map((c) => c.ok),
              commands.map((c) => c.error),
            ],
          );
        }
        return true;
      });
    } catch (e) {
      if (e === stale) return false;
      throw e;
    }
  }

  async ledgerOf(playerId: string, limit: number): Promise<LedgerEntry[]> {
    return (await this.rows('select * from ledger where player_id = $1 order by id desc limit $2', [playerId, limit])).map(toLedger);
  }

  async commandsOf(playerId: string, sinceSeq: number, limit: number): Promise<CommandLogRow[]> {
    return (await this.rows('select * from command_log where player_id = $1 and seq > $2 order by seq limit $3', [playerId, sinceSeq, limit])).map(toCommand);
  }

  // ------------------------------------------------------------ groves

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

  // ------------------------------------------------------------ chat

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

  // ------------------------------------------------------------ reports and blocks

  async addReport(r: Report): Promise<boolean> {
    // The partial unique index (reporter, target, message) where open makes a repeat a no-op.
    const res = await this.db.query(
      `insert into reports (id, at, reporter_id, kind, target_id, target_name, message_id, grove_id, text, reason, note, status, resolved_at, resolution)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict do nothing`,
      [r.id, r.at, r.reporterId, r.kind, r.targetId, r.targetName, r.messageId, r.groveId, r.text, r.reason, r.note, r.status, r.resolvedAt, r.resolution],
    );
    return (res.rowCount ?? 0) > 0;
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

  // ------------------------------------------------------------ troop requests and donations

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

  // ------------------------------------------------------------ grove raids

  async getPairing(week: number, groveId: string): Promise<RaidPairing | null> {
    const r = await this.rows('select * from raid_pairings where week = $1 and grove_id = $2', [week, groveId]);
    return r[0] ? toPairing(r[0]) : null;
  }

  async createPairings(pairs: RaidPairing[]): Promise<boolean> {
    const taken = new Error('pairing taken');
    try {
      return await this.transaction(async (tx) => {
        for (const p of pairs) {
          const r = await (tx as PgRepo).db.query(
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
  }
}

function toPurchase(r: Record<string, unknown>): PurchaseRow {
  return {
    store: String(r.store) as PurchaseRow['store'],
    transactionId: String(r.transaction_id),
    playerId: String(r.player_id),
    productId: String(r.product_id),
    cents: num(r.cents),
    at: num(r.at),
    environment: String(r.environment),
    status: String(r.status) as PurchaseRow['status'],
    refundedAt: r.refunded_at == null ? null : num(r.refunded_at),
    ref: String(r.ref),
    heldOnServer: Boolean(r.held_on_server),
    storefront: strOrNull(r.storefront),
    currency: strOrNull(r.currency),
    priceMicros: r.price_micros == null ? null : num(r.price_micros),
    device: strOrNull(r.device),
  };
}

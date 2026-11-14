/** Row mappers and shared statements of the Postgres adapter (tables in server/migrations/). Bases and battle records are JSONB. */

import type { Player, Ticket, AttackRecord, Grove, GroveSummaryRow, GroveMember, ChatRow, Report, Block, TroopRequest, Donation, RaidPairing, RaidAttack, RaidClaim, VillageRow, LedgerEntry, CommandLogRow, PurchaseRow, DeletionRequest } from '../types';

export type Row = Record<string, unknown>;
export const num = (v: unknown) => Number(v ?? 0);
export const strOrNull = (v: unknown) => (v === null || v === undefined ? null : String(v));

export const toPlayer = (r: Row): Player => ({
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
export const isUniqueClash = (e: unknown) => (e as { code?: string })?.code === '23505' && /name_key|friend_code/.test(String((e as { constraint?: string }).constraint ?? (e as Error).message));

export const toTicket = (r: Row): Ticket => {
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
export const toAttack = (r: Row): AttackRecord => {
  const rec = r.record as AttackRecord;
  return { ...rec, base: (r.stored_base as AttackRecord['base'] | null) ?? rec.base, id: String(r.id) };
};

/**
 * A statement prefix that stores a base version once ($1 = hash, $2 = base,
 * $3 = time): new content is inserted, known content only has its last use
 * refreshed (so retention never removes a base that was just used again).
 */
export const PUT_BASE = `with put_base as (
  insert into base_versions (hash, base, created_at, last_used_at) values ($1, $2, $3, $3)
  on conflict (hash) do update set last_used_at = greatest(base_versions.last_used_at, excluded.last_used_at)
)`;
export const toGrove = (r: Row): Grove => ({ id: String(r.id), name: String(r.name), color: String(r.color), createdAt: num(r.created_at) });
export const toSummary = (r: Row): GroveSummaryRow => ({ ...toGrove(r), members: num(r.members), averageTrophies: Math.round(num(r.average_trophies)), lastActiveAt: num(r.last_active_at) });
export const toMember = (r: Row): GroveMember => ({ groveId: String(r.grove_id), playerId: String(r.player_id), role: r.role as GroveMember['role'], joinedAt: num(r.joined_at), xp: num(r.xp) });
export const toChat = (r: Row): ChatRow => ({
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
export const toReport = (r: Row): Report => ({
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
export const toVillage = (r: Row): VillageRow => ({
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
export const toLedger = (r: Row): LedgerEntry => ({ playerId: String(r.player_id), at: num(r.at), resource: String(r.resource), delta: num(r.delta), balance: num(r.balance), reason: String(r.reason), ref: strOrNull(r.ref) });
export const toCommand = (r: Row): CommandLogRow => ({ playerId: String(r.player_id), seq: num(r.seq), at: num(r.at), clientAt: num(r.client_at), type: String(r.type), command: r.command, ok: Boolean(r.ok), error: strOrNull(r.error) });
export const toBlock = (r: Row): Block => ({ playerId: String(r.player_id), blockedId: String(r.blocked_id), blockedName: String(r.blocked_name), at: num(r.at) });
export const toRequest = (r: Row): TroopRequest => ({
  id: String(r.id),
  groveId: String(r.grove_id),
  playerId: String(r.player_id),
  name: String(r.name),
  at: num(r.at),
  size: num(r.size),
  filled: num(r.filled),
  open: Boolean(r.open),
});
export const toDonation = (r: Row): Donation => ({
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
export const toPairing = (r: Row): RaidPairing => ({
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
export const toRaidAttack = (r: Row): RaidAttack => ({
  id: String(r.id),
  week: num(r.week),
  groveId: String(r.grove_id),
  attackerId: String(r.attacker_id),
  target: num(r.target),
  stars: num(r.stars),
  destruction: num(r.destruction),
  at: num(r.at),
});
export const toDeletion = (r: Row): DeletionRequest => ({
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
export const toClaim = (r: Row): RaidClaim => ({ week: num(r.week), playerId: String(r.player_id), groveId: String(r.grove_id), outcome: r.outcome as RaidClaim['outcome'], at: num(r.at) });

/** Groves with their member count, average trophies and last activity. */
export const GROVE_SUMMARY = `
  select g.*, count(p.id) as members, coalesce(avg(p.trophies), 0) as average_trophies, coalesce(max(p.last_seen_at), 0) as last_active_at
  from groves g join grove_members m on m.grove_id = g.id join players p on p.id = m.player_id`;

export function toPurchase(r: Record<string, unknown>): PurchaseRow {
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

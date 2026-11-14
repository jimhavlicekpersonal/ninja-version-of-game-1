/** Postgres players, sessions, staff tools, account protections and deletion (`PlayerStore`). */
import { isAgeBand, type AgeBand } from '../../../src/gameplay/sim/age';
import { nameNoticePatterns } from '../notices';
import { NameTakenError, REVOKED_TOKEN_PREFIX, DELETED_PLAYER } from '../types';
import type { Player, PlayerPatch, StaffAction, IdentityLink, PlayerNotice, TokenRotation, DeletionRequest, OpponentQuery } from '../types';
import type { PlayerStore } from '../ports';
import { type Row, num, strOrNull, toPlayer, isUniqueClash, toDeletion } from './rows';
import { PgBase, dbOf } from './base';

export class PgPlayers extends PgBase implements PlayerStore {
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

  async deletePlayer(id: string, name: string, at: number): Promise<void> {
    const D = DELETED_PLAYER;
    await this.repo.transaction(async (tx) => {
      const q = (sql: string, vals: unknown[]) => dbOf(tx).query(sql, vals);
      await q('delete from tickets where attacker_id = $1', [id]);
      // Growth batch 2026-11-14: referrals either way and the player's shared replays.
      await q('delete from referrals where recruit_id = $1 or inviter_id = $1', [id]);
      await q('delete from shared_replays where owner_id = $1', [id]);
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
      // A complaint the player sent stays (others may be named in it), without their id.
      await q('update complaints set player_id = null where player_id = $1', [id]);
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
      await q('delete from token_rotations where player_id = $1', [id]);
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
    // Backend A16: the newest device token of an account with no other way in (first token signed out, no link) stays.
    const r = await this.db.query(
      `delete from player_tokens t where coalesce(t.last_used_at, t.created_at) < $1
         and (exists (select 1 from players p where p.id = t.player_id and left(p.token_hash, length($2)) <> $2)
           or exists (select 1 from identity_links l where l.player_id = t.player_id)
           or t.token_hash <> (select o.token_hash from player_tokens o where o.player_id = t.player_id
                                order by coalesce(o.last_used_at, o.created_at) desc, o.token_hash limit 1))`,
      [unusedBefore, REVOKED_TOKEN_PREFIX],
    );
    return r.rowCount ?? 0;
  }

  async keysOf(playerId: string): Promise<{ main: string | null; devices: { hash: string; provider: string | null }[] }> {
    const p = await this.rows('select token_hash from players where id = $1', [playerId]);
    const main = p[0] ? String(p[0].token_hash) : null;
    const devices = (await this.rows('select token_hash, provider from player_tokens where player_id = $1', [playerId])).map((r) => ({ hash: String(r.token_hash), provider: strOrNull(r.provider) }));
    return { main: main && !main.startsWith(REVOKED_TOKEN_PREFIX) ? main : null, devices };
  }

  async addRotation(r: TokenRotation): Promise<void> {
    await this.db.query('insert into token_rotations (new_hash, old_hash, player_id, created_at) values ($1,$2,$3,$4) on conflict do nothing', [r.newHash, r.oldHash, r.playerId, r.at]);
  }

  async rotationOf(newHash: string): Promise<TokenRotation | null> {
    const r = (await this.rows('select * from token_rotations where new_hash = $1', [newHash]))[0];
    return r ? { newHash: String(r.new_hash), oldHash: String(r.old_hash), playerId: String(r.player_id), at: num(r.created_at) } : null;
  }

  async dropRotations(oldHash: string): Promise<number> {
    return (await this.db.query('delete from token_rotations where old_hash = $1', [oldHash])).rowCount ?? 0;
  }

  async pruneRotations(before: number): Promise<number> {
    return (await this.db.query('delete from token_rotations where created_at < $1', [before])).rowCount ?? 0;
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
    await this.db.query('insert into player_notices (id, player_id, at, kind, text, read, parts) select $1,$2,$3,$4,$5,$6,$7::jsonb where exists (select 1 from players where id = $2)', [n.id, n.playerId, n.at, n.kind, n.text, n.read, n.parts?.length ? JSON.stringify(n.parts) : null]);
  }

  async noticesOf(playerId: string, limit: number): Promise<PlayerNotice[]> {
    return (await this.rows('select * from player_notices where player_id = $1 order by at desc limit $2', [playerId, limit])).map((r) => ({ id: String(r.id), playerId: String(r.player_id), at: num(r.at), kind: r.kind as PlayerNotice['kind'], text: String(r.text), read: Boolean(r.read), parts: Array.isArray(r.parts) ? (r.parts as PlayerNotice['parts']) : null }));
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
}

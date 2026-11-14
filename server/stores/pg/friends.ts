/** Postgres names, friends and friendly duels (part of `SocialStore`). */
import type { Player, DuelRecord, DuelTally, DuelChallenge, Squad, FriendRequest } from '../types';
import { type Row, num, toPlayer } from './rows';
import { PgBase } from './base';

const toChallenge = (x: Row): DuelChallenge => ({ id: String(x.id), fromId: String(x.from_id), toId: String(x.to_id), createdAt: num(x.created_at), expiresAt: num(x.expires_at), fromResult: (x.from_result as DuelChallenge['fromResult']) ?? null, toResult: (x.to_result as DuelChallenge['toResult']) ?? null });

export class PgFriends extends PgBase {
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
  async getChallenge(id: string): Promise<DuelChallenge | null> {
    const r = await this.rows('select * from duel_challenges where id = $1', [id]);
    return r[0] ? toChallenge(r[0]) : null;
  }
  async challengesOf(playerId: string, since: number): Promise<DuelChallenge[]> {
    return (await this.rows('select * from duel_challenges where (from_id = $1 or to_id = $1) and created_at > $2 order by created_at desc', [playerId, since])).map(toChallenge);
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
  }}

/** Postgres storage (see schema.sql). Uses JSONB for bases and battle records. */
import pg from 'pg';
import type { AttackRecord, Player, Repo, Ticket } from './repo';

type Row = Record<string, unknown>;

const toPlayer = (r: Row): Player => ({
  id: String(r.id),
  name: String(r.name),
  tokenHash: String(r.token_hash),
  trophies: Number(r.trophies),
  hallLevel: Number(r.hall_level),
  shieldUntil: Number(r.shield_until),
  base: (r.base as Player['base']) ?? null,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});

const toAttack = (r: Row): AttackRecord => ({ ...(r.record as AttackRecord), id: String(r.id) });

export class PgRepo implements Repo {
  constructor(private readonly pool: pg.Pool) {}

  async migrate(schemaSql: string): Promise<void> {
    await this.pool.query(schemaSql);
  }

  static fromUrl(url: string): PgRepo {
    return new PgRepo(new pg.Pool({ connectionString: url, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined }));
  }

  async createPlayer(p: Player): Promise<void> {
    await this.pool.query(
      'insert into players (id, name, token_hash, trophies, hall_level, shield_until, base, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [p.id, p.name, p.tokenHash, p.trophies, p.hallLevel, p.shieldUntil, p.base ? JSON.stringify(p.base) : null, p.createdAt, p.updatedAt],
    );
  }

  async playerByTokenHash(hash: string): Promise<Player | null> {
    const r = await this.pool.query('select * from players where token_hash = $1', [hash]);
    return r.rows[0] ? toPlayer(r.rows[0]) : null;
  }

  async getPlayer(id: string): Promise<Player | null> {
    const r = await this.pool.query('select * from players where id = $1', [id]);
    return r.rows[0] ? toPlayer(r.rows[0]) : null;
  }

  async updatePlayer(id: string, patch: Partial<Player>): Promise<void> {
    const cols: Record<string, string> = { name: 'name', trophies: 'trophies', hallLevel: 'hall_level', shieldUntil: 'shield_until', base: 'base', updatedAt: 'updated_at' };
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, col] of Object.entries(cols)) {
      if (!(k in patch)) continue;
      const v = (patch as Record<string, unknown>)[k];
      vals.push(k === 'base' ? JSON.stringify(v) : v);
      sets.push(`${col} = $${vals.length}`);
    }
    if (!sets.length) return;
    vals.push(id);
    await this.pool.query(`update players set ${sets.join(', ')} where id = $${vals.length}`, vals);
  }

  async findOpponents(o: { excludeIds: string[]; minTrophies: number; maxTrophies: number; now: number; limit: number }): Promise<Player[]> {
    const r = await this.pool.query(
      `select * from players where base is not null and shield_until <= $1 and trophies between $2 and $3 and not (id = any($4::text[]))
       order by random() limit $5`,
      [o.now, o.minTrophies, o.maxTrophies, o.excludeIds, o.limit],
    );
    return r.rows.map(toPlayer);
  }

  async createTicket(t: Ticket): Promise<void> {
    await this.pool.query('insert into tickets (id, attacker_id, defender_id, base, defender_trophies, created_at, used) values ($1,$2,$3,$4,$5,$6,false)', [
      t.id, t.attackerId, t.defenderId, JSON.stringify(t.base), t.defenderTrophies, t.createdAt,
    ]);
  }

  async getTicket(id: string): Promise<Ticket | null> {
    const r = await this.pool.query('select * from tickets where id = $1', [id]);
    const row = r.rows[0];
    if (!row) return null;
    return { id: row.id, attackerId: row.attacker_id, defenderId: row.defender_id, base: row.base, defenderTrophies: Number(row.defender_trophies), createdAt: Number(row.created_at), used: row.used };
  }

  async useTicket(id: string): Promise<boolean> {
    const r = await this.pool.query('update tickets set used = true where id = $1 and used = false', [id]);
    return (r.rowCount ?? 0) > 0;
  }

  async addAttack(a: AttackRecord): Promise<void> {
    await this.pool.query('insert into attacks (id, at, attacker_id, defender_id, record) values ($1,$2,$3,$4,$5)', [a.id, a.at, a.attackerId, a.defenderId, JSON.stringify(a)]);
  }

  async defensesFor(defenderId: string, since: number, limit: number): Promise<AttackRecord[]> {
    const r = await this.pool.query('select id, record from attacks where defender_id = $1 and at > $2 order by at desc limit $3', [defenderId, since, limit]);
    return r.rows.map(toAttack).reverse();
  }

  async recentTargets(attackerId: string, since: number): Promise<string[]> {
    const r = await this.pool.query('select defender_id from attacks where attacker_id = $1 and at > $2', [attackerId, since]);
    return r.rows.map((x) => String(x.defender_id));
  }
}

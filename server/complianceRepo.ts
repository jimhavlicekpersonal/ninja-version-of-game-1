/**
 * Storage for the compliance switches (2026-11-14; net/compliance.ts), kept beside the main `Repo` port like
 * growthRepo.ts so repo.ts / pgRepo.ts stay untouched: the terms of service version a player accepted and
 * their Apple consumption consent (migration 0039 `player_compliance`).
 *
 * `complianceOf(repo)`: on Postgres the PgRepo's own connection (so it joins `Repo.transaction`); in memory a
 * `complianceState` field of the MemoryRepo (restored by its rollback). Account deletion calls `deletePlayer`.
 */
import type { Repo } from './repo';

export interface ComplianceRow {
  playerId: string;
  termsVersion: string | null;
  termsAcceptedAt: number | null;
  consumptionConsent: boolean;
  consumptionConsentAt: number | null;
}

export interface ComplianceRepo {
  get(playerId: string): Promise<ComplianceRow | null>;
  setTerms(playerId: string, version: string, at: number): Promise<void>;
  setConsumptionConsent(playerId: string, consent: boolean, at: number): Promise<void>;
  deletePlayer(playerId: string): Promise<void>;
}

const empty = (playerId: string): ComplianceRow => ({ playerId, termsVersion: null, termsAcceptedAt: null, consumptionConsent: false, consumptionConsentAt: null });

type MemoryHost = { complianceState?: Record<string, ComplianceRow> };

class MemoryComplianceRepo implements ComplianceRepo {
  constructor(private readonly host: MemoryHost) {
    host.complianceState ??= {};
  }
  private get s(): Record<string, ComplianceRow> {
    return this.host.complianceState!;
  }
  async get(playerId: string) {
    const r = this.s[playerId];
    return r ? { ...r } : null;
  }
  async setTerms(playerId: string, version: string, at: number) {
    this.s[playerId] = { ...(this.s[playerId] ?? empty(playerId)), termsVersion: version, termsAcceptedAt: at };
  }
  async setConsumptionConsent(playerId: string, consent: boolean, at: number) {
    this.s[playerId] = { ...(this.s[playerId] ?? empty(playerId)), consumptionConsent: consent, consumptionConsentAt: at };
  }
  async deletePlayer(playerId: string) {
    delete this.s[playerId];
  }
}

interface Queryable {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

class PgComplianceRepo implements ComplianceRepo {
  constructor(private readonly db: Queryable) {}
  async get(playerId: string) {
    const q = await this.db.query('select * from player_compliance where player_id = $1', [playerId]);
    const r = q.rows[0];
    if (!r) return null;
    return { playerId, termsVersion: r.terms_version === null ? null : String(r.terms_version), termsAcceptedAt: numOrNull(r.terms_accepted_at), consumptionConsent: r.consumption_consent === true, consumptionConsentAt: numOrNull(r.consumption_consent_at) };
  }
  async setTerms(playerId: string, version: string, at: number) {
    await this.db.query('insert into player_compliance (player_id, terms_version, terms_accepted_at) values ($1,$2,$3) on conflict (player_id) do update set terms_version = excluded.terms_version, terms_accepted_at = excluded.terms_accepted_at', [playerId, version, at]);
  }
  async setConsumptionConsent(playerId: string, consent: boolean, at: number) {
    await this.db.query('insert into player_compliance (player_id, consumption_consent, consumption_consent_at) values ($1,$2,$3) on conflict (player_id) do update set consumption_consent = excluded.consumption_consent, consumption_consent_at = excluded.consumption_consent_at', [playerId, consent, at]);
  }
  async deletePlayer(playerId: string) {
    await this.db.query('delete from player_compliance where player_id = $1', [playerId]);
  }
}

export function complianceOf(repo: Repo): ComplianceRepo {
  const db = (repo as unknown as { db?: Queryable }).db;
  if (db && typeof db.query === 'function') return new PgComplianceRepo(db);
  return new MemoryComplianceRepo(repo as unknown as MemoryHost);
}

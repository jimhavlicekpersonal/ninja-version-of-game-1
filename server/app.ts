/**
 * Toadstool Kingdoms asynchronous PvP API.
 * Every attack is re-simulated here with the same deterministic battle code
 * the game uses, so a modified client cannot invent a result.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { runBattle } from '../src/sim/battle/battle';
import type { BaseLayout, Deployment } from '../src/sim/battle/types';
import { maxHousingAtHall } from '../src/sim/army';
import { shieldHoursFor } from '../src/sim/defense';
import { applyLootPenalty } from '../src/sim/matchmaking';
import { troopLevelCapAt } from '../src/sim/research';
import { lossTrophies, winTrophies } from '../src/sim/ranks';
import type { GameData } from '../src/sim/types';
import type { Player, Repo } from './repo';

export interface ServerOptions {
  repo: Repo;
  data: GameData;
  now?: () => number;
  corsOrigin?: string;
  logger?: boolean;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const HOUR = 3_600_000;

/** Reject bases that could not exist in the game. */
export function validateBase(base: BaseLayout, data: GameData): string | null {
  if (!base || !Array.isArray(base.buildings) || base.buildings.length === 0 || base.buildings.length > 400) return 'bad base';
  const map = data.economy.mapSize;
  const occ = new Uint8Array(map * map);
  let halls = 0;
  const maxLoot = (data.battle.generatedLootByHall[data.battle.generatedLootByHall.length - 1]?.max ?? 0) * 4;
  const totals: Record<string, number> = {};
  for (const b of base.buildings) {
    const def = data.buildings[b.type];
    if (!def || def.category === 'obstacle' || def.category === 'decor') return `unknown building ${b.type}`;
    if (!Number.isInteger(b.level) || b.level < 1 || b.level > def.levels.length) return `bad level on ${b.type}`;
    if (def.category === 'hall') halls++;
    for (let y = b.y; y < b.y + def.size; y++) {
      for (let x = b.x; x < b.x + def.size; x++) {
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map || y >= map) return 'building off the map';
        if (occ[y * map + x]) return 'overlapping buildings';
        occ[y * map + x] = 1;
      }
    }
    for (const [k, v] of Object.entries(b.loot ?? {})) {
      if (typeof v !== 'number' || v < 0 || !Number.isFinite(v)) return 'bad loot';
      totals[k] = (totals[k] ?? 0) + v;
    }
  }
  if (halls !== 1) return 'base needs exactly one Elder Toadstool';
  if (Object.values(totals).some((v) => v > maxLoot)) return 'too much loot';
  return null;
}

/** Largest army housing possible at a hall level (camps x their max level). */
export function maxHousing(hallLevel: number, data: GameData): number {
  return maxHousingAtHall(hallLevel, data) + 60; // + Grove Lodge troops
}

/** Troop levels must be ones the attacker's hall level allows. */
export function validLevels(levels: unknown, hallLevel: number, data: GameData): Record<string, number> | null {
  if (levels === undefined || levels === null) return {};
  if (typeof levels !== 'object') return null;
  const cap = troopLevelCapAt(hallLevel, data);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(levels as Record<string, unknown>)) {
    const def = data.troops[k];
    if (!def || typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > Math.min(cap, def.levels.length)) return null;
    out[k] = v;
  }
  return out;
}

export function buildServer(opts: ServerOptions): FastifyInstance {
  const { repo, data } = opts;
  const now = opts.now ?? (() => Date.now());
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1_000_000 });

  // CORS without an extra dependency.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', opts.corsOrigin ?? '*');
    reply.header('Access-Control-Allow-Headers', 'authorization, content-type');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  const auth = async (req: FastifyRequest, reply: FastifyReply): Promise<Player | null> => {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const p = token ? await repo.playerByTokenHash(sha(token)) : null;
    if (!p) {
      void reply.code(401).send({ error: 'unauthorized' });
      return null;
    }
    return p;
  };

  app.get('/healthz', async () => ({ ok: true }));

  app.post('/v1/players', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string };
    const token = randomBytes(24).toString('base64url');
    const t = now();
    const player: Player = {
      id: randomUUID(),
      name: String(body.name ?? 'Ruler').slice(0, 32) || 'Ruler',
      tokenHash: sha(token),
      trophies: 0,
      hallLevel: 1,
      shieldUntil: t + data.raids.newPlayerShieldHours * HOUR,
      base: null,
      createdAt: t,
      updatedAt: t,
    };
    await repo.createPlayer(player);
    return reply.code(201).send({ playerId: player.id, token });
  });

  app.get('/v1/me', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    return { id: me.id, name: me.name, trophies: me.trophies, hallLevel: me.hallLevel, shieldUntil: me.shieldUntil };
  });

  app.put('/v1/base', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const body = (req.body ?? {}) as { name?: string; base?: BaseLayout };
    const base = body.base as BaseLayout;
    const err = validateBase(base, data);
    if (err) return reply.code(400).send({ error: err });
    await repo.updatePlayer(me.id, { base: { ...base, name: me.name }, hallLevel: base.hallLevel, name: body.name ? String(body.name).slice(0, 32) : me.name, updatedAt: now() });
    return reply.code(204).send();
  });

  app.get('/v1/match', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const t = now();
    const recent = await repo.recentTargets(me.id, t - HOUR);
    let found: Player | null = null;
    for (const range of [data.ranks.matchTrophyRange, 300, 1000, 100000]) {
      const list = await repo.findOpponents({ excludeIds: [me.id, ...recent], minTrophies: me.trophies - range, maxTrophies: me.trophies + range, now: t, limit: 20 });
      if (list.length) {
        found = list[Math.floor(Math.random() * list.length)];
        break;
      }
    }
    if (!found || !found.base) return reply.code(404).send({ error: 'no opponents right now' });
    const ticket = { id: randomUUID(), attackerId: me.id, defenderId: found.id, base: { ...found.base, name: found.name, trophies: found.trophies }, defenderTrophies: found.trophies, createdAt: t, used: false };
    await repo.createTicket(ticket);
    return { ticket: ticket.id, base: ticket.base };
  });

  app.post('/v1/attacks', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const body = (req.body ?? {}) as { ticket?: string; seed?: number; army?: Record<string, number>; levels?: Record<string, number>; deployments?: Deployment[]; endTick?: number };
    const ticket = body.ticket ? await repo.getTicket(body.ticket) : null;
    const t = now();
    if (!ticket || ticket.attackerId !== me.id) return reply.code(404).send({ error: 'unknown ticket' });
    if (t - ticket.createdAt > 10 * 60_000) return reply.code(410).send({ error: 'ticket expired' });
    const army = body.army ?? {};
    let housing = 0;
    for (const [k, n] of Object.entries(army)) {
      const def = data.troops[k];
      if (!def || !Number.isInteger(n) || n < 0) return reply.code(400).send({ error: 'bad army' });
      housing += def.housing * n;
    }
    if (housing > maxHousing(me.hallLevel, data)) return reply.code(400).send({ error: 'army too big' });
    const levels = validLevels(body.levels, me.hallLevel, data);
    if (!levels) return reply.code(400).send({ error: 'bad troop levels' });
    const deployments = Array.isArray(body.deployments) ? body.deployments.slice(0, 2000) : [];
    if (!(await repo.useTicket(ticket.id))) return reply.code(409).send({ error: 'ticket already used' });
    const seed = Number(body.seed) >>> 0;
    // Same loot penalty the client applied when it showed the base.
    const base = applyLootPenalty(structuredClone(ticket.base), me.hallLevel, data);
    const { result } = runBattle({ seed, base, army, levels }, deployments, data, body.endTick);
    const defender = await repo.getPlayer(ticket.defenderId);
    const defTrophies = defender?.trophies ?? ticket.defenderTrophies;
    const attackerDelta = result.stars >= 1 ? winTrophies(me.trophies, defTrophies, data) : -lossTrophies(me.trophies, defTrophies, data);
    const defenderDelta = -attackerDelta;
    await repo.updatePlayer(me.id, { trophies: Math.max(0, me.trophies + attackerDelta), shieldUntil: Math.min(me.shieldUntil, t) });
    if (defender) {
      const patch: Partial<Player> = { trophies: Math.max(0, defender.trophies + defenderDelta) };
      const shield = shieldHoursFor(result.destruction, data);
      if (shield > 0) patch.shieldUntil = Math.max(defender.shieldUntil, t + shield * HOUR);
      await repo.updatePlayer(defender.id, patch);
    }
    const record = { id: randomUUID(), at: t, attackerId: me.id, attackerName: me.name, defenderId: ticket.defenderId, seed, army, levels, base, deployments, endTick: body.endTick, result, attackerTrophies: attackerDelta, defenderTrophies: defenderDelta };
    await repo.addAttack(record);
    return { result, trophies: attackerDelta, attackId: record.id };
  });

  app.get('/v1/defenses', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const since = Number((req.query as { since?: string }).since ?? 0) || 0;
    const list = await repo.defensesFor(me.id, since, 20);
    return { defenses: list.map((a) => ({ id: a.id, at: a.at, attackerName: a.attackerName, seed: a.seed, army: a.army, levels: a.levels ?? {}, base: a.base, deployments: a.deployments, endTick: a.endTick, result: a.result, trophies: a.defenderTrophies })) };
  });

  return app;
}

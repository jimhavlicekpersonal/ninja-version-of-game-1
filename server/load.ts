/**
 * Load test (roadmap step 46): many players matching and reporting battles
 * against a running server, through the game's own HTTP adapter, at a set
 * rate of battles per second. Each battle is a full army for the player's
 * Keep (the bench's armies, `botArmy` at the research cap) deployed through
 * the Infiltration Points of the base the server sent, so the server
 * re-simulates real, CPU-heavy battles. Reports latency per call and errors.
 *
 * Before launch there is no live traffic to record, so the traffic is
 * generated with the game's own rules; once there is, `tk_resim_ms` and the
 * request metrics give the real mix to compare with.
 *
 *   npm run server:build && npm run server:load -- --url https://staging… --bps 14 --seconds 120
 *
 * 5x the expected peak (roadmap section 2: 10k daily players, 8 attacks each,
 * about 3x the average at peak) is ~14 battles a second. Point it at staging
 * with relaxed registration limits (RATE_LIMITS), never at production.
 *
 * Beast Mode SEC-08: `--mix` adds the traffic of server-held villages, which dominates once every village is held:
 * players who keep a village on the server run sessions of hello → village commands (a collector placed, then
 * collected, applied with the game's own rules so the economy hash matches) → notices, at `commandsPerSecond`.
 * The 10x targets and pass criteria are in docs/SHIPPING.md 3h.
 */
import { HttpServerAdapter, memoryTokenStore } from '../src/backend/net/httpAdapter';
import { ServerError } from '../src/backend/net/ports';
import { createBattle } from '../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../src/gameplay/sim/battle/basegen';
import { botDeployments } from '../src/gameplay/sim/defense';
import { canPlace } from '../src/gameplay/sim/grid';
import { botArmy } from '../src/gameplay/sim/matchmaking';
import { deserialize } from '../src/gameplay/sim/save';
import { economyHash } from '../src/gameplay/sim/serverEconomy';
import { applyCommand, type Command } from '../src/gameplay/sim/village';
import type { VillageCommand } from '../src/backend/net/protocol';
import { troopLevelCapAt } from '../src/gameplay/sim/research';
import { createRng } from '../src/gameplay/sim/rng';
import type { GameData, VillageState } from '../src/gameplay/sim/types';

export interface LoadOptions {
  url: string;
  data: GameData;
  /** Virtual players (each plays one battle at a time). */
  players: number;
  /** Target battles per second across all players. */
  battlesPerSecond: number;
  seconds: number;
  /** Keeps the players are spread over. */
  keeps?: number[];
  /** Beast Mode SEC-08: village-command sessions per second (hello → commands → notices) from held villages. */
  commandsPerSecond?: number;
  /** Players who keep a village on the server (default a third of `players`, at least 1, when commands run). */
  holders?: number;
  log?: (line: string) => void;
}

export interface CallStats {
  count: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface LoadReport {
  battles: number;
  /** Battles reported per second, measured. */
  achievedBps: number;
  targetBps: number;
  calls: Record<string, CallStats>;
  /** Refusals and failures by protocol error code. */
  errors: Record<string, number>;
  /** Beast Mode SEC-08: command sessions completed, and commands the server refused (game rules, not failures). */
  sessions?: number;
  refusedCommands?: number;
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);

export async function runLoad(o: LoadOptions): Promise<LoadReport> {
  const keeps = o.keeps ?? [3, 6, 9, 12, 15];
  const times = new Map<string, number[]>();
  const failures = new Map<string, number>();
  const errors: Record<string, number> = {};
  const timed = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    const t0 = performance.now();
    try {
      return await fn();
    } catch (e) {
      failures.set(name, (failures.get(name) ?? 0) + 1);
      const code = e instanceof ServerError ? e.code : 'exception';
      errors[code] = (errors[code] ?? 0) + 1;
      return null;
    } finally {
      const list = times.get(name) ?? [];
      list.push(performance.now() - t0);
      times.set(name, list);
    }
  };

  // Players, each with a base of its Keep (so its army is legal there).
  const players: { port: HttpServerAdapter; keep: number; busy: boolean }[] = [];
  for (let i = 0; i < o.players; i++) {
    const keep = keeps[i % keeps.length];
    const port = new HttpServerAdapter(o.url, { tokens: memoryTokenStore(), retryDelayMs: 200, build: 'loadtest' });
    const ok = await timed('register', async () => {
      await port.register(`Load ${keep}-${i}`);
      await port.uploadBase({ base: generateOpponent(9000 + i, keep, o.data) });
    });
    if (ok !== null) players.push({ port, keep, busy: false });
  }
  // Beast Mode SEC-08: holders keep their village on the server and send the game's own commands.
  const cps = o.commandsPerSecond ?? 0;
  type Holder = { port: HttpServerAdapter; state: VillageState; seq: number; collector: string | null; busy: boolean };
  const holders: Holder[] = [];
  const holderCount = cps > 0 ? (o.holders ?? Math.max(1, Math.ceil(o.players / 3))) : 0;
  for (let i = 0; i < holderCount; i++) {
    const port = new HttpServerAdapter(o.url, { tokens: memoryTokenStore(), retryDelayMs: 200, build: 'loadtest' });
    const v = await timed('register', async () => {
      await port.register(`Keeper ${i}`);
      return port.startVillage();
    });
    if (v) holders.push({ port, state: deserialize(v.file, o.data), seq: v.seq, collector: null, busy: false });
  }
  let sessions = 0;
  let refusedCommands = 0;
  /** The next command a holder's game would send: place a collector once, then collect it. */
  const nextCommand = (h: Holder): Command | null => {
    if (h.collector) return { type: 'collect', id: h.collector };
    const limits = o.data.hall.levels[0].limits;
    const type = Object.keys(limits).find((k) => o.data.buildings[k]?.produces && limits[k].count > 0);
    if (!type) return null;
    for (let y = 0; y < o.data.economy.mapSize; y++) for (let x = 0; x < o.data.economy.mapSize; x++) if (canPlace(h.state, o.data, type, x, y).ok) return { type: 'place', buildingType: type, x, y };
    return null;
  };
  const session = async (h: Holder) => {
    h.busy = true;
    try {
      await timed('hello', () => h.port.hello());
      const commands: VillageCommand[] = [];
      for (let k = 0; k < 3; k++) {
        const cmd = nextCommand(h);
        if (!cmd) break;
        const t = Date.now();
        const r = applyCommand(h.state, cmd, t, o.data);
        if (r.ok) {
          const before = new Set(h.state.buildings.map((b) => b.id));
          h.state = r.state;
          if (cmd.type === 'place') h.collector = h.state.buildings.find((b) => !before.has(b.id))?.id ?? null;
        }
        commands.push({ seq: ++h.seq, t, command: cmd });
      }
      if (commands.length) {
        const res = await timed('commands', () => h.port.sendCommands({ stateHash: economyHash(h.state), commands }));
        if (res) refusedCommands += res.results.filter((x) => !x.ok).length;
        if (res?.corrections) {
          // The server's economy wins (as in the game); reload the whole village so the next hash matches.
          const v = await timed('village', () => h.port.getVillage());
          if (v) h.state = deserialize(v.file, o.data);
        }
      }
      await timed('notices', () => h.port.notices());
      sessions++;
    } finally {
      h.busy = false;
    }
  };

  o.log?.(`${players.length} players ready; ${o.battlesPerSecond} battles/s for ${o.seconds} s.${holders.length ? ` ${holders.length} held villages, ${cps} command sessions/s.` : ''}`);

  let battles = 0;
  let seq = 0;
  const battle = async (p: (typeof players)[number]) => {
    p.busy = true;
    try {
      const m = await timed('match', () => p.port.match());
      if (!m) return;
      // Protocol 10 (ledger audit A1): the seed comes when the raid starts.
      const started = p.port.startAttack ? await timed('start', () => p.port.startAttack!(m.ticket)) : null;
      const seed = started?.seed ?? m.seed ?? 0;
      const army = botArmy(p.keep, 1, o.data);
      const levels: Record<string, number> = {};
      for (const t of Object.keys(army)) levels[t] = Math.max(1, Math.min(troopLevelCapAt(p.keep, o.data, t), o.data.troops[t].levels.length));
      const probe = createBattle({ seed, base: m.base, army, levels, infiltration: true }, o.data);
      const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(++seq), o.data, levels, probe.entry);
      const r = await timed('attack', () => p.port.submitAttack({ ticket: m.ticket, seed, army, levels, deployments }));
      if (r) battles++;
      await timed('me', () => p.port.me());
    } finally {
      p.busy = false;
    }
  };

  const start = performance.now();
  const running = new Set<Promise<void>>();
  const interval = 1000 / o.battlesPerSecond;
  let next = start;
  let i = 0;
  const cmdInterval = cps > 0 ? 1000 / cps : Infinity;
  let nextCmd = start;
  let hi = 0;
  while (performance.now() - start < o.seconds * 1000) {
    const now = performance.now();
    if (holders.length && now >= nextCmd) {
      nextCmd += cmdInterval;
      let h: Holder | null = null;
      for (let k = 0; k < holders.length && !h; k++) {
        const c = holders[(hi + k) % holders.length];
        if (!c.busy) {
          h = c;
          hi = (hi + k + 1) % holders.length;
        }
      }
      if (h) {
        const run = session(h);
        running.add(run);
        void run.finally(() => running.delete(run));
      } else errors.skipped_holders_busy = (errors.skipped_holders_busy ?? 0) + 1;
      continue;
    }
    if (now < next) {
      await new Promise((r) => setTimeout(r, Math.max(1, Math.min(50, next - now, nextCmd - now))));
      continue;
    }
    next += interval;
    // The next idle player starts a battle; if all are busy, the server is behind (counted as skipped).
    let p: (typeof players)[number] | null = null;
    for (let k = 0; k < players.length; k++) {
      const c = players[(i + k) % players.length];
      if (!c.busy) {
        p = c;
        i = (i + k + 1) % players.length;
        break;
      }
    }
    if (!p) {
      errors.skipped_all_busy = (errors.skipped_all_busy ?? 0) + 1;
      continue;
    }
    const run = battle(p);
    running.add(run);
    void run.finally(() => running.delete(run));
  }
  await Promise.all(running);
  const elapsed = (performance.now() - start) / 1000;
  const calls: Record<string, CallStats> = {};
  for (const [name, list] of times) {
    const s = [...list].sort((a, b) => a - b);
    calls[name] = { count: s.length, errors: failures.get(name) ?? 0, p50: Math.round(pct(s, 0.5)), p95: Math.round(pct(s, 0.95)), p99: Math.round(pct(s, 0.99)), max: Math.round(s[s.length - 1] ?? 0) };
  }
  return { battles, achievedBps: Math.round((battles / elapsed) * 100) / 100, targetBps: o.battlesPerSecond, calls, errors, ...(holders.length ? { sessions, refusedCommands } : {}) };
}

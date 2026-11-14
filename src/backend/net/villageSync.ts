/**
 * The game's side of a server-owned village (roadmap Phase 2, step 21).
 *
 * While the server keeps this player's village, every player action that
 * touches the economy (`PLAYER_COMMANDS`) is applied here at once, as always,
 * and also queued with its number, its time and the economy hash right after
 * it. The queue is stored on the device and sent in batches (every 15 s, when
 * it grows, and before every attack report), so actions taken offline wait
 * until the server has them. The server replays each batch; when its economy
 * differs, its answer wins (`adoptEconomy`), and anything queued since is
 * replayed on top of it.
 *
 * Several devices can hold the same village (cloud save). Each queue has its
 * own device id and numbers its commands itself; the server keeps the last
 * number it processed per device (GLOBAL-009), so two devices' "command 1"
 * are two commands, and a retried batch from one device is still skipped.
 * Whatever one device did is replayed on the server's village as it stands;
 * the other device takes the result as a correction and replays its own
 * queue on top (the rebase). Commands the server refused (the village had
 * changed: the building was already upgraded elsewhere) are counted in
 * `refused` and listed in `refusedLog` (what, when and the server's reason
 * code, for News), never dropped silently.
 *
 * The queue is the only copy of offline actions until the server has them, so
 * a failed write is not ignored (GLOBAL-010): `storageProblem` says so, the
 * Connection tells the player, and the queue is sent at once to make the
 * server hold it instead.
 */
import { deserialize, serialize } from '../../gameplay/sim/save';
import { economyHash, economyOf, PLAYER_COMMANDS, type Economy } from '../../gameplay/sim/serverEconomy';
import type { GameData, VillageState } from '../../gameplay/sim/types';
import type { Command } from '../../gameplay/sim/village';
import { ServerError, type ServerPort } from './ports';
import type { CommandOutcome, VillageCommand } from './protocol';

/** What the queue needs from the game (GameController provides it). */
export interface SyncGame {
  readonly data: GameData;
  readonly state: VillageState;
  onCommand(fn: (cmd: Command, at: number) => void): () => void;
  adoptEconomy(economy: Economy, replay: { command: Command; t: number }[]): void;
  adoptVillage(state: VillageState): Promise<void>;
}

export interface SyncStore {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
  /** Like `set`, but false when the write failed (storage full or blocked). */
  trySet?(key: string, value: string | null): boolean;
}

/** A new random device id for a queue (GLOBAL-009). */
export function newDeviceId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  let out = '';
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

interface Queued extends VillageCommand {
  /** The economy hash right after this command ('' once unknown, after a correction). */
  hash: string;
}

interface Stored {
  /** The server keeps this player's village. */
  active: boolean;
  /** This queue's own id: the server numbers commands per device (absent on queues from before). */
  device?: string;
  /** The last command number used. */
  seq: number;
  queue: Queued[];
}

/**
 * One action the server refused (audit GLOBAL-009 follow-up): the command's type, the building or warrior
 * it was about, when it was taken on this device and the server's reason code (a sim error code such as
 * `NOT_ENOUGH_RESOURCES`, or `NOT_ALLOWED`, `TOO_LARGE`, `TOO_MANY_BATTLES`).
 */
export interface RefusedAction {
  at: number;
  type: string;
  code: string;
  building?: string;
  troop?: string;
}

/** How many refused actions `refusedLog` keeps (newest last). */
export const REFUSED_LOG_SIZE = 20;

/** Most commands sent in one batch (the server's limit). */
export const BATCH_SIZE = 200;
/** Send at once when this many are waiting (otherwise every 15 s). */
export const FLUSH_AT = 20;

export class VillageSync {
  private stored: Stored;
  private sending: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  /** Corrections taken from the server since start (for Settings and tests). */
  corrections = 0;
  /** Commands the server refused since start (the village had changed, e.g. on another device). */
  refused = 0;
  /** The last `REFUSED_LOG_SIZE` refused actions since start, newest last (News lists them). */
  refusedLog: RefusedAction[] = [];
  /** What the server held back when this village moved (GLOBAL-002), to tell the player once. */
  importHeld: { jade: number; premium: boolean; purchases: number } | null = null;
  /** The last write of the queue failed: actions since then live only in memory until the server has them. */
  storageProblem = false;
  /** Called after anything changes (Settings redraws). */
  onChange: () => void = () => undefined;

  constructor(
    private readonly game: SyncGame,
    private readonly port: () => ServerPort | null,
    private readonly kv: SyncStore,
    private readonly key: string,
  ) {
    this.stored = this.load();
    this.unsubscribe = game.onCommand((cmd, at) => this.record(cmd, at));
  }

  private load(): Stored {
    try {
      const v = JSON.parse(this.kv.get(this.key) ?? 'null') as Stored | null;
      if (v && typeof v.seq === 'number' && Array.isArray(v.queue)) return { ...v, device: v.device ?? newDeviceId() };
    } catch {
      /* a damaged queue starts empty: the server's state is the truth anyway */
    }
    return { active: false, device: newDeviceId(), seq: 0, queue: [] };
  }

  /** A fresh queue for a village this device starts on (a new device id, so old numbers never clash). */
  private fresh(active: boolean, seq: number): Stored {
    return { active, device: newDeviceId(), seq, queue: [] };
  }

  private persist(): boolean {
    const value = this.stored.active || this.stored.queue.length ? JSON.stringify(this.stored) : null;
    let ok = true;
    if (this.kv.trySet) ok = this.kv.trySet(this.key, value);
    else {
      try {
        this.kv.set(this.key, value);
      } catch {
        ok = false;
      }
    }
    const was = this.storageProblem;
    this.storageProblem = !ok;
    this.onChange();
    // Not stored here: get it to the server, which keeps it (GLOBAL-010).
    if (!ok && !was && this.stored.queue.length) void this.flush().catch(() => undefined);
    return ok;
  }

  /** The server keeps this village. */
  /** This device's queue id (sent with purchase intents too: backend batch 2026-11-13, A5/A24). */
  get device(): string | undefined {
    return this.stored.device;
  }

  get active(): boolean {
    return this.stored.active;
  }

  /** Actions waiting for the server. */
  get pending(): number {
    return this.stored.queue.length;
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Forget everything (account deleted, or the server no longer has the village). */
  reset(): void {
    this.stored = this.fresh(false, 0);
    this.persist();
  }

  private record(cmd: Command, at: number): void {
    if (!this.stored.active || !PLAYER_COMMANDS.has(cmd.type)) return;
    this.stored.queue.push({ seq: ++this.stored.seq, t: at, command: JSON.parse(JSON.stringify(cmd)) as Command, hash: economyHash(this.game.state) });
    const stored = this.persist();
    if (stored && this.stored.queue.length >= FLUSH_AT) void this.flush().catch(() => undefined);
    else if (!stored) void this.flush().catch(() => undefined);
  }

  /**
   * Move this player's village to the server: the server starts one (bringing
   * an existing village over is roadmap step 25), and the village here is
   * kept as a backup.
   */
  async enable(how: 'new' | 'move' = 'new'): Promise<void> {
    const port = this.port();
    if (!port) throw new Error('No server configured.');
    if (how === 'move') {
      // This village goes to the server (roadmap step 25); its economy is unchanged, so there is nothing to adopt.
      const v = await port.importVillage(serialize(this.game.state, this.game.state.lastSeenAt));
      this.stored = this.fresh(true, v.seq);
      if (v.importHeld) {
        // GLOBAL-002: the server held back paid value it could not confirm. Take its village
        // whole (Jade and the Scroll included); the one here is kept as a backup for support.
        this.importHeld = v.importHeld;
        await this.game.adoptVillage(deserialize(v.file, this.game.data));
      } else if (economyHash(this.game.state) !== v.stateHash) this.adopt(economyOf(deserialize(v.file, this.game.data)));
      this.persist();
      return;
    }
    const v = await port.startVillage();
    await this.game.adoptVillage(deserialize(v.file, this.game.data));
    this.stored = this.fresh(true, v.seq);
    this.persist();
  }

  /**
   * On connecting: learn whether the server keeps this village. If it does and
   * nothing is waiting, take its economy when ours differs (another session,
   * or results that arrived while away); waiting actions are sent instead, and
   * the answer reconciles.
   */
  async connect(): Promise<void> {
    const port = this.port();
    if (!port) return;
    const v = await port.getVillage();
    if (!v) {
      if (this.stored.active) this.reset();
      return;
    }
    if (!this.stored.active) {
      // First time this device meets the server's village (signed in on a new device: cloud save):
      // take the whole village; the one here becomes a backup.
      await this.game.adoptVillage(deserialize(v.file, this.game.data));
      this.stored = this.fresh(true, v.seq);
      this.persist();
      return;
    }
    if (this.stored.seq < v.seq) this.stored = { ...this.stored, seq: v.seq };
    this.persist();
    if (this.stored.queue.length) await this.flush();
    else if (economyHash(this.game.state) !== v.stateHash) this.adopt(economyOf(deserialize(v.file, this.game.data)));
  }

  /** Send everything waiting, a batch at a time. Concurrent calls share one run. */
  flush(): Promise<void> {
    if (!this.stored.active || !this.stored.queue.length) return Promise.resolve();
    if (!this.sending) {
      this.sending = this.run().finally(() => {
        this.sending = null;
      });
    }
    return this.sending;
  }

  private async run(): Promise<void> {
    const port = this.port();
    if (!port) return;
    while (this.stored.queue.length) {
      const batch = this.stored.queue.slice(0, BATCH_SIZE);
      let r;
      try {
        r = await port.sendCommands({ stateHash: batch[batch.length - 1].hash, commands: batch.map(({ seq, t, command }) => ({ seq, t, command })), ...(this.stored.device ? { device: this.stored.device } : {}) });
      } catch (e) {
        if (e instanceof ServerError && e.code === 'no_village') {
          // The server no longer keeps this village: it lives here again.
          this.reset();
          return;
        }
        throw e;
      }
      for (const x of r.results) if (!x.ok) this.noteRefused(x, batch.find((q) => q.seq === x.seq));
      this.stored.queue = this.stored.queue.filter((q) => q.seq > r.ackSeq);
      if (r.corrections) this.adopt(r.corrections.economy);
      this.persist();
    }
  }

  /** Count and keep a refused action; its subject comes from the queued command (or the server's `type`, protocol addition). */
  private noteRefused(x: CommandOutcome, queued: Queued | undefined): void {
    this.refused++;
    const cmd = queued?.command as (Command & { buildingType?: string; troop?: string; id?: string }) | undefined;
    const type = cmd?.type ?? x.type ?? 'unknown';
    const entry: RefusedAction = { at: queued?.t ?? x.at ?? Date.now(), type, code: x.error ?? 'REFUSED' };
    const building = cmd?.buildingType ?? (typeof cmd?.id === 'string' ? this.game.state.buildings.find((b) => b.id === cmd.id)?.type : undefined);
    if (building) entry.building = building;
    if (typeof cmd?.troop === 'string') entry.troop = cmd.troop;
    this.refusedLog = [...this.refusedLog, entry].slice(-REFUSED_LOG_SIZE);
  }

  /** Put the server's economy in place and replay what is still waiting on top of it. */
  private adopt(economy: Economy): void {
    this.corrections++;
    const rest = this.stored.queue;
    this.game.adoptEconomy(economy, rest.map((q) => ({ command: q.command, t: q.t })));
    // Hashes along the replayed queue are unknown now; the last one is the village as it stands.
    rest.forEach((q, i) => (q.hash = i === rest.length - 1 ? economyHash(this.game.state) : ''));
    this.persist();
  }
}

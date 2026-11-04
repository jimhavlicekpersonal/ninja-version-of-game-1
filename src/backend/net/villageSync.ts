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
 */
import { deserialize } from '../../gameplay/sim/save';
import { economyHash, economyOf, PLAYER_COMMANDS, type Economy } from '../../gameplay/sim/serverEconomy';
import type { GameData, VillageState } from '../../gameplay/sim/types';
import type { Command } from '../../gameplay/sim/village';
import { ServerError, type ServerPort } from './ports';
import type { VillageCommand } from './protocol';

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
}

interface Queued extends VillageCommand {
  /** The economy hash right after this command ('' once unknown, after a correction). */
  hash: string;
}

interface Stored {
  /** The server keeps this player's village. */
  active: boolean;
  /** The last command number used. */
  seq: number;
  queue: Queued[];
}

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
      if (v && typeof v.seq === 'number' && Array.isArray(v.queue)) return v;
    } catch {
      /* a damaged queue starts empty: the server's state is the truth anyway */
    }
    return { active: false, seq: 0, queue: [] };
  }

  private persist(): void {
    this.kv.set(this.key, this.stored.active || this.stored.queue.length ? JSON.stringify(this.stored) : null);
    this.onChange();
  }

  /** The server keeps this village. */
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
    this.stored = { active: false, seq: 0, queue: [] };
    this.persist();
  }

  private record(cmd: Command, at: number): void {
    if (!this.stored.active || !PLAYER_COMMANDS.has(cmd.type)) return;
    this.stored.queue.push({ seq: ++this.stored.seq, t: at, command: JSON.parse(JSON.stringify(cmd)) as Command, hash: economyHash(this.game.state) });
    this.persist();
    if (this.stored.queue.length >= FLUSH_AT) void this.flush().catch(() => undefined);
  }

  /**
   * Move this player's village to the server: the server starts one (bringing
   * an existing village over is roadmap step 25), and the village here is
   * kept as a backup.
   */
  async enable(): Promise<void> {
    const port = this.port();
    if (!port) throw new Error('No server configured.');
    const v = await port.startVillage();
    await this.game.adoptVillage(deserialize(v.file, this.game.data));
    this.stored = { active: true, seq: v.seq, queue: [] };
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
      this.stored = { active: true, seq: v.seq, queue: [] };
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
        r = await port.sendCommands({ stateHash: batch[batch.length - 1].hash, commands: batch.map(({ seq, t, command }) => ({ seq, t, command })) });
      } catch (e) {
        if (e instanceof ServerError && e.code === 'no_village') {
          // The server no longer keeps this village: it lives here again.
          this.reset();
          return;
        }
        throw e;
      }
      this.stored.queue = this.stored.queue.filter((q) => q.seq > r.ackSeq);
      if (r.corrections) this.adopt(r.corrections.economy);
      this.persist();
    }
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

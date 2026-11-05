/**
 * A small Redis client (RESP2 over TCP or TLS) with no dependencies, enough
 * for the shared server state of roadmap step 16: the leaderboard sorted set,
 * match locks and rate-limit counters. Commands are pipelined in order on one
 * connection; a dropped connection fails the commands in flight and reconnects
 * on the next command.
 *
 * Redis must never make every request slow (re-audit): commands time out after
 * 500 ms, a connection attempt after 1 s, and after a failed connection or a
 * timeout the client fails fast for `retryMs` (1 s) instead of making each
 * request wait again. The callers degrade (server/shared.ts: rate limits fail
 * open, the leaderboard reads the database, match locks fall back to tickets).
 *
 * URLs: redis://[user:password@]host:port[/db], rediss:// for TLS (Upstash,
 * most managed Redis).
 */
import { connect as tcpConnect, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

export type RespValue = string | number | null | RespValue[];

export class RedisError extends Error {}

/** What the server uses: one command at a time (pipelined underneath). */
export interface RedisCommander {
  command(...args: (string | number)[]): Promise<RespValue>;
  close(): Promise<void>;
  /** False while the client is failing fast after an outage (undefined: always assumed up). */
  readonly available?: boolean;
}

/** Encode one command as a RESP array of bulk strings. */
export function encodeCommand(args: (string | number)[]): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`)];
  for (const a of args) {
    const b = Buffer.from(String(a), 'utf8');
    parts.push(Buffer.from(`$${b.length}\r\n`), b, Buffer.from('\r\n'));
  }
  return Buffer.concat(parts);
}

/**
 * Incremental RESP2 reply parser: feed it bytes as they arrive, it returns the
 * complete replies (errors as RedisError values) and keeps any partial one.
 */
export class RespParser {
  private buf: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): (RespValue | RedisError)[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const out: (RespValue | RedisError)[] = [];
    for (;;) {
      const r = this.parse(0);
      if (!r) break;
      out.push(r.value);
      this.buf = this.buf.subarray(r.end);
    }
    return out;
  }

  /** One reply starting at `at`, or null when more bytes are needed. */
  private parse(at: number): { value: RespValue | RedisError; end: number } | null {
    const nl = this.buf.indexOf('\r\n', at);
    if (nl < 0) return null;
    const type = String.fromCharCode(this.buf[at]);
    const line = this.buf.toString('utf8', at + 1, nl);
    const next = nl + 2;
    switch (type) {
      case '+':
        return { value: line, end: next };
      case '-':
        return { value: new RedisError(line), end: next };
      case ':':
        return { value: Number(line), end: next };
      case '$': {
        const len = Number(line);
        if (len < 0) return { value: null, end: next };
        if (this.buf.length < next + len + 2) return null;
        return { value: this.buf.toString('utf8', next, next + len), end: next + len + 2 };
      }
      case '*': {
        const n = Number(line);
        if (n < 0) return { value: null, end: next };
        const items: RespValue[] = [];
        let pos = next;
        for (let i = 0; i < n; i++) {
          const r = this.parse(pos);
          if (!r) return null;
          if (r.value instanceof RedisError) return { value: r.value, end: r.end };
          items.push(r.value);
          pos = r.end;
        }
        return { value: items, end: pos };
      }
      default:
        throw new RedisError(`Unexpected reply type "${type}" from Redis`);
    }
  }
}

interface Pending {
  resolve(v: RespValue): void;
  reject(e: Error): void;
}

export interface RedisOptions {
  host: string;
  port: number;
  tls?: boolean;
  username?: string;
  password?: string;
  db?: number;
  /** Fail a command that gets no answer within this time (default 500 ms). */
  timeoutMs?: number;
  /** Give up connecting after this long (default 1 s). */
  connectTimeoutMs?: number;
  /** After a failed connection or a timeout, fail fast for this long before trying again (default 1 s). */
  retryMs?: number;
}

export const REDIS_DEFAULTS = { timeoutMs: 500, connectTimeoutMs: 1000, retryMs: 1000 } as const;

export function parseRedisUrl(url: string): RedisOptions {
  const u = new URL(url);
  if (u.protocol !== 'redis:' && u.protocol !== 'rediss:') throw new Error('REDIS_URL must start with redis:// or rediss://');
  const db = u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0;
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    tls: u.protocol === 'rediss:',
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: Number.isInteger(db) ? db : 0,
  };
}

export class RedisClient implements RedisCommander {
  private socket: Socket | null = null;
  private ready: Promise<void> | null = null;
  private parser = new RespParser();
  private pending: Pending[] = [];
  private closed = false;
  /** Until when commands fail at once (a failed connection or a timeout). */
  private downUntil = 0;

  constructor(private readonly o: RedisOptions) {}

  static fromUrl(url: string, o: Pick<RedisOptions, 'timeoutMs' | 'connectTimeoutMs' | 'retryMs'> = {}): RedisClient {
    return new RedisClient({ ...parseRedisUrl(url), ...o });
  }

  get available(): boolean {
    return Date.now() >= this.downUntil;
  }

  private trip(): void {
    this.downUntil = Date.now() + (this.o.retryMs ?? REDIS_DEFAULTS.retryMs);
  }

  private open(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      let connected = false;
      const connectTimer = setTimeout(() => s.destroy(new RedisError('Redis did not connect in time')), this.o.connectTimeoutMs ?? REDIS_DEFAULTS.connectTimeoutMs);
      const onConnect = () => {
        clearTimeout(connectTimer);
        // Authenticate and pick the database before anything else is sent.
        const hello: Promise<RespValue>[] = [];
        if (this.o.password) hello.push(this.send(this.o.username ? ['AUTH', this.o.username, this.o.password] : ['AUTH', this.o.password]));
        if (this.o.db) hello.push(this.send(['SELECT', this.o.db]));
        Promise.all(hello).then(() => {
          connected = true;
          resolve();
        }, reject);
      };
      const s = this.o.tls ? tlsConnect({ host: this.o.host, port: this.o.port, servername: this.o.host }, onConnect) : tcpConnect({ host: this.o.host, port: this.o.port }, onConnect);
      s.setNoDelay(true);
      s.on('data', (chunk: Buffer) => {
        let replies: (RespValue | RedisError)[];
        try {
          replies = this.parser.push(chunk);
        } catch (e) {
          s.destroy(e as Error);
          return;
        }
        for (const r of replies) {
          const p = this.pending.shift();
          if (!p) continue;
          if (r instanceof RedisError) p.reject(r);
          else p.resolve(r);
        }
      });
      const fail = (e?: Error) => {
        clearTimeout(connectTimer);
        // A connection that never came up trips the breaker; a dropped one just reconnects on the next command.
        if (!connected && this.socket === s) this.trip();
        const err = e ?? new RedisError('Redis connection closed');
        for (const p of this.pending.splice(0)) p.reject(err);
        this.socket = null;
        this.ready = null;
        this.parser = new RespParser();
        reject(err);
      };
      s.on('error', fail);
      s.on('close', () => fail());
      this.socket = s;
    });
    return this.ready;
  }

  private send(args: (string | number)[]): Promise<RespValue> {
    return new Promise<RespValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new RedisError(`Redis did not answer ${String(args[0])} in time`));
        this.trip();
        this.socket?.destroy();
      }, this.o.timeoutMs ?? REDIS_DEFAULTS.timeoutMs);
      this.pending.push({
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.socket!.write(encodeCommand(args));
    });
  }

  async command(...args: (string | number)[]): Promise<RespValue> {
    if (this.closed) throw new RedisError('Redis client is closed');
    if (!this.available) throw new RedisError('Redis is unavailable (retrying shortly)');
    await this.open();
    return this.send(args);
  }

  async close(): Promise<void> {
    this.closed = true;
    const s = this.socket;
    if (!s) return;
    await new Promise<void>((resolve) => {
      s.once('close', () => resolve());
      s.end();
    });
  }
}

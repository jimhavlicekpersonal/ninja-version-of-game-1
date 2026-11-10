/**
 * What the run has spent, estimated from each reply's token counts and the price list in
 * factory.config.json. The budget stop reads it before every call. It is an estimate: the Console
 * has the real bill.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Config } from './config.js';

export interface CallUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export type Phase = 'skeleton' | 'build';

export interface LedgerEntry {
  at: string;
  phase: Phase;
  label: string;
  model: string;
  stop: string | null;
  seconds: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  searches: number;
  usd: number;
}

export class BudgetExceededError extends Error {
  constructor(
    readonly phase: Phase,
    readonly spent: number,
    readonly cap: number,
  ) {
    super(
      `The ${phase} budget is spent: about $${spent.toFixed(2)} of $${cap.toFixed(2)}. Nothing is lost: ` +
        `raise budget.${phase}Usd in factory.config.json and run the same command again to continue.`,
    );
  }
}

export class Ledger {
  private entries: LedgerEntry[] = [];
  private warned = new Set<string>();

  /** `file` is the run's calls.jsonl; an existing file is read back so a resumed run keeps its total. */
  constructor(
    private readonly config: Config,
    private readonly file: string | null = null,
  ) {
    if (file && existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (line.trim()) this.entries.push(JSON.parse(line) as LedgerEntry);
      }
    }
  }

  price(model: string, usage: CallUsage): number {
    const table = this.config.pricing.models;
    let p = table[model];
    if (!p) {
      if (!this.warned.has(model)) {
        this.warned.add(model);
        console.warn(`  (no price for ${model} in factory.config.json; costing it as ${this.config.models.thinker})`);
      }
      p = table[this.config.models.thinker];
    }
    if (!p) return 0;
    const write = this.config.api.cacheTtl === '1h' ? p.cacheWrite1h : p.cacheWrite5m;
    const tokens =
      usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * write;
    const searches = usage.server_tool_use?.web_search_requests ?? 0;
    return tokens / 1_000_000 + searches * this.config.pricing.webSearchPerRequest;
  }

  record(phase: Phase, label: string, model: string, stop: string | null, seconds: number, usage: CallUsage): LedgerEntry {
    const entry: LedgerEntry = {
      at: new Date().toISOString(),
      phase,
      label,
      model,
      stop,
      seconds: Math.round(seconds * 10) / 10,
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
      searches: usage.server_tool_use?.web_search_requests ?? 0,
      usd: this.price(model, usage),
    };
    this.entries.push(entry);
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      appendFileSync(this.file, JSON.stringify(entry) + '\n');
    }
    return entry;
  }

  spent(phase?: Phase): number {
    return this.entries.filter((e) => !phase || e.phase === phase).reduce((sum, e) => sum + e.usd, 0);
  }

  calls(phase?: Phase): number {
    return this.entries.filter((e) => !phase || e.phase === phase).length;
  }

  /** Throws before a call that would start past the cap. */
  assertBudget(phase: Phase): void {
    const cap = phase === 'skeleton' ? this.config.budget.skeletonUsd : this.config.budget.buildUsd;
    const spent = this.spent(phase);
    if (spent >= cap) throw new BudgetExceededError(phase, spent, cap);
  }

  summary(): string {
    const line = (phase: Phase) => `${phase}: ${this.calls(phase)} calls, about $${this.spent(phase).toFixed(2)}`;
    return `${line('skeleton')}; ${line('build')}`;
  }
}

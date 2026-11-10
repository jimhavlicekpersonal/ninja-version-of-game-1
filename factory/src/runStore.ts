/**
 * A run is one new game, from GO to built. Everything it decides and does is a file in
 * factory/runs/<id>/, so a run can stop anywhere (budget, network, laptop lid) and carry on, and the
 * owner can read exactly what was decided before approving.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { FACTORY_ROOT, type StageId } from './config.js';
import { FactoryError, textOf, type Recorder, type Reply, type TurnRequest } from './llm.js';

/** What the owner may say before pressing GO. All of it is optional: an empty brief means "you decide". */
export const BriefSchema = z.object({
  idea: z.string().describe('A theme or direction to start from; empty lets the market stage choose'),
  mustHave: z.array(z.string()),
  avoid: z.array(z.string()),
  regions: z.array(z.string()).describe('Markets that matter most; empty lets the market stage choose'),
  notes: z.string(),
});
export type Brief = z.infer<typeof BriefSchema>;
export const EMPTY_BRIEF: Brief = { idea: '', mustHave: [], avoid: [], regions: [], notes: '' };

export type RunStatus = 'designing' | 'awaiting-approval' | 'approved' | 'building' | 'built';

export interface OrderState {
  status: 'pending' | 'done' | 'partial' | 'blocked' | 'failed';
  commit: string | null;
  turns: number;
  summary: string;
  checks: Array<{ name: string; ok: boolean }>;
  laneReverts: string[];
}

export interface RunState {
  id: string;
  createdAt: string;
  status: RunStatus;
  mock: boolean;
  brief: Brief;
  template: { source: string; sha: string; key: string; dirty: boolean } | null;
  stagesDone: StageId[];
  game: { name: string; slug: string } | null;
  approvedAt: string | null;
  build: { dir: string | null; orders: Record<string, OrderState> };
}

export const RUNS_DIR = join(FACTORY_ROOT, 'runs');

export class RunStore {
  state: RunState;
  private callNumber = 0;

  private constructor(readonly dir: string, state: RunState) {
    this.state = state;
    const calls = join(dir, 'calls');
    if (existsSync(calls)) this.callNumber = readdirSync(calls).length;
  }

  static create(brief: Brief, mock: boolean, runsDir = RUNS_DIR): RunStore {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
    const id = `${stamp}-${randomBytes(2).toString('hex')}`;
    const dir = join(runsDir, id);
    mkdirSync(dir, { recursive: true });
    const store = new RunStore(dir, {
      id,
      createdAt: new Date().toISOString(),
      status: 'designing',
      mock,
      brief,
      template: null,
      stagesDone: [],
      game: null,
      approvedAt: null,
      build: { dir: null, orders: {} },
    });
    store.save();
    return store;
  }

  static open(id: string, runsDir = RUNS_DIR): RunStore {
    const dir = join(runsDir, id);
    const file = join(dir, 'state.json');
    if (!existsSync(file)) throw new FactoryError(`There is no run "${id}" in ${runsDir}. \`npm run status\` lists the runs.`);
    return new RunStore(dir, JSON.parse(readFileSync(file, 'utf8')) as RunState);
  }

  /** Run ids, newest first. */
  static list(runsDir = RUNS_DIR): string[] {
    if (!existsSync(runsDir)) return [];
    return readdirSync(runsDir)
      .filter((name) => existsSync(join(runsDir, name, 'state.json')))
      .sort()
      .reverse();
  }

  static latest(runsDir = RUNS_DIR): RunStore {
    const [id] = RunStore.list(runsDir);
    if (!id) throw new FactoryError('There are no runs yet. Start one with `npm run go`.');
    return RunStore.open(id, runsDir);
  }

  save(): void {
    writeFileSync(join(this.dir, 'state.json'), JSON.stringify(this.state, null, 2) + '\n');
  }

  path(...parts: string[]): string {
    return join(this.dir, ...parts);
  }

  exists(...parts: string[]): boolean {
    return existsSync(this.path(...parts));
  }

  write(rel: string, text: string): void {
    const file = this.path(rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text.endsWith('\n') ? text : text + '\n');
  }

  writeJson(rel: string, value: unknown): void {
    this.write(rel, JSON.stringify(value, null, 2));
  }

  read(rel: string): string {
    return readFileSync(this.path(rel), 'utf8');
  }

  readJson<T>(rel: string): T {
    return JSON.parse(this.read(rel)) as T;
  }

  get ledgerFile(): string {
    return this.path('calls.jsonl');
  }

  log(line: string): void {
    console.log(line);
    const file = this.path('run.log');
    writeFileSync(file, `${new Date().toISOString()} ${line}\n`, { flag: 'a' });
  }

  /**
   * Keeps every answer (and the size and tail of what was asked) under calls/. The folder is not
   * committed: it is the working record of the run, for looking into a decision afterwards.
   */
  recorder(): Recorder {
    return {
      call: (req: TurnRequest, reply: Reply, seconds: number) => {
        const n = String(++this.callNumber).padStart(4, '0');
        const last = req.messages[req.messages.length - 1];
        const lastText =
          typeof last?.content === 'string'
            ? last.content
            : (last?.content ?? [])
                .map((b) => (b.type === 'text' ? b.text : `[${b.type}]`))
                .join('\n');
        const toolCalls = reply.content.filter((b) => b.type === 'tool_use').map((b) => (b.type === 'tool_use' ? { name: b.name, input: b.input } : null));
        this.writeJson(join('calls', `${n}-${req.label.replace(/[^a-z0-9_.-]+/gi, '_')}.json`), {
          label: req.label,
          model: reply.model,
          effort: req.effort,
          seconds,
          stop: reply.stop_reason,
          usage: reply.usage,
          asked: { systemChars: req.system.reduce((sum, b) => sum + b.text.length, 0), messages: req.messages.length, lastMessageTail: lastText.slice(-6000) },
          answered: { text: textOf(reply), toolCalls },
        });
      },
    };
  }
}

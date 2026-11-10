/**
 * The tools a working session gets: read, list, search, write, edit, shell and a closing report.
 * Claude only asks; this file does the work, and decides what is allowed:
 *
 * - every path is confined to one folder (the template snapshot or the new game's repository);
 * - writes are confined to the session's lane (the template's own compartment rule), and a refused
 *   write names the REQUESTS file to use instead;
 * - shell commands run without the factory's secrets, with a time limit and a short list of
 *   refused commands. That list is a tripwire, not a wall: run builds in CI or a container.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { ToolDef, ToolResult, ToolUse } from '../llm.js';
import { globToRegExp, matchesAny, toPosix } from '../template/glob.js';

export interface WriteLane {
  owns: string[];
  generated: string[];
  requests: string | null;
}

export interface ToolBoxOptions {
  /** Everything happens inside this folder. */
  root: string;
  /** null = a read-only session (the template survey). */
  lane: WriteLane | null;
  shell: { enabled: boolean; timeoutSeconds: number };
  log?: (line: string) => void;
}

export const ReportSchema = z.object({
  status: z.enum(['done', 'partial', 'blocked']).describe('done = every acceptance point met and checked; partial = some left; blocked = cannot proceed'),
  summary: z.string().describe('What changed, in a few plain sentences'),
  verified: z.array(z.string()).describe('What you checked and how (the command or the file you read), one per line'),
  unverified: z.array(z.string()).describe('What you could not check here (devices, stores, accounts, legal review), one per line'),
  requests: z.array(z.string()).describe('Asks for other lanes or the owner that this work turned up'),
});
export type Report = z.infer<typeof ReportSchema>;

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'dist-server', 'coverage', '.cache']);
const MAX_READ_LINES = 2000;
const MAX_RESULT_CHARS = 60_000;

/** Commands a build session has no business running. A tripwire: the real boundary is where the build runs. */
const REFUSED_COMMANDS: Array<[RegExp, string]> = [
  [/\bgit\s+(push|remote|clone)\b/, 'the factory publishes nothing; the owner pushes the finished game'],
  [/\bgit\s+config\s+--(global|system)\b/, 'global git settings are the owner\'s'],
  [/\bnpm\s+(publish|login|adduser|token)\b/, 'nothing is published from a build'],
  [/\b(sudo|su)\b/, 'no elevated commands'],
  [/\b(curl|wget)\b[^|;&]*[|;&]\s*(ba|z)?sh\b/, 'no piping downloads into a shell'],
  [/\brm\s+-[a-zA-Z]*[rR][a-zA-Z]*\s+(-[a-zA-Z]+\s+)*(\/|~|\.\.)/, 'no deleting outside the project'],
  [/\b(gh|aws|gcloud|az|fly|vercel|netlify)\s/, 'no cloud or hosting commands: those are owner steps'],
  [/\b(cap|npx\s+cap)\s+(run|open)\b/, 'native tooling needs the owner\'s machines'],
];

const SECRET_ENV = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|ANTHROPIC|GITHUB|AWS_|GCP_|AZURE_|NPM_CONFIG__AUTH)/i;

// Plain types only: these schemas go to the API as they are, and every input is checked again in `run`.
const Read = z.object({ path: z.string(), offset: z.number().optional().describe('First line to return, from 1'), limit: z.number().optional().describe('How many lines') });
const List = z.object({ pattern: z.string() });
const Search = z.object({ pattern: z.string(), glob: z.string().optional(), max_results: z.number().optional() });
const Write = z.object({ path: z.string(), content: z.string() });
const Edit = z.object({ path: z.string(), old_text: z.string(), new_text: z.string(), replace_all: z.boolean().optional() });
const Shell = z.object({ command: z.string(), timeout_seconds: z.number().optional() });

const whole = (n: number | undefined, fallback: number): number => (n === undefined || !Number.isFinite(n) ? fallback : Math.max(1, Math.floor(n)));

const tool = (name: string, description: string, schema: z.ZodType): ToolDef => {
  const { $schema: _unused, ...input } = z.toJSONSchema(schema) as Record<string, unknown>;
  // Large inputs (whole files) stream as they are written; every input is validated in `run` before use.
  return { name, description, input_schema: input as { type: 'object' }, eager_input_streaming: true };
};

export class ToolBox {
  /** Set when the session files its closing report. */
  report: Report | null = null;
  private readonly realRoot: string;

  constructor(private readonly options: ToolBoxOptions) {
    this.realRoot = realpathSync(options.root);
  }

  defs(): ToolDef[] {
    const defs = [
      tool('read_file', 'Read a text file. Returns numbered lines. Use offset and limit (in lines) for a long file.', Read),
      tool('list_files', 'List files whose path matches a glob, e.g. "src/gameplay/data/*.json" or "docs/**/*.md".', List),
      tool('search', 'Search file contents with a regular expression. Optional glob narrows the files. Returns path:line: text.', Search),
    ];
    if (this.options.lane) {
      defs.push(
        tool('write_file', 'Create a file or replace its whole content. Only inside your lane.', Write),
        tool('edit_file', 'Replace old_text with new_text in a file. old_text must occur exactly once unless replace_all is true. Only inside your lane.', Edit),
      );
      if (this.options.shell.enabled) {
        defs.push(tool('shell', 'Run a command in the project folder (npm scripts, git status/diff/add/commit, node). Returns the exit code and output.', Shell));
      }
    }
    defs.push(tool('report', 'File your closing report. Call it exactly once, when the work is finished or you cannot go on, then end your turn.', ReportSchema));
    return defs;
  }

  async run(use: ToolUse): Promise<ToolResult> {
    const result = (content: string, is_error = false): ToolResult => ({ type: 'tool_result', tool_use_id: use.id, content: clip(content), ...(is_error ? { is_error } : {}) });
    const input = <T>(schema: z.ZodType<T>): T => {
      const parsed = schema.safeParse(use.input);
      if (!parsed.success) throw new ToolError(JSON.stringify({ INVALID_JSON: JSON.stringify(use.input) }));
      return parsed.data;
    };
    try {
      switch (use.name) {
        case 'read_file':
          return result(this.read(input(Read)));
        case 'list_files':
          return result(this.list(input(List).pattern));
        case 'search':
          return result(this.search(input(Search)));
        case 'write_file':
          return result(this.write(input(Write)));
        case 'edit_file':
          return result(this.edit(input(Edit)));
        case 'shell':
          return result(await this.shell(input(Shell)));
        case 'report':
          this.report = input(ReportSchema);
          return result('Report recorded. End your turn now.');
        default:
          return result(`There is no tool named ${use.name}.`, true);
      }
    } catch (err) {
      if (err instanceof ToolError) return result(err.message, true);
      return result(`The tool failed: ${(err as Error).message}`, true);
    }
  }

  /** A model-supplied path, resolved and proven to stay inside the root (also through symlinks). */
  private inside(path: string): { abs: string; rel: string } {
    const abs = resolve(this.options.root, path);
    const rel = relative(this.options.root, abs);
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new ToolError(`${path} is outside the project folder.`);
    let probe = abs;
    while (!existsSync(probe)) probe = dirname(probe);
    const real = realpathSync(probe);
    if (real !== this.realRoot && !real.startsWith(this.realRoot + sep)) throw new ToolError(`${path} leads outside the project folder.`);
    return { abs, rel: toPosix(rel) };
  }

  private writable(rel: string): void {
    const lane = this.options.lane;
    if (!lane) throw new ToolError('This session is read-only.');
    if (rel === '.git' || rel.startsWith('.git/')) throw new ToolError('The .git folder is not yours to edit.');
    if (matchesAny(rel, lane.owns) || matchesAny(rel, lane.generated)) return;
    throw new ToolError(
      `${rel} is outside your lane (you own: ${lane.owns.join(', ')}). ` +
        (lane.requests ? `Do not edit it: describe what you need in ${lane.requests} and in your report.` : 'Do not edit it: describe what you need in your report.'),
    );
  }

  private read({ path, offset, limit }: z.infer<typeof Read>): string {
    const { abs, rel } = this.inside(path);
    if (!existsSync(abs)) throw new ToolError(`${rel} does not exist.`);
    if (statSync(abs).isDirectory()) throw new ToolError(`${rel} is a folder; use list_files.`);
    const lines = readFileSync(abs, 'utf8').split('\n');
    const start = whole(offset, 1) - 1;
    const count = Math.min(whole(limit, MAX_READ_LINES), MAX_READ_LINES);
    const shown = lines.slice(start, start + count).map((l, i) => `${start + i + 1}\t${l}`);
    const rest = lines.length - (start + shown.length);
    return shown.join('\n') + (rest > 0 ? `\n[${rest} more lines; read on with offset ${start + shown.length + 1}]` : '');
  }

  private walk(dir = ''): string[] {
    const out: string[] = [];
    for (const name of readdirSync(join(this.options.root, dir))) {
      if (SKIP_DIRS.has(name)) continue;
      const rel = dir ? `${dir}/${name}` : name;
      if (statSync(join(this.options.root, rel)).isDirectory()) out.push(...this.walk(rel));
      else out.push(rel);
    }
    return out;
  }

  private list(pattern: string): string {
    const re = globToRegExp(toPosix(pattern));
    const hits = this.walk().filter((f) => re.test(f)).sort();
    if (!hits.length) return 'No files match.';
    return hits.slice(0, 500).join('\n') + (hits.length > 500 ? `\n[${hits.length - 500} more; narrow the pattern]` : '');
  }

  private search({ pattern, glob, max_results }: z.infer<typeof Search>): string {
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch (err) {
      throw new ToolError(`Not a valid regular expression: ${(err as Error).message}`);
    }
    const only = glob ? globToRegExp(toPosix(glob)) : null;
    const max = Math.min(whole(max_results, 100), 400);
    const out: string[] = [];
    for (const file of this.walk()) {
      if (only && !only.test(file)) continue;
      const abs = join(this.options.root, file);
      if (statSync(abs).size > 2_000_000) continue;
      const text = readFileSync(abs, 'utf8');
      if (text.includes('\u0000')) continue; // binary
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i])) continue;
        out.push(`${file}:${i + 1}: ${lines[i].trim().slice(0, 240)}`);
        if (out.length >= max) return out.join('\n') + `\n[stopped at ${max} matches; narrow the search]`;
      }
    }
    return out.length ? out.join('\n') : 'No matches.';
  }

  private write({ path, content }: z.infer<typeof Write>): string {
    const { abs, rel } = this.inside(path);
    this.writable(rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    this.options.log?.(`write ${rel} (${content.length} chars)`);
    return `Wrote ${rel}.`;
  }

  private edit({ path, old_text, new_text, replace_all }: z.infer<typeof Edit>): string {
    const { abs, rel } = this.inside(path);
    this.writable(rel);
    if (!existsSync(abs)) throw new ToolError(`${rel} does not exist; use write_file to create it.`);
    const before = readFileSync(abs, 'utf8');
    const count = old_text ? before.split(old_text).length - 1 : 0;
    if (count === 0) throw new ToolError(`old_text was not found in ${rel}. Read the file again: it must match exactly, including spaces.`);
    if (count > 1 && !replace_all) throw new ToolError(`old_text occurs ${count} times in ${rel}. Add surrounding text to make it unique, or set replace_all.`);
    writeFileSync(abs, replace_all ? before.split(old_text).join(new_text) : before.replace(old_text, () => new_text));
    this.options.log?.(`edit ${rel} (${count} place${count === 1 ? '' : 's'})`);
    return `Edited ${rel} (${count} place${count === 1 ? '' : 's'}).`;
  }

  private shell({ command, timeout_seconds }: z.infer<typeof Shell>): Promise<string> {
    if (!this.options.lane) throw new ToolError('This session is read-only.');
    if (!this.options.shell.enabled) throw new ToolError('Shell commands are off for this build.');
    for (const [pattern, why] of REFUSED_COMMANDS) {
      if (pattern.test(command)) throw new ToolError(`Refused: ${why}. Put it in your report as an owner step if it is needed.`);
    }
    const seconds = Math.min(whole(timeout_seconds, this.options.shell.timeoutSeconds), this.options.shell.timeoutSeconds);
    this.options.log?.(`shell ${command}`);
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !SECRET_ENV.test(k)));
    return new Promise((done) => {
      const posix = process.platform !== 'win32';
      const child = spawn(command, { cwd: this.options.root, shell: true, env, detached: posix, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      const take = (chunk: Buffer) => {
        out += chunk.toString('utf8');
        if (out.length > 400_000) out = out.slice(0, 20_000) + '\n[...]\n' + out.slice(-200_000);
      };
      child.stdout.on('data', take);
      child.stderr.on('data', take);
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          if (posix && child.pid) process.kill(-child.pid, 'SIGKILL');
          else child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }, seconds * 1000);
      child.on('error', (err) => {
        clearTimeout(timer);
        done(`The command could not start: ${err.message}`);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        done(`${timedOut ? `Stopped after ${seconds} s (time limit).` : `Exit code ${code}.`}\n${tail(out)}`);
      });
    });
  }
}

class ToolError extends Error {}

/** Keeps the start and the end: test runners put the verdict last. */
function tail(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return `${text.slice(0, 8000)}\n[... ${text.length - MAX_RESULT_CHARS} characters left out ...]\n${text.slice(-(MAX_RESULT_CHARS - 8000))}`;
}

function clip(text: string): string {
  if (text.length <= MAX_RESULT_CHARS + 200) return text;
  return `${text.slice(0, MAX_RESULT_CHARS)}\n[cut at ${MAX_RESULT_CHARS} characters; ask for a smaller range]`;
}

/** Runs one command the same way the shell tool does, for the harness's own checks. */
export async function runCommand(root: string, command: string, timeoutSeconds: number): Promise<{ ok: boolean; output: string }> {
  const box = new ToolBox({ root, lane: { owns: [], generated: [], requests: null }, shell: { enabled: true, timeoutSeconds } });
  const result = await box.run({ type: 'tool_use', id: 'harness', name: 'shell', input: { command } } as ToolUse);
  const output = typeof result.content === 'string' ? result.content : '';
  return { ok: output.startsWith('Exit code 0.'), output };
}

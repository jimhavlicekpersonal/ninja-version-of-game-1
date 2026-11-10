/**
 * The new game's repository: a copy of the template snapshot in its own folder with its own git
 * history, plus the game bible. The template is only read. Rebuilding in place means starting from
 * every working system, test and tool the template has, not from an empty folder.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { FACTORY_ROOT, type Config } from '../config.js';
import { FactoryError } from '../llm.js';
import type { RunStore } from '../runStore.js';
import type { Snapshot } from '../template/snapshot.js';

export const FACTORY_BLOCK_START = '<!-- factory:start -->';
export const FACTORY_BLOCK_END = '<!-- factory:end -->';

/** Removes every `<!-- factory:start -->` ... `<!-- factory:end -->` block, and the blank line it leaves. */
export function stripFactoryBlocks(text: string): string {
  let out = text;
  for (;;) {
    const start = out.indexOf(FACTORY_BLOCK_START);
    const end = out.indexOf(FACTORY_BLOCK_END, start);
    if (start < 0 || end < 0) return out;
    const rest = out.slice(end + FACTORY_BLOCK_END.length).replace(/^\n+/, '');
    out = out.slice(0, start).replace(/\n+$/, '\n') + (rest ? `\n${rest}` : '');
  }
}

export const git = (cwd: string, args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

/** Uses the owner's git identity when there is one; a neutral one otherwise (CI). */
function identity(cwd: string): string[] {
  try {
    if (git(cwd, ['config', 'user.email']).trim()) return [];
  } catch {
    /* not configured */
  }
  return ['-c', 'user.name=Game Factory', '-c', 'user.email=game-factory@users.noreply.github.com'];
}

export function commitAll(cwd: string, message: string): string | null {
  git(cwd, ['add', '-A']);
  if (!git(cwd, ['status', '--porcelain']).trim()) return null;
  git(cwd, [...identity(cwd), 'commit', '--quiet', '-m', message]);
  return git(cwd, ['rev-parse', 'HEAD']).trim();
}

/** Files that differ from the last commit, tracked or new. */
export function changedFiles(cwd: string): Array<{ path: string; untracked: boolean }> {
  const out: Array<{ path: string; untracked: boolean }> = [];
  const entries = git(cwd, ['status', '--porcelain', '-z', '--untracked-files=all']).split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const code = entry.slice(0, 2);
    out.push({ path: entry.slice(3).split('\\').join('/'), untracked: code === '??' });
    if (code[0] === 'R' || code[0] === 'C') i++; // the next entry is the path it was renamed from
  }
  return out;
}

export function materialize(store: RunStore, config: Config, snapshot: Snapshot): string {
  const game = store.state.game;
  if (!game) throw new FactoryError('The run has no game name yet (the brand stage has not finished).');
  const dir = resolve(FACTORY_ROOT, config.build.outputDir, game.slug);

  // Carrying on: the folder is this run's game (also when it was restored on another machine, as CI does).
  const marker = join(dir, 'docs', 'factory', 'README.md');
  if (existsSync(join(dir, '.git')) && existsSync(marker) && readFileSync(marker, 'utf8').includes(`run ${store.state.id})`)) {
    store.state.build.dir = dir;
    store.save();
    return dir;
  }
  if (existsSync(dir) && readdirSync(dir).length) {
    throw new FactoryError(`${dir} already exists and does not belong to this run. Move it away, or change the slug in the brand record, then build again.`);
  }

  store.log(`copying the template (${snapshot.files.length} files) to ${dir}`);
  for (const file of snapshot.files) {
    const to = join(dir, file);
    mkdirSync(dirname(to), { recursive: true });
    if (file.endsWith('.md')) {
      // The template's documents may point at the factory between these markers; a new game has no factory.
      const text = readFileSync(join(snapshot.root, file), 'utf8');
      if (text.includes(FACTORY_BLOCK_START)) {
        writeFileSync(to, stripFactoryBlocks(text));
        continue;
      }
    }
    cpSync(join(snapshot.root, file), to);
  }

  const docs = join(dir, 'docs', 'factory');
  mkdirSync(docs, { recursive: true });
  for (const name of ['GAME_BIBLE.md', 'ID_MAP.md', 'id-map.json', 'BUILD_PLAN.md', 'OWNER_TASKS.md', 'STORE_LISTING.md', 'decisions.json']) {
    if (store.exists('skeleton', name)) cpSync(store.path('skeleton', name), join(docs, name));
  }
  writeFileSync(
    join(docs, 'README.md'),
    [
      `# ${game.name}: where this game came from`,
      '',
      `Rebuilt in place by the game factory (run ${store.state.id}) from the template ${snapshot.source} at commit ${snapshot.sha}${store.state.template && store.state.template.sha !== snapshot.sha ? ` (designed against commit ${store.state.template.sha})` : ''}.`,
      '',
      '- `GAME_BIBLE.md`: every design decision, by stage. Change the bible first, then the game.',
      '- `ID_MAP.md`: internal id to player-facing name. Internal ids never change.',
      '- `BUILD_PLAN.md`: the work orders the build ran.',
      '- `OWNER_TASKS.md`: what only the owner can do before a release.',
      '- `BUILD_REPORT.md` and `CLOSURE.md` (written by the build): what was done, what was checked, what was not.',
      '',
    ].join('\n'),
  );

  git(dir, ['init', '--quiet', '--initial-branch=main']);
  commitAll(dir, `Template snapshot ${snapshot.sha.slice(0, 12)} and the ${game.name} game bible`);
  store.state.build.dir = dir;
  store.save();
  return dir;
}

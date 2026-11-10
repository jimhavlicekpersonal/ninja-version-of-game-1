/**
 * The template slot. A snapshot is "the game to mimic, as of now": a folder, the commit it is at and
 * the list of its files. By default it is this repository's working tree, so pushing a new version of
 * the game is all it takes; `template.git` / `template.ref` in factory.config.json pin another repo
 * or an older version instead.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FACTORY_ROOT, type Config } from '../config.js';
import { matchesAny, toPosix } from './glob.js';

export interface Snapshot {
  /** Folder the files are read from. */
  root: string;
  /** Commit of the template (or `untracked` when the folder is not a git repository). */
  sha: string;
  /** True when the folder has changes that are not committed. */
  dirty: boolean;
  /** Changes with the template's content; names the blueprint cache. */
  key: string;
  /** Tracked files, excludes applied, forward slashes, sorted. */
  files: string[];
  /** Where it came from, for the run log. */
  source: string;
}

const git = (cwd: string, args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

function walk(root: string, dir = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    if (name === '.git' || name === 'node_modules') continue;
    const rel = dir ? `${dir}/${name}` : name;
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(root, rel));
    else out.push(rel);
  }
  return out;
}

/** Clones (or refreshes) `url` into the factory's cache and checks out `ref`. */
function checkout(url: string, ref: string | null): string {
  const dir = join(FACTORY_ROOT, '.cache', 'template', createHash('sha256').update(url).digest('hex').slice(0, 12));
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dir, { recursive: true });
    git(FACTORY_ROOT, ['clone', '--quiet', url, dir]);
  } else {
    git(dir, ['fetch', '--quiet', '--tags', 'origin']);
  }
  if (ref) {
    // A branch name means its newest commit on the remote; a tag or commit means itself.
    let target = ref;
    try {
      target = git(dir, ['rev-parse', '--verify', '--quiet', `origin/${ref}`]).trim();
    } catch {
      /* not a remote branch: a tag or a commit */
    }
    git(dir, ['checkout', '--quiet', '--detach', target]);
  } else {
    git(dir, ['checkout', '--quiet', '--detach', 'origin/HEAD']);
  }
  return dir;
}

export function takeSnapshot(config: Config): Snapshot {
  const t = config.template;
  const local = resolve(FACTORY_ROOT, t.path);
  // A pinned ref of the local repository is checked out beside it, so the working tree is never touched.
  const root = t.git ? checkout(t.git, t.ref) : t.ref ? checkout(local, t.ref) : local;
  const source = t.git ? `${t.git}${t.ref ? ` @ ${t.ref}` : ''}` : t.ref ? `${local} @ ${t.ref}` : `${local} (as it is now)`;

  let sha = 'untracked';
  let dirty = false;
  let key: string;
  let files: string[];
  if (existsSync(join(root, '.git'))) {
    sha = git(root, ['rev-parse', 'HEAD']).trim();
    files = git(root, ['ls-files', '-z']).split('\0').filter(Boolean).map(toPosix);
    const changed = git(root, ['status', '--porcelain', '-z'])
      .split('\0')
      .filter(Boolean)
      .map((line) => toPosix(line.slice(3)))
      .filter((p) => !matchesAny(p, t.exclude));
    dirty = changed.length > 0;
    key = dirty ? createHash('sha256').update(sha).update(git(root, ['diff', 'HEAD'])).update(changed.join('\n')).digest('hex').slice(0, 40) : sha;
  } else {
    files = walk(root);
    key = createHash('sha256').update(files.map((f) => `${f}:${statSync(join(root, f)).size}:${statSync(join(root, f)).mtimeMs}`).join('\n')).digest('hex').slice(0, 40);
  }
  files = files.filter((f) => !matchesAny(f, t.exclude) && existsSync(join(root, f))).sort();
  return { root, sha, dirty, key, files, source };
}

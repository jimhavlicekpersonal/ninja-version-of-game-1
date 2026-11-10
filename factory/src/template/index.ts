/**
 * What can be known about the template without asking Claude: its tree, scripts, briefs, the
 * catalogue of player-facing names and the languages it ships. Also loads the files the config lists
 * for each stage. Nothing here knows about ninjas: it reads whatever the template slot holds.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Config, StageId } from '../config.js';
import { FactoryError } from '../llm.js';
import { globToRegExp } from './glob.js';
import type { Snapshot } from './snapshot.js';

/** One thing the player sees a name for (a building, a warrior, a currency, a league...). */
export interface Entity {
  /** Its key in the template's name catalogue, e.g. `troops.hedgehog_roller.name`. */
  key: string;
  /** The name the template shows today. */
  name: string;
  /** The template's description of it, when the catalogue has one. */
  about: string | null;
}

export interface TemplateIndex {
  snapshot: Snapshot;
  tree: Array<{ dir: string; files: number; kb: number }>;
  scripts: Record<string, string>;
  briefs: string[];
  entities: Entity[];
  languages: Array<{ code: string; name: string; wave: number | null }>;
}

export interface LoadedFile {
  path: string;
  text: string;
}

/** Above this, a stage's files are refused instead of silently cut (the owner trims the list). */
const MAX_STAGE_CONTEXT_BYTES = 1_500_000;

const read = (snapshot: Snapshot, path: string): string => readFileSync(join(snapshot.root, path), 'utf8');

function readJson<T>(snapshot: Snapshot, path: string): T | null {
  if (!existsSync(join(snapshot.root, path))) return null;
  try {
    return JSON.parse(read(snapshot, path)) as T;
  } catch {
    return null;
  }
}

export function indexTemplate(snapshot: Snapshot, config: Config): TemplateIndex {
  const groups = new Map<string, { files: number; bytes: number }>();
  for (const f of snapshot.files) {
    const parts = f.split('/');
    const dir = parts.length === 1 ? '(root)' : parts.slice(0, Math.min(2, parts.length - 1)).join('/');
    const g = groups.get(dir) ?? { files: 0, bytes: 0 };
    g.files++;
    g.bytes += statSync(join(snapshot.root, f)).size;
    groups.set(dir, g);
  }
  const tree = [...groups].map(([dir, g]) => ({ dir, files: g.files, kb: Math.round(g.bytes / 1024) })).sort((a, b) => a.dir.localeCompare(b.dir));

  const pkg = readJson<{ scripts?: Record<string, string> }>(snapshot, 'package.json');
  const briefs = snapshot.files.filter((f) => /(^|\/)(CLAUDE|AGENTS)\.md$/.test(f));

  const entities: Entity[] = [];
  const surface = config.template.nameSurface;
  if (surface) {
    const catalogue = readJson<Record<string, unknown>>(snapshot, surface.file);
    if (catalogue) {
      const pattern = new RegExp(surface.entityPattern);
      for (const [key, value] of Object.entries(catalogue)) {
        if (typeof value !== 'string' || !pattern.test(key)) continue;
        const about = catalogue[key.replace(/\.name$/, '.description')];
        entities.push({ key, name: value, about: typeof about === 'string' && about !== value ? about : null });
      }
    }
  }

  const langs = readJson<{ languages?: Array<{ code: string; name: string; wave?: number }> }>(snapshot, 'locales/languages.json');
  const languages = (langs?.languages ?? []).map((l) => ({ code: l.code, name: l.name, wave: typeof l.wave === 'number' ? l.wave : null }));

  return { snapshot, tree, scripts: pkg?.scripts ?? {}, briefs, entities, languages };
}

/** The facts above as text for a prompt. */
export function renderIndex(index: TemplateIndex): string {
  const s = index.snapshot;
  const lines = [
    `Template source: ${s.source}`,
    `Commit: ${s.sha}${s.dirty ? ' (with uncommitted changes)' : ''}`,
    `Files: ${s.files.length}`,
    '',
    'Folders (files, kB):',
    ...index.tree.map((t) => `- ${t.dir}: ${t.files} files, ${t.kb} kB`),
    '',
    'Briefs written for AI sessions:',
    ...index.briefs.map((b) => `- ${b}`),
    '',
    'npm scripts:',
    ...Object.entries(index.scripts).map(([k, v]) => `- ${k}: ${v}`),
  ];
  if (index.languages.length) {
    lines.push('', `Languages in the template (${index.languages.length}): ${index.languages.map((l) => `${l.code}${l.wave === null ? '' : ` (wave ${l.wave})`}`).join(', ')}`);
  }
  if (index.entities.length) lines.push('', `Player-facing named things in the catalogue: ${index.entities.length}`);
  return lines.join('\n');
}

/** Files matching `globs`, in the order the globs list them. Missing ones are reported, never invented. */
export function loadFiles(index: TemplateIndex, globs: readonly string[]): { files: LoadedFile[]; missing: string[] } {
  const seen = new Set<string>();
  const files: LoadedFile[] = [];
  const missing: string[] = [];
  let bytes = 0;
  for (const glob of globs) {
    const re = globToRegExp(glob);
    const hits = index.snapshot.files.filter((f) => re.test(f));
    if (!hits.length) missing.push(glob);
    for (const path of hits) {
      if (seen.has(path)) continue;
      seen.add(path);
      const text = read(index.snapshot, path);
      bytes += Buffer.byteLength(text);
      files.push({ path, text });
    }
  }
  if (bytes > MAX_STAGE_CONTEXT_BYTES) {
    throw new FactoryError(
      `The files listed for one stage add up to ${Math.round(bytes / 1024)} kB (limit ${MAX_STAGE_CONTEXT_BYTES / 1000} kB). ` +
        `Shorten the list in factory.config.json (template.shared / template.stages); nothing is cut silently. Largest: ` +
        files
          .map((f) => ({ path: f.path, kb: Math.round(Buffer.byteLength(f.text) / 1024) }))
          .sort((a, b) => b.kb - a.kb)
          .slice(0, 5)
          .map((f) => `${f.path} (${f.kb} kB)`)
          .join(', '),
    );
  }
  return { files, missing };
}

export function renderFiles(files: readonly LoadedFile[]): string {
  return files.map((f) => `<file path="${f.path}">\n${f.text}\n</file>`).join('\n\n');
}

export const stageGlobs = (config: Config, stage: StageId): string[] => config.template.stages[stage] ?? [];

/**
 * Import cycles (quality 22/23). A value-level cycle works only while no module reads another's
 * top-level binding during load; a type-only cycle is harmless at run time but usually means a type
 * lives in the wrong file. `src/` has none of either, apart from the allow-list below, and this test
 * fails on a new one. `server/` is checked too, with its known cycle listed; the frozen rules archives
 * (`server/rules/v*`, verbatim snapshots that are never edited) are left out.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = normalize(join(__dirname, '..', '..'));

/** Known cycles, as their sorted member files joined by ' ↔ '. Shrink this list; never grow it without a reason. */
const ALLOWED = new Set([
  // Backend (type-only): the connection hands its grove adapter types back and forth.
  'src/backend/net/connection.ts ↔ src/backend/social/groveSource.ts',
  // Server (value): PvP settlement and the held-village replayer call each other inside functions only.
  'server/core/pvp.ts ↔ server/core/village.ts',
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return /^server[\\/]rules$/.test(relative(ROOT, p)) ? [] : walk(p);
    return /\.(?:ts|js|mjs)$/.test(name) ? [p] : [];
  });
}

const rel = (abs: string) => relative(ROOT, abs).split('\\').join('/');

function resolve(fromAbs: string, spec: string): string | null {
  const base = normalize(join(dirname(fromAbs), spec.replace(/\?.*$/, '')));
  for (const cand of [base, `${base}.ts`, `${base}.js`, `${base}.mjs`, join(base, 'index.ts')]) {
    try {
      if (statSync(cand).isFile()) return cand;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Static `import`/`export … from` edges (dynamic `import()` is a lazy edge and never a load-time cycle). */
const EDGE = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[^'";]*?\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g;

function graph(files: string[]): Map<string, string[]> {
  const g = new Map<string, string[]>();
  for (const f of files) {
    const out: string[] = [];
    for (const m of readFileSync(f, 'utf8').matchAll(EDGE)) {
      const t = resolve(f, m[1]);
      if (t) out.push(t);
    }
    g.set(f, out);
  }
  return g;
}

/** Strongly connected components with more than one file (Tarjan). */
function cycles(g: Map<string, string[]>): string[] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const found: string[] = [];
  const visit = (v: string): void => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of g.get(v) ?? []) {
      if (!g.has(w)) continue;
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(rel(w));
      } while (w !== v);
      if (scc.length > 1) found.push(scc.sort().join(' ↔ '));
    }
  };
  for (const v of g.keys()) if (!idx.has(v)) visit(v);
  return found.sort();
}

describe('import cycles', () => {
  const found = cycles(graph(['src', 'server'].flatMap((p) => walk(join(ROOT, p)))));

  it('src/ and server/ have no import cycle outside the allow-list (type-only imports included)', () => {
    expect(found.filter((c) => !ALLOWED.has(c))).toEqual([]);
  });

  it('the allow-list has no stale entry', () => {
    expect([...ALLOWED].filter((c) => !found.includes(c))).toEqual([]);
  });
});

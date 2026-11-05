/**
 * Compartment boundaries (compartments.json). Each compartment is owned by a
 * separate AI session; this test fails the build when one reaches into
 * another's internals instead of going through a declared contract file.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Compartment {
  paths: string[];
  mayImport: string[];
  contracts: string[] | '*';
}

const ROOT = normalize(join(__dirname, '..', '..'));
const config = JSON.parse(readFileSync(join(ROOT, 'compartments.json'), 'utf8')) as { compartments: Record<string, Compartment> };
const compartments = Object.entries(config.compartments);

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(?:ts|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (abs: string) => relative(ROOT, abs).split('\\').join('/');

function owner(file: string): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const [id, c] of compartments) {
    for (const p of c.paths) {
      if ((file === p || file.startsWith(p + '/')) && p.length > bestLen) {
        best = id;
        bestLen = p.length;
      }
    }
  }
  return best;
}

function resolveImport(fromAbs: string, spec: string): string | null {
  const base = normalize(join(dirname(fromAbs), spec.replace(/\?.*$/, '')));
  for (const cand of [base, `${base}.ts`, `${base}.js`, `${base}.mjs`, join(base, 'index.ts')]) {
    try {
      if (statSync(cand).isFile()) return rel(cand);
    } catch {
      /* try next */
    }
  }
  return null;
}

const IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const sources = ['src', 'server', 'locales', 'tools/i18n'].flatMap((p) => walk(join(ROOT, p)));

describe('compartment boundaries', () => {
  it('every source file belongs to exactly one compartment', () => {
    const orphans = sources.map(rel).filter((f) => !owner(f));
    expect(orphans).toEqual([]);
  });

  it('cross-compartment imports only target allowed compartments and their contract files', () => {
    const violations: string[] = [];
    for (const abs of sources) {
      const from = rel(abs);
      const fromId = owner(from)!;
      const fromC = config.compartments[fromId];
      const text = readFileSync(abs, 'utf8');
      for (const m of text.matchAll(IMPORT)) {
        const target = resolveImport(abs, m[1]);
        if (!target) continue;
        const toId = owner(target);
        if (!toId || toId === fromId || fromC.mayImport.includes('*')) continue;
        const toC = config.compartments[toId];
        if (!fromC.mayImport.includes(toId)) {
          violations.push(`${from} -> ${target} (${fromId} may not import ${toId})`);
          continue;
        }
        if (toC.contracts !== '*' && !toC.contracts.some((p) => target === p || target.startsWith(p + '/'))) {
          violations.push(`${from} -> ${target} (not a contract file of ${toId})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('the pure game rules never reach presentation or backend', () => {
    const c = config.compartments.gameplay;
    expect(c.mayImport).toEqual(['gameplay']);
  });
});

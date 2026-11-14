/**
 * The storage port split into per-store files (quality Q16, 2026-11-14 code-debt batch): both adapters are
 * composed from their store classes, offer the same methods, and every method of the `Repo` interface
 * (read from server/stores/ports.ts by the TypeScript compiler) exists on both at run time.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { composeStores } from '../../../server/stores/compose';
import { MemoryRepo } from '../../../server/repo';
import { PgRepo } from '../../../server/pgRepo';

const methods = (proto: object) => new Set(Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor'));

function portMethods(): string[] {
  const file = 'server/stores/ports.ts';
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  for (const s of sf.statements) if (ts.isInterfaceDeclaration(s)) for (const m of s.members) if (m.name && ts.isIdentifier(m.name)) out.push(m.name.text);
  return out;
}

describe('per-store repo modules', () => {
  it('every Repo method exists on both adapters', () => {
    const names = portMethods();
    expect(names.length).toBeGreaterThan(150);
    for (const n of names) {
      expect(typeof (MemoryRepo.prototype as unknown as Record<string, unknown>)[n], `MemoryRepo.${n}`).toBe('function');
      expect(typeof (PgRepo.prototype as unknown as Record<string, unknown>)[n], `PgRepo.${n}`).toBe('function');
    }
  });

  it('both adapters offer the same port methods', () => {
    const port = new Set(portMethods());
    const mem = [...methods(MemoryRepo.prototype)].filter((n) => port.has(n)).sort();
    const pg = [...methods(PgRepo.prototype)].filter((n) => port.has(n)).sort();
    expect(mem).toEqual(pg);
  });

  it('refuses a method two stores both define', () => {
    class A {
      x() {}
    }
    class B {
      x() {}
    }
    class Target {}
    expect(() => composeStores(Target, [A, B])).toThrow(/x is defined by more than one store/);
  });
});

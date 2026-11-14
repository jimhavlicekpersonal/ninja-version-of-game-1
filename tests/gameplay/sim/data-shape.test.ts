/**
 * Every data file matches its TypeScript type (quality 34). `sim/data.ts` casts the JSON
 * (`as unknown as GameData[...]`), so the compiler never compares the two: a field added to a JSON
 * file but not to `types.ts`, a misspelt key, a string where a number belongs or a value outside a
 * literal union would load silently. This test reads `GameData` with the TypeScript compiler and walks
 * each file against it, so the check costs nothing at run time. `$…` keys (`$comment`) are
 * documentation and allowed anywhere.
 */
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { defaultData } from '../../../src/gameplay/sim/data';

const TYPES = join(__dirname, '../../../src/gameplay/sim/types.ts');
const program = ts.createProgram([TYPES], { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, resolveJsonModule: true, noEmit: true, skipLibCheck: true });
const checker = program.getTypeChecker();
const source = program.getSourceFile(TYPES)!;
const gameData = (() => {
  let found: ts.Type | null = null;
  ts.forEachChild(source, (n) => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === 'GameData') found = checker.getTypeAtLocation(n);
  });
  if (!found) throw new Error('GameData not found in sim/types.ts');
  return found as ts.Type;
})();

/** `$comment`, `$troopCutsComment` and the like: notes for people, never read by the game. */
const isComment = (k: string) => k.startsWith('$');

/** Problems found matching `value` against `type` at `path` (empty when it matches). */
function check(value: unknown, type: ts.Type, path: string, out: string[]): void {
  const f = type.flags;
  if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return;
  if (type.isUnion()) {
    // Optional fields carry `undefined` in the union; JSON has no undefined, so try the other members.
    const members = type.types.filter((t) => !(t.flags & ts.TypeFlags.Undefined));
    for (const m of members) {
      const sub: string[] = [];
      check(value, m, path, sub);
      if (!sub.length) return;
    }
    // Report the closest member's problems when every member is an object type (a discriminated union).
    if (members.length === 1) return check(value, members[0], path, out);
    out.push(`${path}: ${JSON.stringify(value)?.slice(0, 60)} matches none of ${checker.typeToString(type)}`);
    return;
  }
  if (type.isStringLiteral()) {
    if (value !== type.value) out.push(`${path}: expected "${type.value}", got ${JSON.stringify(value)}`);
    return;
  }
  if (type.isNumberLiteral()) {
    if (value !== type.value) out.push(`${path}: expected ${type.value}, got ${JSON.stringify(value)}`);
    return;
  }
  if (f & ts.TypeFlags.BooleanLiteral) {
    if (value !== (checker.typeToString(type) === 'true')) out.push(`${path}: expected ${checker.typeToString(type)}`);
    return;
  }
  if (f & ts.TypeFlags.StringLike) return void (typeof value !== 'string' && out.push(`${path}: expected a string, got ${JSON.stringify(value)}`));
  if (f & ts.TypeFlags.NumberLike) return void (typeof value !== 'number' && out.push(`${path}: expected a number, got ${JSON.stringify(value)}`));
  if (f & ts.TypeFlags.BooleanLike) return void (typeof value !== 'boolean' && out.push(`${path}: expected a boolean, got ${JSON.stringify(value)}`));
  if (f & ts.TypeFlags.Null) return void (value !== null && out.push(`${path}: expected null`));
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    if (!Array.isArray(value)) return void out.push(`${path}: expected an array`);
    const args = checker.getTypeArguments(type as ts.TypeReference);
    value.forEach((v, i) => check(v, checker.isTupleType(type) ? args[i] ?? args[args.length - 1] : args[0], `${path}[${i}]`, out));
    return;
  }
  if (f & ts.TypeFlags.Object || type.isIntersection()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return void out.push(`${path}: expected an object, got ${JSON.stringify(value)?.slice(0, 60)}`);
    const obj = value as Record<string, unknown>;
    const props = checker.getPropertiesOfType(type);
    const index = checker.getIndexInfoOfType(type, ts.IndexKind.String);
    const known = new Set(props.map((p) => p.name));
    for (const p of props) {
      const optional = (p.flags & ts.SymbolFlags.Optional) !== 0;
      if (!(p.name in obj)) {
        if (!optional) out.push(`${path}.${p.name}: missing`);
        continue;
      }
      check(obj[p.name], checker.getTypeOfSymbol(p), `${path}.${p.name}`, out);
    }
    for (const [k, v] of Object.entries(obj)) {
      if (known.has(k) || isComment(k)) continue;
      if (index) check(v, index.type, `${path}.${k}`, out);
      else out.push(`${path}.${k}: not in the TypeScript type`);
    }
    return;
  }
  out.push(`${path}: unhandled type ${checker.typeToString(type)}`);
}

describe('data files match their TypeScript types', () => {
  for (const prop of checker.getPropertiesOfType(gameData)) {
    it(`${prop.name}.json`, () => {
      const out: string[] = [];
      const value = (defaultData as unknown as Record<string, unknown>)[prop.name];
      // An optional section the shipped data leaves out (`features`, content batch 2026-11-14) has no file.
      if (value === undefined && (prop.flags & ts.SymbolFlags.Optional) !== 0) return;
      check(value, checker.getTypeOfSymbol(prop), prop.name, out);
      expect(out.slice(0, 40)).toEqual([]);
    });
  }

  it('the checker itself catches a wrong type, a missing field and an unknown key', () => {
    const troops = structuredClone(defaultData.troops) as unknown as Record<string, Record<string, unknown>>;
    const [first, second, third] = Object.keys(troops);
    troops[first].housing = 'three';
    delete troops[second].housing;
    troops[third].housingg = 3;
    const prop = checker.getPropertiesOfType(gameData).find((p) => p.name === 'troops')!;
    const out: string[] = [];
    check(troops, checker.getTypeOfSymbol(prop), 'troops', out);
    expect(out).toEqual([
      `troops.${first}.housing: expected a number, got "three"`,
      `troops.${second}.housing: missing`,
      `troops.${third}.housingg: not in the TypeScript type`,
    ]);
  });
});

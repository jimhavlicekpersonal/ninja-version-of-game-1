/** Beast Mode 2026-11-21 OPS-01 / SAV-08: version identity and the bump guards. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentVersions, semverGreater, versionProblems } from '../../tools/release/check-version.mjs';
import { ClientHeaders, PROTOCOL_VERSION, Routes } from '../../src/backend/net/protocol';
import { defaultData } from '../../src/gameplay/sim/data';
import { SAVE_VERSION } from '../../src/gameplay/sim/save';
import { createNewVillage } from '../../src/gameplay/sim/village';

const root = resolve(__dirname, '../..');
const last = JSON.parse(readFileSync(resolve(root, 'tools/release/last-release.json'), 'utf8'));

describe('OPS-01: the version-bump guard', () => {
  it('this checkout passes against tools/release/last-release.json', () => {
    expect(versionProblems(currentVersions(root), last)).toEqual([]);
  });

  it('a SAVE_VERSION change since the last release needs a greater package version', () => {
    const now = currentVersions(root);
    expect(versionProblems(now, { ...last, save: now.save - 1 })[0]).toMatch(/save .* changed since the last release/);
    expect(versionProblems({ ...now, version: '0.2.0' }, { ...last, save: now.save - 1 })).toEqual([]);
    expect(versionProblems(now, { ...last, migrations: now.migrations - 1 })).toHaveLength(1);
    expect(semverGreater('0.10.0', '0.9.9')).toBe(true);
    expect(semverGreater('1.0.0', '1.0.0')).toBe(false);
  });

  it('every shipping workflow runs the guard', () => {
    for (const wf of ['deploy.yml', 'android.yml', 'ios-testflight.yml']) expect(readFileSync(resolve(root, `.github/workflows/${wf}`), 'utf8')).toMatch(/node tools\/release\/check-version\.mjs/);
  });
});

/** A recursive key-path fingerprint of a value's shape (keys and value types, not values). */
function shape(v: unknown, path = ''): string[] {
  if (Array.isArray(v)) return [`${path}[]`, ...(v.length ? shape(v[0], `${path}[]`) : [])];
  if (v && typeof v === 'object') return Object.keys(v).sort().flatMap((k) => [`${path}.${k}`, ...shape((v as Record<string, unknown>)[k], `${path}.${k}`)]);
  return [`${path}:${typeof v}`];
}
const fp = (lines: string[]) => createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);

describe('SAV-08: shape fingerprints next to the versions', () => {
  it('the stored village shape (a new village and the Keep 15 fixture): bump SAVE_VERSION + add a migration step when this changes', () => {
    const fixture = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/saves/v24-keep15.json'), 'utf8')).village;
    const keys = [...new Set([...shape(createNewVillage(Date.UTC(2026, 0, 1), defaultData)), ...shape(fixture)].map((l) => l.replace(/:\w+$/, '')))].sort();
    expect({ save: SAVE_VERSION, shape: fp(keys) }).toEqual({ save: 24, shape: SAVE_SHAPE });
  });

  it('the protocol surface (routes, client headers): bump PROTOCOL_VERSION (or note an additive change) when this changes', () => {
    const surface = [...Object.values(Routes).map(String).sort(), ...Object.values(ClientHeaders).map(String).sort()];
    expect({ protocol: PROTOCOL_VERSION, surface: fp(surface) }).toEqual({ protocol: 11, surface: PROTOCOL_SURFACE });
  });
});

// Update these only together with SAVE_VERSION / PROTOCOL_VERSION (or, for an additive protocol change, with a line
// in docs/PROTOCOL.md saying why no bump is needed).
const SAVE_SHAPE = '24261ac431099439';
const PROTOCOL_SURFACE = 'e827e4c20185cca6';

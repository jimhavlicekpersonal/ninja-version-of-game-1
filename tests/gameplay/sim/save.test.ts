import { describe, expect, it } from 'vitest';
import { decodeExportCode, deserialize, encodeExportCode, serialize, SAVE_VERSION } from '../../../src/gameplay/sim/save';
import { data, newGame, must } from './helpers';

describe('save and load', () => {
  it('round-trips a village exactly', () => {
    const { state, clock } = newGame();
    const s = must(state, { type: 'place', buildingType: 'acorn_orchard', x: 5, y: 5 }, clock.now());
    const file = serialize(s, clock.now());
    expect(file.version).toBe(SAVE_VERSION);
    const back = deserialize(JSON.parse(JSON.stringify(file)), data);
    expect(back).toEqual({ ...s, lastSeenAt: clock.now() });
  });

  it('rejects saves with overlapping or unknown buildings', () => {
    const { state, clock } = newGame();
    const file = serialize(state, clock.now());
    const bad = structuredClone(file);
    bad.village.buildings[1].x = bad.village.buildings[0].x;
    bad.village.buildings[1].y = bad.village.buildings[0].y;
    expect(() => deserialize(bad, data)).toThrow();
    const bad2 = structuredClone(file);
    bad2.village.buildings[0].type = 'castle';
    expect(() => deserialize(bad2, data)).toThrow();
  });

  it('export codes round-trip and detect typos', () => {
    const { state, clock } = newGame();
    const code = encodeExportCode(serialize(state, clock.now()));
    expect(code.startsWith('TK1.')).toBe(true);
    expect(deserialize(decodeExportCode(code), data).buildings).toEqual(state.buildings);
    const broken = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
    expect(() => decodeExportCode(broken)).toThrow();
    expect(() => decodeExportCode('hello')).toThrow();
  });
});

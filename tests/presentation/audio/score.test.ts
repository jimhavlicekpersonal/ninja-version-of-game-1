/**
 * The written music (`audio/score.ts`): every bar adds up, every note is on the scale, the
 * battle has a part at every intensity, and the string cache holds every pitch at once.
 */
import { describe, expect, it } from 'vitest';
import { prepare, stringPitches } from '../../../src/presentation/audio/music';
import { CHORDS, CODAS, STEPS_PER_BAR, TRACKS, parseLine, type TrackName } from '../../../src/presentation/audio/score';
import { SFX_STRINGS, STRING_CACHE_MAX } from '../../../src/presentation/audio/voices';

const NAMES = Object.keys(TRACKS) as TrackName[];
/** The in scale on E rising through D (in-sen): E F A B C D. */
const SCALE = new Set([4, 5, 9, 11, 0, 2]);
const pc = (m: number) => ((m % 12) + 12) % 12;

describe('score', () => {
  it('parses melodies: eighths, lengths, rests, articulations, and refuses a bar that does not add up', () => {
    const [bar] = parseLine('E5*2 F5^ . B4~*3 A4');
    expect(bar.map((e) => [e.step, e.len, e.midi, e.bend, e.fall])).toEqual([
      [0, 4, 76, false, false],
      [4, 2, 77, true, false],
      [8, 6, 71, false, true],
      [14, 2, 69, false, false],
    ]);
    expect(() => parseLine('E5*3 F5')).toThrow(/4 eighths/);
  });

  it('every track parses: sections exist, bars fill, chords are known, patterns are whole bars', () => {
    for (const name of NAMES) expect(prepare(name).length).toBe(TRACKS[name].form.length);
  });

  it('every note and chord is on the scale (no stray Western leading tones)', () => {
    for (const chord of Object.values(CHORDS)) for (const m of chord) expect(SCALE.has(pc(m)), `chord note ${m}`).toBe(true);
    for (const name of NAMES) {
      for (const s of prepare(name)) {
        for (const p of s.parts) for (const bar of p.notes ?? []) for (const e of bar) expect(SCALE.has(pc(e.midi + (p.shift ?? 0))), `${name} ${p.inst} ${e.midi}`).toBe(true);
      }
    }
    for (const coda of Object.values(CODAS)) for (const n of coda) if (n.inst !== 'odaiko') for (const m of n.notes) expect(SCALE.has(pc(m))).toBe(true);
    for (const [m] of stringPitches()) expect(SCALE.has(pc(m)), `string ${m}`).toBe(true);
  });

  it('tracks run long enough before they repeat', () => {
    const seconds = (name: TrackName) => (prepare(name).reduce((n, s) => n + s.bars, 0) * STEPS_PER_BAR * 60) / TRACKS[name].bpm / 4;
    expect(seconds('village')).toBeGreaterThan(90);
    expect(seconds('battle')).toBeGreaterThan(40);
    expect(seconds('trial')).toBeGreaterThan(40);
  });

  it('battle tracks have something to play at every intensity in every section; the village plays at 0', () => {
    for (const name of ['battle', 'trial'] as const) {
      for (const s of prepare(name)) {
        for (let level = 0; level <= 3; level++) expect(s.parts.some((p) => level >= (p.min ?? 0) && level <= (p.max ?? 9))).toBe(true);
        // Melody comes in when the battle starts, not while scouting.
        expect(s.parts.filter((p) => p.notes).every((p) => (p.min ?? 0) >= 1)).toBe(true);
      }
    }
    for (const s of prepare('village')) expect(s.parts.every((p) => (p.min ?? 0) === 0)).toBe(true);
  });

  it('the string cache holds every pitch the music and the effects pluck, so it never clears mid-song', () => {
    const all = new Set([...SFX_STRINGS, ...stringPitches()].map(([m, v]) => `${v}:${m}`));
    expect(all.size).toBeLessThanOrEqual(STRING_CACHE_MAX);
  });
});

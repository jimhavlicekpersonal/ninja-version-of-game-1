/** Age bands (re-audit: minors online): only ever stricter, under18 follows the band. */
import { describe, expect, it } from 'vitest';
import { ageBandFromBirth, bandChangeAllowed, birthYearNeedsMonth, stricterBand } from '../../../src/gameplay/sim/age';
import { applyCommand } from '../../../src/gameplay/sim/village';
import { data, newGame } from './helpers';

const today = { year: 2026, month: 11 };

describe('age bands', () => {
  it('reads a birth year conservatively: a boundary year without a month gives the stricter band', () => {
    expect(ageBandFromBirth(2020, null, today)).toBe('under13');
    expect(ageBandFromBirth(2013, null, today)).toBe('under13'); // 12 or 13
    expect(ageBandFromBirth(2013, 3, today)).toBe('13to17'); // birthday in March: 13
    expect(ageBandFromBirth(2013, 11, today)).toBe('under13'); // this month: not surely yet
    expect(ageBandFromBirth(2008, null, today)).toBe('13to17'); // 17 or 18
    expect(ageBandFromBirth(2008, 1, today)).toBe('adult');
    expect(ageBandFromBirth(1990, null, today)).toBe('adult');
    expect(birthYearNeedsMonth(2013, today)).toBe(true);
    expect(birthYearNeedsMonth(2008, today)).toBe(true);
    expect(birthYearNeedsMonth(2000, today)).toBe(false);
  });

  it('allows only the same or a stricter band', () => {
    expect(bandChangeAllowed(null, null, 'adult')).toBe(true);
    expect(bandChangeAllowed(null, true, 'adult')).toBe(false); // said "under 18" before bands
    expect(bandChangeAllowed('13to17', true, 'under13')).toBe(true);
    expect(bandChangeAllowed('13to17', true, 'adult')).toBe(false);
    expect(bandChangeAllowed('under13', true, '13to17')).toBe(false);
    expect(stricterBand('adult', '13to17')).toBe('13to17');
    expect(stricterBand(null, 'under13')).toBe('under13');
  });

  it('setProfile with a band sets under18 and refuses a less strict band', () => {
    const { state, clock } = newGame();
    const t = clock.now();
    const a = applyCommand(state, { type: 'setProfile', under18: true, ageBand: '13to17' }, t, data);
    if (!a.ok) throw new Error(a.message);
    expect(a.state.profile).toEqual({ under18: true, ageBand: '13to17' });
    const back = applyCommand(a.state, { type: 'setProfile', under18: false, ageBand: 'adult' }, t, data);
    expect(back.ok).toBe(false);
    const younger = applyCommand(a.state, { type: 'setProfile', under18: true, ageBand: 'under13' }, t, data);
    if (!younger.ok) throw new Error(younger.message);
    expect(younger.state.profile.ageBand).toBe('under13');
    // An older game's plain "under 18" never loosens a younger band.
    const legacy = applyCommand(younger.state, { type: 'setProfile', under18: true }, t, data);
    if (!legacy.ok) throw new Error(legacy.message);
    expect(legacy.state.profile.ageBand).toBe('under13');
    const reset = applyCommand(legacy.state, { type: 'staffResetAge' }, t, data);
    if (!reset.ok) throw new Error(reset.message);
    expect(reset.state.profile).toEqual({ under18: null, ageBand: null });
  });

  it('a plain adult answer fills the band; a plain under-18 answer turns an adult band into 13to17', () => {
    const { state, clock } = newGame();
    const t = clock.now();
    const adult = applyCommand(state, { type: 'setProfile', under18: false }, t, data);
    if (!adult.ok) throw new Error(adult.message);
    expect(adult.state.profile).toEqual({ under18: false, ageBand: 'adult' });
    const minor = applyCommand(adult.state, { type: 'setProfile', under18: true }, t, data);
    if (!minor.ok) throw new Error(minor.message);
    expect(minor.state.profile).toEqual({ under18: true, ageBand: '13to17' });
  });
});

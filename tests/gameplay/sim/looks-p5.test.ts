/** P5-06 (RET-09, RET-13): fifteen looks that are earned in play, never sold. */
import { describe, expect, it } from 'vitest';
import { calendarReward } from '../../../src/gameplay/sim/calendar';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, settleSeasons } from '../../../src/gameplay/sim/village';

import { data, newGame } from './helpers';

const DAY = 86_400_000;
/** UTC ms the monthly season `n` starts (`seasonOf` is year * 12 + month). */
const seasonStart = (n: number) => Date.UTC(Math.floor(n / 12), n % 12, 1);
const earned = data.cosmetics.hallSkins.filter((k) => k.earned);

describe('earned looks (P5-06)', () => {
  it('fifteen besides the festivals, none of them for sale', () => {
    const fest = new Set(data.events.dated!.map((f) => f.goal!.ladder[f.goal!.ladder.length - 1].look));
    expect(earned.filter((k) => !fest.has(k.id)).length).toBe(15);
    const { state } = newGame();
    const rich = { ...state, resources: { ...state.resources, moonstones: 1e6 } };
    for (const k of earned) expect(applyCommand(rich, { type: 'buySkin', skin: k.id }, 0, data)).toMatchObject({ ok: false, code: 'LOCKED' });
  });

  it('every source names a look that exists', () => {
    const ids = new Set(data.cosmetics.hallSkins.map((k) => k.id));
    const named = [
      ...data.ranks.leagues.flatMap((l) => (l.look ? [l.look] : [])),
      ...(data.trials.looks ?? []).map((l) => l.look),
      ...(data.daily.calendar?.skins ?? []),
      ...(data.daily.chestLooks ?? []).map((l) => l.look),
    ];
    expect(named.length).toBe(15);
    for (const id of named) expect(ids.has(id), id).toBe(true);
  });

  it('the first season finished in Obsidian, Storm or Kage gives its look once', () => {
    const { state } = newGame();
    const league = data.ranks.leagues.find((l) => l.look)!;
    const s: VillageState = structuredClone({ ...state, trophies: league.min + 10 });
    const end = seasonStart(s.season + 1);
    settleSeasons(s, end + 1, data);
    expect(s.cosmetics.owned).toContain(league.look);
    expect(s.seasonLog!.at(-1)!.look).toBe(league.look);
    // A second season in the same league adds nothing new.
    s.trophies = league.min + 10;
    settleSeasons(s, seasonStart(s.season + 1) + 1, data);
    expect(s.cosmetics.owned.filter((x) => x === league.look).length).toBe(1);
    expect(s.seasonLog!.at(-1)!.look).toBeUndefined();
  });

  it('calendar cycles 2 to 6 each give their own look on the look day before the Jade', () => {
    const { state } = newGame();
    const def = data.daily.calendar!;
    const day = def.days.findIndex((d) => d.skin) + 1;
    let s: VillageState = { ...state, cosmetics: { ...state.cosmetics, owned: [...state.cosmetics.owned, def.days[day - 1].skin!] } };
    for (let cycle = 1; cycle <= 5; cycle++) {
      s = { ...s, calendar: { ...s.calendar, cycles: cycle } };
      const r = calendarReward(s, day, 5, data);
      expect(r.skin).toBe(def.skins![cycle - 1]);
      s = { ...s, cosmetics: { ...s.cosmetics, owned: [...s.cosmetics.owned, r.skin!] } };
    }
    expect(calendarReward({ ...s, calendar: { ...s.calendar, cycles: 6 } }, day, 5, data)).toEqual({ moonstones: def.repeatJade });
  });

  it('the thirtieth chest opened gives its look, whatever days were missed', () => {
    const { state } = newGame();
    const s: VillageState = { ...state, stats: { ...state.stats, chestsOpened: 29 } };
    const r = applyCommand(s, { type: 'openDailyChest' }, data.events.epoch + 400 * DAY, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.stats.chestsOpened).toBe(30);
    expect(r.state.cosmetics.owned).toContain('chest_30');
  });
});

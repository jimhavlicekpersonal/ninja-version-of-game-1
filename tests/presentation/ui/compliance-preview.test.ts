/**
 * GUI for the content batch's non-live features and the compliance switches (2026-11-14):
 * - the Hero Hall's hero picker and the Warrior Mastery view appear only while the data flags are on
 *   (`withPreview`, i.e. `?sandbox&preview`), and the picker changes state only through `chooseHero`;
 * - the EU real-money value of Jade, the terms gate and withheld chat lines.
 * No browser in `npm test`: a tiny element stub stands in for the DOM.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultData } from '../../../src/gameplay/sim/data';
import { withPreview } from '../../../src/gameplay/sim/plannedContent';
import { applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import type { GameData, VillageState } from '../../../src/gameplay/sim/types';
import { heroPickerSection, masteryRows, masterySection } from '../../../src/presentation/ui/contentPreviewUi';
import { euStorefront, jadeUnitPrice, jadeValueText, termsGate } from '../../../src/presentation/ui/complianceUi';
import { chatText } from '../../../src/presentation/ui/i18n';
import en from '../../../locales/en/ui.json';

class El {
  children: (El | { text: string })[] = [];
  attrs: Record<string, string> = {};
  className = '';
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  constructor(readonly tag: string) {}
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  addEventListener(t: string, f: (e: unknown) => void) {
    (this.listeners[t] ??= []).push(f);
  }
  append(...c: (El | { text: string })[]) {
    this.children.push(...c);
  }
  get text(): string {
    return this.children.map((c) => ('tag' in c ? c.text : c.text)).join(' ');
  }
  find(pred: (e: El) => boolean): El | null {
    if (pred(this)) return this;
    for (const c of this.children) if ('tag' in c) {
      const f = c.find(pred);
      if (f) return f;
    }
    return null;
  }
}
const saved = (globalThis as { document?: unknown }).document;
beforeAll(() => {
  (globalThis as { document?: unknown }).document = { createElement: (t: string) => new El(t), createTextNode: (text: string) => ({ text }) };
});
afterAll(() => {
  (globalThis as { document?: unknown }).document = saved;
});

const NOW = 1_800_000_000_000;
const P = withPreview(defaultData);

function host(data: GameData, keep: number, hall: number) {
  let state: VillageState = createNewVillage(NOW, data);
  state.buildings = state.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle');
  state.buildings[0].level = keep;
  if (hall) state.buildings.push({ id: 'hh', type: 'hero_shrine', level: hall, x: 2, y: 2, upgrade: null, collector: null });
  const sent: Command[] = [];
  const c = {
    data,
    get state() {
      return state;
    },
    dispatch(cmd: Command) {
      sent.push(cmd);
      const r = applyCommand(state, cmd, NOW, data);
      if (r.ok) state = r.state;
      return r;
    },
  };
  return { c: c as never as Parameters<typeof heroPickerSection>[0], sent, get state() {
    return state;
  } };
}

describe('the Hero Hall hero picker', () => {
  it('is hidden with the shipped data (hero choice off), on any building', () => {
    const h = host(defaultData, 10, 0);
    expect(heroPickerSection(h.c, 'hero_shrine', () => undefined, () => undefined)).toBeNull();
    expect(defaultData.features?.heroChoice).not.toBe(true);
  });

  it('with preview data, shows only on the Hero Hall, and Choose sends chooseHero', () => {
    const h = host(P, 15, 3);
    expect(heroPickerSection(h.c, 'kunai_tower', () => undefined, () => undefined)).toBeNull();
    let redrawn = 0;
    const sec = heroPickerSection(h.c, 'hero_shrine', () => redrawn++, () => undefined) as unknown as El;
    expect(sec).not.toBeNull();
    expect(sec.text).toContain(en['preview.notLive']);
    const btn = sec.find((e) => e.attrs['data-id'] === 'choose-hero-iron_matriarch');
    expect(btn).not.toBeNull();
    btn!.listeners.click[0]({});
    expect(h.sent).toEqual([{ type: 'chooseHero', hero: 'iron_matriarch' }]);
    expect(h.state.hero?.chosen).toBe('iron_matriarch');
    expect(redrawn).toBe(1);
    // Chosen: "Let the Keep choose" sends { hero: null }.
    const again = heroPickerSection(h.c, 'hero_shrine', () => undefined, () => undefined) as unknown as El;
    again.find((e) => e.attrs['data-id'] === 'choose-hero-auto')!.listeners.click[0]({});
    expect(h.sent[1]).toEqual({ type: 'chooseHero', hero: null });
  });

  it('the HUD puts it on the building sheet and repaints when the choice changes', () => {
    const hud = readFileSync(join(__dirname, '../../../src/presentation/ui/hud.ts'), 'utf8');
    expect(hud).toMatch(/heroPickerSection\(this\.c, b\.type/);
    expect(hud).toMatch(/this\.c\.state\.hero\?\.chosen \?\? null\]\)/);
  });
});

describe('Warrior Mastery', () => {
  it('is hidden with the shipped data, listed with preview data from the village EXP', () => {
    const off = host(defaultData, 5, 0);
    expect(masterySection(off.c)).toBeNull();
    expect(masteryRows(off.c)).toEqual([]);
    const on = host(P, 5, 0);
    expect(masteryRows(on.c)).toEqual([]);
    const troop = Object.keys(P.troops)[0];
    on.state.mastery = { [troop]: 500 };
    const rows = masteryRows(on.c);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ troop, xp: 500 });
    expect(rows[0].level).toBeGreaterThan(0);
    expect(rows[0].next).toBeGreaterThan(500);
    expect((masterySection(on.c) as unknown as El).text).toContain(en['mastery.title']);
  });

  it('the Codex shows it', () => {
    expect(readFileSync(join(__dirname, '../../../src/presentation/ui/codexUi.ts'), 'utf8')).toMatch(/masterySection\(host\.c\)/);
  });
});

describe('EU real-money value of Jade (C16)', () => {
  const packs = [
    { storeId: 'a', moonstones: 100 },
    { storeId: 'b', moonstones: 600 },
  ];
  const prices = { a: { formatted: '€1.99', currency: 'EUR', micros: 1_990_000 }, b: { formatted: '€9.99', currency: 'EUR', micros: 9_990_000 } };
  it('takes the cheapest per Jade, in one currency only', () => {
    expect(jadeUnitPrice(packs, prices)).toEqual({ microsPerJade: 9_990_000 / 600, currency: 'EUR' });
    expect(jadeUnitPrice(packs, { ...prices, b: { formatted: '$9.99', currency: 'USD', micros: 9_990_000 } })).toBeNull();
    expect(jadeUnitPrice(packs, null)).toBeNull();
  });
  it('says "about" and only when switched on in an EU storefront', () => {
    const unit = jadeUnitPrice(packs, prices);
    expect(jadeValueText(60, unit, 'DE', true)).toBe('about €1.00');
    expect(jadeValueText(60, unit, 'DEU', true)).not.toBeNull();
    expect(jadeValueText(60, unit, 'US', true)).toBeNull();
    expect(jadeValueText(60, unit, 'DE', false)).toBeNull();
    expect(jadeValueText(60, unit, 'DE')).toBeNull(); // off by default
    expect(euStorefront('NO')).toBe(true);
    expect(euStorefront('GB')).toBe(false);
  });
  it('never in an offer that pops up: only the Store looks and the spend confirm use it', () => {
    const econ = readFileSync(join(__dirname, '../../../src/presentation/ui/economyUi.ts'), 'utf8');
    expect(econ.match(/this\.jadeAbout\(/g)).toHaveLength(2);
    expect(readFileSync(join(__dirname, '../../../src/presentation/ui/hud.ts'), 'utf8')).not.toMatch(/jadeValueText|jadeAbout/);
  });
});

describe('terms of service gate (C14)', () => {
  it('asks nothing while legal-config.js has no effective date', () => {
    const kit = { confirm: async () => true };
    expect(termsGate('', kit)).toBeNull();
    expect(termsGate(undefined, kit)).toBeNull();
    expect(termsGate('soon', kit)).toBeNull();
    expect(termsGate('2027-01-15', kit)?.version).toBe('2027-01-15');
    expect(readFileSync(join(__dirname, '../../../public/legal-config.js'), 'utf8')).toMatch(/termsEffective: '',/);
  });
});

describe('withheld chat (under13-limited)', () => {
  it('shows the preset-only line instead of the placeholder text', () => {
    expect(chatText({ text: '(Only ready-made phrases are shown.)', kind: 'chat', withheld: true })).toBe(en['chat.presetOnly']);
    expect(chatText({ text: 'hello there', kind: 'chat' })).toBe('hello there');
  });
});

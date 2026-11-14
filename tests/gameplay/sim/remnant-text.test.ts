/**
 * Remnant audit (2026-11-06): Kagemura was rebuilt in place from Toadstool Kingdoms and kept its internal
 * ids (docs/rebuild/ID_MAP.md). Players must never read those ids or the old game's words: the
 * storage-full toast said "Your acorns storage is full", the Starter Pack was "for new rulers", a
 * description named a "Cannon" that no longer exists, and "troops" survived next to "warriors".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capacity } from '../../../src/gameplay/sim/resources';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { findFreeSpot } from '../../../src/gameplay/sim/grid';
import { applyCommand, createNewVillage } from '../../../src/gameplay/sim/village';

const OLD_WORDS = /\b(toadstools?|acorns?|moonstones?|nightsap|mushrooms?|groves?|sprouts?|ferns?|oaks?|woodland|forests?|critters?|beavers?|hedgehogs?|frogs?|owls?|moles?|beetles?|wasps?|fireflies|firefly|pinecones?|brambles?|kingdoms?|rulers?|cannons?|troops?|dew|elixir|gems?)\b/i;
/** Real Kagemura names that contain one of those words. */
const ALLOWED = new Set(['Great Dragon Cannon']);
/**
 * Catalog entries kept on purpose: wording only archived battle rules (server/rules/v3) still write into
 * old history, technical refusals a normal game never triggers, and a country's name.
 */
const KEPT_KEYS = new Set(['extra.d7e56446de', 'extra.d86e58821f', 'extra.1385b76c86', 'extra.0d2a668902', 'server.bad_troop_level_7dbee25d35', 'server.bad_troop_levels_eee0c4cb4b', 'server.troop_not_unlocked_f8191b3918', 'srv.army.bad_level', 'srv.army.bad_levels', 'srv.army.troop_locked', 'sim.unknown_troop_type_65c4d6aaae', 'pages.privacy.8']);

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8')) as Record<string, string>;

describe('player-visible text', () => {
  it('no game data text or interface text uses the old game\'s words or ids', () => {
    for (const file of ['locales/en/data.json', 'locales/en/ui.json', 'locales/en/messages.json', 'locales/en/boot.json', 'locales/en/pages.json']) {
      for (const [key, text] of Object.entries(read(file))) {
        if (ALLOWED.has(text) || KEPT_KEYS.has(key)) continue;
        expect(text, `${file} ${key}`).not.toMatch(OLD_WORDS);
      }
    }
  });

  it('the storage-full message names the resource and its storage, never the internal id', () => {
    const t = Date.UTC(2026, 10, 6, 12);
    let s = createNewVillage(t, data);
    s.resources.acorns = 100_000;
    s.resources.dew = 100_000;
    for (const type of ['acorn_orchard', 'dewdrop_well'] as const) {
      const spot = findFreeSpot(s, data, type, 20, 20)!;
      const placed = applyCommand(s, { type: 'place', buildingType: type, x: spot.x, y: spot.y }, t, data);
      expect(placed.ok, type).toBe(true);
      if (placed.ok) s = placed.state;
    }
    const later = t + 6 * 3_600_000;
    const cap = capacity(s, data);
    s.resources.acorns = cap.acorns;
    s.resources.dew = cap.dew;
    for (const [type, words] of [['acorn_orchard', /No room for more Coins\. Upgrade your Treasury/], ['dewdrop_well', /No room for more Provisions\. Upgrade your Provision Storehouse/]] as const) {
      const b = s.buildings.find((x) => x.type === type)!;
      const r = applyCommand(structuredClone(s), { type: 'collect', id: b.id }, later, data);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('STORAGE_FULL');
        expect(r.message).toMatch(words);
        expect(r.message).not.toMatch(OLD_WORDS);
      }
    }
  });
});

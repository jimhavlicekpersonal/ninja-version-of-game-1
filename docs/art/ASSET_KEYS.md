# Asset keys (contract between ART and the game)

Every image the game draws lives behind a key (`src/presentation/render/assets.ts`, `Keys`). The code draws a placeholder for every key. An image listed in `public/art/manifest.json` under the same key replaces it.

| Key | What | Size and anchor |
|---|---|---|
| `building.<type>.<level>` | one exact level (optional, wins over tiers) | isometric; footprint diamond = full width, touching the bottom edge |
| `building.<type>.t1` / `t2` / `t3` | visual tier: levels split into thirds | same |
| `building.<type>` | fallback (tier 1) | same |
| `building.elder_toadstool.skin.<skin>.t<n>` | Clan Keep cosmetic skins | same |
| `construction.<1-4>` | scaffolding by footprint size | same |
| `rubble.<1-4>` | destroyed building | same |
| `troop.<troopId>` | battle sprite, faces right, feet at bottom | logical size in `ninja.ts` `troopArt` (e.g. 44×50) |
| `icon.warrior.<rosterId>` | round badge for each of the 50 roster warriors (Warrior Codex) | 56×56 logical, centred; `warriorIcons.ts`. Preview: `docs/art/warrior-icons.png` |
| `troop.<troopId>.companion` | summoned hunting dog or war tiger | 40×32, faces right, feet at bottom |
| `projectile.<kind>` | `acorn` (Kunai Tower kunai), `pebble` (Kunai Adept), `pinecone` (firework shell), `sting` (shuriken), `spark` (arrow), `seedbomb` (firebomb) | centred |
| `bubble.acorns`, `bubble.dew` | "ready to collect" bubbles | 44×54 |
| `fx.puff`, `fx.smoke`, `fx.jam`, `fx.star`, `fx.star.grey`, `fx.shadow` | effects | centred |
| `ground`, `water.wave` | the plateau and mist wisps | ground is map-sized |
| `icon.*` | UI icons, planned (see `ICON_MANIFEST.json`) | square |

Building type ids are the stable internal ids (see `docs/rebuild/ID_MAP.md`): for example the Clan Keep is `elder_toadstool` and the Kunai Tower is `acorn_cannon`.

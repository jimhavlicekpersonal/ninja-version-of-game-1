# Asset keys (contract between ART and the game)

Every image the game draws lives behind a key (`src/presentation/render/assets.ts`, `Keys`). The code draws a placeholder for every key. An image listed in `public/art/manifest.json` under the same key replaces it.

| Key | What | Size and anchor |
|---|---|---|
| `building.<type>.<level>` | one exact level (optional, wins over tiers) | isometric; footprint diamond = full width, touching the bottom edge |
| `building.<type>.t1` / `t2` / `t3` | real art for a visual tier: levels split into thirds (wins over code art) | same |
| `building.<type>.lv<level>` | code art for one exact level, painted on first use (Keep: 6 looks, defenses: 5, others: 3, plus a small change at every level; `art/ninja.ts` `tierFor`, `paintBuildingLevel`) | same |
| `building.<type>` | real art only: the HUD thumbnail (code art uses `.lv1`) | same |
| `building.elder_toadstool.skin.<skin>.t<n>` | Clan Keep cosmetic skins, real art (thirds); code art is `.skin.<skin>.lv<level>` | same |
| `construction.<1-4>` | scaffolding by footprint size | same |
| `rubble.<1-4>` | destroyed wall or generic rubble | same |
| `rubble.<2-4>.<family>` | ruins by family: `keep`, `tower` (defenses), `store` (Treasury, Storehouse), `house` (everything else); painted on first use (`render/fx.ts` `ruinTexture`) | footprint diamond = full width; 40 px above it |
| `troop.<troopId>` | battle sprite, faces right, feet at bottom; the same figure as the badge (role silhouette and signature prop) | logical size in `warriorIcons.ts` `warriorSpriteArt` (64×64; guardians 1.22×, tiers 4-5 1.15×) |
| `icon.warrior.<rosterId>` | round badge for each of the 50 roster warriors (Warrior Codex) | 56×56 logical, centred; `warriorIcons.ts`. Preview: `docs/art/warrior-icons.png` |
| `troop.<troopId>.companion` | summoned hunting dog or war tiger | 40×32, faces right, feet at bottom |
| `projectile.<kind>` | `acorn` (Kunai Tower kunai), `pebble` (Kunai Adept), `pinecone` (firework shell), `sting` (shuriken), `spark` (arrow), `seedbomb` (firebomb) | centred |
| `bubble.acorns`, `bubble.dew` | "ready to collect" bubbles | 44×54 |
| `fx.puff`, `fx.smoke`, `fx.jam`, `fx.star`, `fx.star.grey`, `fx.shadow` | effects | centred |
| `fx.ring`, `fx.tracer`, `fx.flash` | battle: role ring under warriors (tinted), projectile streak (origin at its head), muzzle/impact light | generated in `render/fx.ts` |
| `fx.bird`, `fx.villager.<0-3>`, `fx.streamer` | village life: a swallow, villagers (feet at bottom), a streamer on a pole (origin at the pole) | `art/ninja.ts` `paintBird`, `paintVillager`, `paintStreamer` |
| `scenery.ridge.<0-2>`, `scenery.fog` | mountain bands behind the plateau (far, middle, near) and a fog band, shown with parallax | `art/ground.ts` `paintRidge`, `paintFogBand`; drawn small, displayed large |
| `ground`, `water.wave`, `backdrop` | the plateau, the drifting cloud-sea wisps around it (the key predates the clouds), and the dusk gradient behind everything | ground is map-sized (any resolution: scenes scale it by its width); a wave is about 130 x 44; the backdrop is stretched, so a small smooth gradient is enough |
| `icon.*` | UI icons, planned (see `ICON_MANIFEST.json`) | square |

Building type ids are the stable internal ids (see `docs/rebuild/ID_MAP.md`): for example the Clan Keep is `elder_toadstool` and the Kunai Tower is `acorn_cannon`.

HUD art outside the texture keys (SVG strings for the DOM, `art/chest.ts` and `art/portraits.ts`, re-exported from `art/ninja.ts`): the daily chest (`chestSvg('closed' | 'open')`, `revealChest`) and Sensei Hoshi (`senseiPortrait('calm' | 'smile' | 'stern' | 'surprised')`).

AUDIT: art style, GUI and animation of Kagemura (read-only; nothing in the repo was modified). Method: read src/presentation/{art,render,ui,audio}, tools/brand, tools/store, tests/presentation; ran `npx vite --port 5173` and drove the sandbox with Playwright (Chromium + SwiftShader, DPR 1) at 360x640, 320x568 and 844x390 using a Keep-10 showcase village (tools/store/showcaseVillage.ts via `tk.controller.replace`), reaching village, Build, Army/Codex/Research, Store (all tabs + confirm), Daily, Events, Pass, Goals, Alliance, Settings, building sheets, scouting, a live battle (deploy, smoke, ruins, result), low-quality profile and the art gallery. Nothing reported below repeats the prior audit's "Art and game feel" table; where I spot-checked its claims I say so.

Spot-check of prior claims: role silhouettes (ROLE_STYLE in warriorIcons.ts:833-856, 50 distinct badges in docs/art/warrior-icons.png) VERIFIED; Keep 6 tiers / defenses 5 (ninja.ts TIER_MAPS, FIVE_TIERS, tests/presentation/art/levels-and-sprites.test.ts) VERIFIED; village life, ruins, hit flashes, star slams, Keep collapse (render/fx.ts, BattleScene.ts:676-712) VERIFIED in code and screenshots; haptics/koto/taiko (audio/*) VERIFIED in code (not listened to); Sensei portrait VERIFIED (p360-01); fonts M PLUS 1 / Dela Gothic One VERIFIED but Latin subsets only (see F1).

================ FINDINGS ================

F1 [High] VERIFIED — Internal legacy resource ids leak into player-facing text, unformatted.
Evidence: src/gameplay/sim/village.ts:388-392 `costText` builds "`${cost[k]} ${k}`" from RESOURCE_KINDS; shown on the Keep sheet as "Not enough resources (needs 5448274 acorns)." (screenshot p360-45-keep-sheet.png, p360-46-upgrade.png). Same string at village.ts:431,459,1075,1106,1283.
Why: "acorns" is the Toadstool Kingdoms id; players see a word that exists nowhere else in the game, with no thousands separators, on the single most-visited upgrade surface. Looks unfinished; untranslatable as is.
Fix: route cost text through the display names in data (`resources` names, as the HUD does) and `formatCompact`/toLocaleString; better, show cost chips and drop the sentence.

F2 [High] VERIFIED — Store → Looks sells Keep "looks" previewed as toadstool mushroom caps.
Evidence: src/presentation/ui/economyUi.ts:373-374 builds `.skin-swatch` from `skin.cap` + four `spots`; styles.css:458-461 shapes it as a rounded cap with spots; cosmetics.json fields are literally `cap`/`spots`. Screenshot p360-30-store-looks.png shows grey/purple/gold/blue mushroom caps with dots labelled "Clan Keep look".
Why: the only cosmetic revenue surface shows art from the previous IP and gives no idea what the player buys (the real effect is roof colour + trim on the Keep, keepSkin() in ninja.ts:714). Cosmetics are a top-3 monetisation lever in this genre; this one cannot convert.
Fix: preview with the real Keep painter (`paintBuildingLevel` with `keepSkin(cap, spots)` to a thumbnail via `buildingThumbKey`-style canvas → data URL) and rename data fields to `roof`/`trim`.

F3 [High] VERIFIED — Parallax mountain ridges are finite rectangles with hard vertical/horizontal edges, visible in landscape and tablets.
Evidence: render/fx.ts addScenery: three 1600x300 textures scaled 2.0-2.6 at scrollFactor 0.35-0.78, placed once; screenshots l844-05-battle-start.png, l844-06-scout.png, l844-07-battle-mid.png show the ridge band ending abruptly left and right with a straight bottom edge above the island; portrait battle start (p360-14/15) shows the same hard bottom edge where the fog band stops.
Why: the battle entry screen (every raid, every store screenshot on iPad 13" and landscape phones) shows an obvious rendering artefact; it reads as a bug to reviewers and players.
Fix: tile the ridge horizontally (TileSprite or three copies) sized from the camera's minimum zoom and canvas aspect, fade the band's bottom into the backdrop gradient, and recompute on RESIZE.

F4 [High] VERIFIED — Battle start frames the whole base at ~0.14-0.2 zoom: buildings 8-14 px, warriors ~6 px, top cards cover 20-30% of the screen.
Evidence: BattleScene FIT_FLOOR 0.14 comment; screenshots p360-15-battle-start.png, p320-04-battle.png (opponent card wraps to 6 lines and covers 30% of a 320x568 screen), l844-05 (base ~300 px wide in 844 px).
Why: the first 10 seconds of every raid, the moment that sells the game, show a postage-stamp base with most of the screen being sky/clouds. Competitors open on a readable base that fills the screen.
Fix: fit the points to a larger FIT_FLOOR (0.22-0.26) and rely on the edge chevrons for the rest; collapse the opponent card to one line (name · Lv · "Practice") with loot on tap; move the mountain band lower so the base sits on it.

F5 [High] SUSPECTED (emulated) — Texture footprint is fixed-scale, not DPR-aware, and dominated by one 4080x2241 island texture.
Evidence: measured in-game: village 173 textures / 67 MB, battle 212 / 86 MB at DPR 1 (run4.log); `ground` alone 34.9 MB; BUILDING_SCALE 2.5 / HD_SCALE 3 regardless of the device's DPR (assets.ts:46-50), so a 1x 360-px Android gets the same 86 MB as a 3x iPhone. CPU x4 + software GL gave village ~34 FPS, battle ~28 FPS with 96 troops / 117 buildings / 662 display objects, which is not a device measurement.
Why: 2-3 GB phones with Mali-400/G52 class GPUs will evict or fail large textures; one 4k-wide island is also above the 4096 limit of some older GPUs once multiplied by a safety margin. This is the #1 risk for the "cheap phones" goal.
Fix: scale generation by min(DPR, cap) instead of fixed profiles; split the island into 4-6 tiles so partial eviction and max-texture limits are safe; pack troop/projectile/fx textures into one atlas via `textures.addAtlas` from a packed canvas (Phaser batches per texture; 50 single-texture troop sprites plus 40 building textures mean constant batch flushes on low-end GPUs).

F6 [Medium] VERIFIED — Warriors are single-frame sprites: no walk cycle, attack, hit or death frames; all motion is procedural bob/squash.
Evidence: TroopArt = one `paint` (ninja.ts:2134-2138); BattleScene.ts:749 bob = `-|sin(now/90)|*3`, :759 attack = sine squash, death = alpha fade + puff (:733-742); flip only via setFlipX(:753). Screenshot p360-40/41 (2.4x zoom) show identical frozen poses stacked.
Why: at the zoom players actually use mid-fight (1.5-2.5x) the army reads as a sliding sticker sheet; "feel" is where the market leaders are judged. 
Fix: a 4-frame walk and 2-frame attack per role (not per warrior: the role silhouette already carries identity) painted by the same code with pose parameters (leg offset, arm angle), registered as sprite-sheet frames; a knockback/flash on hit; a fall frame before the puff.

F7 [Medium] VERIFIED — Buildings show no damage state until they vanish into a near-black crater.
Evidence: BattleScene.ts:676-712: only `destroyed` swaps to ruins; damage is a green bar. Screenshot p360-51-ruins-closeup.png: a 2x2 ruin is a dark scorched ellipse with three posts, p360-43 shows them as black blobs on the field.
Why: destruction is the reward loop of raiding; CoC-style games show cracks/smoke/fire at 50% and keep a recognisable shell at 0%. Black discs read as rendering holes.
Fix: a mid-HP overlay (cracks/smoke emitter on `hp < 0.5*maxHp`), ruins that keep the plinth and roof shape in grey (the house/tower/store families exist, paintRuins) with the scorch at 30% alpha, not 90%.

F8 [Medium] VERIFIED — Overlapping edge chevrons and stacked callouts in battle.
Evidence: battleHud.ts:202-245 places each chevron independently at the ray exit; p360-42/43 show "F 100" drawn over "E 100"; p360-18 shows six gold pills crowding a 360-px screen at mid zoom; l844-07 shows three "Moon Cut" labels overprinted (callout throttle is per unit, BattleScene.ts:101/610-622, not per screen area).
Why: the HUD's own elements hide each other and the field; unreadable at the moment the player decides where to drop.
Fix: sort chevrons per edge and stack them with a minimum gap; merge chevrons for points within 40 px; throttle callouts per text+screen-cell (e.g. 80 px grid) and cap live labels at 3.

F9 [Medium] VERIFIED — The two main resource pills are near-identical at a glance.
Evidence: p360-02-village.png top bar: "400,000 / 22.9M" twice with a gold coin and a tan rice bale of the same size, colour family and shape; icons.ts `acorns` (gold disc) vs `dew` (tan ellipse).
Why: resource identity is the base of every economic decision; identical pills slow every read and confuse new players (the tutorial screenshot shows "2,500 / 3K" twice).
Fix: give Provisions a cool hue (indigo/green sack or rice bowl) and a different silhouette; tint the pill backgrounds subtly per resource (the bars already differ: gold vs sky).

F10 [Medium] VERIFIED — Dialogs animate in but vanish instantly; no exit motion anywhere in the HUD.
Evidence: styles.css `.modal` animation pop, `.sheet` sheet-in; hud.ts:2057-2061 `close()` calls `backdrop.remove()` with no out class (only toasts have `.out`).
Why: asymmetric motion feels cheap; every panel close is a hard cut, which is the single most frequent UI event.
Fix: add `.modal-backdrop.out` (fade 120 ms) and `.modal.out` (scale .96, 120 ms), remove on `animationend` with a timeout fallback; respect reduced motion (already handled by the global rule).

F11 [Medium] VERIFIED — Per-level "visible change" is a stone lantern; 24-level producers look the same for 8+ levels.
Evidence: gallery-04.png (Coin Mint L10-L15 differ only by one lantern / coin stack); levels-and-sprites.test.ts only asserts the pixel signature differs, not that a player can tell. Keep L1-L2 (gallery-01.png) is a brown box on stone, not a Keep.
Why: upgrade feedback drives spending; a timer that ends with no visible change undercuts the "Buy missing" button next to it. The Keep's first two levels (what every new player sees for days) look generic.
Fix: per tier add structural steps (roof material already changes; add storeys, walls, paddocks, bigger footprint props) at fixed level milestones (every 4th level) rather than lantern increments; give Keep L1 an identifying feature (gate, banner, crest) so it reads as the heart of the village.

F12 [Medium] VERIFIED — Army troop cards in battle show the dark battle sprite at 48 px with no backing disc; the Codex badges exist but are not used there.
Evidence: battleHud.ts:445-449 `troopThumb` = full `troop.<id>` texture (dark gi on cream card, `.troop-card img` 48 px); screenshots p360-14/16: Moonblade Master and Mountain Shield read as dark smudges, while warrior badges (role-coloured disc, tier ring) in p360-13-codex.png read instantly.
Why: picking the right card mid-raid is the core input; the better asset already exists.
Fix: use `warriorIcon(id)` (Keys.warriorIcon) for cards; keep the sprite for the field.

F13 [Medium] VERIFIED — New-player first frame is an empty green plateau with two buildings and no composition.
Evidence: p360-01-village-new-tutorial.png, p360-20-lowq-zoomed.png: flat #green ground, a faint path, two rocks, bamboo; the Sensei bubble covers the Keep.
Why: first impression at install decides D1 retention; competitors open on a dressed village (trees, props, a river, pre-placed decor, builders walking).
Fix: dress the starting plateau from ground.ts (scenery trees/rocks are drawn only on the rim; bring 6-10 removable obstacles into the playable area; the catalog already has bamboo/cedar/boulder obstacles); start the camera closer (1.0 zoom on the Keep) and place the bubble below the Keep.

F14 [Medium] VERIFIED — Top HUD stack covers 31% of a 320x568 screen and 25% at 360x640.
Evidence: p320-01-village.png: four rows (resources wrap to 3 rows + Keep-unlock chip) end at y≈175/568; p360-02 ends at ≈125/640. The prior audit measured 11.4% only at 390x844.
Why: the base is what the player wants to see; on the cheapest phones (320-360 wide, exactly the worldwide target) a third of it is chrome.
Fix: a 2-row layout under 400 px: Coins/Provisions/Jade in one row with compact caps on tap, Builders/Honor/Shield as 28-px chips in row two; the unlock chip as a badge on the Keep instead of a bar.

F15 [Medium] VERIFIED — Interface fonts are Latin subsets; 40+ of the 50 target languages render in whatever system font exists, with a different weight and metrics.
Evidence: styles.css @font-face unicode-range U+0000-00FF…; ui/fonts/README.md "Latin subset"; `--font-fallback` lists Hiragino/Yu Gothic/Noto which are absent on many budget Androids (Noto Sans CJK is present but Noto Sans Arabic/Devanagari/Thai depend on OEM); Dela Gothic One (display) has no CJK/Arabic/Thai glyphs at all, so every title falls to M PLUS 1 Latin → system.
Why: titles, Attack/Build labels, battle header and results (all DISPLAY_FONT) will look like a different, lighter product in ja/zh/ko/ar/hi/th; canvas text (`stamp`, point labels) is not re-laid out when a late font arrives (fonts.ts).
Fix: ship per-script subsets loaded by unicode-range (M PLUS 1 has full JP; add Noto Sans SC/KR/Arabic/Devanagari/Thai subsets, ~100-300 KB each, only fetched when used); pick a display fallback per script (e.g. "M PLUS 1" 900 for CJK titles, Noto Kufi/Cairo for Arabic); or accept and document that titles use the body font outside Latin.

F16 [Medium] VERIFIED — Latin letters A-H as infiltration point labels, baked into the canvas and the HUD.
Evidence: infiltration.ts:38 `LABELS = 'ABCDEFGH'`; BattleScene point labels and battleHud chevrons/chips use them; scout chips read "A 7 · AA · splash" (p360-14) which is cryptic even in English.
Why: Arabic, Thai, CJK and Devanagari players get foreign letters as the primary battle vocabulary; "AA" and "splash" are jargon.
Fix: keep letters as ids but render numerals or compass glyphs (N, NE…) chosen per locale; expand chip text ("7 free · anti-air · splash" → icons with tooltips).

F17 [Medium] VERIFIED — Procedural music is a 32-step loop: 11.4 s in the village, 7.5 s in battle, with no variation beyond a fixed 4-chord cycle.
Evidence: audio/sound.ts:410-436 (chords[4], 8 steps/bar, deterministic pattern; bpm 84/128).
Why: a 7-second loop in a 3-minute battle repeats ~25 times; players will mute it, and muting kills the taiko hits that carry combat feel. Reviewers call this out.
Fix: add phrase-level variation (4 melodic patterns picked per bar from a seeded sequence, rests, octave shifts, a B-section every 4 bars) and a slow filter/volume swell; keep the existing instruments.

F18 [Medium] VERIFIED — English plural by appending "s": "You have the most Treasurys allowed."
Evidence: village.ts:426 `${def.name}s`; p360-06-build.png, l844-02-build.png.
Why: visible grammar error on the Build screen in the shipping language; impossible to localise.
Fix: a `plural` field in buildings.json (or Intl.PluralRules with a names map).

F19 [Medium] VERIFIED — Army filter dropdowns clip their own labels at 360 px and 320 px.
Evidence: p360-07-army.png "Unloc…", p320-02-army.png "Unlo… / All ti… / All r…" (three native `<select>` in one row).
Why: the default view name is unreadable on the most common low-end widths; translated labels will be longer.
Fix: two rows under 400 px, or chips/segmented controls instead of selects (also avoids the native select look that breaks the washi style).

F20 [Medium] SUSPECTED — Phaser batch count: every building level, troop, badge, fx and ridge is its own texture (no atlas).
Evidence: assets.ts `canvasFor`/`addPainted` per key; fx.ts `artTexture` per key; 212 textures live in battle. Phaser 3.90 multi-texture batching helps (up to 16 units) but sorted iso depth interleaves textures constantly.
Why: draw-call bound GPUs (Mali-4xx/T-series in sub-$150 phones) drop frames in big fights.
Fix: see F5 atlas; also `renderer.drawCount` instrumentation in the FPS readout for a field test.

F21 [Low] VERIFIED — fx.ts still uses `textures.createCanvas` for ruins (BUILDING_SCALE), ridges, villagers, cloud shadows, petals, bird, streamer.
Evidence: fx.ts artTexture (line ~115) vs the rule in src/presentation/CLAUDE.md ("never createCanvas: keeps a full ImageData copy"). Ruins at 2.5x for sizes 1-4 × 4 families = 16 CanvasTextures with ImageData copies, ridges 3 × 1600x300.
Why: contradicts the memory fix the re-audit recorded; ~10 MB of avoidable JS heap on low profile phones.
Fix: reuse `canvasFor`/`addPainted` from assets.ts (export them) in fx.ts.

F22 [Low] VERIFIED — Army count pill overlaps the Army button icon; three red "1" badges at once on the rail.
Evidence: p360-02, l844-01 ("300/300" covers the lower third of the ninja-face button; badges on Daily, Goals, Alliance).
Why: cluttered bottom-left corner; badge inflation trains players to ignore them.
Fix: put the count under the button in a 10-px ribbon, or inside the button replacing the icon when full; badge only time-limited things.

F23 [Low] VERIFIED — App icon and splash are a building, not a character, and the icon is near-identical to the maskable variant with the Keep ~25% of the tile.
Evidence: public/icons/icon-512.png, icon-maskable-512.png, android splash (viewed). Clean and on-brand, but no face/figure.
Why: store conversion in this genre is driven by a character or hero face at 60x60; a pagoda-on-sun reads as a travel or meditation app in a results list.
Fix: human artist: a ninja face/kasa silhouette over the sun with the crest; keep the current mark for the splash.

F24 [Low] VERIFIED — Splash wordmark and boot line are Latin-only hard-coded English and the boot card uses the 192-px icon upscaled.
Evidence: index.html `.boot-title` "Kagemura", "Lighting the lanterns…"; `.boot-mark` img icon-192 at 112 CSS px (336 device px on 3x).
Why: first screen in every locale is English; soft icon on 3x phones.
Fix: read `navigator.language` for the two strings now (the text layer is planned); use icon-512 for the mark.

F25 [Low] VERIFIED — Store Jade packs have no pack art: 1-4 repeated gem glyphs; Offers tab is empty text; no "most popular"/"best value" hero card.
Evidence: p360-08-store.png, p360-29-store-offers.png, hud.ts shop-card rendering.
Why: pack art and a hero card are standard conversion tools; the current grid looks like a settings list. Honest "+11% value" chips are good and should stay.
Fix: a code-drawn pouch/bag/chest/crate per pack (chest.ts already draws one), one wide hero card for the best-value pack; pack art with no "limited time" claims that aren't real.

F26 [Low] VERIFIED — Building sheets have no picture of the building; the info bar duplicates resource icons ("Stores 57,720" twice).
Evidence: p360-45, p360-47.
Why: with the sheet covering 60% of the screen the player cannot see what they are upgrading; upgrade previews (next-level thumbnail) are a known conversion driver.
Fix: a 96-px thumbnail of the current level and the next level (`buildingTexture` already paints any level on demand) in the sheet head.

F27 [Low] SUSPECTED — Defenses never turn toward their target; only a muzzle flash and a lock-on line.
Evidence: BattleScene setRotation/setAngle used 3 times, none on building images; towers are static art.
Why: feel; secondary to F6/F7.
Fix: a rotating top piece for Shuriken/Kunai towers (paint head and base as separate keys), or at least a recoil squash already used for mortar (line 882-884) on every shot.

F28 [Low] VERIFIED — No store screenshots exist in the repo (docs/store/screenshots missing); the tool requires `npm run build` and hand review.
Evidence: `ls docs/store` has no screenshots/; tools/store/screenshots.mjs prints "Check each one: store rules forbid misleading screenshots".
Why: owner step 49 is unstarted; with F3/F4 the battle shot it produces would show the ridge artefact and a tiny base.
Fix: fix F3/F4 before generating; add a `--zoom` option to frame the base.

================ WHAT A HUMAN ARTIST MUST DO THAT CODE CAN'T ================
1. A key-art character set: 4-6 hero/warrior faces (Sensei Hoshi exists as a vector portrait) for the icon, splash, store listing, Store packs and result screens. Code-drawn chibi figures are fine on the field; they cannot carry a storefront.
2. Ground and environment painting: the plateau is a flat green with a tile grid; hand-painted ground tiles (grass variation, dirt, moss, paths, paddies), tree clusters and cliff textures are what separates "clean vector" from "world".
3. Animation key poses for the 10 roles (walk/attack/hit/fall) that a coder can turn into procedural frames; code cannot invent appealing timing.
4. Building concept pass for the first two tiers of the Keep, Dojo and Courtyard (the buildings every new player stares at) and a visual language for "damaged".
5. Store listing assets: feature graphic, 6-8 screenshots with captions per locale, icon A/B variants.
6. Music: two 60-90 s compositions (village, battle) plus stingers, exported as OGG/AAC; the Karplus-Strong engine should stay for SFX.
7. Localised typography review for ja/zh/ko/ar/th/hi (F15) by a native designer.

================ BIG-PICTURE ASSESSMENT ================
Tier: upper "polished indie / programmer-plus" — comfortably above placeholder, clearly below Clash of Clans / Boom Beach / Rise of Kingdoms, and roughly on par with small-studio soft launches that have a consistent flat-vector style. The strengths are real: one coherent palette (washi/ink/vermilion/copper), consistent lighting, a readable HUD with good hierarchy, distinct building families, 50 distinct badges, no text baked into art, and the whole thing ships with zero image files (great for download size on weak networks). What sells against market leaders is missing: character appeal (no faces anywhere a shopper looks), ground/environment richness, frame animation and destruction feel, and a store with art. The battle entry frame (F3/F4) and the two IP leaks (F1/F2) are the items that would make a reviewer or a player think "unfinished" today; they are cheap to fix and should go before any store screenshot is taken. On cheap phones the risk is memory and batch count (F5/F20), not fill rate; this needs one real low-end Android measurement before launch, which code cannot provide.

Screenshots (all under (session scratchpad, not in the repo)/agent-art/shots/):
p360-00-splash.png, p360-01-village-new-tutorial.png, p360-02-village.png, p360-06-build.png, p360-07-army.png, p360-08-store.png, p360-09-settings.png, p360-10-daily.png, p360-11-alliance.png, p360-13-codex.png, p360-14-scout.png, p360-15-battle-start.png, p360-16-battle-mid.png, p360-17-battle-zoomed.png, p360-18-battle-closeup.png, p360-19-battle-result.png, p360-20-lowq-zoomed.png, p360-21-village-zoom1.3.png, p360-22-village-zoom0.45.png, p360-25-build-defense.png, p360-26-build-decor.png, p360-27-army-tab.png, p360-29-store-offers.png, p360-30-store-looks.png, p360-31-store-confirm.png, p360-32-events.png, p360-33-pass.png, p360-34-goals.png, p360-35-battlelog.png, p360-37-settings-2.png, p360-40-battle-warriors-2.4x.png, p360-41-battle-warriors-2.4x-b.png, p360-42-battle-smoke.png, p360-43-battle-late.png, p360-44-lowq-zoom1.3.png, p360-45-keep-sheet.png, p360-46-upgrade.png, p360-47-tower-sheet.png, p360-48-research.png, p360-49-rail-collapsed-a.png, p360-50-rail-collapsed-b.png, p360-51-ruins-closeup.png, p320-01-village.png, p320-02-army.png, p320-03-scout.png, p320-04-battle.png, l844-01-village.png, l844-02-build.png, l844-03-army.png, l844-04-store.png, l844-05-battle-start.png, l844-06-scout.png, l844-07-battle-mid.png, gallery-01.png … gallery-04.png.
Scripts and logs: (session scratchpad, not in the repo)/agent-art/shoot.mjs, shoot2.mjs, shoot3.mjs, run2.log, run3.log, run4.log (texture/FPS numbers). Note: p360-39-rail-collapsed.png shows a blank canvas; p360-49/50 re-took it and the map is fine, so that was a capture artefact, not a bug. The dev server I started on 127.0.0.1:5173 is still running in the background.
# ART compartment (Section 1): art and audio

You are the **ART AI**. You own `src/presentation/art/`, `src/presentation/audio/`, `public/art/` and `docs/art/`. Read `docs/art/ART_AI_BRIEF.md` first: style, palette, silhouettes, stages and file specs.

## What lives here

- `ninja.ts`: all code-drawn art. Buildings take a tier (1–3) so upgrades show. Troops are chibi ninja (`ninja()`, facing right, feet at y = 0). Also projectiles, smoke, the jam marker and other effects. Registries: `buildingPainters`, `troopArt`, `projectileArt`.
- `warriorIcons.ts`: one distinct badge per roster warrior (`icon.warrior.<id>`): role-coloured disc, tier ring, chibi ninja and a unique signature prop. `tests/presentation/art/warriorIcons.test.ts` checks all 50 exist and draw different pictures.
- `registerWarriorArt` accepts catalog metadata from rendering to populate all 50 warrior textures without importing game data into art. Beast companions use `troop.<warriorId>.companion`; original six texture keys remain unchanged.
- `ground.ts`: the mountain plateau rising out of a sea of clouds (crags, cloud banks, shrub rim), the mist wisps (`water.wave`) and the dusk backdrop. `toolkit.ts`: colour and shading helpers.
- Materials: the shared helpers (`block`, `roof`, `stoneBase`, `storey`, `plate`) light faces from the upper left with gradients, rim light and eave shadows, so a new building gets depth for free. Each building also shows its job (see the root `CLAUDE.md`, Art).
- App icon and splash screens: `tools/brand/brand.mjs` (`npm run brand`) renders the Kagemura mark (the Keep against a vermilion sun over the cloud sea) to every PWA, iOS and Android size; master SVGs in `docs/art/brand/`.
- `../audio/sound.ts`: synthesized SFX and music (koto/taiko loop on the Japanese *in* scale). No audio files.
- `public/art/manifest.json`: real image files, keyed by asset key. Loaded by `render/artManifest.ts`. A listed image replaces the code art with the same key.

## Rules

- Imports: only within `art/`, plus `render/iso.ts` for tile sizes (enforced by `tests/architecture/boundaries.test.ts`).
- Keys are the contract (`docs/art/ASSET_KEYS.md`). Never rename a key. To ask for a new key or animation, write to `docs/art/REQUESTS.md`.
- Original IP only: no franchise look-alikes, real crests, religious symbols or Clash of Clans resemblance. The clan crest is three kunai in a ring (`crest()`).
- Readability on a phone beats detail: silhouettes at 40 px, icons at 48 px.
- Preview with `npm run art` (gallery of every texture and tier). Check in game with `npm run dev`.
- Finish with `npm test` and `npm run build`.

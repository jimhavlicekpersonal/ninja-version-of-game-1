# Stage 7: graphics engine

## What this stage decides

What the new theme needs from rendering, what it is allowed to cost, and which engine changes (if any) are worth their risk. The default answer is none: the engine is the part of the template players never asked to be different.

## What the template gives you

Read the interface brief, the quality profile code, the build configuration and the low-end and download prompts in this stage's context; they win over this page.

- A 2.5D isometric scene on a 2D engine with a custom, smaller production build of it; the HUD is plain DOM and CSS on top.
- **All art is drawn in code** and painted into textures at run time, keyed by asset keys. No image downloads: the first visit is a few hundred kilobytes.
- Two quality profiles (high and low) with different texture scales, frame rates and scenery; per-level building textures painted on first use; a cap and eviction on painted textures; a run-time downgrade when frames drop.
- A start-up guard: polyfills, a "too old" screen, a progress-aware slow-network card.
- A service worker with offline play, language packs fetched in the background, and the engine in its own cached chunk.
- Measuring tools: low-end emulation with network and CPU throttling, a start-up profiler, texture sums. They run in a desktop browser.

## Method

1. **Scene needs.** What does this world need that the template's scene does not have: water, snow, sand, night, weather, light sources, vertical scale, a different ground shape? For each: can the existing painters and parallax layers express it (art's job), or does rendering need something new (an engine change)?
2. **Budgets for art and interface**, each with how it is measured:
   - first-visit download and total until fully offline;
   - texture memory per profile at start and after a long session;
   - number of textures and their sizes; visual tiers per building (three or four, not one per level);
   - particles and full-screen layers per profile;
   - frame time in a full battle on the low profile;
   - start-up time on the throttled profiles.
   Start from the template's measured numbers; a theme that needs more must say what it gives up.
3. **Changes, each argued:** what, why the theme cannot do without it, which lane owns it, and the risk. Rendering changes that would alter what a battle *does* are not rendering changes: they belong to the economy stage and its process.
4. **Fonts and scripts.** The template uses system fonts for other scripts and downloads none. A display font for the new brand must have a fallback for every script and stay within the download budget.
5. **Device checks.** What only hardware can settle (memory over a long session, GPU fill, battery, the canvas fallback, old system webviews, large text): owner tasks, with the phone classes to test.

## What went wrong last time

- Texture memory grew all session with nothing evicted; quality was picked by memory size alone; the slow-network card interrupted a boot that was nearly done; music was synthesised while muted.
- "Fixed" items were all verified in emulation; the two riskiest (texture memory, GPU fill) cannot be seen there.
- Every deploy re-downloaded everything until the engine got its own chunk and caches were kept across builds.
- A one-megabyte-plus bundle and synchronous thumbnail encoding slowed first opens of heavy panels.

## Limits

- Doctrine 9. No per-frame allocation in hot paths. No new runtime dependency without its size and need argued.
- Art never imports game data; rendering registers catalogue facts with it.
- Nothing is called device-ready by this stage or by the build.

## A good record

A short list. If it says "no engine changes", it also says which scene needs art will meet with existing means, and the budgets art must stay inside.

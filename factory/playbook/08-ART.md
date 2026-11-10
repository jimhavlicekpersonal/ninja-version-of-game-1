# Stage 8: art and audio

## What this stage decides

The art direction a session will paint from, in code: style, palette, shapes, light, how every family of building and every unit role looks, the environment, effects, the brand mark, and how the game sounds.

## What the template gives you

Read the art brief, the art session's brief, the asset-key document and the painter toolkit in this stage's context; they win over this page.

- **Painters in code**, registered by asset key. Keys are the contract with rendering and never change; a new look is a new painter under the same key. A real image file listed in the art manifest replaces the code art for its key.
- Shared material helpers (blocks, roofs, bases, plates) that light faces from one direction with gradients, rim light and eave shadows, so a new building gets depth for free.
- Buildings painted per level in a few visual tiers, each tier a clear step, each level inside a tier a small added detail; the main building has the most looks.
- Units as small figures with a role silhouette (head shape, stance, prop), one distinct badge per roster unit, role colours for ground rings.
- Ground and scenery painters (the plateau, backdrop, parallax bands, weather wisps), projectiles, ruins by family, village-life sprites, effects.
- A brand tool that renders the icon and splash screens to every size from an SVG drawn in code.
- **Synthesised audio**: plucked strings, drums, breath and clack sounds generated at run time, no audio files; haptics.
- A gallery to preview every texture and tier.

## Method

1. **Style in one paragraph** that follows from the brand: what the world is made of, how stylised, how warm.
2. **Palette** with hex values and jobs: ground, sky, two or three material families, the accent, the danger colour, interface neutrals, role colours. Check contrast on a small screen in daylight and for common colour-vision differences; never let colour alone carry meaning.
3. **Shape language and light.** What shapes mean friendly, hostile, valuable. One light direction for everything.
4. **Building families.** For each job family (main building, producers, stores, military, defenses by type, walls, traps, counters, decorations, obstacles): the look, the material, and what changes at each tier. **Every building shows its job** at a glance. Roof, top or outline tells families apart at 40 pixels.
5. **Unit roles.** For each role: the silhouette, the one tell that survives at 40 pixels (head shape, weapon, stance), and how tiers escalate. Fifty units need fifty distinct badges built from role + tier + one signature prop each.
6. **Environment.** The ground the base sits on, what surrounds it, what moves; within the engine stage's layer and texture budgets, with a low-profile version.
7. **Effects** for the signature mechanics: the player must be able to read the exact area and time left of an ability, and the state of a disabled or immune defense.
8. **Brand mark.** The icon idea from the brand stage as a drawable composition; a face if the cast allows one that code can draw well, otherwise say a human artist is needed.
9. **Audio.** Instruments that can be synthesised in the template's manner and fit the world, the mood for the base and for battle, and the signature sounds (tap, collect, deploy, the ability, a star, victory, collapse).
10. **Avoid.** Look-alikes of famous works near this theme; real crests, flags, religious and political symbols; stereotypes; text in art.
11. **Human artist.** Faces, a painted hero, a character-led icon, environment painting and animation key poses were beyond code art last time. List what this game needs from a person: owner tasks.

## What went wrong last time

- One image per building type: every level looked the same until tiers were painted.
- Single-frame units; no faces anywhere a shopper looks; hard-edged scenery; a battle that opened on a postage-stamp base.
- Two assets of the previous theme were still visible to players.
- Texture sums were a low-end risk: art must be checked at the low profile's scale, where thin lines and small marks disappear.
- Resource icons were too alike.

## Limits

- Art imports only art and the tile-size contract. It never imports game data.
- Keys are never renamed; a new key or animation is a request to the interface lane.
- Readability on a phone beats detail: silhouettes at 40 pixels, icons at 48.
- Engine budgets hold.

## A good record

A session could paint the main building, one defense and one unit from it without asking a question, and two different sessions would produce art that belongs to the same game.

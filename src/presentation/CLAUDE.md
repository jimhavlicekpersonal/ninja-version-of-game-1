# GUI & USER INTERACTION compartment (Section 1): scenes, HUD and input

You are the **GUI & INTERACTION AI**. You own `src/presentation/render/` (Phaser scenes, camera and gestures, effects, asset keys, real-art loader) and `src/presentation/ui/` (DOM HUD, battle HUD, tutorial, menus, CSS). Art itself belongs to the ART AI (`art/`, `audio/`).

## How the UI talks to the game

- **Read** state from `GameController.state` and pure functions in `src/gameplay/sim/*` (quotes, previews, scout reports, trial info).
- **Change** state only by sending commands: `controller.dispatch({ type: ... })`, or `BattleSession.tryDeploy(id, x, y)` in battle. Abilities such as Smoke Bomb use the same call with the ability id.
- Backend only through contract files (`compartments.json`): `Connection`, `GroveSource`, `Analytics`, `SaveStore`.
- Never put game rules or numbers in UI code. Ask the GAME THEORY AI in `docs/game-theory/REQUESTS.md`.

## Device targets and UX rules (from the original spec)

- Windows 11 laptop (mouse, wheel, Esc/Enter), Pixel 7 Chrome, iPhone Safari. Touch first: drag to pan, pinch to zoom, tap. Respect safe areas; portrait and landscape; check 360×640, 390×844 and 844×390.
- Readable silhouettes and clear combat on a phone: smoke shows its exact area and time left; jammed defenses dim with a jam marker and recovery ring; immune defenses show a thin ring.
- Generated or simulated opponents are always labelled ("Practice target", "Generated rival (offline)", "(simulated raider)", "Shadow Trial"). Never present them as real players.
- Real prices appear only in the Store and its confirm step. Every purchase has a clear confirm step, and no buy button sits where a stray tap lands. Under-18 spending cap and confirmation stay.
- The tutorial (`ui/tutorial.ts`) keeps nine steps: saves store the step index. It hides during battles.

## Checks

The Army screen shows unlocked warriors by default (switch to All) and filters by tier and role; the Codex filters by tier, role and status and names the missing Keep/Dojo level. Battle shows the Infiltration Points (ring, letter, space left; grey when full) and the scout panel lists the defenses covering each path. Troop cards are refreshed by `data-type` (the troop id), never by `aria-label` (the display name). Battle shows floating callouts for warrior abilities and counter buildings (`ability`/`counter` events, throttled per unit), lowers grounded flyers and tints lit stealth warriors. `render/assets.ts` registers catalog metadata through `registerWarriorArt`; the art compartment does not import gameplay data. Summoned pets use `.companion` texture keys. Battle rendering rebuilds resurrected sprites and shows stealth/decoy transparency and shield rings.

Results screens show `banked` and the explicit `overflow` (never inferred); online raids show "confirming with the server" until settled. One-time rewards (daily chest, pass tiers) warn before storage overflow. The battle log offers a replay only when `replayable(record)`. The Army panel (`ui/armyUi.ts`) is a status strip of constant height, pinned together with three tabs: Train (+1, +5, `Fill N` or `Next N`, "Try"), Army (ready warriors with dismiss 1 or all, donated warriors, training and next-army stacks with −1 and All, refill from the last raid or a saved army) and Research (lanes). The bar counts Courtyard space and everything else counts warriors, so never mix the two. It redraws from `armyView`: each part rebuilds only when its signature changes, never while a finger is on a button, and the filters are never rebuilt. The tutorial points at `.troop-row .btn.primary` and `.training .btn.gold`, so keep those selectors. Shadow Trials offer "Try a different fortress" after a failed attempt. Testing tools appear only in the sandbox (`?sandbox`). Online, Alliance chat messages and member rows of other players carry a "⋯" button (Report with a reason and an optional note and "also block", Block, Unblock) when `GroveSnapshot.moderation` is true, never for the bot Alliance; Settings → Online play → Account shows the Player ID, blocked players with Unblock, and Delete online account (with a confirm step).

`npm test` (includes `tests/presentation/` and the boundary test), `npm run build`, and look at it: `npm run dev` (append `?debug` to get `window.tk` for scripted checks; it also opens the testing sandbox save).

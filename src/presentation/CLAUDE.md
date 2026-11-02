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

`npm test` (includes `tests/presentation/` and the boundary test), `npm run build`, and look at it: `npm run dev` (append `?debug` to get `window.tk` for scripted checks).

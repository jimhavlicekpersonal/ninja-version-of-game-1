# ART → GUI requests

Things the art compartment made that the GUI session wires up (AGENTS.md: ART writes here instead of editing `src/presentation/ui/`).

## Art re-audit, November 2026

All of these are exported from contract files (`compartments.json`), so `ui/` may import them.

| What | Import | Where it goes |
|---|---|---|
| Troop-card selection tick (haptics) | `import { haptic } from '../audio/sound'` → `haptic('selection')` | when the player picks a troop card in the battle HUD (`battleHud.ts`). Battle deploy/destroy/star haptics are already wired in `BattleScene`. |
| Haptics switch in Settings | `hapticsEnabled()`, `setHapticsEnabled(on)` from `../audio/sound` | Settings → sound section: "Vibration" switch (default on, stored in localStorage `tk.haptics`). Only show it when it can do something: in the apps (`Capacitor.isNativePlatform()`), or on the web when `navigator.vibrate` exists. |
| Daily chest art | `chestSvg('closed' \| 'open', { label? })` from `../art/ninja` | the Daily panel card (`dailyUi.ts`): closed while `chestReady`, open after the claim; the rail button may keep `icons.chest`. |
| Daily chest reveal | `revealChest(host, rewardElement, { onOpen })` from `../art/ninja` (returns a Promise) | on claim: build `rewardElement` from the claim event's real grants, then call it; in `onOpen` play `sound.play('collect')` and `haptic('success')`. It is the same animation for every outcome (no tease) and is instant under `prefers-reduced-motion`. |
| Sensei Hoshi portrait | `senseiPortrait(expression)` from `../art/ninja`; expressions `calm`, `smile`, `stern`, `surprised` (`SENSEI_EXPRESSIONS`) | `tutorial.ts` `.tut-face`, in place of `icon(icons.toadstool)` (e.g. `smile` on welcome and finished steps, `stern` before the first raid, `surprised` when a building finishes, `calm` otherwise). The SVG fills its box; ids are unique per copy. |
| Battle result | (no change needed) | `BattleScene` now shows a star slam per star (`fx.ts` `starSlam`, sound `starSlam`, haptic `success`) and a "100%" banner in the scene; the DOM result count-up stays with the GUI. New sounds you may use: `sound.play('starSlam' \| 'collapse' \| 'perfect')`. |

Contract note for INTEGRATION: `art/chest.ts`, `art/portraits.ts` and `audio/haptics.ts` are re-exported through `art/ninja.ts` and `audio/sound.ts`; listing them as contracts in `compartments.json` would let `ui/` import them directly.

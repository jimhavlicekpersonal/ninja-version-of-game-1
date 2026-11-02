# Kagemura: Ninja Clans

_ninja version of the game on 11/2/2026_

An original ninja-clan base-building and raiding game. Lead a clan, build a hidden mountain village of tiled roofs, stone walls and lanterns, train specialised warriors, scout rival strongholds, and raid them with **Smoke Bombs** and **Saboteurs**. Then climb the endless **Shadow Trials**.

**The loop:** build village → train squad → scout opponent → deploy troops and tactics → resolve raid → collect rewards → return home and upgrade.

Rebuilt in place from Toadstool Kingdoms (Phase 6: PWA, Capacitor iOS/Android, StoreKit, PvP server). Every working system was kept, and old saves migrate. See `docs/rebuild/HANDOFF.md` for what works and what is left.

## Play on your devices

| Device | How |
|---|---|
| **Windows 11** | Open the GitHub Pages link in Edge or Chrome, then **Install** in the address bar. |
| **Pixel 7** | Open the link in Chrome, then **⋮ → Add to Home screen → Install**. |
| **iPhone** | Open the link in **Safari**, then **Share → Add to Home Screen**. Launch from that icon so Safari keeps your save. |

The link is `https://<owner>.github.io/<repo>/` once Pages is on (Settings → Pages → Source: GitHub Actions).

**Controls:** drag to pan; pinch or mouse wheel to zoom; tap or click to select. In battle, pick a card and tap the map: troops go outside the red zone, and a Smoke Bomb can land anywhere. On a laptop, **Esc** cancels and **Enter** confirms placement.

## Run the code

Install **Node.js 20.19+** and Git, then:

```bash
git clone https://github.com/jimhavlicekpersonal/ninja-version-of-game-1.git
```

```bash
cd ninja-version-of-game-1
```

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173 (add `?debug` for the `window.tk` testing hook).

| Command | What it does |
|---|---|
| `npm run dev` / `npm run dev:lan` | Start the game with live reload (`:lan` exposes it to phones on your Wi-Fi) |
| `npm test` | Every test: rules, balance, tactics, trials, progression model, compartment boundaries, server |
| `npm run build` | Type-check and build the production version into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run art` | Art gallery: every generated texture at every upgrade tier |
| `npm run docs:progression` | Regenerate the roster tables and the 504-entry icon manifest from the progression model |
| `npm run server:dev` | Build and run the PvP server locally (memory storage) |
| `npm run cap:android` / `npm run cap:ios` | Copy the web build into the native projects and open Android Studio / Xcode |

## Project layout: three compartments

```
src/presentation/   1. Art, GUI, animation: procedural art and audio, Phaser scenes, HUD, tutorial
src/gameplay/       2. Game theory and mechanics: pure deterministic rules, balance data, commands
src/backend/        3. Backend: protocol, connection, payments, platform, saves, analytics, PWA
server/             3. Fastify + Postgres PvP server (re-simulates every attack)
tools/              Art gallery, progression doc generator
docs/               Rebuild analysis and handoff, architecture, game theory, art brief and manifest
```

Each compartment has a `CLAUDE.md` brief, so a **separate AI session** can upgrade it on its own (ART AI, GUI & INTERACTION AI, GAME THEORY AI, BACKEND AI). See `AGENTS.md`. `compartments.json` plus a test keep them from reaching into each other's internals.

## Key documents

- `docs/rebuild/HANDOFF.md`: what works, what is unfinished, and the owner steps
- `docs/rebuild/01-REBUILD-ANALYSIS.md`: pitfalls and the mechanics that were rebuilt
- `docs/rebuild/02-ARCHITECTURE.md`: structure, dependency rules and research sources
- `docs/game-theory/PROGRESSION_MODEL.md` and `ROSTER.md`: one power budget for all 50 warriors, buildings, EXP and difficulty
- `docs/art/ART_AI_BRIEF.md` and `ICON_MANIFEST.md`: instructions and the full list of icons for an ART AI
- `docs/PROTOCOL.md` (v3) and `docs/SHIPPING.md`: multiplayer protocol and store and hosting steps

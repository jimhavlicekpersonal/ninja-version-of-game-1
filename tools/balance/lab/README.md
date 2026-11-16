# Balance lab (Rules 10, 2026-11-15)

Runs the game's real battle simulator and campaign model under plain Node (no npm install) and scores a design.
The simulator, balance tools and data were identical at the commit the lab was built on (04b0552) and at main (4dbd3c7).
Reports, the data patch and the tuning table are in `docs/game-theory/rules10/`.

## What is here

- The tools (below), the rule files they read (`R10a.json` base patch, `S10.json` tuner state, `R10f.json` the two
  combined, `cp_p5.json` raid and economy patch) and `results/` (summaries behind the report's tables; the raw
  battle rows are not in the repository, re-run to get them).
- `campaignLab.ts`: `tools/balance/campaign.ts` with the fortress and artisan-hiring players, replicate seeds and
  more columns. The gated `campaign.ts` is unchanged.
- The simulator hooks these tools switch on are in `src/gameplay/sim` behind data values that live data does not
  set: `battle.crowding`, `battle.wallHp`, `battle.damageSpread`, `battle.temper.convexity`, an axis's `versus`,
  `kit.breachRadius`, `raids.carryByStars`, `raids.defenseWin.perStar` / `.uncapped`, `raids.raiderMatch`,
  `raids.attackCarryByStars`, `economy.garrisonCrew`, and `raids.labAutoLayout` (model player only). Live battles
  run the same arithmetic as before; SIM_RULES is unchanged. Turning any combat one on for players needs
  `npm run rules:snapshot`, a SIM_RULES bump and the server first, as for any rule change.

## Running it

Node 22.18 or newer, Python 3 with numpy and scipy. No npm install is needed. Run from this folder.

    cd tools/balance/lab
    FRESH=1 SEARCH=1 python3 mkcfg.py cfg.json 12 2 1 R10f.json   # Keep 12, fresh bases, best of six entries
    ./run.sh cfg.json out.json
    python3 peek.py 12 out.json

- `tune5.py <keep> <rounds> R10a.json S10.json [target]`: the tuner. Each round fights 19 armies against the six
  layouts in all four tunings on bases it has not used before, keeps a filtered estimate of every army's average,
  solves for the per-warrior changes that move the 13 showcase armies to the target at once (ridge least
  squares), holds the six probe and search-found armies at or below the target, and moves each layout's bot-base
  level bias toward the mean. State (multipliers, bias, estimates, log) is in `S10.json`; `mkrules.py` turns it
  into a full rules file.
- `oracle10.py out.json rules.json <keep> <n> <seed>`: n random role mixes against the defender's best mix.
  `oracle_do.py out.json rules.json <keep>` then gives the attacker the five best of them on every base and
  re-solves the game. The second number is the one that matters: the first is always large when the
  defender's mix sits on four or five bases.
- `sens10.py rules.json <keep> <tag> <seeds> [armies]`: destruction against overall army strength (cliffs).
  `OVER='{"patch":{...},"troopPatch":{...}}'` tries a change.
- `xp.py <keep> variants.json [seeds]`: a small army panel by tuning and layout, for trying a structural change.
- `camp.ts <campaign id> <patch.json|-> <out.json> [rules.json]`: one model-player campaign. `PILOT=entry`
  makes the model try the six ways in; `REP=n` plays a different run. `campq.sh` runs a list of them one at a
  time; `csum.py <patch tag> <policies...>` averages the replicates. `cp_p5.json` is the Rules 10 raid and
  economy patch.

## What the numbers do not cover

- The payoff is the best of six entry points with the bots' formation. Formation, wave order and smoke are
  worth about 14 more points and are not in the tuning.
- Keeps 9, 12 and 15 were scored on 48 fresh bases each and searched. The other seven Keeps have the tuner's
  own estimate only, after two rounds.
- The campaign model cannot design a base; its buildings are placed on a generated layout. It has no notion of
  wanting to buy anything.
- No person has played any of this.

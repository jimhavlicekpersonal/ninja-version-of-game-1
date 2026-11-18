# Rules 10 (built, not live)

A proposed set of battle, raid and economy rules, measured in the balance lab (`tools/balance/lab`). Nothing here is
live: the simulator hooks exist behind data values that live data does not set, and SIM_RULES is unchanged.

- `Kagemura_Core_Design_v5.pdf`: what Rules 10 is, what it fixed, what it did not, and every measurement.
- `Kagemura_Core_Design_v4.pdf`: the round before (Rules 9), for the history of the raid rules.
- `Kagemura_Plan_to_8.pdf`: the plan from here, with pass/fail tests.
- `rules10_data_patch.json`: the values. `warrior_tuning_by_keep.csv`: the multiplier for each warrior at each Keep's
  research cap.

Correction to the plan's step B2: combat numbers never ship in balance bundles (root `CLAUDE.md`), so the battle side of
Rules 10 cannot be switched on by a bundle. It needs a SIM_RULES bump with the server deployed first, or the
`?sandbox&preview` path used for other built-but-not-live content. ~~Only the raid and economy numbers could go in a bundle.~~
**Corrected 2026-11-18 (P4-10, BNL-10):** not even those: a balance bundle only changes numbers that already exist in
the shipped data (`src/backend/net/balanceBundle.ts`), and none of the Rules 10 keys does. A key must first ship in data
(at a neutral value) before a bundle can move it.

## Status after the 2026-11-16 pass (SIM_RULES 8)

What went live, measured on its own, not as Rules 10: the defense per-star reward and stars-decide-carry
(`raids.defenseWin.perStar`, `raids.carryByStars`, P2-01), raiders from the defender's Keep (`raids.raiderMatch`,
P2-02) and the garrison crew (`economy.garrisonCrew` 2, P2-14). Removed: `kit.breachRadius` (measured to do nothing).
The rest stay hooks with no shipped value, now typed in `src/gameplay/sim/types.ts` and tested one by one
(`tests/gameplay/battle/rules10-hooks.test.ts`; `raids.attackCarryByStars` in `tests/gameplay/sim/defense-2026-11-16.test.ts`):
`battle.wallHp`, `battle.crowding`, `battle.damageSpread`, `battle.temper.convexity` with per-axis `versus`, and
`raids.attackCarryByStars`.

What a switch-on of the battle side would still need: a warrior class on all 50 warriors (`versus` acts on a class no
warrior has), per-warrior multipliers (0.51 to 2.71 in `warrior_tuning_by_keep.csv`) reconciled with the power model the
live roster is pinned to (`tests/gameplay/balance/progression-model.test.ts`), the seven Keeps never tuned, its own pass
table met (best-to-worst army gap 19/19/17 against a mark of 12), a SIM_RULES bump with the server deployed first, and
every balance gate re-run. Its lessons taken in this pass instead: support needs an effect that does damage (P4-01's
support strike) and squad orders (P6-01).

Limits: the payoff is the best of six entry points with the bots' formation; Keeps 9, 12 and 15 were scored on fresh
bases, the other seven Keeps have the tuner's own estimate only; model-player outcomes are not observed retention or
revenue; no person has played any of it.

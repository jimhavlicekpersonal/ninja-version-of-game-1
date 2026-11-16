# defense-raids: the raid loop as a game between attacker and defender

Investigator notes, 2026-11-16, read-only. Everything below was read in today's code and data, measured with
one-off scripts on today's simulator, or reproduced; each item says which. Version numbers are not quoted from
memory (see `docs/STATUS.md`). Scripts and raw outputs are beside this file:

- `def_hold.ts` → `hold_5.out`, `hold_9_12.out`, `hold_15.out` (hold rate by build quality and raider strength)
- `def_econ.ts` → `econ_today_raider.out`, `econ_uniform_raider.out` (per-raid loss and reward, today vs proposed)
- `def_daily.ts` → `daily_12.out`, `daily_9_15.out` (raids per day and loss per day through the real slot/shield rules)
- `def_cost.mjs` (Coins and builder-days of the defensive catalogue per Keep)
- `pace_noraids.ts` → `pace_on.out`, `pace_off.out` (regular model player with and without raids)
- `model_village.ts` (what the gated "defender" village looks like)
- `raider_dist.ts` (which bot raider a village meets, by honor)
- `next_offers.ts` (spread of Next offers against the fee)
- `away.ts` (what a long absence costs)

Run line: `node --experimental-transform-types --import /home/user/ninja-version-of-game-1/tools/balance/lab/register.mjs <script>`
(no npm install needed; the lab's loader hook is only read).

Method for the hold measurements: a village is built from a generated base of the Keep (`generateOpponent`) with
the defensive buildings (defense, trap, hedge, support) set to a chosen quality: `lvl1` (every defensive building
present at level 1, no walls: what the campaign's model player has), `b0` (about caps − 2), `b50` (about caps − 1),
`b100` (caps); storages full, 6 hours in the collectors; the raid is the real `raidVillage`. The raider strength is
pinned with the existing `raids.raiderMatch` hook. 16–24 raids per cell, so single cells carry ± 10 points.

## 1. The answer to "is defense strategically worthless?"

No, and the campaign cannot tell. Three separate facts, in order of weight.

### 1.1 The campaign's 0 % is the model player's village, not the game (reproduced)

`model_village.ts`, policy `defender`, day 38, Keep 10: Kunai Tower 4/4 at average level 1.5 of cap 11, every
other defensive building at level 1 of caps 4–9, walls 0 of 125, last 20 raids all three-starred. The "defender"
ranks defenses at priority 2.6 behind storage, camps and collectors (`tools/balance/playerModel.ts:222-228`) and
places with `findFreeSpot(…, 20, 20)` (`:217`), so it never upgrades a defense and never designs a base. The
"Is defense worth building?" table in `docs/game-theory/CAMPAIGN.md:146-165` therefore compares two undefended
villages, and the PS-1 known-failing gate (`tests/gameplay/balance/campaign-gates.test.ts:101-109`) compares a
rusher with a non-defender. The audit said this (PS-4, `docs/audit/BALANCE_AUDIT_2026-11-08.md:161`); it is still
true today.

### 1.2 A built base holds the raider it is sent (measured)

Which raider: `raider_dist.ts`, 400 draws of `attackerFor` per row. At the campaign's honor for both the regular
and the casual player, at Keeps 5, 9, 12 and 15, the raider is the same one every time: Keep − 1 at the low end
(research one level under that Keep's cap, about 80 % of the defender's own maximum housing from Keep 9, 57 % at Keep 5). Reason:
`matchStrength(..., mirror = true)` clamps strength to at least own Keep − 2 (`src/gameplay/sim/matchmaking.ts:53`)
and honor ÷ 350 sits below that clamp (Keep 12: 3,217 ÷ 350 = 9.2 against a clamp of 10). Above about
350 × (Keep − 1) honor the raider jumps: Keep 12 at 4,300 honor meets a Keep 13 raider 91 % of the time.

Against that typical raider (hold = no star lost):

| Keep | level-1 defenses, no walls | caps − 2 | caps − 1 | caps |
|---|---|---|---|---|
| 5 | 56–60 % held, 0.6★ | 75–80 %, 0.3★ | 88–90 %, 0.2★ | 94–95 %, 0.1★ |
| 9 | 0 %, 3.0★ | 20 %, 1.7★ | 80–90 %, 0.2★ | 100 %, 0★ |
| 12 | 0 %, 3.0★ | 30 %, 0.9★ | 80 %, 0.2★ | 100 %, 0★ |
| 15 | 0 %, 3.0★ | 25–40 %, 1.0–1.25★ | 75–80 %, 0.3–0.4★ | 88–95 %, 0.1★ |

Against a same-Keep raider at mid strength (offset +0.5): Keep 12 caps holds 90 %, caps − 1 30 %; Keep 15 caps 38 %.

### 1.3 But holding does not protect the loot, and pays almost nothing (measured)

Loot leaves with every destroyed building whatever the stars (`src/gameplay/sim/defense.ts:210-230`); a held raid
is one that destroyed under half the base and not the Keep. What a raid costs and pays today, typical raider,
Coins + Provisions:

| Keep | 3★ loss, undefended (full storages) | Campaign average loss per raid (regular) | A held raid still loses | A held raid pays (`defenseWin` 0.05) | Pay ÷ what the held raid lost |
|---|---|---|---|---|---|
| 5 | 166 k | 45 k | 47–67 k | 3.5 k | 5–7 % |
| 9 | 947–959 k | 611 k | 408–440 k | 39.5 k | 9–10 % |
| 12 | 3.83 M | 2.49 M | 1.3–1.7 M | 146 k | 8–11 % |
| 15 | 22.0–22.5 M | 9.29 M | 10.5–12.0 M | 960 k | 8–9 % |

Net per raid today (reward − loss), from `econ_today_raider.out`:

| Keep | level 1 | caps − 2 | caps − 1 | caps |
|---|---|---|---|---|
| 5 | −73 k | −50 k | −63 k | −61 k |
| 9 | −947 k | −566 k | −407 k | −376 k |
| 12 | −3.83 M | −1.77 M | −1.46 M | −1.51 M |
| 15 | −22.5 M | −12.1 M | −9.85 M | −9.42 M |

So the first defensive levels halve the loss; everything from caps − 2 to caps (62.6 M Coins at Keep 12,
214 M at Keep 15, `def_cost.mjs`) buys about nothing, because a base that "holds" every raid still loses a third
of what was raidable.

### 1.4 For a one-visit player a stronger base is raided more and loses more per day (measured)

A shield needs 30 % destruction (`raids.json` `shieldTiers`); a held raid at 26–30 % gives none, and exhaustion
counts only lost raids (`defense.ts:89`). `def_daily.ts`, one visit a day, no attack (two villages × 20–25 days,
storages refilled at each visit, so an upper bound):

| Keep | Village | Raids per day | Lost per day today |
|---|---|---|---|
| 9 | level 1 / caps − 2 / caps − 1 / caps | 0.97 / 1.02 / 1.18 / 1.48 | 0.90 M / 0.63 M / 0.46 M / 0.55 M |
| 12 | level 1 / caps − 2 / caps − 1 / caps | 1.00 / 1.06 / 1.12 / 1.20 | 3.72 M / 1.86 M / 1.96 M / 2.08 M |
| 15 | level 1 / caps − 2 / caps − 1 / caps | 1.02 / 1.13 / 1.35 / 1.70 | 21.9 M / 13.2 M / 14.3 M / 17.0 M |

At Keep 15 the maxed base loses 29 % more per day than the caps − 2 base. With four visits a day (each attack
ends the shield) the order is right but flat: Keep 12 2.99 M / 2.74 M / 2.44 M per day for caps − 2 / caps − 1 / caps.

### 1.5 Defense cannot buy pace, whatever the loot rule (measured)

`pace_noraids.ts`, the gated regular policy. With raids on it reproduces `campaign.json` to the day (Keep 9 on
day 28.4, Keep 10 on 33.4, Keep 11 on 42.2). With `chancePerSlot` 0: Keep 9 on day 24.7, Keep 10 on 29.6,
Keep 11 on 37.0. The whole raid tax (61–63 % of loot) costs 11–13 % of pace, because the Keep's own timer is
most of a Keep (120 hours of the 9 days at Keep 11, `buildings.json` `elder_toadstool`). A free, perfect defense
would gain at most that; a real one costs 1.4× (to caps − 2: 16.5 M) to 3.3× (to caps: 37.6 M) the next Keep's
own price in Coins at Keep 12 (11.45 M), and 2.0× / 3.9× at Keep 14. The lab's Rules 10 campaigns agree: with
carry-by-stars and a 0.15 per-star reward the fortress (within 3 levels of cap, hiring artisans) still reached
Keep 12 on day 59.2 against the rusher's
48.8 (`tools/balance/lab/results/csum_cp_p5.json`), while its stolen share fell from 59 % to 45 % (34.5 % for
the within-1-level fortress).

Conclusion: the PS-1 target "skipping defense costs ≥ 10 % of the pace to Keep 12" is not reachable by loot
protection and should be restated as an economic gate (section 3, DEF-03). Defense can honestly pay in wealth,
honor and visible results; pace parity needs a different lever (opportunity: escort bonus).

## 2. The smallest rule set that makes defense a graded decision

All of it is in `raids.json` / `ranks.json` plus hooks that already exist in the simulator behind data values
live data does not set. None of it touches `troops.json`, `buildings.json` or `battle.json`, so the combat
fingerprint (`tests/gameplay/battle/rules-version.test.ts:33`) and `SIM_RULES` stay as they are. All of it
changes the campaign fingerprint (`tools/balance/campaign.ts:126-128`: `raids`, `ranks`, `defense.ts`,
`matchmaking.ts`), so `npm run balance:campaign` must be re-run.

1. `raids.carryByStars: [0.2, 0.5, 0.8, 1]` (hook: `defense.ts:208-209`). A raider carries home a share of what
   it broke open, by the stars it won.
   - Bug to fix when it goes live: `defense.ts:215` computes `v = v0 * carry` and the storage branch
     (`:225-227`) does not round, so resources become fractional. Floor it.
2. `raids.defenseWin: { shareOfRaidLoot: 0.15, perStar: true }` (hooks: `defense.ts:244-245`, `:270-285`). Every
   star denied pays a third. Full hold pays 10.5 k / 118.5 k / 437 k / 2.88 M at Keeps 5 / 9 / 12 / 15.
   Keep it storage-capped (the `uncapped` hook would push resources past capacity); record what did not fit.
3. `raids.raiderMatch: { lo: -1, hi: 0 }` (hook: `matchmaking.ts:274-279`). Raiders come from the defender's
   Keep (Keep − 1, low to high), not from honor: a spread instead of a point mass, and holding raids no longer
   summons a Keep + 1 raider.
4. Add the three to the `RaidsData` type (`src/gameplay/sim/types.ts:886-892`) and drop the `as` casts.

Same battles, proposed rules (raider drawn Keep + U(−1, 0), `econ_uniform_raider.out`), net per raid:

| Keep | level 1 | caps − 2 | caps − 1 | caps |
|---|---|---|---|---|
| 5 | −29 k | −12 k | −8 k | −4 k |
| 9 | −940 k | −482 k | −25 k | +33 k |
| 12 | −3.82 M | −1.10 M | −184 k | +64 k |
| 15 | −22.5 M | −8.39 M | −1.25 M | +152 k |

Per day, four visits (`daily_*.out`, typical raider): Keep 12 loss 5.72 M / 1.93 M / 1.03 M / 0.49 M with rewards
0 / 0.42 M / 0.63 M / 0.84 M; Keep 15 loss 36.6 M / 9.7 M / 5.6 M / 3.8 M with rewards 0 / 3.7 M / 5.4 M / 6.2 M.
Every level now moves the result, the maxed base is slightly positive, the perverse order of 1.4 disappears
(Keep 15 one visit: 6.05 M / 4.16 M / 3.40 M lost per day for caps − 2 / caps − 1 / caps), and nobody is worse
off than today (carry ≤ 1, rewards ≥ today's). The undefended village is unchanged, so "losses hurt" stays.
Reward size against income: about 1.9 raids a day × 437 k = 0.84 M a day at Keep 12 for a maxed base, against
about 6.7 M a day of raid loot for the regular player.

What this does not do: make the casual player with level-1 defenses lose less (see DEF-06, DEF-08, DEF-11), or
make defense buy Keep pace (1.5).

## 3. Problems (most important first)

DEF-01 · critical · measured — Stars do not protect loot; a held raid loses a third of everything raidable and is
paid 5–11 % of that back. Evidence 1.3. Fix: section 2 items 1, 2, 4, the rounding fix, and one line in the
battle log / welcome-back ("kept X of Y"). Touches BALANCE_GATES, UI, I18N.

DEF-02 · high · measured — One-visit players with strong bases are raided more often and lose more per day than
with weaker ones (1.4). Fix: comes with DEF-01 (a held raid becomes about neutral); add a gate in a new small
test that loss per day never rises with defense quality at Keeps 9, 12, 15 (the `def_daily.ts` harness).
Touches BALANCE_GATES.

DEF-03 · high · reproduced — The gated campaign cannot see defense (1.1), and the PS-1 target is unreachable (1.5).
Fix: port the lab's `fortress` policy (already in `playerModel.ts:58-60, 184-192, 226`) into `CAMPAIGNS` as
`regular_fortress` (gap 2) and give model villages a real layout through a data clone with
`raids.labAutoLayout` + `labWalls` (`defense.ts:184-196`); replace the known-failing assertion with: fortress
holds ≥ 40 % at Keeps 9–15; fortress stolen ÷ looted ≤ 0.6 × the rusher's; fortress reaches Keep 12 within
1.25 × the rusher's days. Touches BALANCE_GATES, DOCS.

DEF-04 · high · measured — Bot raid strength is a point mass at the weakest raider for regular and casual honor,
then jumps to Keep + 1 with honor (1.2); a held raid pays +34 to +40 honor (`ranks.ts:38-41`), so holding
raises the raider. Fix: section 2 item 3. Touches BALANCE_GATES.

DEF-05 · high · read-in-code — Bot raiders bring one ground army per Keep. `raids.json` `botArmyMix` has no flyer
at Keeps 7–15 (Kite Raider is 8–10 % at Keeps 3–6 only) and uses four of the ten roles from Keep 7 (blade,
thrower, guardian, saboteur; never shadow, mystic, siege or beast); the audit measured
Sky Bows and Ballistas at 0.0 points against it (DM-1). Anti-air, the Lantern Line and two of the three temper
axes never matter on defense. Fix: `raids.raiderMixes` (two or three alternates per Keep band: today's line, an
air raid, a shadow/siege raid), picked by the raid's seed in `attackerFor`; `botArmy()` and its 20 other callers
stay as they are. Check each alternate in the army lab so none is a free hold. Touches BALANCE_GATES.

DEF-06 · high · measured — A long absence empties the treasury. `maxRaidsPerCatchUp` is 24. `away.ts`, level-1
defenses: 7 days away from a 30 %-full storage loses 40–62 % of what was stored (Keeps 12 / 9); 30 days loses
94–97 % (41–67 % from full storages), and the welcome-back screen lists 24 raids. Fix: `raids.json`
`maxRaidsPerCatchUp` 24 → 3. The campaign players visit daily, so results do not change (the fingerprint does).
Touches DATA_ONLY, BALANCE_GATES.

DEF-07 · high · read-in-code — A build with a server never runs bot raids (`src/main.ts:280`
`botRaids: !serverUrl`; `offline.ts:42`), whether or not any real player attacks. At low population the village
is never raided: defenses, shields, exhaustion, the defense log and Settle the score are dead, and the game is
11–13 % faster than the gated campaign (1.5). Online, a held raid pays honor only (`server/core/pvp.ts:689-690`;
`defenseWinReward` exists only in `raidVillage`), and a real raider cannot be answered (`rematch.ts:31` needs
`simulated`). Fix: the server sends a labelled simulated raider to a village with no real raid in the last
N hours, at the bot slot rate, through `applyDefense`; pay the held reward there too. Touches SERVER, PROTOCOL,
BALANCE_GATES, DOCS. Hosting and population are the owner's.

DEF-08 · medium · measured from data — Settle the score spends a full army for 12–26 % of a normal raid and no
honor. Keep 12: three stars pay 437 k (`rematch.ts:43-46`, share 0.15) against 1.67 M banked by an average raid;
the audit put it at negative value at every Keep (LD-3). The raider's base is Keep − 1 at the low end, easier
than the player's normal opponents. Fix: `raids.rematch.recoverShare` 0.75: the reward is the larger of today's
and recoverShare × stars ÷ 3 × what that raid took (`record.result.loot`); `rematchReward` and `rematchEnd`
(`village.ts:1985-2007`). At 2.5 stars that is about a normal raid, at 3 stars more, so it is a real choice and
the casual player's recovery. Touches PLAYER_COMMANDS (the server replays `rematchEnd`), I18N, UI, BALANCE_GATES
(fingerprint only).

DEF-09 · medium · measured from data — Declared stakes are a dominated button. Break-even hit rates are 91 %
(2★ × 1.1) and 80 % (3★ × 1.25); `campaign.json` gives P(≥ 2★) = 0.50–0.64 at Keeps 10–15 and P(3★) = 0.04–0.17,
so always declaring 2★ multiplies loot by 0.55–0.71 and 3★ by 0.05–0.21; only Keeps 5 and 9 reach 0.94–1.00.
(Ignores that higher-star raids carry more loot, which lowers the true break-even a little.) Fix: `raids.json`
`stakes.byStars` `{ "2": 1.3, "3": 1.75 }` (break-even 77 % and 57 %). Touches DATA_ONLY, BALANCE_GATES
(fingerprint only), server deploy order.

DEF-10 · medium · measured from data — Honor is a play-time counter and league pay fades. Honor needed before it
moves the opponent above the research floor: 3,913 at Keep 12 and 4,725 at Keep 15 against the regular player's
3,217 and 4,308 (LD-2 still holds). The league win bonus is not scaled by Keep (`village.ts:1773-1782`): 30.6 %
of an average raid at Keep 5 (Iron, 5 k + 5 k on 32.7 k), 3.6 % at Keep 12, 1.4 % at Keep 15. The season reset
halves everything above 400 (`ranks.ts:82`), and the regular Keep 15 player averages 4,308, under Shadow (4,400)
and Kage (5,200). Fix: express `winBonus` as a share of the Keep's lowest raid loot (2 % Cedar to 15 % Kage per
three stars) in `leagueWinBonus`; reset to floor + 75 % of the excess. Touches BALANCE_GATES, UI, PLAYER_COMMANDS.

DEF-11 · medium · measured from data — Casual players lose more than they loot and the safety net misses them.
Totals: casual 156 %, casual explorer 266 % (`CAMPAIGN.md:59, 128`). The daily attack ends the shield
(`village.ts:1823`), the 12 % per hour slot refills it within a day, every raid is three stars, and exhaustion
(24 hours) rarely catches raids a day apart. Fix: `raids.exhaustion.windowHours` 24 → 36, with DEF-06 and DEF-08.
It also lowers the regular player's losses, so check the 100–140-day Keep 15 gate. Touches DATA_ONLY, BALANCE_GATES.

DEF-12 · medium · read-in-code + campaign — A struggling player's honor falls but their opponents do not get
easier. The casual explorer wins 19 % and 18 % of raids at Keeps 13 and 14 (0.26 and 0.27 stars over 118 raids)
while honor falls 1,154 → 685; opponents stay at Keep 12.1–13.0 because the research floor sets them
(`matchmaking.ts:169-172`). Fix: `ranks.matchmaking.lossStreakSlack` 0.25 per consecutive lost raid (cap 1.0,
reset by a win), counting only raids that deployed ≥ 80 % of the army's housing, in `opponentFor`. Touches
BALANCE_GATES; the server's generated fallback keeps its own floor.

DEF-13 · low · measured — Next is a fair choice at Keeps 9 and 12 (fee 1.6 % of the mean offer, best
accept-or-reroll policy +9 %, Iron Tide 28 % richer than Moon Veil) and weak at Keeps 5 and 15 (fee 4.8 % and
3.3 %, best policy +1.8 % and +5.8 %), because the fee follows the player's Keep while the offers are a Keep
lower with the 0.8 loot penalty. Fix in `scoutFee` (`village.ts:1681-1684`): price by the Keep the player is
matched against. Do not edit `battle.scoutFeeByHall` or `generatedLootByHall`: both are inside the combat
fingerprint, so a change there forces a `SIM_RULES` bump. Touches BALANCE_GATES.

Lower priority, not in the list:

- `raidVillage` reads six lab values through `as` casts (`defense.ts:184, 208, 244, 278`; `matchmaking.ts:274`;
  `village.ts:1850`). A balance bundle cannot switch them on (bundles only change existing numbers,
  `src/backend/net/balanceBundle.ts:79-85`), so this is tidiness; type them when they go live.
- 3-star rate and win rate: 4–10 % three stars and 74–81 % wins at Keeps 12–15 with the bot plan; the lab puts
  formation, wave order and smoke at about 14 points more for a person. Healthy. The swing between neighbours
  (Keep 8: 0 %, Keep 9: 30 %, Keep 10: 11 %) follows `powerSlackByKeep`; not worth touching.
- Diversity carry (0.85–1.0): only a one-role army pays (−15 %); two roles at 50/50 carry 0.975. Mild and fine.
- Server push text for a raid is built in English in `server/core/pvp.ts:733` and the attacker's name is not
  isolated there (it is in `duels.ts:141`); `server/push/push.ts:88` passes it through `notificationText`.
  Backend's area.

## 4. Genius elements: do not change

1. The raid clock (`defense.ts:305-337`): slots fixed on the real clock, whether a slot holds a raid comes from
   the village seed, so the same save always meets the same raids and splitting an absence dodges nothing.
2. The research-strength floor (`matchmaking.ts:126-172`): housing-weighted `attackerStrength`, `researchKeep`,
   `levelCapOffset`, per-Keep slack; the sandbagger gate proves it (day 55 against 51.2 to Keep 12).
3. Staked honor (`ranks.ts:22-35`, `defenseHonorLossShare` 0): being raided costs no honor, wins against lower
   honor pay less down to nothing.
4. Exhausted stores and exposure targeting (`defense.ts:84-91`, `pvp.ts:386-397`).
5. Rival clans that answer the player (`matchmaking.ts:182-220`, `battle.json` `temper.rivals`/`offers`): home
   tempers, loot and toughness per clan, a counter-temper half the time against the player's last ten armies.
6. The rematch structure (`rematch.ts`, `defense.ts:258`): the raider's own base rebuilt from the record, once,
   72 hours, labelled simulated. Only its payout is wrong (DEF-08).
7. Loot provenance and bounded loss (`defense.ts:43-78, 210-230`; `village.ts:1737-1770`): loot leaves the
   building that held it, 20 % of storage under a per-Keep cap, 50 % of collectors, a debt is never deepened.
8. Result-stale gates (`campaign.ts:145-152`, `campaign-gates.test.ts:28-32, 101-109`): the fingerprint and the
   explicit known-failing assertion.

Also good: the first three softened raids and the 24-hour shield; scout stays the same opponent until attacked
or paid; the stake is fixed on the server before the seed is sent (`pvp.ts:476-480`); hidden Attack and Base
Ratings with a power term (`rating.ts`).

## 5. Opportunities

1. Defense drill: "Test my defenses" runs the simulated raider against the player's own village on demand and
   plays the replay; no loot, no honor, no shield change. Reuses `attackerFor`, `villageToBase`,
   `botDeployments`, the replay viewer and the practice label. M; UI, I18N.
2. Defense report: per raid "kept X of Y, denied N stars, reward Z", the entry point used and the first three
   buildings that fell, on welcome-back and in the log; feed the weakest side to `nextObjective`. M; UI, I18N.
3. Raider clans with their own armies and an honest forecast in the Events panel on the existing 14-day
   schedule (builds on DEF-05). M–L; BALANCE_GATES, UI, I18N.
4. Hold tasks and achievements: weekly "deny 3 stars", an achievement ladder on `stats.defensesWon`, Season
   Scroll points for stars denied. S–M; DATA_ONLY, I18N, BALANCE_GATES (pass and task data are fingerprinted).
5. Escort bonus (the Living Fortress "Watch" as a bonus, never a cut): own raid loot +0–15 % by a defense
   index. The one lever that lets defense buy pace. L; PLAYER_COMMANDS, SERVER, BALANCE_GATES, UI, I18N.
6. Towers payable in Provisions: add `defense` and `support` to `economy.provisionsPayable`
   (`village.ts:474-477`); Coins bind 1.1–2.7× at Keeps 3–12 while Provisions sit idle (CU-1). S; DATA_ONLY,
   I18N (the refusal sentence), BALANCE_GATES (fingerprint only).
7. Season defense summary on the league chest screen: raids held, stars denied, loot kept this season. M; UI,
   I18N, SAVE_VERSION (a per-season baseline of the stats).
8. Real-player revenge online: one attack on the player who raided you, within 72 hours, at normal rules. L;
   SERVER, PROTOCOL, UI, I18N.

## 6. Which fixes touch what

- Campaign fingerprint only (re-run, results identical because the model does not use the feature):
  DEF-06, DEF-08, DEF-09, opportunity 6.
- Campaign results change: DEF-01/02/04 (little for the level-1 model villages, a lot for a fortress policy),
  DEF-03 (new campaign), DEF-05, DEF-10, DEF-11, DEF-12, DEF-13.
- Battle results (`SIM_RULES`): none of the above. The trap is `battle.json`: `generatedLootByHall` and
  `scoutFeeByHall` live there and are hashed by the combat fingerprint.
- Server code: DEF-07, opportunities 5 and 8. Server deploy order (same sim code replays the command):
  DEF-08, DEF-09, DEF-10.

## 7. Limits

Hold rates use generated layouts (walls included except in `lvl1`), the bots' attack plan, storages full and
16–24 raids per cell; a person's layout may do better or worse. Daily numbers refill the village at every visit.
The pace comparison ran to Keep 11 (a 28-second budget per run). No campaign was re-run, and none of the proposed
values was played through a full campaign here; the lab's Rules 10 campaigns (`csum_cp_p5.json`) are the nearest
evidence. Model-player outcomes are not real players.

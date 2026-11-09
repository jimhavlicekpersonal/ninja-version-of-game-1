# Option: a direct balance pass (nerf the outliers, counter-buildings)

Owner: GAME THEORY. Status: measured option, not implemented. Asked 2026-11-08: instead of the Living Fortress, can we just balance the overpowered warriors, or give a portion of the buildings extra power against the overpowered tactics? Measured in the real simulation (a scratch copy of the sim with one data-driven hook, `docs/audit/balance-2026-11-08/scripts/design/counter_hook.patch`), ten army styles per Keep, 10 bases × 2 entry seeds, bot deployment plan, hero. Outputs: `measurements/design/nerf_vs_counter_K*.out`, `skydebug.out`.

## Variants

- **V1 nerf:** Iron Monk aura 15 % → 7 %; Mountain Shield splash cover 50 % → 25 %; Eclipse Ninja crit chance 25 % → 8 %; Dragon Kite splash 0.35 → 0.15 and Thunder Kite 0.35 → 0.2; Chain-Sickle shred 20 % → 10 %; Shuriken Storm splash 0.35 → 0.2.
- **V2 counters on every tower of a type:** Shuriken Tower +80 % against ranged warriors, Firework Mortar +60 % against 5-housing tanks and +80 % against stealth, Sky Bow +60 % against flyers.
- **V2p counters on one tower of each type** ("a portion of the buildings").
- **V3:** half the nerfs plus V2p.
- **V4:** full nerfs + V2p + buffs to the weak families (siege +35 %, beasts +30 %, shadows below tier 5 +25 %, mystics +20 %, HP and damage).

## Results

| Keep | Measure | Today | V1 nerf | V2 all | V2p one | V3 | V4 |
|---|---|---|---|---|---|---|---|
| 8 | best army (destruction %) | 79.5 | 76.8 | 73.0 | 79.0 | 77.2 | 74.6 |
| 8 | best − Suggested | 13.7 | 10.9 | 9.0 | 14.1 | 12.3 | 9.7 |
| 8 | armies within 5 points of the best | 1 | 1 | 1 | 1 | 1 | 1 |
| 12 | best army | 86.4 | 76.9 | 81.8 | 82.8 | 75.5 | shadow 79.7 |
| 12 | best − Suggested | 20.6 | 21.4 | 24.6 | 19.2 | 17.6 | 26.7 |
| 12 | armies within 5 points | 1 | 1 | 1 | 1 | 1 | 2 |
| 15 | best army | Eclipse 94.7 | Eclipse 88.0 | air 90.0 | air 90.0 | air 90.5 | air 84.3 |
| 15 | best − Suggested | 14.3 | 7.5 | 14.0 | 10.7 | 11.2 | **5.0** |
| 15 | armies within 5 points | 2 | 3 | 1 | 2 | 1 | 2 (6 within 11) |

## What it shows

1. **Nerfs work where the outlier is one warrior.** Eclipse Ninja at Keep 15 falls from 94.7 % (85 % three-star) to 88.0 % with the crit nerf, and to 61.0 % with a Mortar bonus against stealth on every Mortar (78.5 % with it on one Mortar). Keep 15 under V4 has six armies within 11 points of each other (air 84.3, the thrower line 83.2, Suggested 79.3, a mixed army 76.3, Eclipse 75.4, throwers + Oni 73.0): the closest to balanced of any variant measured.
2. **Nerfs do not work where the outlier is a combination.** At Keeps 8 and 12 the best army and the Suggested army share the nerfed warriors (Chain-Sickle Reapers, Mountain Shields), so both fall together: at Keep 12 the leader drops 9.5 points and the gap to the Suggested army stays 21. At Keep 8 the leader is a Wind-Step Assassin mass, which none of the nerfs touch; it stays 10–14 points ahead in every variant.
3. **A counter on a tactic everyone uses hits everyone.** Shuriken Towers +80 % against ranged warriors cut the leader at Keep 12 by 4.6 points but the Suggested army by 8.6, widening the gap to 24.6, because every competitive army carries throwers.
4. **Extra damage only helps where damage is the bottleneck.** A Sky Bow bonus against flyers changed nothing (air 90.0 % with +60 % and with +500 %; 100 % with Sky Bows at zero damage): a level-9 Sky Bow already kills a Dragon Kite in one shot with about 4.7× overkill. Against air the limit is shots per second and how long the Sky Bows survive the kites' splash, so the counter must be fire rate, a third Sky Bow earlier, or splash, not damage.
5. **Buffing the bottom creates the next outlier unless it is measured.** Shadows +25 % made the Void Walker army the new Keep 12 leader (44.3 → 79.7). Beasts +30 % was about right (Keep 8: 28 → 46; Keep 15: 54 → 61). Siege +35 % is still last (24–43 %): its problem is behaviour (wall-first targeting, short range), not stats.
6. **A "portion" of the buildings is a useful dial.** One counter tower per type gives about half the effect of all of them (Eclipse 94.7 → 78.5 vs 61.0), which is a cleaner tuning knob than numbers on the warriors.

## Verdict

A direct balance pass is worth doing and is cheap (data-only, one `SIM_RULES` bump, about two days with the measurements). It reliably fixes single-warrior outliers (Eclipse, Dragon Kites) and can make Keep 15 close to balanced. It does not, on its own, fix Keeps 8 and 12, where the advantage comes from a combination that the Suggested army half-shares, and it cannot make the optimum *hard to find*: with every base of a Keep built the same way, there is always one best army, and tuning only narrows the gap. It also leaves the non-warrior problems untouched (defence not worth building, the queue-dilution matchmaking exploit, the hero-only loot, the currency loads).

## Recommended version, if this route is taken

1. **Update the Suggested army to the measured best per Keep** (the cheapest fix of all: it closes a 10–21 point trap for every player who trusts the button).
2. **Nerf the two single-warrior outliers:** Eclipse Ninja crit chance 25 % → 10 %; Dragon Kite splash 0.35 → 0.2.
3. **Counter only where damage is the bottleneck:** Mortar +60 % against stealth on one Mortar per base; anti-air as Sky Bow fire interval 10 → 7 ticks (not damage). Skip the Shuriken-vs-ranged counter.
4. **Buff the bottom in small measured steps:** beasts +25 %, shadows below tier 5 +10 %, mystics +15 %; give siege a behaviour fix (target the nearest defence once its wall is down) rather than stats.
5. **Ship the two one-line rule fixes from the audit with it:** matchmaking strength weighted by fielded housing (queue ignored) and no loot or honor from a battle with no warriors.
6. **Gate it:** rerun `docs/audit/balance-2026-11-08/scripts/army_search/harness.ts` at Keeps 8, 12, 15 and `scripts/design/nerf_vs_counter.ts`; target at least four of the ten panel armies within 8 points of the best at every Keep, and the Suggested army within 5. Then `npm run balance:armies`, `npm run balance:campaign`, `npm run rules:snapshot` before bumping `SIM_RULES`.

This pass can come first and the Living Fortress later: nothing here conflicts with stances, memory or the Watch, and the measured numbers carry over.

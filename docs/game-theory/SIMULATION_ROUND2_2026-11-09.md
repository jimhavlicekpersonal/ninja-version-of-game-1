# Simulation round 2: co-evolution, a player-versus-player population, Trials and the Next lottery

Owner: GAME THEORY. Status: measurements and proposals, nothing implemented. Written 2026-11-09 on top of [`docs/audit/BALANCE_AUDIT_2026-11-08.md`](../audit/BALANCE_AUDIT_2026-11-08.md) and [`DESIGN_TEMPERING_2026-11-08.md`](DESIGN_TEMPERING_2026-11-08.md). Scripts: `docs/audit/balance-2026-11-08/scripts/design/{coevo.ts,pvp_pop.ts,misc.ts}` (they import the patched scratch sim `scratch/gp`, recreated from `counter_hook.patch`); outputs: `measurements/design/{coevo_K12.out,coevo_K15.out,pvp_pop.out,misc.out}`.

## 1. Co-evolution with Tempering

Method: for each pure tempered profile (and today), a coordinate-descent army search *against that profile* (36 evaluations from the best known army); the searched armies, their spread-deployment variants and a seven-army panel form the attacker pool; the defender pool adds heterogeneous bases (Kunai Towers on one axis, Shuriken Towers on another). Matrix of mean destruction over 10 bases × 2 entry seeds; then 16 steps of sequential best response and a fictitious-play mixed equilibrium.

| Keep | Safest army's largest gap to a profile's best army | Best-response dynamics | Mixed equilibrium |
|---|---|---|---|
| 12 | 11.7 points (no universal army) | 3-state cycle: ranged line → Reach base → air → Watch base → ranged line | attacker: two searched ranged lines 57/41 %; defender: Reach 51 %, Reach+Watch 47 % |
| 15 | 13.3 points (no universal army) | 3-state cycle: ranged line → Reach base → Eclipse → split base → air → Watch base | attacker: searched ranged line 73 %, air 25 %; defender: Reach+Watch 72 %, split Blast/Reach 21 %, Reach 7 % |

Findings:

- **Tempering removes the universal army at both Keeps** (gap ≥ 11.7), and the dynamics cycle instead of settling.
- **Pure Blast is not a profile, it is a trap for the stacked bot plan.** An army searched against Blast at Keep 12 scores 99.7; at Keep 15 every spread attacker scores 93–100 against pure Blast. Blast works only *mixed with Reach in the same base*.
- **Heterogeneous bases beat every uniform profile.** Kunai on Blast + Shuriken on Reach holds the attacker's best response to 88.5 (Keep 12) and 89.7 (Keep 15), the lowest of any profile at Keep 15. Per-building tempers must be in the design and shown at scouting (`IMPLEMENTATION_NOTE_TEMPERING.md` section 10 listed this as unmeasured).

## 2. A player-versus-player population

Method: 12 model players (3 regular raiders, 2 rushers, 2 turtles, 2 level-1 defenders, 2 casual raiders, 1 casual turtle), 45 days, each raiding the richest unshielded *real* village in its Keep window (`villageToBase`, `battleEnd`, the real `applyDefense` command), regular players 3 raids a day and casual players 1, bot raids still applied while offline.

| Group | Keep at day 45 | Honor | Taken | Lost to players | Net | Times raided | Held |
|---|---|---|---|---|---|---|---|
| raider (regular) | 10.0 | 8 | 7.3 M | 8.6 M | −1.3 M | 22.7 | 0 % |
| rusher (regular) | 10.0 | 3 | 7.1 M | 8.9 M | −1.7 M | 25.5 | 0 % |
| defender (regular, level-1 towers) | 9.5 | 145 | 7.2 M | 4.3 M | +2.9 M | 22.0 | 0 % |
| turtle (regular) | 7.0 | 572 | 3.5 M | 4.3 M | −0.7 M | 34.5 | 23 % |
| raider (casual) | 6.0 | 155 | 2.7 M | 2.5 M | +0.3 M | 22.5 | 0 % |
| turtle (casual) | 5.0 | 640 | 2.5 M | 0.2 M | +2.4 M | 6.0 | 0 % |

New holes:

1. **Honor inverts.** The most successful raiders end at honor 0–24 because they are the richest villages and are farmed; the Keep-5 casual turtle ends at 640. In a zero-sum raid economy honor counts how often you were raided, not how well you raid, and the floor at 0 hides the damage.
2. **Lagging pays.** The casual Keep-5 turtle had almost nobody in its Keep window (raided 6 times), raided Keep-6 players with no loot penalty (penalties apply only when raiding down) and finished with the best net in the population.
3. **The turtle's Provisions are a beacon.** Turtles spend Coins on defence and sit at 81–94 % full Provisions, so richest-first targeting picks them: raided 34.5 times, more than anyone, and net negative despite holding 23–38 % of raids.
4. Wealth inequality (Gini of stored resources) 0.31 at day 45; Keeps spread 5–10.

## 3. Shadow Trials and the Next lottery

- **Trials** (bot mix at caps + hero, primary fortress then up to four alternates, 2 stars to clear): a Keep 8 army clears tiers 25–35 and stalls on the first Keep 9 fortress (tier 36); a Keep 12 army clears 41–51 and stalls at 52. Each new Keep harvests about 4 average raids of resources and 5 Jade at once. Bounded; no exploit.
- **Next** (300 scouted offers per Keep at the campaign honor): the richest offer holds only 1.20–1.32× the poorest; the best accept-or-reroll policy gains 1.6–4.5 % per raid against a fee of 1.3–1.5 % of a mean offer. The reroll is a non-decision.

## 4. Balance proposals these results suggest (not implemented)

| Proposal | Rule | Fixes |
|---|---|---|
| **Exposure targeting** | A village's chance of being offered to an attacker falls with how recently it was raided (e.g. weight = min(1, hours since last raid / 12)) instead of richest-first | the farmed raider (hole 1), the turtle beacon (hole 3) |
| **Attacker-staked honor** | Attackers gain honor only against bases at or above their own honor; a held raid pays the defender honor; being raided costs no honor | honor inversion (hole 1); first honor return for defence |
| **Exhausted stores** | Each raid suffered in the last 24 h halves the raidable share of storage for the next one | protects the farmed and the casual player without new shields |
| **Upward loot penalty** | Raiding a base above your Keep pays less, symmetric to `lootPenaltyByHallDiff` today | lagging pays (hole 2) |
| **Diversity carries more** | Banked loot × (0.7 + 0.3 × normalized entropy of the army's role mix) | pulls the Tempering equilibrium away from mono-armies (180 Eclipse, 90 Dragon Kites) |
| **Either-currency defences** | Walls and traps may be paid in Provisions | the turtle's idle Provisions (hole 3) |
| **Declared stakes** | Before a raid the attacker declares 1, 2 or 3 stars for ×0.8, ×1.0, ×1.3 loot; a miss forfeits the loot | every PvP raid was a 3-star walkover: gives the attacker a decision to get wrong |
| **A real Next** | Offers differ in temper and size by rival clan, or the fee is removed | the non-decision reroll |
| **Per-building tempers** | Allow and show heterogeneous tempers (Tempering design update) | the strongest defensive shape measured |

Limits: bot deployment plan; twelve players for 45 days; one seed set per experiment; measurements from a scratch copy of the sim, not gated tests.

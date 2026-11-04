# Playable warrior roster

All 50 catalog warriors are trainable and deployable. Unlocks follow the existing 15-Keep catalog and require an appropriately upgraded Training Dojo. Existing IDs, inventory, research and progress survive save migration v10 → v11. Combat changes require protocol 4 on both client and server.

## Combat mechanics

Ability numbers live in `src/gameplay/data/troops.json` (`kit`); shared limits live in `battle.json` (`warriorRules`). `sim/battle/warriors.ts` implements effects and `battle.ts` integrates them with damage, movement, targeting, projectiles and traps.

| Role | Implemented specialties |
|---|---|
| Blade | Basic melee, reduced secondary cleave, double opening dash strike, every-fourth-hit crescent, three-building arcs |
| Thrower | Ranged attacks (0.7× damage budget: range pays for safety), fan splash, five-second nonstacking poison, nonstacking 20% vulnerability, rapid 5-range needles (extra 0.6× DPS tax) |
| Guardian | Tanking, nonstacking 15% resistance, in-range defense taunt, directional splash reduction, fivefold wall damage |
| Saboteur | Original one-use six-second jam, trap disarming, two nine-second jams, five-second delayed explosive, one three-defense four-second blackout |
| Infiltrator | Wall bypass, storage preference, defense preference, one two-second emergence stun, periodic nearby wall opening |
| Sky | Flight, fast storage raids, ember splash and burning, lightning against up to four defenses, bomber-crew splash |
| Mystic | Follows the nearest ally it can reach and breaks a wall when every ally is walled in; nonstacking 2.5%-max-health/second healing, nonstacking 25% haste, intermittent moving mist, one 35%-health resurrection, one 25% heal plus shields |
| Siege | Fourfold wall damage, flame splash/burning, one suicidal explosion, stationary 5-range artillery that fires on defenses (0.5× DPS tax), wide splash and burning ground. Wall-breakers break the wall between them and the nearest defense or Keep, not every wall |
| Beast | Two budgeted hunting dogs, nonstacking defense fire delay from 3.5 range (0.6× DPS tax; a Repair Crane cuts it short), one wall-breaking charge, 75% extra damage below half health, two budgeted war tigers |
| Shadow | Hidden until first attack, four-second decoy, double damage against smoked buildings, periodic six-tile shadow step, trap immunity and seeded 25% double-damage criticals |

## Limits

- Gearbreaker, Ghost Engineer, Mole King and Saboteur share ten seconds of defense immunity after recovery. Blackout affects at most three defenses and has one charge.
- Identical resistance, haste, healing and mist auras do not stack. Mist covers two tiles for three seconds out of each eight-second cycle and uses the Smoke Bomb range floor.
- Identical poison on one building refreshes its strongest application. Overlapping same-type burning ground applies only its strongest damage to each building per tick. Ground effects persist after their caster falls.
- A Sage casts once. Each recipient can receive its heal/shield only once per ten seconds; shields expire after four seconds and absorb one hit up to 50% of the recipient's maximum health.
- A Spirit Caller revives once; an individual warrior can be resurrected only once. Pets and decoys cannot be resurrected.
- Each handler keeps 60% of the original HP/damage budget; each of two pets receives 20%. Pets never summon, use inventory, or add training/mastery credit. Decoys cannot attack and expire after four seconds.
- Eclipse stealth ends on the first attack. Criticals use seeded battle RNG.
- Artillery stops while firing and must approach its target. New specialized abilities make the numerical budget a starting point, not proof of balanced win rates.
- DPS taxes (`dpsScale` in `roster.json`, gameplay audit Nov 2026) for warriors that measured too strong in battle: Siege Bombardier 0.5, Thousand Needle 0.6, Hawk Tamer 0.6. Kit trims: Wind-Step first hit ×2 (was ×3), Storm Sovereign arcs 35% (was 50%), Thunder Kite 35% (was 45%); the Dragon Kite Armada now splashes three buildings within 2.5 tiles at 35%, so the tier-5 kite is worth its price over the Thunder Kite. Measured in `docs/game-theory/ARMY_BALANCE.md`.

## Validation

`tests/gameplay/battle/warriors.test.ts` covers deployment and repeatable battles for all 50 plus mechanics and limits. `tests/gameplay/sim/playable-roster.test.ts` covers unlocks, training, research, persistence, progression reachability and server acceptance/rejection. Existing combat, pacing, save, protocol and architecture checks remain required.

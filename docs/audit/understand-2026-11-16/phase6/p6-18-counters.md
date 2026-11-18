# P6-18: live counter lists checked in battle (tools/balance/run-counter-check.mjs 6)

A one-warrior army filling the housing at a Keep where both exist, against generated bases holding the building, with the building's effect on and switched off (same base, same seed), six bases a row. The Codex names only the confirmed pairs. A Δ of 0.0 means the effect never changed the battle for that army: with one-warrior armies most listed pairs never trigger it, so they are not confirmed (a stronger check with mixed armies is left open).

| Building | Keep | Warrior | Listed as | Effect on % | Effect off % | Δ effect | Bases |
|---|---|---|---|---|---|---|---|
| paper_lantern_line | 6 | shadow_stalker | it counters | 40.3 | 40.3 | 0.0 | 6 |
| paper_lantern_line | 8 | mist_weaver | it counters | 47.3 | 47.3 | 0.0 | 6 |
| paper_lantern_line | 15 | eclipse_ninja | it counters | 63.5 | 63.5 | 0.0 | 6 |
| paper_lantern_line | 6 | shuriken_storm | counters it | 65.5 | 65.5 | 0.0 | 6 |
| paper_lantern_line | 6 | fire_monk | counters it | 18.2 | 18.2 | 0.0 | 6 |
| clockwork_repairer | 6 | saboteur | it counters | 0.8 | 1.2 | -0.3 | 6 |
| clockwork_repairer | 7 | gearbreaker | it counters | 0.7 | 1.3 | -0.7 | 6 |
| clockwork_repairer | 13 | ghost_engineer | it counters | 0.3 | 0.3 | 0.0 | 6 |
| clockwork_repairer | 6 | hawk_tamer | it counters | 46.5 | 46.5 | 0.0 | 6 |
| clockwork_repairer | 10 | fuse_master | counters it | 16.3 | 16.3 | 0.0 | 6 |
| clockwork_repairer | 14 | phantom_gate | counters it | 49.8 | 49.8 | 0.0 | 6 |
| bitter_incense_burner | 6 | herbalist | it counters | 57.5 | 57.5 | 0.0 | 6 |
| bitter_incense_burner | 6 | drum_monk | it counters | 64.8 | 64.8 | 0.0 | 6 |
| bitter_incense_burner | 6 | iron_monk | it counters | 92.2 | 92.2 | 0.0 | 6 |
| bitter_incense_burner | 14 | sage_of_clouds | it counters | 86.0 | 86.0 | 0.0 | 6 |
| bitter_incense_burner | 7 | blowgun_hunter | counters it | 44.5 | 44.5 | 0.0 | 6 |
| bitter_incense_burner | 14 | dragon_kite_armada | counters it | 78.5 | 78.5 | 0.0 | 6 |
| kite_cutter_ballista | 8 | crane_glider | it counters | 30.5 | 30.2 | 0.3 | 6 |
| kite_cutter_ballista | 11 | thunder_kite | it counters | 42.5 | 60.2 | -17.7 | 6 |
| kite_cutter_ballista | 14 | dragon_kite_armada | it counters | 78.5 | 85.7 | -7.2 | 6 |
| kite_cutter_ballista | 8 | lantern_balloon | it counters | 38.0 | 45.2 | -7.2 | 6 |
| kite_cutter_ballista | 8 | saboteur | counters it | 0.0 | 0.0 | 0.0 | 6 |
| kite_cutter_ballista | 8 | shadow_stalker | counters it | 33.2 | 33.2 | 0.0 | 6 |
| kite_cutter_ballista | 11 | mole_king | counters it | 14.7 | 14.7 | 0.0 | 6 |
| longbow_yagura | 12 | siege_bombardier | it counters | 16.2 | 16.2 | 0.0 | 6 |
| longbow_yagura | 13 | thousand_needle | it counters | 66.0 | 66.0 | 0.0 | 6 |
| longbow_yagura | 12 | hawk_tamer | it counters | 23.8 | 23.8 | 0.0 | 6 |
| longbow_yagura | 12 | grapple_raider | counters it | 9.5 | 9.5 | 0.0 | 6 |
| longbow_yagura | 12 | mirage_twin | counters it | 37.0 | 37.0 | 0.0 | 6 |

Confirmed (an "it counters" warrior loses more to the effect than the mean "counters it" warrior of the same building):
- paper_lantern_line: confirmed (none); not confirmed shadow_stalker, mist_weaver, eclipse_ninja (reference 0.0)
- clockwork_repairer: confirmed saboteur, gearbreaker; not confirmed ghost_engineer, hawk_tamer (reference 0.0)
- bitter_incense_burner: confirmed (none); not confirmed herbalist, drum_monk, iron_monk, sage_of_clouds (reference 0.0)
- kite_cutter_ballista: confirmed thunder_kite, dragon_kite_armada, lantern_balloon; not confirmed crane_glider (reference 0.0)
- longbow_yagura: confirmed (none); not confirmed siege_bombardier, thousand_needle, hawk_tamer (reference 0.0)

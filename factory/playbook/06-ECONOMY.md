# Stage 6: game theory and economy balance

## What this stage decides

What each of the template's systems becomes in the new game, the scheme by which everything is named, and which rules or numbers really change. The default is that the fiction changes and the numbers do not: the template's numbers are measured, and every changed number has a process cost.

## What the template gives you

Read the gameplay brief, the progression model, the roster, the campaign and army-balance reports and the name catalogue in this stage's context; they win over this page.

- Every balance number in data files; pure deterministic rules; time from an injected clock; offline progress computed on load.
- A formula-driven progression: a power budget per role and tier from which unit and building stats derive, so a roster can grow without hand-tuning.
- A roster catalogue (roles × tiers) and heroes; a main building that gates everything; research lanes; training queues; saved armies.
- Battles: entry points, an ability the player throws, a specialist that disables defenses, defensive counters, layout archetypes for generated bases, scouting.
- Matchmaking with strength floors and slack, hidden ratings, leagues and seasons, honest practice opponents.
- An endless ladder: slow geometric difficulty, modifiers at intervals, rewards once per tier.
- Tasks, a pass, events, a calendar, achievements, a daily reward, alliances, donations, wars, small-group wars, friends and duels.
- Measurement tools: model players with several policies, a campaign simulator with lower and upper gates, an army lab across compositions, layouts and seeds. Their outputs are generated documents and tests.

## Method

1. **Fiction map.** For each system: what it becomes, and what the player sees and calls it. Use the brand's world words exactly.
2. **Naming scheme, by family.** The catalogue has a few hundred named things in families (currencies, buildings by job, units by role and tier, heroes, abilities, counters, traps, decorations, obstacles, leagues, achievements, tasks, events, pass, chest outcomes, name parts for generated names). Give each family a rule and three examples. Code will ask for every name right after this record, family by family, so the rule must be enough to name the fiftieth unit as well as the first. Follow the languages stage's naming rules.
3. **Roles keep their jobs.** A unit that was a fast melee fighter stays one; its name and look say so in the new fiction. A name that promises a different job than the stats deliver is a bug.
4. **Signature mechanics.** Retell the template's ability, specialist, counters and entry points in the new world. Prefer `none` (new fiction only) or `tuning`. A `new-rule` is allowed where the market record's differentiator needs it, and it carries the full process cost below.
5. **Deltas with their price.** For every change to rules or numbers:
   - combat data or rules → rules version up, old rules archived first, replays of old rules shown as unavailable, fingerprint test updated;
   - saved state → save version up with a migration, never dropping progress;
   - wire or server behaviour → protocol version, protocol document, contract tests, server deployed first;
   - costs, times, loot → the model-player and balance tests, the army and campaign generators, the gates kept inside bounds;
   - new named things → the catalogue regenerated and every worksheet synced.
   Mark each `must` (the market, monetization or compliance record requires it), `should`, or `later`. Few musts.
6. **Monetization's asks.** Make each one true or say why not: faucets against packs, sinks, the entry product, no pay-to-get-worse.
7. **Pacing targets** against what the template's campaign measures today: first session, day 2, the first wall, the day-30 window, late game for casual players. Where the template has a known dip or wall, decide: accept, retune (a delta), or cover with content.
8. **Gates.** The bounds the build must keep green, and any new gate a delta needs.
9. **Live operations.** A year of events in the new fiction on the template's event system, with real ends and nothing random for sale.
10. **Exploits.** For each new or retold mechanic: can it stack, chain, be double-fired by rapid taps, be farmed, be reverted by killing the app, be forged offline? Finite charges, immunity windows, idempotent rewards, bank-once settlement.

## What went wrong last time

- New units arrived as designs only; 44 of 50 were not playable for a long time. The record must say what is live.
- From a mid level every army scored full marks: building power grew slower than army power. Flyers won everything until their budget was cut. A tier spike made one level trivial.
- Brute force worked until entry points and squads made placement matter.
- Infinite difficulty needs slow geometric growth and logarithmic, once-only rewards, or it becomes a farm.
- A casual player hit a four-week wall exactly where day-30 retention is measured; a dip on day 2; late-game casual raids mostly lost; defense was not worth building.
- Tables indexed by a fixed number of main-building levels blocked growth; the formula model fixed it.
- Model-player numbers were read as retention. They are not.

## Limits

- Internal ids never change. Combat numbers never ship in remote balance bundles.
- The rules of doctrine 3, 4 and 6.
- Nothing here is verified by players until statistics exist; say so.

## A good record

The naming scheme can name everything. The list of deltas is short, each with its price. A gameplay session can read it and know what to rename, what to leave exactly as it is, and what to change by which process.

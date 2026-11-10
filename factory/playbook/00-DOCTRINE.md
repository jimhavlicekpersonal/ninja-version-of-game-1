# Doctrine

These rules hold in every stage and every build session. They were extracted from two builds on this chassis (Toadstool Kingdoms, then Kagemura: Ninja Clans rebuilt from it) and from the audits of the second. Where the template's own briefs are stricter or newer than this page, the template wins.

## 1. Rebuild in place, never from scratch

- The template is a finished chassis: simulation, economy, server, payments, saves, tests, tools, 50-language text layer. A new game keeps all of it and changes what the player sees and feels. Throwing a working system away to write a "cleaner" one throws away its tests and its fixes.
- **Internal ids never change.** They are in saves, the server database, the wire protocol, stored replays and analytics. A new game changes display names in the data files and the text catalogues; the lookup from id to old name to new name is the ID map document. An id that still says `acorns` in a game about something else is correct.
- New content is additive. A number that existing replays or saves depend on changes only through the template's versioning process (rule 3).
- Bundle ids, package names in stores and product ids are identities in someone else's system: changing one creates a new app. They are owner steps, taken when the store listings are created, never by a build session.

## 2. Original work only

- Game mechanics may be shared with a genre. Names, characters, art, sounds, music, level layouts and interface layouts of an existing game may not be, renamed or not.
- Every theme sits near something famous. Name the nearby franchises and conventions for the chosen theme and say how the game stays clear of each (names, rank ladders, symbols, costumes, crests).
- No real crests, flags, religious or political symbols, real people or real brands. A theme drawn from a living culture gets a cultural review by a native speaker as an owner task.
- The store listing never mentions another game.

## 3. Determinism and versions

- Battles replay exactly from a seed and the list of deployments, with integer ticks and only + − × ÷ and √. Anything that changes a battle's outcome is part of that stream.
- Combat data or rules change: the battle-rules version goes up, and the old rules are archived for the server **before** the change. Saved state changes: the save version goes up with a migration that never drops progress. The wire format changes: the protocol version goes up, the protocol document and contract tests with it. Database changes are new numbered migrations, never edits.
- The server is deployed before the game.
- Current version numbers are in the template's generated status file. Never quote them from memory.

## 4. The server owns online truth

- The server issues battle seeds, re-simulates every battle, replays the commands of villages it holds, verifies store receipts and applies spending caps. The game on the phone is a convenience, not an authority.
- Whatever a device earned offline is unproven until the server has a reason to believe it.

## 5. Honesty with players

- Generated opponents, simulated raids and generated groups are always labelled as generated. They are never presented as people.
- Countdowns are real. A reward screen shows what was actually given. A "close call" is said only when it was one. Odds are shown before any random reward is opened.
- The store listing and every in-game claim is true of the build that ships.

## 6. Money and minors

- Nothing random is sold. Free random rewards show their odds. Paid random items would need each market's loot-box law checked first, and are outside this factory's default.
- Real prices appear only in the store and its confirm step, as the store returns them. Every purchase has a clear confirm step, and no buy button sits where a stray tap lands.
- Players under 18, and players whose age is unknown, never get an offer that opens by itself. An under-18 monthly spending cap is enforced by the server. An age band can only be made stricter by the player.
- Premium currency buys time and convenience. It buys resources only as a top-up of exactly what one action is missing. Paying must never make the game worse for the payer.
- What is never sold stays never sold: the daily reward, streak repairs, calendars, ability charges, trial rewards.

## 7. Return hooks stay ethical

- Notifications are off until the player says yes, every type can be switched off, there are quiet hours and a daily maximum.
- A missed day never wipes a streak or a calendar. Events have real end times.
- The game may be habit-forming because it is good. It may not manufacture anxiety, fake scarcity, fake social pressure or fake near-misses.

## 8. Privacy

- Play statistics come only from adults who opted in, under a random id. Crash reports are opt-in. Account deletion clears every table the player owns.
- No advertising, no tracking, no data sale unless the owner decides otherwise in writing; that decision would redo the compliance stage.

## 9. Every phone, every network

- The rule for every byte and every frame: **tap to play, even on one bar.** Nothing between the tap and play waits on the network; every download is small, in the background, survives a dropped connection and is never needed to keep playing.
- The target is a cheap Android phone with 1 to 3 GB of memory on 2G or 3G, then everything better. Art and effects live inside the budgets the engine stage sets.
- Emulation is not a device. A number measured in a desktop browser is a hint.

## 10. Text and languages

- Every string a player can read goes through the text layer with its English in the source catalogue; plurals are keyed messages. Game data text is generated from the data files by the template's own tools.
- Nothing in a sentence may depend on the grammar of a name or a number the game cannot know. Names in any script are displayed isolated from the sentence around them.
- No text is baked into art.
- Translation coverage is not release readiness.

## 11. Lanes

- Work is divided the way the template divides it: each lane owns its folders and reads its own brief first. A session never edits another lane's files; it writes a request in the place the template names.
- Contract files between lanes change only in an integration step.
- A boundary test enforces this in the template; the factory's tools enforce it too.

## 12. Evidence, not claims

- A finding is closed with the commit that fixed it, how it was checked, the date, and what remains unchecked. "Fixed" and "done" in a summary prove nothing.
- Say which of these a statement is: reproduced, read in the code, inferred, or unverified. A model player is not a player. A draft policy is not legal advice. A green CI job that skipped its work is not a pass.
- A claim about a law, a store rule, a market or a platform carries its source and the date it was read, or the word "unverified", and is re-read at the official source before submission.
- Tests are never skipped, deleted or weakened to get a pass.

## 13. What only the owner can do

- A legal entity, publisher facts on legal pages, store accounts, products, keys, hosting, trademark searches, real devices, native-speaker reviews, human art, legal review, and spending money on players. None of this can be done or faked by code.
- A publisher fact that is not known stays empty and the page says it is not published yet. Never a placeholder that looks real.
- Every stage lists its owner tasks. The owner backlog is always longer than the engineering backlog; say so early.

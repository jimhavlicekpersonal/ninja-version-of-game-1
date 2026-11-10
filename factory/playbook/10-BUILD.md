# Stage 10 and the build: rebuilding in place

## What the plan stage decides

A work order for each standard step, written for the game at hand, plus extra orders only where a decision needs work none of them covers. Then the build runs them.

## The method

The new game's repository starts as a copy of the template with its own git history and the game bible in `docs/factory/`. Nothing is rewritten that still works. The order of work is fixed because each step feeds the next:

1. **identity** (integration): the game's name and one-line description in the root documents, the session briefs, the package name, the page title, the manifest and the app display name; the rebuild documents (what this game was rebuilt from, the new ID map). Not the bundle id, not product ids.
2. **names** (gameplay): every display name and description in the game data files, from the ID map and the brand's world words; chat lines, name parts, events, achievements, tasks. Then the template's own extract and sync tools regenerate the text catalogues. **No numbers change in this order.** After it, the game already reads as the new game in every data-driven screen.
3. **rules** (gameplay): only the economy changes marked "must", each by its process (rules version and archive first, save migration, protocol, tests, balance tools). An empty order when there are none.
4. **text** (interface): the interface, boot and system catalogues rewritten in the new voice; the tutorial retold step for step; labels that say an opponent is generated keep saying so.
5. **art** (art): palette and materials first, then the main building, then the families, units and badges, the environment, effects, the brand mark, audio. Same keys. Checked in the gallery and at the low profile's scale.
6. **interface** (interface): theme tokens, screen changes, and rendering changes the engine stage decided.
7. **store** (backend): listing texts, public and legal pages, server-side names and messages, push texts, and compliance's build asks. Publisher facts stay empty.
8. **glossary** (integration): the translators' glossary and language notes rewritten for the new fiction. Contract files, so integration owns it.
9. **translate-‹code›** (translation, one order per language): by the template's translation brief, one language, chunk by chunk, with its check after each chunk.
10. **finish** (integration): the leftover hunt, every check, generated documents regenerated, briefs brought in line, the closure record.

## Writing a work order

A brief is read by a session that knows nothing but the game bible and its own lane's brief. It says:

- what to change and where (folders, files, keys), in what order;
- what must stay exactly as it is, and why;
- which decisions in the bible it carries out (name them);
- what it needs from an earlier order;
- how it will be judged: acceptance points a person could tick.

It does not repeat the lane's brief or the doctrine, and it does not ask for anything outside the lane: that goes to the order whose lane owns it.

## How a session works

- Read the lane's brief first. Then look at what is there before changing it.
- Small steps; run the lane's tests as you go where a shell exists.
- Out-of-lane needs go into the lane's request file and the report.
- Finish with the report: what changed, what was verified and how, what could not be verified here, requests.

## What the harness does

- Confines every tool to the game's folder and every write to the lane.
- Runs the checks itself after each order and hands failures back for a bounded number of fix rounds.
- Puts back anything changed outside the lane, and notes it.
- Commits each order with the report's summary.
- Writes a record per order and a build report that keeps verified and unverified apart.
- Stops at the budget and carries on from the first unfinished order.

## Closure

The closure record (`docs/factory/CLOSURE.md`, written in the last order) follows the template's audit discipline: for each area, what the build did, the evidence, the date, and what remains unverified. It ends with the owner tasks in the order they unblock a release. It never says the game is ready to ship.

## What went wrong last time

- Renames reached a troop-card refresh keyed on display names. Search for logic keyed on names before renaming.
- Tests asserted the old theme's visible text; they are updated to the new text, not removed.
- Briefs and status tables drifted from the code within days. Regenerate, do not hand-edit numbers.
- A committed database dump, the old package name and old store product ids survived a rename.
- Sessions colliding in large shared files: keep orders in their lanes and their sequence.

## What the build does not do

It does not create store listings, products, keys or accounts; fill in publisher facts; change bundle or product ids; deploy a server; test on a phone; review translations as a native speaker; paint faces; or decide the game is ready. Those are the owner's, and the report says so.

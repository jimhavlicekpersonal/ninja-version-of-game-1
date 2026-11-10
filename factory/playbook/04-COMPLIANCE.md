# Stage 4: App Store and Google Play compliance for every market served

## What this stage decides

Where this game may launch, what each market and each store requires of it, what the template already does, what the build must add, and what only the owner can do. It is a working draft made from official sources read on a stated date. It is not legal advice, and the record says so.

## The frame: languages reach markets, markets have rules

A language is not a country. For each language in the plan, list the countries it actually reaches, then decide per market: **launch**, **later** (a named blocker), or **exclude** (a named reason). Ticking a territory in a store console does not make the game lawful there.

## What the template gives you

Read the legal and store documents in this stage's context; they are the starting matrix and they win over this page. In short, the template already has: a neutral age screen with one-way stricter bands; preset-only chat and non-findability under 13; private discovery defaults for teens; a server-enforced under-18 spending cap; no ads and no tracking; opt-in statistics and crash reports; in-app and web account deletion; sign-in with the platform accounts; report, block, auto-hide and staff tools; moderation notices with reasons; receipt checks on the server; store age-signal handling; drafts of the privacy policy, terms, community rules and the Japanese statutory pages; a release checklist.

It does **not** have, because code cannot: a publisher (name, address, contacts, representatives, governing law, retention periods), store accounts, declarations, products, keys, a hosted server, legal review, native-speaker reviews, device tests.

## Method

1. **Market matrix.** For each market: requirements (consumer, children, data, platform-content, payments, registration or licensing, local representative), what the template does, gaps, decision. Typical exclusions for a small foreign studio are markets that need a local licence or partner; confirm with the research notes.
2. **Apple, item by item:** in-app purchase rules; user-generated content rules (filtering, reporting, blocking, published contact); privacy labels and tracking; account deletion; sign-in rules; the age-rating questionnaire and age-assurance APIs; trader status for the EU; export compliance; review notes a reviewer needs (how to reach online features, test accounts, where the odds are shown).
3. **Google, item by item:** billing library version and its deadline; target API level; Data safety form; account-deletion URL (must name the listing); user-generated-content policy; target audience and the families rules; age signals; testing requirements for new accounts; page-size and other technical deadlines.
4. **Age and minors.** State the game's position for this audience: who may play online, who may chat, what is collected, what is sold. The weakest position is the middle one (children online with adult chat under a 13+ declaration): choose a defensible one and list its cost.
5. **Theme check.** Does this game's theme, cast or text change an age rating, a content declaration or a market's acceptance (violence, gambling imagery, religion, history, alcohol)? Say which answers change.
6. **Build asks, by lane:** the code and text this game needs beyond the template (a real-money estimate next to currency prices in a region, a withdrawal acknowledgement at purchase, a market-specific notice, new strings on the legal pages).
7. **Re-check list:** every claim that must be re-read at the official source before submission, with where to read it.
8. **Owner tasks:** everything else. Be exhaustive; this list decides the launch date more than the build does.

## What went wrong last time

- All publisher facts were empty: no listing possible in several regions, and no code could fix it. Found late.
- The Android billing library was past its deadline at audit time. Deadlines move every year: the research notes must carry dates.
- An age-signal API call skipped a mandatory step and silently fell back to self-declaration.
- The store test configuration still listed the previous game's product ids.
- The deletion page showed a name that did not match the listing name.
- The listing overstated free earnings.
- Statements of law written from memory were wrong or stale; every one now carries a source or "recheck".

## Limits

- Never invent a publisher fact, a representative, a registration number or a legal conclusion.
- Never mark a market "launch" on the strength of a draft.
- Bundle ids, product ids and store accounts are owner steps.

## A good record

The owner can read one table and see where the game can launch on day one, what blocks each other market, and their own task list in the order it unblocks things. A build session can read its lane's asks and do them without legal knowledge.

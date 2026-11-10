# Stage 5: languages

## What this stage decides

Which languages ship in which wave, which are translated during the build, and the glossary and rules that let this game's fiction survive 50 languages.

## What the template gives you

Read the translation brief, the glossary and the language list in this stage's context; they win over this page.

- A fixed list of languages with codes, scripts, direction, waves and per-language notes; worksheets per language; English as the source.
- A text layer: keyed messages with plural rules, local number formats, device-language pick, right-to-left layout, system fonts (no font downloads).
- Tools: extract game-data text, sync worksheets, status, next-untranslated, check (placeholders, scripts, forbidden forms per language), build compact packs.
- A translator session model: one language per session, small commits, a per-language terms file, a check after every chunk.
- Rules learned the hard way: nothing may agree grammatically with a placeholder or the player; names combine by position; several languages have enforced spelling and script rules.

## Method

1. **Waves follow the market.** Wave 1 is the launch regions' languages plus English. Later waves follow the launch waves. A language the template has no worksheet for is an owner task.
2. **Translate during the build** only what launch needs: a full translation of the whole game per language is a large session each. Name them in `buildNow`.
3. **Glossary before strings.**
   - *Setting and tone:* a short paragraph a translator can act on: where and when, how the game speaks, how formal.
   - *Names that stay:* the game's name, proper names of the cast, and any coined word that must not be translated, with pronunciation notes.
   - *Game terms:* every recurring term (home base, currencies, unit roles, alliance, the signature mechanics, the endless mode) with meaning and guidance: translate, transliterate or keep.
4. **Naming rules for the economy stage.** Names must: avoid English-only puns and rhyme; be nouns or noun phrases that need no article; avoid gendered forms; stay short (a label fits about the English length in German and Tamil only if the English is short); be distinct after translation (two "shadow" things become one word in some languages); avoid words that are brands or insults in a launch language.
5. **Generated names.** If the game combines name parts (place names, rival names), the parts must combine in every language's word order; the template has settings for this per language. Give the parts' rules.
6. **Per-language notes** where this fiction is hard: honorifics, taboo topics, scripts for borrowed words, counters and classifiers, how a culture's own words in the theme should be written back in that culture's language.
7. **Cultural risk.** A theme drawn from a living culture, religion, history or conflict reads differently where it comes from. List the risks by language and the mitigation (review by a native speaker: owner task; a renamed element; a market held back).
8. **Text rules for the interface stage:** maximum label lengths, no text in art, no concatenated sentences, numbers and dates through the formatter.

## What went wrong last time

- The interface was hard-coded in English when translation was first attempted; the text layer had to be built first.
- A character-by-character or word-for-word approach produced wrong Chinese variants, Danish that was Norwegian, and Hindi that talked down to adults; each needed its own rule and check.
- Particles, articles and case endings attached to placeholders broke in a dozen languages.
- Store listings, screenshots, moderation notices and blocklists were not translated with the game: they are separate tasks and belong in the plan.
- Coverage numbers were read as readiness. They are not: native review and device checks of fonts and line breaking are owner tasks.

## Limits

- The translator sessions own only their language folder. The glossary, the language list and the English source are contract files: they change in an integration step.
- Authored names and chat are never passed through translation.

## A good record

A translator who has never seen the game can start from the glossary and get the tone, the terms and the names right in the first chunk.

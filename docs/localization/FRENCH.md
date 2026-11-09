---
document_type: french_implementation
schema_version: 1
language: fr
variant: International French with tu, also served to Canada, Belgium, Switzerland and Africa
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.fr)
---

# French translation

French (`fr`) was released together with Italian ([ITALIAN.md](ITALIAN.md)) on 2026-11-09. It is written in international French with *tu*, also in the legal pages, and served to every French device (`fr-FR`, `fr-CA`, `fr-BE`, `fr-CH`, African locales). It covers the same surfaces as the earlier languages: every namespace (`boot` 17, `ui` 125, `data` 669, `messages` 1,863, `pages` 314 = 2,988 entries), the six public pages and PWA manifest under `public/fr/`, the account-deletion form (`/account/delete?lang=fr`), server push text, iOS (`fr.lproj`) and Android (`values-fr`) resources, StoreKit fixtures for `fr_FR` and `fr_CA`, and listing and product copy in `docs/store/fr/`. Terms: `locales/fr/TERMS.md`; reviewed warnings: `locales/fr/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native French speaker has reviewed it**, nor the legal pages.

## What French and Italian needed

The translator instructions were checked against both languages first; these are the problems found and fixed.

| Issue | Fix |
|---|---|
| Both languages put the noun first in two-part generated names (Pic du Tonnerre, Picco del Tuono). | `generatedNames: "noun-first"` for `fr` and `it` in `languages.json`; first parts are invariant *de*/*di* phrases or invariable adjectives (*du Tonnerre*, *Pourpre*, *del Tuono*, *Cremisi*). |
| The French note asked for "a non-breaking space before : ; ! ?" without saying which space, and the checker treats a no-break space as a space: a fragment that starts with `:` (`: {arg1}`, `: loot banked`) fails if it gets one. | The French note, `GLOSSARY.md` and `locales/CLAUDE.md` say: U+00A0 before `:` and inside « », U+202F before `; ! ?` and `%`, only between words, never at the start or end of a string; both spaces are allowed characters. `french.test.ts` checks both rules. |
| Elision and contracted articles before a placeholder (*d'*, *l'*, *du*; *dell'*, *del*, *al*) depend on the inserted word's gender and first sound, which the game cannot know; the glossary did not mention them. | `GLOSSARY.md` forbids an article, *de*, *que* or contracted preposition directly before a placeholder; both release tests fail on one. |
| The Italian note was "Informal tu." | A full note: *tu*, agreement with *essere* participles, articles, plurals (0 in `other`), numbers and generated names. |
| Found in the browser check: the Events rail pill was built by parsing English (`startsWith('Next')`, `.replace(' left', '')`), so every translated language kept its own "left"/"in" words, the pill overflowed at 320 px ("19 h 3 min resta…", "mancano 19h 2m…") and "running" was misdetected. Wrong in all earlier languages too. | `DailyUi.chipParts` returns the sentence, whether an event is running and the time alone; `hud.ts` uses it. English is unchanged. |
| Found in the browser check: at 320 px the Keep-unlock chip's dismiss button spilled under the side rail for any label longer than English (French 272 px, German and Spanish 283 px, rail at 260 px). | `styles.css`: the chip's label button can shrink (`min-width: 0`) and truncates; the dismiss button ends at 254 px in every language. |

French also uses compact durations (`19h 3min`, as Spanish and Portuguese) because they appear in tight chips. `Intl` writes French numbers with narrow no-break spaces (1 234 567; 1,2 k; 1,5 M) and puts 0 and 1 in `one` (0 guerrier); the bundled Latin font subsets cover French, including « » and U+202F.

## Storage

`npm run i18n:build` (`SPANISH_SIZE.json`, `measured.fr`): 227,446 bytes UTF-8 (74,082 gzip, 62,738 Brotli) for 2,674 strings, the largest Latin-script pack so far (Spanish 222,792). The six pages and manifest add 52,753 bytes.

## Validation

- `npm run i18n:check -- fr`: no errors; English-identical entries reviewed in `REVIEW.json` (Japanese names, brands, parameter-only strings and shared words such as Alliance, Base, Chat, Jade, Lotus, Saboteur, Tunnel, raid, OK). Three length warnings are the Japanese statutory titles.
- `tests/locales/french.test.ts`: catalog complete and ready; `fr-FR`, `fr-CA`, `fr-BE`, `fr-CH` and `fr-SN` pick French; French numbers; 0 in `one`; noun-first generated names; no article or elision before a name or label; no-break spaces only between words; literal player parameters, unchanged canonical data and seeded bases; pages, account form and push text.
- Built client in Chromium (a scratch copy of `npm run i18n:smoke` set to `fr-FR`): all 12 panels and their tabs, no page errors, no word found only in the English catalogs, no element wider than its box; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px (at 320 px "Attaquer" and "Construire" wrap onto two lines inside the button, as Spanish "Construir" does); only the French pack is fetched and cached; an offline reload stays in French; switching to English keeps every building's identity. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (French push catalog and account form) before or with the game.
2. Native French review (France, and a reader from Quebec for Canada), including the tutorial, purchase, safety and legal pages.
3. Legal: the publisher's *mentions légales* for France, and a French-law review of the terms and privacy policy; the pages keep their draft notices.
4. Physical iOS and Android checks; uploading `docs/store/fr/` to App Store Connect (French, French (Canada)) and Google Play (fr-FR, fr-CA) with French screenshots.
5. French moderation coverage: the chat filter's word list is English only.

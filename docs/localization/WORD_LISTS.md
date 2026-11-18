# Chat and name word lists: native review status (P7-07)

The game and the server censor chat lines and player names with `src/gameplay/data/social.json`: `profanity`
(English) and `profanityByLanguage` (one list per launch language). Every list applies to every line, because chat
and names mix languages. The lists are deliberately short and conservative: strong insults and slurs only, nothing
that is an ordinary word in another launch language or appears inside common words. Each list has a corpus of
ordinary sentences that must pass untouched (`tests/gameplay/sim/profanity-lists.test.ts`); a native reviewer should
add to both.

This is moderation quality, not legal compliance. **No list has been reviewed by a native speaker.**

| Language | List | Native review |
|---|---|---|
| English (`profanity`) | 30 words | not reviewed |
| es | `profanityByLanguage.es` | not reviewed |
| pt | `profanityByLanguage.pt` | not reviewed |
| fr | `profanityByLanguage.fr` | not reviewed |
| de | `profanityByLanguage.de` | not reviewed |
| ru | `profanityByLanguage.ru` | not reviewed |
| ja | `profanityByLanguage.ja` (unspaced: matched inside text) | not reviewed |
| ko | `profanityByLanguage.ko` | not reviewed |
| zh-Hans | `profanityByLanguage['zh-Hans']` (unspaced) | not reviewed |
| ar | `profanityByLanguage.ar` | not reviewed |
| hi | `profanityByLanguage.hi` (Devanagari and common romanized forms) | not reviewed |
| The other 39 languages | none yet | — |

A change to any list changes the data the game and the server load: deploy the server and the game together
(`docs/backend/REQUESTS.md`).

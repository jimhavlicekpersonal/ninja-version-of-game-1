# Kagemura glossary (for translators)

Translate a term the same way every time it appears. When you choose a translation for a term below, write it into your language's `locales/<code>/TERMS.md` (create it on your first session) so later sessions and reviewers reuse it. Keep `TERMS.md` short: one line per term, `English = yours (note)`.

## Setting and tone

- **Kagemura: Ninja Clans** is an original game about a ninja clan hidden in the mountains of a feudal-Japan-inspired world. The tone is warm, confident and a little playful, never gory. Players are "leaders" or "rulers" of a clan.
- Address the player as a friend: the informal "you" where the language has one (see each language's note in `languages.json`).
- Short and clear beats literal. A button label must fit on a phone. Aim for the English length, and at most about 1.5×.

## Names that stay as they are

| English | Rule |
|---|---|
| Kagemura | The game's name. Keep it in Latin letters in every language (it is the logo). In running text, Japanese may write 影村. Other languages may add a transliteration once in parentheses, never instead of it. |
| Sensei Hoshi | The tutorial guide. Hoshi is a name: transliterate it, never translate its meaning. "Sensei" is a title: transliterate it or use your language's word for a martial-arts master (Japanese: ホシ先生). |
| Japanese words used as names: Shinobi, the oni in Oni Breaker, Kage in Kage League | Transliterate into your script. Do not translate the meaning. Kage League must stay different from Shadow League. |
| Generated person names (`names.playerFirst`, `names.playerSecond`) | Japanese given names (Kaito, Hana…) are transliterated. English epithets (Swiftwind, Ironpine…) are translated as epithets. |

## Game terms

| English | Meaning | Guidance |
|---|---|---|
| Keep (Clan Keep) | The main building. Its level gates everything ("Keep 7"). | Translate as a castle keep or stronghold tower. "Keep 7" means level 7. |
| Coins | First resource, from Coin Mints. | Plain "coins". |
| Provisions | Second resource (grown on Terraced Farms). Pays for warriors. | "Provisions" or "supplies"; a word for rice is fine if natural. Use one word everywhere. |
| Shadow Ink | Third resource, for top-tier warriors. | Translate both words. |
| Jade | The premium gem currency bought in the Store. | The gemstone jade. |
| Honor | Ranking points won or lost in raids. | A word for honour or prestige; not "trophies". |
| League (Bamboo, Cedar, Iron, Obsidian, Jade, Storm, Shadow, Kage) | Honor brackets, lowest to highest. | Translate the material and "league"; transliterate Kage. |
| Warrior / troops | Units the player trains. | "Warrior" in player-facing text. |
| Dojo (Training Dojo) | Trains and researches warriors. | Japanese loanword where known (道場); otherwise "training hall". |
| Lodge (Alliance Lodge) | Holds warriors donated by allies. | A meeting hall. |
| Artisan (Village Artisan) | The builder: one job at a time. | A craftsperson. |
| Alliance / Alliance War | Player groups and their weekly war. | Clan alliance; war between alliances. |
| Raid / attack | Fighting another village. | Use one word for raid. |
| Shield | Protection from raids for some hours. | A shield. |
| Smoke Bomb | Ninja ability: hides warriors inside its cloud. | Japanese 煙玉 style where natural. |
| Sabotage / Saboteur | Jams a defense for a few seconds. | — |
| Infiltration Points | The six places warriors may enter a map. | — |
| Shadow Trials | Endless ladder of practice fortresses. | — |
| Season Scroll | The season pass. | A scroll, not "pass". |
| Daily chest | Free chest once a day. | — |
| Star(s) | 0–3 stars per battle. | — |

## Placeholders and numbers

- `{n}`, `{name}` and other words in braces are filled in by the game. Copy them exactly. Move them anywhere the grammar needs.
- The game formats numbers, times and dates for the player's language. Do not write digits or units yourself.
- Plural forms are supported. A message such as `{n, plural, one {# warrior} other {# warriors}}` is an ICU plural: keep the variable name (`n`), keep an `other` branch, and write the branches your language needs (`zero`, `one`, `two`, `few`, `many`, `other`, as `Intl.PluralRules` names them for your language code). `#` is replaced by the formatted number; an exact branch such as `=0 {none}` wins over the category. `{x, select, a {…} other {…}}` chooses by value: keep every value the English has. A plain `{n}` outside a plural is still just the number, so phrase those sentences so they are correct for any count.
- Your language's categories may not match English. Hindi, Bangla, Gujarati, Kannada, Punjabi, Amharic, Zulu, French and Portuguese put **0 in `one`** together with 1; Russian and Polish need `few` and `many`; Arabic has all six. Check with `new Intl.PluralRules('<code>').select(n)` when unsure.
- Where a word that agrees with a placeholder changes with its gender (Hindi, Urdu, Arabic, Hebrew, the Romance and Slavic languages, German, Dutch, Greek), the game cannot tell you the gender of `{name}`, `{building}` or `{troop}`, nor of the player. Rephrase so nothing has to agree with them, as Turkish and Finnish rephrase to avoid suffixes on placeholders.
- Articles and case endings count as agreement. In German, *der/die/das*, *dein/deine* and adjective endings before `{building}` or `{troop}` depend on a gender the game does not know, so put the placeholder after a colon or use it without an article (`Fertig: {building}`, `{building} verbessern`). A placeholder also cannot take a case ending: never write `{name}s Dorf` (names ending in s, x or z need an apostrophe, and translated labels are not names); write `Dorf von {name}`.
- Elision and contraction count too. French *de/le/la/que* become *d'/l'/qu'* before a vowel, and *de + le* is *du*; Italian *il/lo/la/l'* and *del/dello/della/dell'* depend on the next word's gender and first sound. The game cannot know either for `{name}` or `{building}`, so put no article, *de*, *que* or contracted preposition directly before a placeholder (French `Village : {name}`, not `Village de {name}`; Italian `Edificio: {building}`, not `il {building}`).
- Role nouns for the player (leader, ruler, winner, friend) are gendered in many languages (German *Anführer/Anführerin*). Prefer a neutral noun (German *Oberhaupt*, a neuter word) or address the player directly.

## Generated names

Places, rival outposts and computer Alliances get two-part names from `names.placeFirst` × `names.placeSecond` and `social.groveNames.first` × `social.groveNames.second` (Thunder + Peak). Every first part must fit every second part. How the parts are joined is set per language by `generatedNames` in `languages.json` (an integration setting):

- unset: first part, space, second part (English *Thunder Peak*);
- `noun-first`: second part, space, first part (Spanish *Cumbre del Trueno*). Write first parts as invariant modifiers (*del Trueno*, *de la Niebla*) so they fit masculine and feminine nouns;
- `compound`: one word, with the second part's first letter lowercased (German *Donner* + *Gipfel* = *Donnergipfel*). Write first parts as word stems with any linking letters they need (*Zwillings*, *Laternen*), and second parts as nouns that stand alone (*Gipfel*, *Klinge*). This avoids adjective endings, which would have to agree with each noun. Dutch, the Scandinavian languages and Finnish may want it too.

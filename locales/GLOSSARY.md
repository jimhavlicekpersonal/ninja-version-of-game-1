# Kagemura glossary (for translators)

Translate a term the same way every time it appears. When you choose a translation for a term below, write it into your language's `locales/<code>/TERMS.md` (create it on your first session) so later sessions and reviewers reuse it. Keep `TERMS.md` short: one line per term, `English = yours (note)`.

## Setting and tone

- **Kagemura: Ninja Clans** is an original game about a ninja clan hidden in the mountains of a feudal-Japan-inspired world. The tone is warm, confident and a little playful, never gory. Players are "leaders" or "rulers" of a clan.
- Address the player as a friend: the informal "you" where the language has one (see each language's note in `languages.json`). Japanese has no friendly "you" to use (あなた is distant, 君 and お前 talk down): leave the player unnamed, as Japanese games do, and see the Japanese section below for the polite register.
- Short and clear beats literal. A button label must fit on a phone. Aim for the English length, and at most about 1.5×.

## Names that stay as they are

| English | Rule |
|---|---|
| Kagemura | The game's name. Keep it in Latin letters in every language (it is the logo). In running text, Japanese may write 影村. Other languages may add a transliteration once in parentheses, never instead of it. |
| Sensei Hoshi | The tutorial guide. Hoshi is a name: transliterate it, never translate its meaning. "Sensei" is a title: transliterate it or use your language's word for a martial-arts master (Japanese: ホシ先生). |
| Japanese words used as names: Shinobi, the oni in Oni Breaker, Kage in Kage League | Transliterate into your script. Do not translate the meaning. Kage League must stay different from Shadow League. Japanese writes these words as Japanese (忍, 鬼, 影); since 影 is also the plain word for shadow, Japanese gives the other Shadow names another word (Shadow League 闇リーグ, Kage League 影リーグ). Chinese writes these words with their own Han characters (忍, 鬼, 影), which is their spelling, not a translation; Kage League must still read differently from Shadow League (zh-Hans: 影级联赛 and 暗影联赛). |
| Generated person names (`names.playerFirst`, `names.playerSecond`) | Japanese given names (Kaito, Hana…) are transliterated. English epithets (Swiftwind, Ironpine…) are translated as epithets. Chinese does not transliterate Japanese names by sound (凯托 reads as a Western name): write a common kanji spelling in Simplified forms (Kaito 海斗, Hana 花, Takeda 武田), as Chinese media do, and the same for Hoshi (保志, never 星, which would translate the meaning). Japanese writes Japanese given names and family names the way a Japanese reader expects them, in kanji (Kaito 海斗, Hana 花, Takeda 武田); Sensei Hoshi stays ホシ先生 (katakana marks it as a name, and 星 would read as a word). English epithets are translated into Japanese words, not katakana. |

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
- Your language's categories may not match English. Hindi, Bangla, Gujarati, Kannada, Punjabi, Amharic, Zulu, French and Portuguese put **0 in `one`** together with 1; Russian and Polish need `few` and `many`; Arabic has all six. Romanian puts 0 and 2–19 in `few` and needs *de* in `other` (20 and up: `# de războinici`), so a plain `{n}` before a noun is wrong there too: put it after a colon. Chinese, Japanese, Korean, Vietnamese, Thai, Indonesian and Malay have **only `other`**: write just the `other` branch (`{n, plural, other {# 名忍者}}`), and keep an `=0` or `=1` branch only where the wording really differs ("no warriors"). Check with `new Intl.PluralRules('<code>').select(n)` when unsure.
- ICU syntax stays ASCII in every language: the braces, the comma after the variable name and after `plural`/`select`, the branch names and `#`. A full-width comma or brace (`，` `｛`) inside the syntax breaks the message; full-width punctuation belongs only in the words inside the branches.
- Where a word that agrees with a placeholder changes with its gender (Hindi, Urdu, Arabic, Hebrew, the Romance and Slavic languages, German, Dutch, Greek), the game cannot tell you the gender of `{name}`, `{building}` or `{troop}`, nor of the player. Rephrase so nothing has to agree with them, as Turkish and Finnish rephrase to avoid suffixes on placeholders.
- Articles and case endings count as agreement. In German, *der/die/das*, *dein/deine* and adjective endings before `{building}` or `{troop}` depend on a gender the game does not know, so put the placeholder after a colon or use it without an article (`Fertig: {building}`, `{building} verbessern`). A placeholder also cannot take a case ending: never write `{name}s Dorf` (names ending in s, x or z need an apostrophe, and translated labels are not names); write `Dorf von {name}`.
- Elision and contraction count too. French *de/le/la/que* become *d'/l'/qu'* before a vowel, and *de + le* is *du*; Italian *il/lo/la/l'* and *del/dello/della/dell'* depend on the next word's gender and first sound; Catalan *el/la/de* become *l'/d'* and *de/a/per + el* are *del/al/pel*, and names take the personal article *en/na*. The game cannot know any of this for `{name}` or `{building}`, so put no article, *de*, *que* or contracted preposition directly before a placeholder (French `Village : {name}`, not `Village de {name}`; Italian `Edificio: {building}`, not `il {building}`; Catalan `Poble: {name}`, not `Poble d'en {name}`).
- Romanian writes the definite article and the genitive/dative as endings (*satul*, *satului*), and *lui* before a name depends on the name. Attach nothing to a placeholder and do not write `lui {name}`: use a colon (`Satul: {name}`) or an articled noun in apposition (`clădirea {building}`).
- Role nouns for the player (leader, ruler, winner, friend) are gendered in many languages (German *Anführer/Anführerin*). Prefer a neutral noun (German *Oberhaupt*, a neuter word) or address the player directly.
- Languages without grammatical gender still have gendered pronouns: in Chinese never write 他 or 她 for the player, another player or a `{name}`; repeat the name, use 你 or 对方, or rephrase. In Japanese never write 彼 or 彼女 for them either: repeat the name, use 相手, or leave the subject out.
- Japanese particles (は, が, を, の, に) follow a placeholder without changing with it, so `{name}の村` and `{building}をアップグレード` are safe; nothing before a placeholder may depend on it.

## Chinese, Japanese and other languages written without spaces

- Counted nouns take a measure word in Chinese: `{n} 名忍者`, `{n} 座建筑`, `{n} 颗星`, `{n} 次`; resource amounts take none, as in games (`500 金币`). Japanese uses counters the same way (人, 棟, 回).
- Spaces: Chinese and Japanese do not separate words with spaces. Follow the platform convention (Apple and Google in Simplified Chinese): one half-width space between Han characters and digits, Latin words or a number placeholder (`还需 {n} 金币`, `登录 Game Center`), no space next to full-width punctuation (`完成：{building}`), and no space around a placeholder that is itself Chinese text (`升级{building}`, `{name}的村庄`). Time abbreviations are compact (`{h}小时{m}分`).
- Punctuation: full-width in the words (，。：；！？（）、 and “ ” for quotes, 《》 for titles), half-width only in the ICU syntax, placeholders, numbers and Latin text. Ellipsis is …… and the dash ——, but prefer short sentences to either.
- Simplified Chinese (`zh-Hans`) uses Simplified characters only: no Traditional forms (們, 這, 戰, 點) and no Japanese shinjitai forms (戦, 気, 剣, 図). `npm run i18n:check` fails on the most common ones. Traditional Chinese (`zh-Hant`) is a separate translation, never a character conversion.
- The game does not know whether a line will wrap: a Chinese label breaks between any two characters, so keep button labels short (two to four characters where you can).

### Japanese

- Register: polite です・ます in sentences (tips, descriptions, notices, the legal pages), as Japanese games and app stores write; buttons, tabs and labels are short nouns or verb stems (建設, アップグレード, 受け取る), never です・ます. Sensei Hoshi and the bot chat may speak more warmly, but never talk down to the player. No second-person pronoun in the game: leave the player out (村を守る, not あなたの村を守る); the legal pages may use お客様 or あなた where a sentence needs a subject.
- Spaces: Japanese has none between words, digits or number placeholders (500コイン, {n}人, 天守Lv.{n}). Put one half-width space between Japanese and a Latin word or brand only (Game Center にサインイン, Kagemura を読み込めません), the Apple Japanese convention. No space around a placeholder that is Japanese text (`{building}をアップグレード`).
- Punctuation: 、。 and full-width ！？（）：; quotes 「」 and 『』 for titles, never “ ”; ellipsis …… . Half-width only in the ICU syntax, placeholders, numbers and Latin text. Prefer short sentences to dashes.
- Counters: warriors 人 (an animal or machine unit is still a warrior: 人), buildings and defenses 棟 or 基 for towers and traps (pick one per term in `TERMS.md`), times 回, stars つ or 個, items 個, purchases 件, messages 件. Resources take no counter (500コイン).
- Characters: standard modern kanji (常用漢字 where possible) in Japanese shinjitai forms. Unicode gives Chinese and Japanese one Han script, so a Simplified (们, 这, 战, 剑, 图) or Traditional (們, 戰, 劍, 圖, 氣) form passes the script check; `npm run i18n:check` fails on the common ones in `ja`. Write words a Japanese game uses in kana in kana (アップグレード, ショップ), and ninja words in natural Japanese (忍者, 道場, 煙玉), not katakana English.
- Japan's statutory pages (`tokushoho`, `shikin-kessai`) are the legally required pages in this language: use their statutory titles (特定商取引法に基づく表記, 資金決済法に基づく表示) and keep the draft notices; a translation is not a lawyer's review.

## Generated names

Places, rival outposts and computer Alliances get two-part names from `names.placeFirst` × `names.placeSecond` and `social.groveNames.first` × `social.groveNames.second` (Thunder + Peak). Every first part must fit every second part. How the parts are joined is set per language by `generatedNames` in `languages.json` (an integration setting):

- unset: first part, space, second part (English *Thunder Peak*);
- `noun-first`: second part, space, first part (Spanish *Cumbre del Trueno*). Write first parts as invariant modifiers (*del Trueno*, *de la Niebla*) so they fit masculine and feminine nouns. Romanian writes second parts with their definite article (*Vârful*, *Valea*) and first parts as genitives or *de*-phrases (*Tunetului*, *Ceții*, *de Fier*), which fit every articled noun (*Vârful Tunetului*, *Valea de Fier*);
- `compound`: one word, with the second part's first letter lowercased (German *Donner* + *Gipfel* = *Donnergipfel*). Write first parts as word stems with any linking letters they need (*Zwillings*, *Laternen*), and second parts as nouns that stand alone (*Gipfel*, *Klinge*). This avoids adjective endings, which would have to agree with each noun. Dutch, the Scandinavian languages and Finnish may want it too. Chinese and Japanese use it as well, because they write the two parts with no space (雷霆 + 峰 = 雷霆峰; lowercasing does nothing to Han characters): first parts are modifiers of one or two characters (雷霆, 寂静, 双子), second parts one- or two-character nouns (峰, 刃, 谷口); do not add 之 or 的 to a part, since the parts are combined freely. Japanese the same way, with the parts in kanji (雷鳴 + 峰 = 雷鳴峰, 双子 + 刃 = 双子刃); do not add の or ノ to a part.

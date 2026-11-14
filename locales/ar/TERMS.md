# العربية — قرارات الترجمة

Modern Standard Arabic, Western digits (the game formats numbers), Unicode NFC, no direction marks.

## Addressing the player (gender-neutral)

The game does not know the player's gender, so written forms that differ by gender are avoided:

- No singular imperatives (اضغط/اضغطي) and no second-person present verbs (تملك/تملكين). Buttons and instructions use verbal nouns (بناء، ترقية، جمع، إنهاء الآن، «يلزم تدريب محاربين أولًا»), passives, «يمكنك + مصدر», «يُرجى + مصدر» or «الحل: ...» for battle tips.
- Unvocalised forms that read the same for both genders are fine: the suffix ـك (قريتك، لديك، يمكنك), أنت, and second-person past verbs (هاجمت، انضممت، فزت).
- No adjectives agreeing with the player (مستعد، عالق، بالغ); rephrased.
- Sensei Hoshi uses inclusive «لنـ» forms (لنبنِ، لنضغط). Bot chat may address the group in the plural (لا تنسوا).
- Placeholders never take an agreeing verb or adjective: masdar/idafa (انضمام {arg1} إلى التحالف، اكتمل بناء {arg1})، «من {arg1}» (طلب صداقة من {arg1})، or a colon.
- Counts with a bare `{n}`: «{n} من + plural» (جمع {n} من العملات). ICU plurals use all six Arabic categories: zero/one/two without the number where idiomatic (محارب واحد، محاربان), few `# محاربين`, many `# محاربًا`, other `# محارب`.

## Terms

| English | العربية |
|---|---|
| Kagemura | Kagemura (Latin, logo) |
| Sensei Hoshi | المعلّم هوشي |
| Shinobi / oni / Kage | شينوبي / أوني / كاغي |
| Clan Keep / Keep | قلعة العشيرة / القلعة («القلعة {n}» = level) |
| Coins / Coin Mint | العملات / دار السك |
| Provisions | المؤن |
| Shadow Ink | حبر الظل |
| Jade | اليشم |
| Honor | الشرف |
| Power | القوة |
| Leagues: Bamboo, Cedar, Iron, Obsidian, Ember, Storm, Shadow, Kage | دوري الخيزران، الأرز، الحديد، السبج، الجمر، العاصفة، الظل، كاغي |
| Warrior(s) | محارب / محاربون |
| Training Dojo | دوجو التدريب |
| Squad Courtyard | ساحة الفرق |
| Alliance Lodge | دار التحالف |
| Village Artisan | حرفي القرية |
| Alliance / Alliance War | التحالف / حرب التحالفات |
| Gang / Gang War / relay | العصابة / حرب العصابات / التتابع |
| Friendly Duel | مبارزة ودية |
| Raid / attack | غارة (أغار) / هجوم |
| Shield | درع |
| Smoke Bomb | قنبلة دخان |
| Sabotage / Saboteur / jam | التخريب / المخرّب / تعطيل |
| Infiltration point | نقطة تسلل |
| Shadow Trials / tier | اختبارات الظل / مرتبة |
| Season Scroll / premium | لفافة الموسم / البريميوم |
| Daily chest | الصندوق اليومي |
| Star(s) | نجمة / نجوم |
| Tempering (Reach, Blast, Watch) | التطويع (المدى، الانفجار، الرصد) |
| Stake | الرهان |
| Settle the score | تصفية الحساب |
| Collectors / storage | المُجمِّعات / المخزن |
| Looks | المظاهر |
| Research | البحث |
| Tile | مربع |
| Splash | ضرر واسع |
| Clan Stipend | راتب العشيرة |
| Player ID / friend code / save code | معرّف اللاعب / رمز الصداقة / رمز الحفظ |
| Online play / sandbox | اللعب عبر الإنترنت / بيئة الاختبار |
| generated (opponent) / simulated raider | مولَّد آليًا / مغير محاكى |

## Generated names

Arabic puts the noun first. `names.placeSecond` and `social.groveNames.second` are indefinite nouns in construct form (قمة، وادي، نمر، قناع) and the first parts are definite nouns in the genitive (الرعد، الصمت، القرمز), so every pair forms a correct idafa with no gender agreement: قمة الرعد، نمر الصمت. This needs `generatedNames: "noun-first"` in `languages.json` (integration step); without it the parts appear in the wrong order.

Japanese names are transliterated (كايتو، تاكيدا); Rin = رين, Ren = رِن.

## Not translated

`ui.on_slam_*` (" on slam") is a CSS class string, and `ui.s_have_*` ("s have") is an extraction fragment with no visible use; both are kept as in English. Brand and platform names (App Store, Google Play, Game Center, Play Games, Sentry, IndexedDB) stay in Latin. Legal pages keep their draft notices; the Japanese statutory pages are translated in full as the Spanish worksheet does, and Japan's own Japanese text is served to Japanese players.

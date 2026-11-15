# Русский: выбранные термины

Обращение к игроку на «ты», дружелюбно. Пол игрока и любого `{name}` неизвестен: никаких глаголов прошедшего времени и кратких прилагательных, согласованных с игроком или `{name}` («ты построил(а)», «{name} напал»). Используем настоящее/будущее время, безличные и страдательные обороты («Пропущен # день», «Набег: {name}», «от игрока {name}»). Плейсхолдеры не склоняются: `{building}`, `{troop}`, `{name}` стоят в именительном падеже после двоеточия или в приложении («Улучшить: {building}», «игрок {name}», «здание {building}»). Склонения чисел через ICU: one / few / many / other (other = дробные, родительный ед. ч.).

| English | Русский |
|---|---|
| Clan Keep / Keep / Keep 7 | Замок клана / Замок / Замок 7 (ур. 7) |
| Coin Mint / Terraced Farm | Монетный двор / Террасная ферма |
| Treasury / Provision Storehouse | Казна / Склад провизии |
| Coins / Provisions / Shadow Ink / Jade | Монеты / Провизия / Теневые чернила / Нефрит |
| Training Dojo / Squad Courtyard | Тренировочное додзё (коротко: Додзё) / Двор отрядов |
| Village Artisan / Artisan's Hut | Мастер деревни (мастер) / Хижина мастера |
| Alliance / Alliance Lodge / Alliance War | Альянс / Дом альянса / Война альянсов |
| Gang / Gang War / Gang leader | Банда / Война банд / главарь банды |
| Friendly Duel / duel layout | Дружеский поединок / расстановка для поединков |
| Shadow Trials / tier | Испытания Тени / ступень |
| Season Scroll / premium track / Pass (rail) | Свиток сезона / премиум-линия / Свиток |
| Smoke Bomb / smoke | Дымовая бомба / дым |
| Saboteur / Sabotage / jam | Диверсант / Диверсия / выводить из строя |
| Infiltration Points | Точки проникновения |
| Raid / attack / raider | набег / атака / налётчик |
| Warrior / Defense / Shield | воин / оборонительное сооружение, при счёте укрепление (оборона) / щит |
| Honor / Power / League | честь / сила / Лиги: Бамбуковая, Кедровая, Железная, Обсидиановая, Лига Углей, Лига Бури, Лига Тени, Лига Каге |
| Daily chest / streak / skip | ежедневный сундук / серия / пропуск |
| Clan Stipend | Жалованье клана |
| Looks | облики |
| Tempering (Reach / Blast / Watch) | Закалка (Дальность / Залп / Дозор) |
| Stake | Ставка |
| splash / anti-air | урон по площади / ПВО |
| generated | созданный компьютером |
| Settings / Store / Online play / Sign-ins | Настройки / Магазин / Игра онлайн / Способы входа |
| Privacy and help / moderators / support | Конфиденциальность и помощь / модераторы / поддержка |
| Codex | Кодекс |
| Sensei Hoshi | Сэнсэй Хоси |
| Shinobi / Oni Breaker / Kage League | Синоби / Крушитель Они / Лига Каге (отлична от Лиги Тени) |
| Level (Lv) | уровень (ур.) |

Названия зданий, воинов и ресурсов пишем с заглавной только первое слово (Монетный двор, Теневые чернила), как в русских играх; собственные имена (Каге, Синоби, Хоси) с заглавной. Бренды и технические имена (Kagemura, App Store, Google Play, Game Center, Play Games, IndexedDB, Sentry) латиницей.

Японские имена транскрибируются по системе Поливанова (Кайто, Такэда, Хоси, Синоби). Сгенерированные названия: `noun-first` — существительное, пробел, определение в родительном падеже (Пик + Грома = Пик Грома, Клинок Рассвета), чтобы ничего не согласовывалось по роду.

Время: {d} д {h} ч, {h} ч {m} мин, {m} мин {s} с. Перевод не проверен носителем языка.

## Notes from the parallel translation (2026-11-14)

The 2026-11-15 integration merge kept these terms. A parallel branch translated the same language with its own terms; its translations survive only for the keys this worksheet did not yet have (server messages, the complaint and account pages, interface text added after 2026-11-13). Those entries may use the parallel terms and should be harmonised with this table in a review pass. The parallel term table is `locales/ru/TERMS.md` at commit 04b0552.

Harmonisation done (2026-11-15): every key that came only from the parallel branch (the `srv.*` server messages, the complaint form `pages.complaints.*` and `pages.support.30`–`32`, and the interface keys added 2026-11-13/14) was reviewed against this table. Where the same English already had a translation here, that wording was taken over; elsewhere the parallel terms were replaced: Цитадель → Замок, сетевая игра / онлайн-игра / по сети → игра онлайн (Настройки → Игра онлайн → Способы входа), повтор → запись (replay), дуэль → поединок (расстановка для поединков), лидер банды → главарь банды, Зал альянса → Дом альянса, сид → seed, сгенерированная база → база, созданная компьютером. Обращение на «ты» везде, как в остальном переводе.

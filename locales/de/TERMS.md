# Deutsch — Übersetzungsentscheidungen

Standarddeutsch (Deutschland) mit *du* und *dein*, kleingeschrieben außer am Satzanfang, auch in den Rechtstexten; auch für Österreich, die Schweiz (mit ß) und Luxemburg. Text in Unicode NFC. Die Sprache ist eine Einstellung des Geräts; sie ändert nie Kennungen, Regeln, Kämpfe, von Spielern gewählte Namen oder von Menschen geschriebenen Chat.

| Englisch | Deutsch |
|---|---|
| Clan Keep / Keep / Keep 7 | Clanburg / Burg / Burg 7 |
| Coin Mint / Terraced Farm | Münzprägerei / Terrassenfeld |
| Treasury / Provision Storehouse | Schatzkammer / Proviantspeicher |
| Coins / Provisions / Shadow Ink / Jade | Münzen / Proviant (ohne Plural: 1.200 Proviant) / Schattentinte / Jade |
| Training Dojo / Squad Courtyard | Trainings-Dojo / Truppenhof |
| Village Artisan / Artisan's Hut | Dorfhandwerker / Handwerkerhütte |
| Alliance / Alliance Lodge / Alliance War | Allianz / Allianzhalle / Allianzkrieg |
| Gang / Gang War / Gang leader | Bande / Bandenkrieg / Bandenleitung |
| Friendly Duel / duel layout | Freundschaftsduell / Duell-Layout |
| Shadow Trials / tier | Schattenprüfungen / Stufe |
| Season Scroll / premium track / Pass (rail) | Saisonrolle / Premium-Pfad / Pass |
| Smoke Bomb | Rauchbombe |
| Saboteur / Sabotage / jam | Saboteur / Sabotage / lahmlegen, Lahmlegung, Störung |
| Infiltration Points | Einstiegspunkte (kurz: Punkt A) |
| Raid / attack / raider | Überfall, überfallen / Angriff, angreifen / Angreifer |
| Warrior / troops / Defense / Shield | Krieger / Truppen / Verteidigung / Schild |
| Honor / Power / League | Ehre / Macht / Liga (Bambusliga … Kage-Liga) |
| Daily chest / streak / skip | Tagestruhe / Serie / Joker |
| Clan Stipend | Clan-Sold |
| Looks / Keep look | Designs / Burgdesign |
| Research / Upgrade / Lv | Forschung / Verbessern, Verbesserung / Stufe, St. |
| Tile / space (Courtyard) | Feld (bis zu 3 Felder) / Platz, Truppenhofplatz |
| Kite (Kite Raider, Kite-Cutter Ballista, Dragon Kite Crew) | Drachen (Drachenflieger, Drachenschneider-Ballista, Lindwurm-Crew) |
| splash / anti-air | Flächenschaden / Flugabwehr (Chip: Flak) |
| generated (opponent, Gang) | generiert, computergeneriert |
| leader (player) / Elder / Member | Oberhaupt (neutral) / Ältestenrat / Mitglied |
| Village / Settings / Store | Dorf / Einstellungen / Shop (der App- oder Play-Store: Store) |
| Online play / Sign-ins / Privacy and help | Onlinespiel / Anmeldungen / Datenschutz und Hilfe |
| moderators / staff | die Moderation / das Team |
| Deleted player | Gelöschtes Konto |

Kagemura: Ninja Clans ist der offizielle Name und bleibt unverändert, ebenso Apple, Google, Game Center, Play Games, App Store, Google Play und „Mit Apple anmelden“ (Apples deutscher Name für Sign in with Apple). Japanische Personennamen, Shinobi, Kage und internationale Schriftnamen können wie im Englischen sein. Jade, Saboteur, Sabotage, Adept, Veteran, Tunnel, Tiger, Lotus, Frost, Pass, Obsidian, Chat, Chance, Events, Premium, Online, Support, OK und die Monatsnamen April, August, September und November sind auch deutsche Wörter. Kompositionen nur aus Parametern, Symbolen oder Einheiten können identisch sein. Codes, URLs, E-Mail-Adressen, IDs, Selektoren, CSS-Klassen und technische Werte (delete, reject, under13 …) werden nicht übersetzt.

Genus und Kasus: Artikel, Possessivpronomen und Adjektivendungen richten sich nach dem Genus, und das Spiel kennt weder das Genus eines eingesetzten Namens (`{name}`, `{building}`, `{troop}`) noch das der spielenden Person. Platzhalter stehen deshalb ohne Artikel oder nach einem Doppelpunkt (`{building} verbessern`, `Fertig gebaut: {arg1}`, `Basis von {arg1}`), nie mit Genitiv-s (`{name}s Dorf`). Für die spielende Person stehen neutrale Wörter (das Oberhaupt, die Person, die Moderation, die Bandenleitung) statt Anführer/Anführerin; die Bot-Sätze vermeiden „neuer Verbündeter“ und „du bist der Beste“. Prädikative Adjektive („du bist bereit“) bleiben im Deutschen unverändert und sind daher erlaubt. Wo ein Zähler im Satz steht, stehen Formen wie `{arg1} × {arg2}` statt eines selbst gebildeten Plurals.

Plural: Deutsch hat `one` (nur 1) und `other` (0 Krieger, 2 Krieger). Dezimalzahlen im Text mit Komma (3,5 Felder, 2,5-fach); Prozent mit geschütztem Leerzeichen (20 %), wie es `Intl` für Deutsch selbst schreibt. Das Spiel formatiert Zahlen deutsch (1.234.567; kompakt erst ab einer Million: 1,2 Mio.). Zeitangaben: `{d}T {h}h`, `{h}h {m}min`, `{m}min {s}s`.

Generierte Orts- und Alliancenamen werden als ein Wort zusammengesetzt (`generatedNames: "compound"` in `languages.json`): Donner + Gipfel = Donnergipfel, Eisen + Tor = Eisentor, Zwillings + Klinge = Zwillingsklinge. Erste Teile sind Wortstämme mit Fugenlaut (Zwillings, Laternen, Höhlen), zweite Teile Substantive, deren erster Buchstabe beim Zusammensetzen klein wird. Name und Startwert bleiben unverändert gespeichert.

Preise echter Käufe behalten das Format des Stores. Abrechnungsbeträge in US-Dollar bleiben in Dollar, ohne Währungsumrechnung. Serverzeiten in UTC bleiben in UTC.

Die Rechtstexte behalten die Entwurfshinweise und die noch fehlenden Angaben des Herausgebers. Die Übersetzung setzt keine Bedingungen in Kraft und ersetzt keine Prüfung durch den Herausgeber; die DSGVO-Begriffe (Verantwortlicher, berechtigte Interessen, Einwilligung, Standardvertragsklauseln) folgen der deutschen Fassung der Verordnung. Auf den japanischen Seiten ersetzt die Übersetzung, wie in den anderen Sprachen, das Paar Japanisch–Englisch; die Originalseiten bleiben japanisch. Systemfenster von Apple und Google folgen der Systemsprache.

Siehe REVIEW.json für die geprüften Übereinstimmungen mit dem Englischen und die Längenwarnungen. Sie sind kein vergessener Text. Noch hat kein deutscher Muttersprachler diese Übersetzung geprüft.

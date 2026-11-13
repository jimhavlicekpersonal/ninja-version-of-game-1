# Türkçe: seçilen terimler

Standart Türkçe (tr-TR), samimi ve sıcak; oyuncuya "sen" diye hitap edilir. Sensei Hoshi "ben" der, oyuncuya "sen" der. Türkçede dilbilgisel cinsiyet yok, ama ekler yer tutuculara (`{name}`, `{building}`, `{n}`…) eklenemez: ünlü uyumu oyunun bilmediği sese bağlıdır. Bu yüzden yer tutucudan sonra ek yok; cümle iki nokta ile ya da yer tutucudan sonra eki taşıyan bir isimle kurulur (`Köy: {name}`, `{name} adlı oyuncu`, `{building} binasını`, `{n} savaşçıyı`). Yüzde işareti Türkçede sayıdan önce gelir (`%{pct}`), ama `{pct}` işareti zaten içeriyorsa dokunulmaz.

| English | Türkçe |
|---|---|
| Clan Keep / Keep / Keep 7 | Klan Kalesi / Kale / Kale Sv. 7 (Sv. = seviye) |
| Coin Mint / Terraced Farm | Sikke Darphanesi / Teras Tarlası |
| Treasury / Provision Storehouse | Hazine / Erzak Ambarı |
| Coins / Provisions / Shadow Ink / Jade | Sikke / Erzak / Gölge Mürekkebi / Yeşim |
| Training Dojo / Squad Courtyard | Eğitim Dojosu (kısa: Dojo) / Bölük Avlusu |
| Village Artisan / Artisan's Hut | Köy Zanaatkârı (kısa: Zanaatkâr) / Zanaatkâr Kulübesi |
| Alliance / Alliance Lodge / Alliance War | İttifak / İttifak Konağı / İttifak Savaşı |
| Gang / Gang War / Gang leader | Çete / Çete Savaşı / çete lideri |
| Friendly Duel | Dostluk Düellosu |
| Shadow Trials / tier | Gölge Sınavları / kat (sınav), kademe (parşömen) |
| Season Scroll / premium track / Pass (rail) | Sezon Parşömeni / premium yol / Parşömen |
| Smoke Bomb / smoke | Duman Bombası / duman |
| Saboteur / Sabotage / jam | Sabotajcı / Sabotaj / kilitlemek |
| Infiltration Points | Sızma Noktaları |
| Raid / attack / raider | baskın / saldırı / baskıncı |
| Warrior / Defense / Shield | savaşçı / savunma / kalkan |
| Honor / Power / League | şeref / güç / Lig: Bambu, Sedir, Demir, Obsidyen, Yeşim, Fırtına, Gölge, Kage |
| Daily chest / streak / skip | günlük sandık / seri / atlama hakkı |
| Clan Stipend | Klan Maaşı |
| Looks | görünüm |
| Tempering (Reach / Blast / Watch) | Tavlama (Menzil / Patlama / Nöbet) |
| Stake | Bahis |
| splash / anti-air | alan hasarı / hava savunması |
| generated | bilgisayar üretimi |
| Settings / Store / Online play | Ayarlar / Mağaza / Çevrim içi oyun |
| Codex | Ansiklopedi |
| Sensei Hoshi | Sensei Hoshi |
| Shinobi / Oni Breaker / Kage League | Shinobi / Oni Kıran / Kage Ligi (Gölge Ligi'nden ayrı) |
| Lv | Sv. |

Bina, savaşçı ve kaynak adlarında her kelime büyük harfle başlar (Eğitim Dojosu, Gölge Mürekkebi). Marka ve teknik adlar (Kagemura, App Store, Google Play, Game Center, Play Games, IndexedDB, Sentry) aynen kalır. "Sign in with Apple" = "Apple ile Giriş Yap".

Japon adları Latin yazımıyla kalır (Kaito, Takeda, Gorō). İngilizce lakaplar Türkçeye çevrilir.

Çoğul: `Intl.PluralRules('tr')` one ve other verir; Türkçede sayıdan sonra isim tekil kalır, iki dal genelde aynıdır (`{n, plural, one {# savaşçı} other {# savaşçı}}`). Süreler: {d} g {h} sa, {h} sa {m} dk, {m} dk {s} sn.

Üretilen adlar: varsayılan düzen (birinci parça, boşluk, ikinci parça), çünkü Türkçede niteleyen önce gelir. Birinci parçalar sıfat ya da yer adlarında yalın kullanılan isimlerdir (Demir, Kara, Sessiz, İkiz), ikinci parçalar iyelik eki almayan yalın isimlerdir (Tepe, Kaya, Kapı), Türk yer adlarındaki gibi (Demirkapı, Karakaya). `generatedNames` ayarı gerekmez.

Bu çeviri anadili Türkçe olan bir insan tarafından gözden geçirilmedi.

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
| Honor / Power / League | şeref / güç / Lig: Bambu, Sedir, Demir, Obsidyen, Kor (Ember), Fırtına, Gölge, Kage |
| Relay (Gang War) | bayrak (bayrak vuruşu) |
| Gang Rating | Çete Puanı |
| Rematch / Settle the score | rövanş / Hesaplaş |
| simulated raider / computer rival | simüle baskıncı / bilgisayar rakibi |
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

Hukuki sayfalar (gizlilik, koşullar, topluluk kuralları, destek, hesap silme) Türk hukuk metinlerindeki gibi resmî "siz" ile yazıldı; oyunun kendisi "sen" kullanır. Japonya'nın yasal sayfaları Türkçeye çevrildi (Japonya Belirli Ticari İşlemler Kanunu / Ödeme Hizmetleri Kanunu Kapsamında Bildirim); destek sayfası onlara Japonca başlıklarıyla bağlantı verir.

Bu çeviri anadili Türkçe olan bir insan tarafından gözden geçirilmedi.

## Notes from the parallel translation (2026-11-14)

The 2026-11-15 integration merge kept these terms. A parallel branch translated the same language with its own terms; its translations survive only for the keys this worksheet did not yet have (server messages, the complaint and account pages, interface text added after 2026-11-13). Those entries may use the parallel terms and should be harmonised with this table in a review pass. The parallel term table is `locales/tr/TERMS.md` at commit 04b0552.

Harmonisation done (2026-11-15): every key that came only from the parallel branch (the `srv.*` server messages, the complaint form `pages.complaints.*` and `pages.support.30`–`32`, and the interface keys added 2026-11-13/14) was reviewed against this table. Where the same English already had a translation here, that wording was taken over (Çete'n, Çete Savaşı'na, Dostlar, kontrol et, kurulu değil, raporla); elsewhere the parallel terms were replaced: akıncı → baskıncı, çevrimiçi → çevrim içi, hizmet şartları → hizmet koşulları, Sebep → Neden, bildirim (a report) → rapor, askıya alındı (suspension from online play) → uzaklaştırıldı, oluşturulmuş üs → bilgisayar üretimi üs, alıştırma savaşı → antrenman savaşı, Lider tabloları → Sıralamalar, veya → ya da. The game says "sen"; the legal pages and the complaint form keep the formal "siz", as before.

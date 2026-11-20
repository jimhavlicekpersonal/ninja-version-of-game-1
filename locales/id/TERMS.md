# Bahasa Indonesia: istilah yang dipilih

Bahasa Indonesia baku yang ramah, menyapa pemain dengan "kamu" (posesif "-mu": desamu, prajuritmu). Sensei Hoshi menyebut dirinya "aku". Bahasa Indonesia tidak punya gender gramatikal; untuk pemain lain atau {name} pakai nama, "lawan" atau "pemain itu" (dia netral, boleh). Tidak ada akhiran yang menempel pada placeholder: tulis `desa {name}`, bukan `{name}-nya`.

| English | Bahasa Indonesia |
|---|---|
| Clan Keep / Keep / Keep 7 | Benteng Klan / Benteng / Benteng Lv. 7 (dalam kalimat: Benteng level 7) |
| Coin Mint / Terraced Farm | Percetakan Koin / Sawah Terasering |
| Treasury / Provision Storehouse | Perbendaharaan / Lumbung Perbekalan |
| Coins / Provisions / Shadow Ink / Jade | Koin / Perbekalan / Tinta Bayangan / Giok |
| Training Dojo / Squad Courtyard | Dojo Latihan (pendek: Dojo) / Halaman Regu |
| Village Artisan / Artisan's Hut | Perajin Desa / Pondok Perajin |
| Alliance / Alliance Lodge / Alliance War | Aliansi / Balai Aliansi / Perang Aliansi |
| Gang / Gang War / Gang leader | Geng / Perang Geng / ketua Geng |
| Friendly Duel / duel layout | Duel Persahabatan / tata letak duel |
| Shadow Trials / tier | Ujian Bayangan / tingkat |
| Season Scroll / premium track | Gulungan Musim / jalur premium |
| Smoke Bomb / smoke | Bom Asap / asap |
| Saboteur / Sabotage / jam | Penyabot / Sabotase / melumpuhkan |
| Infiltration Points | Titik Penyusupan |
| Raid / attack / raider | serbuan, menyerbu / serangan, menyerang / penyerbu |
| Warrior / troops / Defense / Shield | prajurit / pasukan / pertahanan / Perisai |
| Honor / Power / League | Kehormatan / Kekuatan / Liga: Bambu, Aras, Besi, Obsidian, Bara (Ember), Badai, Bayangan, Kage |
| Fortress (Ujian, buruan) / bounty / outpost | kubu (bukan Benteng) / buruan / pos |
| Daily chest / streak / skip | peti harian / runtunan / lompatan |
| Clan Stipend | Tunjangan Klan |
| Looks | tampilan |
| Tempering (Reach / Blast / Watch) | Penempaan (Jangkauan / Ledakan / Jaga) |
| Stake | Taruhan |
| The Gauntlet / Bounty Hunt / daily contract | Uji Nyali / Perburuan Hadiah / kontrak harian |
| Keep seal / sealed / mark (ladder) | segel Benteng / tersegel / tanda (di tangga) |
| Warrior Mastery rank / Season of the X | Peringkat (Penguasaan Prajurit) / Musim X (Musim Bangau) |
| splash / anti-air | kerusakan area / antiudara |
| generated | buatan komputer |
| Settings / Store / Online play / Sign-ins | Pengaturan / Toko / Main online / Cara masuk |
| Privacy and help / moderators / support | Privasi dan bantuan / moderator / dukungan |
| Codex | Ensiklopedia |
| Sensei Hoshi | Sensei Hoshi |
| Shinobi / Oni Breaker / Kage League | Shinobi / Penghancur Oni / Liga Kage (berbeda dari Liga Bayangan) |

Nama bangunan, prajurit dan sumber daya ditulis dengan huruf kapital di setiap kata (Dojo Latihan, Tinta Bayangan); kalimat biasa hanya huruf pertama. Merek dan nama teknis (Kagemura, App Store, Google Play, Game Center, Play Games, IndexedDB, Sentry) tetap. "Sign in with Apple" = "Masuk dengan Apple".

Nama Jepang tetap dalam ejaan Latin yang biasa (Kaito, Takeda, Gorō). Julukan bahasa Inggris (Swiftwind…) diterjemahkan sebagai julukan.

Nama yang dibuat game: `noun-first` (bagian kedua, spasi, bagian pertama), seperti bahasa Vietnam dan Spanyol, karena bahasa Indonesia menaruh kata benda sebelum penjelasnya (Puncak + Guntur = Puncak Guntur, Gerbang Besi, Bilah Kembar). Bagian pertama adalah penjelas yang cocok setelah kata benda apa pun; tanpa "dari" atau "milik". Pengaturan `generatedNames: "noun-first"` di `languages.json` adalah langkah integrasi.

Jamak hanya `other`. Angka sebelum kata benda tanpa bentuk jamak ({n} prajurit, {n} bangunan, {n} kali, {n} bintang). Waktu singkat: {d}h {h}j, {h}j {m}m, {m}m {s}d (hari, jam, menit, detik).

Terjemahan ini belum ditinjau oleh penutur asli bahasa Indonesia.

## Notes from the parallel translation (2026-11-14)

The 2026-11-15 integration merge kept these terms. A parallel branch translated the same language with its own terms; its translations survive only for the keys this worksheet did not yet have (server messages, the complaint and account pages, interface text added after 2026-11-13). Those entries may use the parallel terms and should be harmonised with this table in a review pass. The parallel term table is `locales/id/TERMS.md` at commit 04b0552.

Harmonisation done (2026-11-15): every key that came only from the parallel branch (the `srv.*` server messages, the complaint form `pages.complaints.*` and `pages.support.30`–`32`, and the interface keys added 2026-11-13/14) was reviewed against this table. Where the same English already had a translation here, that wording was taken over (ketua Geng, markas perang, Main online, Aliansi-mu/Benteng-mu/ID Pemain-mu, disiapkan, uji coba); elsewhere the parallel terms were replaced: Bermain online / permainan online → Main online, Halaman Pasukan → Halaman Regu, pemimpin Geng → ketua Geng, desa (war base) → markas, markas buatan → markas buatan komputer. The player is "kamu" throughout, the legal and complaint pages included.

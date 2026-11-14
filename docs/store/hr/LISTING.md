# Podaci za trgovine na hrvatskom — Kagemura: Ninja Clans

Tekst pripremljen za App Store i Google Play (hr-HR), istim jezikom i izrazima kao u igri (`locales/hr/TERMS.md`). Cijene i zasloni za kupnju dolaze iz svake trgovine. Objava podataka i snimaka zaslona posao je pri izdavanju i nije dio lokalne verzije. Ovaj tekst još nije unesen ni u jednu konzolu trgovine i nije ga pregledao izvorni govornik hrvatskog.

- Naziv: **Kagemura: Ninja Clans**
- Podnaslov u App Storeu: **Izgradi skriveno nindža selo**
- Kratki opis na Google Playu: **Izgradi skriveno planinsko selo, obuči ratnike i napadni suparničke utvrde**
- Promotivni tekst: **Vodi svoj klan kroz beskrajna Iskušenja sjene. Dim, sabotaža i dobar plan nadjačavaju grubu silu.**
- Ključne riječi: `nindža,ninja,shinobi,klan,selo,strategija,prepad,obrana,toranj,utvrda,rat,savez,dimna bomba`

## Opis

Vodi nindža klan, izgradi skriveno selo u planinama, obuči pedeset vrsta ratnika, izvidi suparnike i izvedi prepad uz dim i sabotažu.

**Izgradi skriveno selo**

- Podiži Utvrdu klana od razine 1 do 15 i otključavaj nove zgrade, zidove i obrambene građevine.
- Svaka zgrada ima svoj posao: Kovnica novčića, Terasasto polje, Riznica, Dojo za obuku, tornjevi i zamke.
- Rasporedi obranu tako da napadači moraju proći kroz nju.

**Obuči pedeset vrsta ratnika**

- Od Shinobija i Vještaka kunaija do Napadača na zmaju, Sabotera i Opsadnih bombardera, svaki sa svojom ulogom.
- Istraživanje u Dojou za obuku jača svakog ratnika.

**Napadaj s planom**

- Ratnici ulaze samo kroz Točke infiltracije. Izvidi putove i tornjeve koji ih čuvaju.
- Baci Dimnu bombu kad ratnici uđu u domet tornja i pošalji Sabotera da onesposobi obranu.
- Promišljen napad pobjeđuje veću vojsku.

**Igrajte zajedno** (na mreži)

- Pridruži se Savezu: razgovaraj, traži ratnike i šalji ih suborcima.
- Bori se u tjednom Ratu saveza.
- Dodaj prijatelje, izazovi ih na Prijateljski dvoboj i udružite se u Bandu do četiri igrača za Rat bandi.
- Penji se kroz lige časti i ljestvicu snage.

**Iskušenja sjene**

- Beskrajni niz utvrda. Svaka razina nagrađuje samo jednom i sve je teža.

**Poštena igra**

- Besplatna dnevna škrinja koja prije otvaranja pokazuje izglede. Ništa nasumično nikad se ne prodaje.
- Računalno stvoreni protivnici uvijek su tako označeni.
- Ograničenja potrošnje za igrače mlađe od 18 godina i samo podsjetnici koje odabereš (isključeni dok ih ne uključiš).

Kagemura je besplatna za preuzimanje i igranje: svaka zgrada, ratnik, razina Utvrde i način igre dostupni su bez plaćanja, a oglasa nema. Žad, premium valuta, zarađuje se u malim količinama igranjem (postignuća, lige, dnevna škrinja i besplatna staza Sezonskog svitka), a može se i kupiti. Neke stvari prodaju se samo za pravi novac: premium staza Sezonskog svitka (dodatne nagrade, brža gradnja tijekom sezone i izgled Utvrde „Festival lampiona“) i vremenski ograničeni paketi žada i resursa.

## Poveznice za izdavanje

Uzmi objavljenu adresu igre i dodaj `/hr/support.html`, `/hr/privacy.html` i `/hr/community.html`. Obrazac poslužitelja podržava `/account/delete?lang=hr`. Hrvatski prijevodi japanskih zakonskih stranica su `/hr/tokushoho.html` i `/hr/shikin-kessai.html`. Uvjeti korištenja i zakonske stranice ostaju nacrti dok ih operater ne ispuni i ne primijeni. Pravila izdavanja nalaze se u [RELEASE.md](../RELEASE.md).

## Napomene uz izdanje

Kagemura je sada dostupna na hrvatskom. Zasloni, vodič, zgrade, ratnici, bitke, obavijesti i stranice pomoći prikazuju se na hrvatskom. Jezik se mijenja u Postavke → Jezik. Tvoje selo i imena igrača ostaju nepromijenjeni.

Hrvatski snimci zaslona: `npm run build && npm run store:screenshots -- --language=hr` (potrebni su Playwright, Chromium i font sa slovima č, ć, đ, š i ž; program se može zadati s `CHROMIUM_PATH`)

# Magyar áruházi adatlap — Kagemura: Ninja Clans

Az App Store és a Google Play számára előkészített szöveg (hu-HU), a játékkal azonos nyelvezettel és kifejezésekkel (`locales/hu/TERMS.md`). Az árakat és a vásárlási képernyőket az egyes áruházak jelenítik meg. Az adatlap és a képernyőképek közzététele kiadáskori feladat, nem része a helyi buildnek. Ezt a szöveget még egyik áruház felületére sem töltötték fel, és magyar anyanyelvű lektor még nem nézte át.

- Név: **Kagemura: Ninja Clans**
- App Store-alcím: **Építs rejtett nindzsafalut**
- Google Play rövid leírás: **Építs rejtett hegyi falut, képezz harcosokat, és portyázz a rivális erődök ellen**
- Promóciós szöveg: **Vezesd a klánodat végig a végtelen Árnypróbákon. Füst, szabotázs és egy jó terv többet ér a nyers erőnél.**
- Kulcsszavak: `nindzsa,shinobi,klán,falu,stratégia,portya,védelem,torony,vár,háború,szövetség,füstbomba`

## Leírás

Vezess egy nindzsaklánt, építs rejtett falut a hegyekben, képezz ötvenféle harcost, kémleld ki a riválisaidat, és portyázz ellenük füsttel és szabotázzsal.

**Építsd fel a rejtett falut**

- Fejleszd a Klánvárat az 1. szinttől a 15.-ig, és nyiss meg új épületeket, falakat és védőépületeket.
- Minden épületnek megvan a maga feladata: Pénzverde, Teraszos földek, Kincstár, Gyakorló dódzsó, tornyok és csapdák.
- Úgy helyezd el a védelmet, hogy a portyázóknak rajta keresztül kelljen jönniük.

**Képezz ötvenféle harcost**

- A Shinobitól és a Kunai-avatottól a Sárkányos portyázóig, a Szabotőrig és az Ostrombombázóig mindegyiknek saját szerepe van.
- A Gyakorló dódzsóban végzett kutatás minden harcost erősebbé tesz.

**Portyázz tervvel**

- A harcosok csak a Beszivárgási pontokon jutnak be. Kémleld ki az utakat és az őket védő tornyokat.
- Dobj Füstbombát, amikor a harcosaid egy torony hatótávjába lépnek, és küldj Szabotőrt, hogy megbénítson egy védőépületet.
- Egy jól átgondolt támadás legyőzi a nagyobb sereget.

**Játsszatok együtt** (online)

- Csatlakozz egy Szövetséghez: csevegj, kérj harcosokat, és küldj a klántársaidnak.
- Harcolj a heti Szövetségi háborúban.
- Vegyél fel barátokat, hívd ki őket Barátságos párbajra, és álljatok össze legfeljebb négyfős Bandába a Bandaháborúhoz.
- Mássz feljebb a becsületligákban és az erőranglistán.

**Árnypróbák**

- Erődök végtelen sora. Minden szint csak egyszer ad jutalmat, és egyre nehezebb.

**Tisztességes játék**

- Ingyenes napi láda, amely kinyitás előtt megmutatja az esélyeket. Semmi véletlenszerűt nem árulunk.
- A gépi ellenfelek mindig meg vannak jelölve.
- Költési korlát 18 év alatti játékosoknak, és csak az általad választott emlékeztetők (kikapcsolva, amíg be nem kapcsolod őket).

A Kagemura ingyenesen letölthető és játszható: minden épület, harcos, Vár-szint és játékmód elérhető fizetés nélkül, és nincsenek hirdetések. A Jáde, a prémium fizetőeszköz, kis mennyiségben játékkal szerezhető (eredmények, ligák, a napi láda és a Szezontekercs ingyenes sávja), és meg is vásárolható. Néhány dolog csak valódi pénzért kapható: a Szezontekercs prémium sávja (extra jutalmak, gyorsabb építés a szezon során és a „Lámpásünnep” várkinézet), valamint korlátozott ideig elérhető Jáde- és nyersanyagcsomagok.

## Kiadási hivatkozások

Vedd a játék közzétett címét, és fűzd hozzá: `/hu/support.html`, `/hu/privacy.html` és `/hu/community.html`. A szerver űrlapja támogatja a `/account/delete?lang=hu` címet. A japán jogszabályi oldalak magyar fordítása: `/hu/tokushoho.html` és `/hu/shikin-kessai.html`. A felhasználási feltételek és a jogszabályi oldalak tervezetek maradnak, amíg az üzemeltető ki nem tölti és hatályba nem lépteti őket. A kiadás szabályai: [RELEASE.md](../RELEASE.md).

## Kiadási megjegyzések

A Kagemura mostantól magyarul is elérhető. A képernyők, az oktatórész, az épületek, a harcosok, a csaták, az értesítések és a súgóoldalak magyarul jelennek meg. A nyelvet a Beállítások → Nyelv menüben válthatod. A falud és a játékosnevek változatlanok maradnak.

Magyar képernyőképek: `npm run build && npm run store:screenshots -- --language=hu` (Playwright, Chromium és egy ő és ű betűt is tartalmazó betűtípus szükséges; a program a `CHROMIUM_PATH` változóval adható meg)

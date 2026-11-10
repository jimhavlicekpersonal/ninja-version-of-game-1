// Writes ios/App/Products.storekit from the game's catalog (report section 5 step 7, compliance C08):
// one Consumable per store product id in src/gameplay/data/store.json `storeProductIds`, with the
// catalog price and what it gives. tests/backend/release-config.test.ts fails when they disagree.
//   node tools/store/storekit.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const store = read('src/gameplay/data/store.json');
const offers = read('src/gameplay/data/offers.json');
const pass = read('src/gameplay/data/pass.json');
const path = new URL('ios/App/Products.storekit', root);
const esData = read('locales/es/data.json');
const shortSpanish = {starter_pack: 'Jade y recursos para nuevos líderes', builder_pack: 'Jade para contratar otro Artesano y recursos', war_prep_pack: 'Provisiones y Jade para la Guerra de Alianzas', rebuild_pack: 'Jade y recursos para reconstruir', keep_pack: 'Recursos y Jade para celebrar tu nueva Fortaleza'};
const spanish = key => esData[key]?.text || '';
const hiData = read('locales/hi/data.json');
const shortHindi = {starter_pack: 'नए सरदारों के लिए जेड और संसाधन', builder_pack: 'एक और कारीगर रखने के लिए जेड, और संसाधन', war_prep_pack: 'गठबंधन युद्ध के लिए रसद और जेड', rebuild_pack: 'फिर से बनाने के लिए जेड और संसाधन', keep_pack: 'आपके नए किले के जश्न के लिए संसाधन और जेड'};
const hindi = key => hiData[key]?.text || '';
const ptData = read('locales/pt/data.json');
const shortPortuguese = {starter_pack: 'Jade e recursos para novos líderes', builder_pack: 'Jade para contratar mais um Artesão, e recursos', war_prep_pack: 'Provisões e Jade para a Guerra de Alianças', rebuild_pack: 'Jade e recursos para reconstruir', keep_pack: 'Recursos e Jade para celebrar sua nova Fortaleza'};
const portuguese = key => ptData[key]?.text || '';
const deData = read('locales/de/data.json');
const shortGerman = {starter_pack: 'Jade und Ressourcen für neue Clanoberhäupter', builder_pack: 'Jade für einen weiteren Handwerker, plus Ressourcen', war_prep_pack: 'Proviant und Jade für den Allianzkrieg', rebuild_pack: 'Jade und Ressourcen für den Wiederaufbau', keep_pack: 'Ressourcen und Jade für deine neue Burgstufe'};
const german = key => deData[key]?.text || '';
const frData = read('locales/fr/data.json');
const shortFrench = {starter_pack: 'Du Jade et des ressources pour les nouveaux clans', builder_pack: 'Du Jade pour un Artisan de plus, et des ressources', war_prep_pack: "Provisions et Jade pour la Guerre d'Alliance", rebuild_pack: 'Du Jade et des ressources pour reconstruire', keep_pack: 'Ressources et Jade pour fêter ton nouveau Donjon'};
const french = key => frData[key]?.text || '';
const itData = read('locales/it/data.json');
const shortItalian = {starter_pack: 'Giada e risorse per i nuovi clan', builder_pack: "Giada per un altro Artigiano, più risorse", war_prep_pack: "Provviste e Giada per la Guerra d'Alleanza", rebuild_pack: 'Giada e risorse per ricostruire', keep_pack: 'Risorse e Giada per festeggiare la nuova Rocca'};
const italian = key => itData[key]?.text || '';
const zhData = read('locales/zh-Hans/data.json');
const shortChinese = {starter_pack: '为新任族长准备的翡翠和资源', builder_pack: '可再雇一名工匠的翡翠，外加资源', war_prep_pack: '同盟战用的粮草和翡翠', rebuild_pack: '用于重建的翡翠和资源', keep_pack: '庆祝天守阁升级的资源和翡翠'};
const chinese = key => zhData[key]?.text || '';
const roData = read('locales/ro/data.json');
const shortRomanian = {starter_pack: 'Jad și resurse pentru clanurile noi', builder_pack: 'Jad pentru încă un Meșteșugar, plus resurse', war_prep_pack: 'Provizii și Jad pentru Războiul Alianțelor', rebuild_pack: 'Jad și resurse pentru reconstrucție', keep_pack: 'Resurse și Jad pentru noua ta Cetate'};
const romanian = key => roData[key]?.text || '';
// Romanian counts from 20 up (CLDR plural 'other') take "de": 30 de plăți, 12 plăți.
const roCount = n => `${n}${new Intl.PluralRules('ro').select(n) === 'other' ? ' de' : ''}`;
const caData = read('locales/ca/data.json');
const shortCatalan = {starter_pack: 'Jade i recursos per als clans nous', builder_pack: 'Jade per a un altre Artesà, i recursos', war_prep_pack: "Provisions i Jade per a la Guerra d'Aliances", rebuild_pack: 'Jade i recursos per reconstruir', keep_pack: 'Recursos i Jade per celebrar la nova Fortalesa'};
const catalan = key => caData[key]?.text || '';
const jaData = read('locales/ja/data.json');
const shortJapanese = {starter_pack: '新しい頭領のための翡翠と資源', builder_pack: '職人をもう1人雇える翡翠と資源', war_prep_pack: '同盟戦のための兵糧と翡翠', rebuild_pack: '再建のための翡翠と資源', keep_pack: '天守閣の強化を祝う資源と翡翠'};
const japanese = key => jaData[key]?.text || '';
const nlData = read('locales/nl/data.json');
const shortDutch = {starter_pack: 'Jade en grondstoffen voor nieuwe clanleiders', builder_pack: 'Jade voor nog een Ambachtsman, plus grondstoffen', war_prep_pack: 'Proviand en Jade voor de Alliantieoorlog', rebuild_pack: 'Jade en grondstoffen om te herbouwen', keep_pack: 'Grondstoffen en Jade voor je nieuwe Burcht'};
const dutch = key => nlData[key]?.text || '';
const svData = read('locales/sv/data.json');
const shortSwedish = {starter_pack: 'Jade och resurser för nya klanledare', builder_pack: 'Jade för ännu en Hantverkare, plus resurser', war_prep_pack: 'Proviant och Jade för Allianskriget', rebuild_pack: 'Jade och resurser för att bygga upp igen', keep_pack: 'Resurser och Jade för din nya Borg'};
const swedish = key => svData[key]?.text || '';
const daData = read('locales/da/data.json');
const shortDanish = {starter_pack: 'Jade og ressourcer til nye klanledere', builder_pack: 'Jade til endnu en Håndværker, plus ressourcer', war_prep_pack: 'Proviant og Jade til Alliancekrigen', rebuild_pack: 'Jade og ressourcer til genopbygning', keep_pack: 'Ressourcer og Jade til din nye Borg'};
const danish = key => daData[key]?.text || '';
const nbData = read('locales/nb/data.json');
const shortNorwegian = {starter_pack: 'Jade og ressurser for nye klanledere', builder_pack: 'Jade til enda en Håndverker, pluss ressurser', war_prep_pack: 'Proviant og Jade til Alliansekrigen', rebuild_pack: 'Jade og ressurser til gjenoppbygging', keep_pack: 'Ressurser og Jade til den nye Borgen din'};
const norwegian = key => nbData[key]?.text || '';
const koData = read('locales/ko/data.json');
const shortKorean = {starter_pack: '새 가문 지도자를 위한 비취와 자원', builder_pack: '장인 한 명을 더 고용할 비취와 자원', war_prep_pack: '동맹전을 위한 군량과 비취', rebuild_pack: '재건을 위한 비취와 자원', keep_pack: '새 본성 레벨을 위한 자원과 비취'};
const korean = key => koData[key]?.text || '';
const thData = read('locales/th/data.json');
const shortThai = {starter_pack: 'หยกและทรัพยากรสำหรับผู้นำตระกูลมือใหม่', builder_pack: 'หยกสำหรับจ้างช่างเพิ่ม พร้อมทรัพยากร', war_prep_pack: 'เสบียงและหยกสำหรับสงครามพันธมิตร', rebuild_pack: 'หยกและทรัพยากรสำหรับสร้างใหม่', keep_pack: 'ทรัพยากรและหยกสำหรับป้อมเลเวลใหม่'};
const thai = key => thData[key]?.text || '';
// Never cut Hindi, German, French, Italian, Chinese, Romanian, Catalan, Japanese, Dutch, Swedish, Danish, Norwegian, Korean or Thai to the store limits: slicing can split a Devanagari cluster (leaving a vowel sign or virama dangling), a compound, a Chinese word or a Thai syllable (a vowel or tone mark cut from its consonant), so overlong text fails here instead.
const clip = (text, max, language = 'Hindi') => { if (text.length > max) throw new Error(`${language} store text is over ${max} characters: ${text}`); return text; };
const old = JSON.parse(readFileSync(path, 'utf8'));

const products = Object.entries(store.storeProductIds).map(([gameId, storeId], i) => {
  const pack = store.packs.find((p) => p.id === gameId);
  const offer = offers.rules.find((o) => o.productId === gameId);
  const stipend = store.stipend?.id === gameId ? store.stipend : null;
  const isPass = pass.productId === gameId;
  const [name, usd, text] = pack
    ? [pack.name, pack.usd, `${pack.moonstones} Jade`]
    : offer
      ? [offer.title, offer.usd, offer.description]
      : stipend
        ? [stipend.name, stipend.usd, `${stipend.payments} daily payments of ${stipend.jadePerPayment} Jade`]
        : isPass
          ? [`${pass.name} premium`, pass.usd, 'The premium track of this season']
          : [storeId, 0, storeId];
  return {
    displayPrice: usd.toFixed(2),
    familyShareable: false,
    internalID: String(60000001 + i),
    localizations: [
      { description: text.slice(0, 55), displayName: name.slice(0, 30), locale: 'en_US' },
      ...['es_ES', 'es_MX'].map(locale => ({
        displayName: (pack ? spanish(`store.packs.${gameId}.name`) : offer ? spanish(`offers.rules.${offer.id}.title`) : stipend ? spanish('store.stipend.name') : isPass ? `${spanish('pass.name')} prémium` : name).slice(0, 30),
        description: (pack ? `${pack.moonstones} de Jade` : offer ? (shortSpanish[offer.id] || spanish(`offers.rules.${offer.id}.description`)) : stipend ? `${stipend.payments} pagos diarios de ${stipend.jadePerPayment} de Jade` : 'Senda prémium de esta temporada').slice(0, 55), locale,
      })),
      {
        displayName: clip(pack ? hindi(`store.packs.${gameId}.name`) : offer ? hindi(`offers.rules.${offer.id}.title`) : stipend ? hindi('store.stipend.name') : isPass ? `प्रीमियम ${hindi('pass.name')}` : name, 30),
        description: clip(pack ? `${pack.moonstones} जेड` : offer ? (shortHindi[offer.id] || hindi(`offers.rules.${offer.id}.description`)) : stipend ? `${stipend.jadePerPayment} जेड के ${stipend.payments} रोज़ाना भुगतान` : 'इस सीज़न का प्रीमियम पथ', 55),
        locale: 'hi',
      },
      // Brazilian Portuguese, also offered to Portugal (locales/languages.json).
      ...['pt_BR', 'pt_PT'].map(locale => ({
        displayName: (pack ? portuguese(`store.packs.${gameId}.name`) : offer ? portuguese(`offers.rules.${offer.id}.title`) : stipend ? portuguese('store.stipend.name') : isPass ? 'Pergaminho Premium' : name).slice(0, 30),
        description: (pack ? `${pack.moonstones} de Jade` : offer ? (shortPortuguese[offer.id] || portuguese(`offers.rules.${offer.id}.description`)) : stipend ? `${stipend.payments} pagamentos diários de ${stipend.jadePerPayment} de Jade` : 'Trilha premium desta temporada').slice(0, 55), locale,
      })),
      // German (Germany), the App Store's one German localization, also shown in Austria and Switzerland.
      {
        displayName: clip(pack ? german(`store.packs.${gameId}.name`) : offer ? german(`offers.rules.${offer.id}.title`) : stipend ? german('store.stipend.name') : isPass ? `Premium-${german('pass.name')}` : name, 30, 'German'),
        description: clip(pack ? `${pack.moonstones} Jade` : offer ? (shortGerman[offer.id] || german(`offers.rules.${offer.id}.description`)) : stipend ? `${stipend.payments} tägliche Zahlungen à ${stipend.jadePerPayment} Jade` : 'Premium-Pfad dieser Saison', 55, 'German'),
        locale: 'de_DE',
      },
      // French: France and Canada (the App Store's two French localizations), also Belgium, Switzerland and Africa.
      ...['fr_FR', 'fr_CA'].map(locale => ({
        displayName: clip(pack ? french(`store.packs.${gameId}.name`) : offer ? french(`offers.rules.${offer.id}.title`) : stipend ? french('store.stipend.name') : isPass ? 'Parchemin premium' : name, 30, 'French'),
        description: clip(pack ? `${pack.moonstones} Jade` : offer ? (shortFrench[offer.id] || french(`offers.rules.${offer.id}.description`)) : stipend ? `${stipend.payments} versements quotidiens de ${stipend.jadePerPayment} Jade` : 'Voie premium de cette saison', 55, 'French'),
        locale,
      })),
      {
        displayName: clip(pack ? italian(`store.packs.${gameId}.name`) : offer ? italian(`offers.rules.${offer.id}.title`) : stipend ? italian('store.stipend.name') : isPass ? 'Pergamena premium' : name, 30, 'Italian'),
        description: clip(pack ? `${pack.moonstones} Giada` : offer ? (shortItalian[offer.id] || italian(`offers.rules.${offer.id}.description`)) : stipend ? `${stipend.payments} pagamenti giornalieri da ${stipend.jadePerPayment} Giada` : 'Percorso premium di questa stagione', 55, 'Italian'),
        locale: 'it_IT',
      },
      // Simplified Chinese (App Store "Chinese (Simplified)"), shown in every storefront whose device language is zh-Hans.
      {
        displayName: clip(pack ? chinese(`store.packs.${gameId}.name`) : offer ? chinese(`offers.rules.${offer.id}.title`) : stipend ? chinese('store.stipend.name') : isPass ? `高级${chinese('pass.name')}` : name, 30, 'Chinese'),
        description: clip(pack ? `${pack.moonstones} 翡翠` : offer ? (shortChinese[offer.id] || chinese(`offers.rules.${offer.id}.description`)) : stipend ? `每天发放 ${stipend.jadePerPayment} 翡翠，共 ${stipend.payments} 次` : '本赛季的高级路线', 55, 'Chinese'),
        locale: 'zh_Hans',
      },
      // Romanian (Romania), also shown in Moldova.
      {
        displayName: clip(pack ? romanian(`store.packs.${gameId}.name`) : offer ? romanian(`offers.rules.${offer.id}.title`) : stipend ? romanian('store.stipend.name') : isPass ? 'Pergament premium' : name, 30, 'Romanian'),
        description: clip(pack ? `${roCount(pack.moonstones)} Jad` : offer ? (shortRomanian[offer.id] || romanian(`offers.rules.${offer.id}.description`)) : stipend ? `${roCount(stipend.payments)} plăți zilnice a câte ${stipend.jadePerPayment} Jad` : 'Traseul premium al acestui sezon', 55, 'Romanian'),
        locale: 'ro',
      },
      // Catalan (the App Store's Catalan localization), shown in Spain and Andorra to Catalan devices.
      {
        displayName: clip(pack ? catalan(`store.packs.${gameId}.name`) : offer ? catalan(`offers.rules.${offer.id}.title`) : stipend ? catalan('store.stipend.name') : isPass ? 'Pergamí premium' : name, 30, 'Catalan'),
        description: clip(pack ? `${pack.moonstones} Jade` : offer ? (shortCatalan[offer.id] || catalan(`offers.rules.${offer.id}.description`)) : stipend ? `${stipend.payments} pagaments diaris de ${stipend.jadePerPayment} Jade` : "Recorregut premium d'aquesta temporada", 55, 'Catalan'),
        locale: 'ca',
      },
      // Japanese (the App Store's Japanese localization).
      {
        displayName: clip(pack ? japanese(`store.packs.${gameId}.name`) : offer ? japanese(`offers.rules.${offer.id}.title`) : stipend ? japanese('store.stipend.name') : isPass ? `プレミアム${japanese('pass.name')}` : name, 30, 'Japanese'),
        description: clip(pack ? `翡翠${pack.moonstones}個` : offer ? (shortJapanese[offer.id] || japanese(`offers.rules.${offer.id}.description`)) : stipend ? `翡翠${stipend.jadePerPayment}個を毎日1回、全${stipend.payments}回` : '今シーズンのプレミアム枠', 55, 'Japanese'),
        locale: 'ja',
      },
      // Dutch (the App Store's one Dutch localization), also shown in Belgium.
      {
        displayName: clip(pack ? dutch(`store.packs.${gameId}.name`) : offer ? dutch(`offers.rules.${offer.id}.title`) : stipend ? dutch('store.stipend.name') : isPass ? 'Premium-Seizoensrol' : name, 30, 'Dutch'),
        description: clip(pack ? `${pack.moonstones} Jade` : offer ? (shortDutch[offer.id] || dutch(`offers.rules.${offer.id}.description`)) : stipend ? `${stipend.payments} dagelijkse betalingen van ${stipend.jadePerPayment} Jade` : 'Premiumspoor van dit seizoen', 55, 'Dutch'),
        locale: 'nl_NL',
      },
      // Swedish, also shown to Swedish-speaking Finland.
      {
        displayName: clip(pack ? swedish(`store.packs.${gameId}.name`) : offer ? swedish(`offers.rules.${offer.id}.title`) : stipend ? swedish('store.stipend.name') : isPass ? 'Premium-Säsongsrulle' : name, 30, 'Swedish'),
        description: clip(pack ? `${pack.moonstones} Jade` : offer ? (shortSwedish[offer.id] || swedish(`offers.rules.${offer.id}.description`)) : stipend ? `${stipend.payments} dagliga utbetalningar på ${stipend.jadePerPayment} Jade` : 'Premiumspår för den här säsongen', 55, 'Swedish'),
        locale: 'sv',
      },
      // Danish.
      {
        displayName: clip(pack ? danish(`store.packs.${gameId}.name`) : offer ? danish(`offers.rules.${offer.id}.title`) : stipend ? danish('store.stipend.name') : isPass ? 'Premium-Sæsonrulle' : name, 30, 'Danish'),
        description: clip(pack ? `${pack.moonstones} Jade` : offer ? (shortDanish[offer.id] || danish(`offers.rules.${offer.id}.description`)) : stipend ? `${stipend.payments} daglige udbetalinger på ${stipend.jadePerPayment} Jade` : 'Premiumspor for denne sæson', 55, 'Danish'),
        locale: 'da',
      },
      // Norwegian Bokmål (App Store Connect lists it as Norwegian), also shown to nn and no devices.
      {
        displayName: clip(pack ? norwegian(`store.packs.${gameId}.name`) : offer ? norwegian(`offers.rules.${offer.id}.title`) : stipend ? norwegian('store.stipend.name') : isPass ? 'Premium-Sesongrull' : name, 30, 'Norwegian'),
        description: clip(pack ? `${pack.moonstones} Jade` : offer ? (shortNorwegian[offer.id] || norwegian(`offers.rules.${offer.id}.description`)) : stipend ? `${stipend.payments} daglige utbetalinger på ${stipend.jadePerPayment} Jade` : 'Premiumspor for denne sesongen', 55, 'Norwegian'),
        locale: 'nb',
      },
      // Korean (the App Store's Korean localization).
      {
        displayName: clip(pack ? korean(`store.packs.${gameId}.name`) : offer ? korean(`offers.rules.${offer.id}.title`) : stipend ? korean('store.stipend.name') : isPass ? `프리미엄 ${korean('pass.name')}` : name, 30, 'Korean'),
        description: clip(pack ? `비취 ${pack.moonstones}개` : offer ? (shortKorean[offer.id] || korean(`offers.rules.${offer.id}.description`)) : stipend ? `비취 ${stipend.jadePerPayment}개씩 매일 ${stipend.payments}회 지급` : '이번 시즌의 프리미엄 트랙', 55, 'Korean'),
        locale: 'ko',
      },
      // Thai (the App Store's Thai localization).
      {
        displayName: clip(pack ? thai(`store.packs.${gameId}.name`) : offer ? thai(`offers.rules.${offer.id}.title`) : stipend ? thai('store.stipend.name') : isPass ? `${thai('pass.name')}พรีเมียม` : name, 30, 'Thai'),
        description: clip(pack ? `หยก ${pack.moonstones}` : offer ? (shortThai[offer.id] || thai(`offers.rules.${offer.id}.description`)) : stipend ? `หยกวันละ ${stipend.jadePerPayment} จำนวน ${stipend.payments} วัน` : 'เส้นทางพรีเมียมของซีซันนี้', 55, 'Thai'),
        locale: 'th',
      },
    ],
    productID: storeId,
    referenceName: name,
    type: 'Consumable',
  };
});
writeFileSync(path, `${JSON.stringify({ ...old, products }, null, 2)}\n`);
console.log(`Wrote ${products.length} products to ios/App/Products.storekit.`);

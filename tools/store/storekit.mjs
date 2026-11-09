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
// Never cut Hindi, German, French, Italian or Chinese to the store limits: slicing can split a Devanagari cluster (leaving a vowel sign or virama dangling), a compound or a Chinese word, so overlong text fails here instead.
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
    ],
    productID: storeId,
    referenceName: name,
    type: 'Consumable',
  };
});
writeFileSync(path, `${JSON.stringify({ ...old, products }, null, 2)}\n`);
console.log(`Wrote ${products.length} products to ios/App/Products.storekit.`);

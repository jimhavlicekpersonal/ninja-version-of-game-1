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
    ],
    productID: storeId,
    referenceName: name,
    type: 'Consumable',
  };
});
writeFileSync(path, `${JSON.stringify({ ...old, products }, null, 2)}\n`);
console.log(`Wrote ${products.length} products to ios/App/Products.storekit.`);

// Measures the next-objective chip texts in all 50 languages (characters), to compare with what a one-line
// ellipsis chip can show on a phone. Run from the repo root: node <this file>
const fs = require('fs');
const REPO = '/home/user/ninja-version-of-game-1';
const langs = JSON.parse(fs.readFileSync(REPO + '/locales/languages.json', 'utf8')).languages.map((l) => l.code);
const en = { ...require(REPO + '/locales/en/ui.json'), ...require(REPO + '/locales/en/messages.json') };
const enData = require(REPO + '/locales/en/data.json');
const keys = ['objective.chest', 'objective.raid', 'objective.keep', 'objective.upgrade', 'objective.save', 'objective.builders', 'battle.trainFirst'];
const rows = [];
for (const code of langs) {
  let pack;
  try { pack = JSON.parse(fs.readFileSync(REPO + '/locales/compiled/' + code + '.json', 'utf8')); } catch { pack = en; }
  if (code === 'en') pack = Object.assign({}, en, Object.fromEntries(Object.entries(enData).map(([k, v]) => ['data.' + k, v])));
  const b = pack['data.buildings.army_camp.name'] || 'Squad Courtyard';
  const coins = pack['data.economy.resourceNames.acorns'] || 'Coins';
  const prov = pack['data.economy.resourceNames.dew'] || 'Provisions';
  const p = { level: '4', building: b, need: '12.3K ' + coins + ' + 4.5K ' + prov, time: '3h 12m' };
  const fill = (s) => s.replace(/\{(\w+)\}/g, (m, k) => p[k] ?? m);
  rows.push([code, ...keys.map((k) => [...fill(pack[k] || en[k] || k)].length)]);
}
console.log(['lang', ...keys.map((k) => k.split('.')[1])].join('\t'));
for (const r of rows) console.log(r.join('\t'));
const col = (i) => rows.map((r) => r[i]);
console.log('max\t' + keys.map((k, i) => Math.max(...col(i + 1))).join('\t'));
console.log('min\t' + keys.map((k, i) => Math.min(...col(i + 1))).join('\t'));
console.log('median\t' + keys.map((k, i) => col(i + 1).sort((a, b) => a - b)[25]).join('\t'));
for (const lim of [23, 34]) console.log('languages over ' + lim + ' chars:', keys.map((k, i) => k.split('.')[1] + '=' + rows.filter((r) => r[i + 1] > lim).length).join(' '));

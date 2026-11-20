import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
const OUT = (process.env.SCRATCH ?? '/tmp/kagemura-understand');
writeFileSync(OUT, '');
const log = (...a: unknown[]) => appendFileSync(OUT, a.join(' ') + '\n');
const REPO = '/home/user/ninja-version-of-game-1';
test('probe', async () => {
  const rt = await import(/* @vite-ignore */ `${REPO}/locales/runtime.ts`);
  const es = JSON.parse(readFileSync(`${REPO}/locales/compiled/es.json`, 'utf8'));
  rt.installCatalog('es', es);
  rt.setDeviceLocale('es');
  const src = (s: string, err = false) => rt.sourceText(s, 'es', es, err);
  const lab = (s: string) => rt.labelText(s, 'es', es);
  const cases: [string, string, string][] = [];
  const add = (how: string, s: string, out: string) => cases.push([how, s, out]);
  for (const s of [
    'Loot you can win', 'Practice battle (nothing spent or won)', 'Friendly duel with Aki (nothing spent or won)',
    'Practice battle: no warriors were spent and nothing was won.', 'Friendly duel with Aki: no warriors were spent and nothing was won.',
    'Iron Crane outpost (computer rival, offline)', 'Generated rival (offline)', 'Generated rival (no player fitted your rank)', 'Iron Crane outpost (computer rival)',
    'Just 3% short of the 50% star.', 'The Clan Keep had only 7% of its health left.', 'One building stood between you and 3 stars.', 'Only 2 buildings stood between you and 3 stars.',
    "Aki's base (simulated raider)", 'Settle the score', 'This raid cannot be answered.', 'You already settled the score with this raider.', 'Too long ago: the raider has moved on.',
    'There is no free space for that building.', "That spot isn't free.", 'Level 4!', 'Bounty fortress', 'A new version of Kagemura is out, and online play needs it.',
    'Army 1', 'Army 3',
  ]) add('source', s, src(s));
  for (const s of ['Reward: ', 'Loot: ', 'Honor: ', 'Cost: ', ' (practice)', 'None.', 'Done!', 'Offline play', 'Connecting…', 'Online', 'No connection', 'Update needed', 'Suspended', 'Built', 'Being built', 'Not built yet', 'Resources', 'Army', 'Defense', 'Decor', 'Train', 'Honor', 'Power', 'Weekly: ', 'Settings', 'End battle', 'Exit replay', 'Home', 'Alliance War', '+1', '+5', "You've been playing for an hour. How about a stretch and a glass of water? Your Village Artisans will keep working while you're away."]) add('label', s, lab(s));
  const same = cases.filter(([, s, o]) => s === o);
  log('TOTAL', cases.length, 'UNTRANSLATED', same.length);
  for (const [h, s, o] of cases) log(s === o ? 'SAME ' : 'ok   ', h, JSON.stringify(s), '=>', JSON.stringify(o));
  // the duel toast with plural hack
  log('duel en:', rt.ENGLISH['ui.duel_recorded_against_win_in_duel_ad5ab60385']);
  log('duel es:', es['ui.duel_recorded_against_win_in_duel_ad5ab60385']);
  log('bounty en:', rt.ENGLISH['ui.new_bounty_step_reached_the_reward_is__7c76ffd3be']);
  log('bounty es:', es['ui.new_bounty_step_reached_the_reward_is__7c76ffd3be']);
  log('vs en:', rt.ENGLISH['ui.vs_2d68ca8191'], '| es:', es['ui.vs_2d68ca8191'], '|', rt.translate('ui.vs_2d68ca8191', { arg1: 'Alliance War', arg2: 'X' }, 'es', es));
  log('queued en:', rt.ENGLISH['ui.queued_more_could_not_be_queued_61c350a031'], '| es:', es['ui.queued_more_could_not_be_queued_61c350a031']);
});

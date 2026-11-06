// Balance bundles (roadmap step 76): signed number changes the server hands out,
// so prices, timers and rewards can change without an app release.
//
//   node tools/balance/bundle.mjs keygen
//       Prints a new key pair. Keep the private key secret (a password manager, never
//       the repo). The public key goes in the repository variable VITE_BALANCE_PUBLIC_KEY
//       (built into the game) and the server's BALANCE_PUBLIC_KEY.
//
//   BALANCE_PRIVATE_KEY_FILE=key.pem node tools/balance/bundle.mjs make <changes.json> <id> [out.json]
//       changes.json: { "economy.scoutFeeByHall.3": 40, "offers.starter.usd": 1.99 } (dotted paths
//       into the game's data; numbers only, existing numbers only, never combat numbers).
//       Writes a signed bundle (default balance-<id>.json) after the same checks the game runs.
//       Deploy it with the server's BALANCE_BUNDLE_FILE; games pick it up on their next start.
//
//   Experiment arms (report section 5 step 5): BALANCE_COHORT=offer-timing-1:short:0-50 makes the
//   bundle an arm for statistics-id buckets 0..49 of that experiment; BALANCE_MAIN=balance-main.json
//   names everyone's bundle it sits beside (its changes are repeated in the arm). An arm may change
//   only offer timing. Deploy a list: BALANCE_BUNDLE_FILE=[main, arm, …] as one JSON array.
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const [mode, changesFile, id, outFile] = process.argv.slice(2);

if (mode === 'keygen') {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  console.log('Private key (keep secret; save as key.pem):\n');
  console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }));
  console.log('Public key (VITE_BALANCE_PUBLIC_KEY and BALANCE_PUBLIC_KEY):\n');
  console.log(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
  process.exit(0);
}
if (mode !== 'make' || !changesFile || !id) {
  console.error('Usage: node tools/balance/bundle.mjs keygen | make <changes.json> <id> [out.json]');
  process.exit(1);
}
const keyPem = process.env.BALANCE_PRIVATE_KEY ?? (process.env.BALANCE_PRIVATE_KEY_FILE ? readFileSync(process.env.BALANCE_PRIVATE_KEY_FILE, 'utf8') : '');
if (!keyPem) {
  console.error('Set BALANCE_PRIVATE_KEY_FILE (or BALANCE_PRIVATE_KEY) to the private key from keygen.');
  process.exit(1);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { defaultData } = await server.ssrLoadModule('/src/gameplay/sim/data.ts');
  const { SIM_RULES } = await server.ssrLoadModule('/src/gameplay/sim/battle/battle.ts');
  const { dataVersionOf } = await server.ssrLoadModule('/src/backend/net/dataVersion.ts');
  const { bundleMessage, checkCohort, patchedData } = await server.ssrLoadModule('/src/backend/net/balanceBundle.ts');
  const wanted = JSON.parse(readFileSync(changesFile, 'utf8'));
  let changes = Object.entries(wanted).map(([p, value]) => ({ path: p.split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k)), value }));
  let cohort;
  const main = process.env.BALANCE_MAIN ? JSON.parse(readFileSync(process.env.BALANCE_MAIN, 'utf8')) : null;
  if (process.env.BALANCE_COHORT) {
    const m = /^([a-z0-9_-]+):([a-z0-9_-]+):(\d+)-(\d+)$/i.exec(process.env.BALANCE_COHORT);
    if (!m) throw new Error('BALANCE_COHORT must look like experiment:arm:from-to, e.g. offer-timing-1:short:0-50');
    cohort = { experiment: m[1], arm: m[2], from: Number(m[3]), to: Number(m[4]) };
    // An arm starts from the built-in data, so it repeats everyone's changes.
    const own = new Set(changes.map((c) => c.path.join('.')));
    changes = [...(main?.changes ?? []).filter((c) => !own.has(c.path.join('.'))), ...changes];
  }
  // Work out the resulting data version with the game's own checks, then sign.
  const draft = { format: 1, id, rules: SIM_RULES, base: dataVersionOf(defaultData), changes, dataVersion: '', ...(cohort ? { cohort } : {}) };
  const probe = patchedData(defaultData, { ...draft, dataVersion: 'x', signature: '' }, SIM_RULES);
  if ('error' in probe && !/data version/.test(probe.error)) throw new Error(`Refused: ${probe.error}`);
  const patched = structuredClone(defaultData);
  for (const c of changes) {
    let node = patched;
    for (const k of c.path.slice(0, -1)) node = node[k];
    node[c.path[c.path.length - 1]] = c.value;
  }
  draft.dataVersion = dataVersionOf(patched);
  const signature = sign('sha256', Buffer.from(bundleMessage(draft)), { key: keyPem, dsaEncoding: 'ieee-p1363' }).toString('base64');
  const bundle = { ...draft, signature };
  const check = patchedData(defaultData, bundle, SIM_RULES);
  if ('error' in check) throw new Error(`Refused: ${check.error}`);
  if (cohort) {
    const why = checkCohort(bundle, main);
    if (why) throw new Error(`Refused: ${why}`);
  }
  const out = outFile ?? `balance-${id}.json`;
  writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(`Wrote ${out}: ${changes.length} changes for battle rules ${SIM_RULES}, data ${draft.base} -> ${draft.dataVersion}.`);
} finally {
  await server.close();
}

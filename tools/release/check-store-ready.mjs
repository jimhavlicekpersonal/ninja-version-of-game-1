// Store-readiness preflight (PUB-04, P7-01): one table of everything still missing for a store build.
//   npm run release:preflight              a notice (web build, local check): always exits 0
//   npm run release:preflight -- --store   the signed Android and TestFlight jobs: exits 1 when a fact a store
//                                          build needs is empty (operator, support email, deletion URL, terms date)
//                                          or malformed, or the app id is the legacy one (unless allowed)
// It reads only the repository and the environment the job gives it; it never invents a value.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { ciNote } from './ci-note.mjs';
import { REQUIRED_FOR_STORE, legalValueProblem, readLegalConfig } from './legal-config.mjs';
import { appIdProblem } from './app-id.mjs';

const store = process.argv.includes('--store');
const rows = []; // [what, state, blocking]
const add = (what, state, blocking = false) => rows.push([what, state, blocking]);

const legal = readLegalConfig();
for (const [k, v] of Object.entries(legal)) {
  const bad = legalValueProblem(k, v);
  if (bad) add(`legal-config.js ${k}`, `malformed: ${bad}`, true);
  else if (v === '') add(`legal-config.js ${k}`, 'empty (pages say "not published yet")', REQUIRED_FOR_STORE.includes(k));
}
if (!legal.termsEffective) add('Terms of service', 'draft (termsEffective empty: terms.html shows the draft banner)', true);

const id = appIdProblem(process.env.APP_ID, process.env.ALLOW_LEGACY_APP_ID === '1');
if (id) add('App id', id, true);
for (const [name, label] of [['ANDROID_KEYSTORE_BASE64', 'Android upload key'], ['ASC_KEY_ID', 'App Store Connect API key']]) {
  if (!process.env[name]) add(label, `${name} not given to this job`);
}
if (!process.env.VITE_SERVER_URL) add('Server URL', 'VITE_SERVER_URL not set: the build plays offline only');

// Products: every store id the game asks for appears in the shipping table (docs/SHIPPING.md 3b).
const ids = Object.values(JSON.parse(readFileSync('src/gameplay/data/store.json', 'utf8')).storeProductIds ?? {});
const shipping = readFileSync('docs/SHIPPING.md', 'utf8');
const missing = ids.filter((p) => !shipping.includes(`\`${p}\``));
if (missing.length) add('Store products', `not in the SHIPPING.md table: ${missing.join(', ')}`);

// Policy date: tests pin it to the English privacy text; a stale pin means the date was not moved.
const pages = JSON.parse(readFileSync('locales/en/pages.json', 'utf8'));
const text = Object.keys(pages).filter((k) => k.startsWith('pages.privacy.')).sort().map((k) => `${k}=${pages[k]}`).join('\n');
const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
if (!readFileSync('tests/presentation/store-compliance.test.ts', 'utf8').includes(hash)) add('Privacy policy date', 'the English privacy text changed since policyUpdated was set');

// Native plugins: every Capacitor plugin dependency is registered in the native projects (P7-03).
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const plugins = Object.keys(pkg.dependencies ?? {}).filter((d) => /^@capacitor(-community)?\//.test(d) && !['@capacitor/core', '@capacitor/android', '@capacitor/ios', '@capacitor/cli'].includes(d));
const fileText = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const [settings, build, swift] = ['android/capacitor.settings.gradle', 'android/app/capacitor.build.gradle', 'ios/App/CapApp-SPM/Package.swift'].map(fileText);
// settings.gradle and Package.swift point at node_modules/<package>; capacitor.build.gradle names the project ':<scope>-<name>'.
const unsynced = plugins.filter((p) => !settings.includes(`node_modules/${p}/`) || !swift.includes(`node_modules/${p}"`) || !build.includes(`':${p.slice(1).replace('/', '-')}'`));
if (unsynced.length) add('Native plugins', `run npm run build && npx cap sync: not registered: ${unsynced.join(', ')}`);

const blocking = rows.filter((r) => r[2]);
console.log(`Store readiness: ${rows.length ? `${rows.length} item(s) open, ${blocking.length} blocking a store build` : 'nothing open that this script can check'} (owner list: docs/store/OWNER_CHECKLIST.md)`);
for (const [what, state, b] of rows) console.log(`${b ? '✗' : '·'} ${what}: ${state}`);
if (store && blocking.length) {
  ciNote('error', 'Not ready for a store build', `${blocking.length} blocking item(s): ${blocking.map((r) => r[0]).join('; ')} (docs/store/OWNER_CHECKLIST.md)`);
  process.exit(1);
}
if (rows.length) ciNote('notice', 'Store readiness', `${rows.length} item(s) still open for a store build (npm run release:preflight)`);

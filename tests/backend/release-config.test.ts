/**
 * Release pipeline guards (worldwide audit GLOBAL-001, -016, -017, R09). There
 * is no Android SDK or Actions runner in `npm test`, so these read the build
 * files: they catch a regression, they do not prove a build or upload works.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
/** One step of a workflow job, as text (no YAML parser in the dependencies): `run` holds the whole step. */
type Step = { run?: string; text: string };
const steps = (file: string, job: string): Step[] => {
  const lines = read(file).split('\n');
  const start = lines.findIndex((l) => l === `  ${job}:`);
  if (start < 0) throw new Error(`no job ${job} in ${file}`);
  const end = lines.findIndex((l, i) => i > start && /^ {2}[a-z][\w-]*:/.test(l));
  const body = lines.slice(start, end < 0 ? undefined : end).join('\n');
  return body
    .split(/\n {6}- /)
    .slice(1)
    .map((text) => ({ text, run: /(^|\n)\s*run: /.test(text) ? text : undefined }));
};
const envOf = (s: Step | undefined, key: string) => (s ? new RegExp(`\\n\\s+${key}: (.+)`).exec(s.text)?.[1].trim() : undefined);
const isBuild = (s: Step) => /(^|\n)\s*run: npm run build\s*(\n|$)/.test(s.text);

describe('Android build configuration', () => {
  it('uses Play Billing 8 or later (7.x is no longer accepted by Play)', () => {
    const v = /playBillingVersion\s*=\s*'(\d+)\.(\d+)\.(\d+)'/.exec(read('android/variables.gradle'));
    expect(v).not.toBeNull();
    expect(Number(v![1])).toBeGreaterThanOrEqual(8);
    expect(read('android/app/build.gradle')).toContain('com.android.billingclient:billing:$playBillingVersion');
    expect(read('android/app/build.gradle')).not.toMatch(/billingclient:billing:7\./);
  });

  it('takes versionCode/versionName and the upload key from release.gradle, not a fixed 1', () => {
    const app = read('android/app/build.gradle');
    expect(app).not.toMatch(/versionCode\s+1\b/);
    expect(app).toContain("apply from: 'release.gradle'");
    expect(app).toMatch(/versionCode project\.ext\.tkVersionCode/);
    expect(app).toMatch(/signingConfig signingConfigs\.release/);
    const rel = read('android/app/release.gradle');
    for (const env of ['ANDROID_VERSION_CODE', 'ANDROID_KEYSTORE_FILE', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) expect(rel).toContain(env);
    expect(read('android/.gitignore')).toMatch(/^keystore\.properties$/m);
  });

  it('registers the native sign-in and billing plugins', () => {
    const main = read('android/app/src/main/java/com/toadstoolkingdoms/app/MainActivity.java');
    expect(main).toContain('registerPlugin(TkBillingPlugin.class)');
    expect(main).toContain('registerPlugin(TkAuthPlugin.class)');
    expect(read('android/app/src/main/java/com/toadstoolkingdoms/app/TkAuthPlugin.java')).toContain('@CapacitorPlugin(name = "TkAuth")');
    expect(main).toContain('registerPlugin(TkAgePlugin.class)');
  });
});

describe('iOS app shell', () => {
  // Capacitor 8 registers only the npm plugins in capacitor.config.json on its own. The game's own
  // plugins exist only if the scene's root view controller registers them; a plain
  // CAPBridgeViewController here left every iPhone without purchases, sign-ins and the age signal.
  it('the scene uses TkViewController, which registers every plugin the game calls', () => {
    const scene = read('ios/App/App/SceneDelegate.swift');
    expect(scene).toMatch(/rootViewController = TkViewController\(\)/);
    expect(scene).not.toMatch(/rootViewController = CAPBridgeViewController\(\)/);
    const vc = read('ios/App/App/TkViewController.swift');
    for (const [cls, jsName, ts] of [
      ['TkStorePlugin', 'TkStore', 'src/backend/payments/storekit.ts'],
      ['TkAuthPlugin', 'TkAuth', 'src/backend/platform/auth.ts'],
      ['TkAgePlugin', 'TkAge', 'src/backend/platform/auth.ts'],
    ] as const) {
      expect(vc, cls).toContain(`registerPluginInstance(${cls}())`);
      expect(read(`ios/App/App/${cls}.swift`), cls).toContain(`public let jsName = "${jsName}"`);
      expect(read(ts), jsName).toContain(`('${jsName}')`);
    }
  });

  it('TestFlight builds take their version from package.json (the project says 1.0 for ever)', () => {
    const archive = steps('.github/workflows/ios-testflight.yml', 'testflight').find((x) => x.run?.includes('xcodebuild -project'));
    expect(archive?.run).toContain(`node -p "require('./package.json').version"`);
    expect(archive?.run).toMatch(/MARKETING_VERSION="\$MARKETING_VERSION"/);
  });
});

describe('workflows', () => {
  it('deploy.yml migrates the contract database before starting the built server, and waits on /readyz', () => {
    const s = steps('.github/workflows/deploy.yml', 'server');
    const migrate = s.findIndex((x) => x.run?.includes('npm run server:migrate'));
    const start = s.findIndex((x) => x.run?.includes('node dist-server/main.js'));
    const build = s.findIndex((x) => x.run?.includes('npm run server:build'));
    expect(build).toBeGreaterThanOrEqual(0);
    expect(migrate).toBeGreaterThan(build);
    expect(start).toBeGreaterThan(migrate);
    expect(s[start].run).toContain('/readyz');
    expect(s[start].run).toMatch(/exit 1/);
  });

  it('android.yml keeps the debug APK and builds a signed commercial AAB with an increasing versionCode', () => {
    const apk = steps('.github/workflows/android.yml', 'apk');
    expect(apk.some((x) => x.run?.includes('assembleDebug'))).toBe(true);
    const aab = steps('.github/workflows/android.yml', 'aab');
    const build = aab.find(isBuild);
    expect(envOf(build, 'VITE_PLAY_BILLING')).toBe("'1'");
    expect(aab.some((x) => x.run?.includes('bundleRelease'))).toBe(true);
    expect(aab.some((x) => x.run?.includes('github.run_number') && x.run.includes('ANDROID_VERSION_CODE'))).toBe(true);
    expect(aab.some((x) => x.run?.includes('jarsigner -verify'))).toBe(true);
  });

  it('native builds know the web address friend links open (R09)', () => {
    for (const [file, job] of [
      ['.github/workflows/android.yml', 'apk'],
      ['.github/workflows/android.yml', 'aab'],
      ['.github/workflows/ios-testflight.yml', 'testflight'],
    ] as const) {
      const build = steps(file, job).find(isBuild);
      expect(envOf(build, 'VITE_PUBLIC_URL'), `${file} ${job}`).toBe('${{ vars.VITE_PUBLIC_URL }}');
    }
  });
});

describe('report section 5 step 4 (economy E08): the store setup table lists every product the game sells', () => {
  it('docs/SHIPPING.md 3b has a row for each store product id in store.json', () => {
    const store = JSON.parse(read('src/gameplay/data/store.json')) as { storeProductIds: Record<string, string> };
    const doc = read('docs/SHIPPING.md');
    for (const [gameId, storeId] of Object.entries(store.storeProductIds)) expect(doc, storeId).toContain(`| \`${storeId}\` | \`${gameId}\` |`);
  });

  it('no other table in docs/SHIPPING.md starts a row with a game id the stores do not use', () => {
    // Section 2 once told the owner to create `moonstones_1` … `lantern_pass` in App Store Connect: the
    // game asks for the store ids, and App Store Connect never lets a product id be used twice.
    const store = JSON.parse(read('src/gameplay/data/store.json')) as { storeProductIds: Record<string, string> };
    const gameOnly = Object.entries(store.storeProductIds).filter(([g, s]) => g !== s).map(([g]) => g);
    const doc = read('docs/SHIPPING.md');
    for (const id of gameOnly) expect(doc, id).not.toMatch(new RegExp(`^\\s*\\| \`${id}\` \\|`, 'm'));
  });
});

describe('report section 5 step 7 (compliance C08): the StoreKit test configuration matches the catalog', () => {
  it('ios/App/Products.storekit sells exactly the store product ids, as consumables, at the catalog price (npm run store:storekit)', () => {
    const store = JSON.parse(read('src/gameplay/data/store.json')) as { storeProductIds: Record<string, string>; packs: { id: string; usd: number }[] };
    const kit = JSON.parse(read('ios/App/Products.storekit')) as { products: { productID: string; type: string; displayPrice: string }[] };
    expect(kit.products.map((p) => p.productID).sort()).toEqual(Object.values(store.storeProductIds).sort());
    for (const p of kit.products) expect(p.type, p.productID).toBe('Consumable');
    for (const pack of store.packs) expect(kit.products.find((p) => p.productID === store.storeProductIds[pack.id])?.displayPrice).toBe(pack.usd.toFixed(2));
  });
});

describe('backend batch 2026-11-13: image and CI hygiene (A26, A27)', () => {
  it('the server image pins its base by digest, runs under tini and has a health check', () => {
    const docker = read('Dockerfile');
    expect(docker).toMatch(/ARG NODE_IMAGE=node:\d+\.\d+\.\d+-slim@sha256:[0-9a-f]{64}/);
    expect(docker.match(/^FROM /gm)!.length).toBe(docker.match(/^FROM \$\{NODE_IMAGE\}/gm)!.length);
    expect(docker).toContain('ENTRYPOINT ["/usr/bin/tini", "--"]');
    expect(docker).toMatch(/HEALTHCHECK [^\n]*\\\n\s+CMD node -e "fetch\('http:\/\/127\.0\.0\.1:'/);
  });

  it('every workflow pins its actions by commit SHA and the build audits runtime packages', async () => {
    const { readdirSync } = await import('node:fs');
    const dir = new URL('../../.github/workflows/', import.meta.url);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
      for (const m of read(`.github/workflows/${f}`).matchAll(/uses:\s*(\S+)/g)) expect(m[1], `${f}: ${m[1]}`).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
    expect(read('.github/workflows/deploy.yml')).toContain('npm audit --omit=dev --audit-level=high');
  });
});

describe('report section 5 step 10 (quality 32): the server image carries only server packages', () => {
  it('every runtime dependency is either imported by the server bundle or removed in the Dockerfile', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    const docker = read('Dockerfile');
    const server = ['fastify', 'pg', 'unicode-segmenter'];
    for (const dep of Object.keys(pkg.dependencies)) {
      if (server.includes(dep)) continue;
      const removed = docker.includes(`node_modules/${dep}`) || docker.includes(`node_modules/${dep.split('/')[0]} `) || docker.includes(`node_modules/${dep.split('/')[0]}\n`) || docker.includes(`node_modules/${dep.split('/')[0]} \\`);
      expect(removed, `${dep} would ship in the server image`).toBe(true);
    }
  });
});

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
  const end = lines.findIndex((l, i) => i > start && /^  [a-z][\w-]*:/.test(l));
  const body = lines.slice(start, end < 0 ? undefined : end).join('\n');
  return body
    .split(/\n      - /)
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
});

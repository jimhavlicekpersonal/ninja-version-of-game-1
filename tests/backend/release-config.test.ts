/**
 * Release pipeline guards (worldwide audit GLOBAL-001, -016, -017, R09). There
 * is no Android SDK or Actions runner in `npm test`, so these read the build
 * files: they catch a regression, they do not prove a build or upload works.
 */
import { existsSync, readFileSync } from 'node:fs';
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
    // Beast Mode OPS-03 / STB-04: a renderer death rebuilds the activity instead of killing the app, and is recorded.
    expect(main).toContain('registerPlugin(TkNativePlugin.class)');
    expect(main).toMatch(/addWebViewListener\(new WebViewListener\(\) \{[\s\S]*public boolean onRenderProcessGone\(WebView view, RenderProcessGoneDetail detail\) \{[\s\S]*recreate\(\);\s*return true;/);
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
      ['TkSecureStorePlugin', 'TkSecureStore', 'src/backend/platform/secureTokens.ts'],
    ] as const) {
      expect(vc, cls).toContain(`registerPluginInstance(${cls}())`);
      expect(read(`ios/App/App/${cls}.swift`), cls).toContain(`public let jsName = "${jsName}"`);
      expect(read(ts), jsName).toContain(`('${jsName}')`);
      expect(read('ios/App/App.xcodeproj/project.pbxproj'), cls).toContain(`${cls}.swift in Sources`);
    }
    // SEC-11: Keychain items stay on this device (no iCloud/backup copy of the session token).
    expect(read('ios/App/App/TkSecureStorePlugin.swift')).toContain('kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly');
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

  it('App Links / Universal Links: templates with placeholders never reach public/, the native hooks wait behind a TODO (R09)', () => {
    const assetlinks = JSON.parse(read('tools/applinks/assetlinks.template.json'));
    expect(assetlinks[0].target.sha256_cert_fingerprints).toEqual(['__PLAY_APP_SIGNING_SHA256__']);
    expect(JSON.parse(read('tools/applinks/apple-app-site-association.template.json')).applinks.details[0].appIDs).toEqual(['__APPLE_TEAM_ID__.__IOS_BUNDLE_ID__']);
    for (const f of ['public/.well-known/assetlinks.json', 'public/.well-known/apple-app-site-association']) expect(existsSync(new URL(`../../${f}`, import.meta.url)), f).toBe(false);
    // Commented out until the owner's domain exists: an autoVerify filter for a placeholder host would fail verification.
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/TODO\(owner, audit R09\)[\s\S]*android:autoVerify="true"[\s\S]*YOUR_DOMAIN[\s\S]*-->/);
    expect(manifest.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/autoVerify/);
    const ent = read('ios/App/App/App.entitlements');
    expect(ent).toMatch(/TODO\(owner, audit R09\)[\s\S]*applinks:YOUR_DOMAIN/);
    expect(ent.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/associated-domains/);
    expect(read('src/main.ts')).toMatch(/listenForAppLinks\(/);
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

/**
 * Backend A26 follow-up (2026-11-14 code-debt batch): no Docker daemon runs where the tests run, so the
 * image is never built here. This parses the Dockerfile the way the builder reads it (comments, line
 * continuations, instructions) and checks what a build would trip over first: unknown instructions,
 * ARG/stage references, JSON-form ENTRYPOINT/CMD, HEALTHCHECK options, and COPY sources that exist.
 */
describe('the Dockerfile parses (A26 follow-up)', () => {
  const INSTRUCTIONS = new Set(['FROM', 'RUN', 'CMD', 'LABEL', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL']);
  function instructions(text: string): { op: string; args: string; line: number }[] {
    const out: { op: string; args: string; line: number }[] = [];
    let buf = '';
    let start = 0;
    text.split('\n').forEach((raw, i) => {
      const line = raw.replace(/\r$/, '');
      if (!buf && (/^\s*#/.test(line) || !line.trim())) return;
      if (buf && /^\s*#/.test(line)) return; // comments inside a continued instruction are dropped
      if (!buf) start = i + 1;
      buf += (buf ? ' ' : '') + line.replace(/\\$/, '').trim();
      if (line.endsWith('\\')) return;
      const m = /^(\S+)\s*(.*)$/.exec(buf)!;
      out.push({ op: m[1]!.toUpperCase(), args: m[2]!, line: start });
      buf = '';
    });
    expect(buf, 'the last instruction ends with a line continuation').toBe('');
    return out;
  }

  it('every instruction is known, stages and build arguments resolve, and COPY sources exist', () => {
    const list = instructions(read('Dockerfile'));
    const stages: string[] = [];
    const args = new Set<string>();
    let seenFrom = false;
    for (const { op, args: rest, line } of list) {
      const at = `Dockerfile:${line} ${op}`;
      expect(INSTRUCTIONS.has(op), at).toBe(true);
      if (op === 'ARG') args.add(rest.split('=')[0]!.trim());
      else if (!seenFrom) expect(op, `${at}: only ARG may come before the first FROM`).toBe('FROM');
      if (op === 'FROM') {
        seenFrom = true;
        const m = /^(\S+)(?:\s+AS\s+(\S+))?$/i.exec(rest);
        expect(m, at).not.toBeNull();
        for (const v of m![1]!.matchAll(/\$\{(\w+)\}/g)) expect(args.has(v[1]!), `${at}: ARG ${v[1]} declared before FROM`).toBe(true);
        stages.push(m![2] ?? String(stages.length));
      }
      if (op === 'COPY' || op === 'ADD') {
        const parts = rest.split(/\s+/);
        const from = parts.find((p) => p.startsWith('--from='))?.slice('--from='.length);
        const files = parts.filter((p) => !p.startsWith('--'));
        expect(files.length, at).toBeGreaterThanOrEqual(2);
        if (from) expect(stages.slice(0, -1), `${at}: --from names an earlier stage`).toContain(from);
        else for (const src of files.slice(0, -1)) expect(existsSync(new URL(`../../${src}`, import.meta.url)), `${at}: ${src} exists`).toBe(true);
      }
      if (op === 'ENTRYPOINT' || op === 'CMD') expect(Array.isArray(JSON.parse(rest)), `${at}: JSON form`).toBe(true);
      if (op === 'HEALTHCHECK') {
        const m = /^((?:--\w[\w-]*=\S+\s+)*)CMD\s+(.+)$/.exec(rest);
        expect(m, at).not.toBeNull();
        for (const o of m![1]!.trim().split(/\s+/).filter(Boolean)) expect(o, at).toMatch(/^--(interval|timeout|start-period|start-interval|retries)=\d+[smh]?$/);
      }
      if (op === 'EXPOSE') expect(rest, at).toMatch(/^\d+(\/(tcp|udp))?$/);
    }
    expect(stages.length).toBe(2);
    expect(list.at(-1)!.op).toBe('CMD');
  });
});

describe('one app id variable (PUB-05, P7-02)', () => {
  it('capacitor, gradle and both signed workflows read APP_ID and refuse the legacy id unless allowed', async () => {
    const { appIdProblem, LEGACY_APP_ID } = await import('../../tools/release/app-id.mjs');
    expect(appIdProblem(undefined)).toMatch(/APP_ID is not set/);
    expect(appIdProblem(LEGACY_APP_ID)).toMatch(/legacy/);
    expect(appIdProblem(LEGACY_APP_ID, true)).toBeNull();
    expect(appIdProblem(undefined, true)).toBeNull();
    expect(appIdProblem('com.Example.App')).toMatch(/not a valid/);
    expect(appIdProblem('com.example.kagemura')).toBeNull();
    const read = (p: string) => readFileSync(p, 'utf8');
    expect(read('capacitor.config.ts')).toContain('process.env.APP_ID || LEGACY_APP_ID');
    expect(read('android/app/release.gradle')).toMatch(/readProp\('tkApplicationId', 'APP_ID'\)/);
    expect(read('android/app/build.gradle')).toContain('applicationId project.ext.tkApplicationId');
    expect(read('.github/workflows/android.yml')).toContain('node tools/release/check-app-id.mjs');
    expect(read('.github/workflows/ios-testflight.yml')).toContain('node tools/release/check-app-id.mjs');
    // strings.xml keeps the legacy package_name and custom_url_scheme (cap sync does not rewrite them): listed in
    // docs/SHIPPING.md section 6 as staying until the owner moves to the new id.
    expect(read('docs/SHIPPING.md')).toMatch(/custom_url_scheme/);
  });
});

describe('native projects list every Capacitor plugin the game depends on (PUB-06, P7-03)', () => {
  it('each @capacitor/* and @capacitor-community/* plugin is in the Android settings, the app build and the iOS package', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    const plugins = Object.keys(pkg.dependencies).filter((d) => /^@capacitor(-community)?\//.test(d) && !['@capacitor/core', '@capacitor/android', '@capacitor/ios', '@capacitor/cli'].includes(d));
    expect(plugins.length).toBeGreaterThanOrEqual(5);
    const settings = readFileSync('android/capacitor.settings.gradle', 'utf8');
    const build = readFileSync('android/app/capacitor.build.gradle', 'utf8');
    const swift = readFileSync('ios/App/CapApp-SPM/Package.swift', 'utf8');
    for (const p of plugins) {
      expect(settings, `${p}: run npm run build && npx cap sync`).toContain(`node_modules/${p}/`);
      expect(build, p).toContain(`':${p.slice(1).replace('/', '-')}'`);
      expect(swift, p).toContain(`node_modules/${p}"`);
    }
  });
});

describe('P7-06 (PUB-09): the iPhone release runs on an image with the required SDK', () => {
  it('runs on macos-26 and stops (not warns) below iOS SDK 26', () => {
    const y = read('.github/workflows/ios-testflight.yml');
    expect(y).toMatch(/runs-on: macos-26/);
    expect(y).not.toMatch(/runs-on: macos-15/);
    expect(y).toMatch(/::error::iOS SDK .* older than 26.*\n?.*exit 1|older than 26[^\n]*exit 1/);
  });
});

describe('P7-11 (PUB-14): local-day statistics stay the owner\'s switch', () => {
  it('every client workflow passes VITE_STATS_TZ from a repository variable, off when unset', () => {
    for (const f of ['deploy.yml', 'android.yml', 'ios-testflight.yml']) {
      const y = read(`.github/workflows/${f}`);
      expect(y, f).toMatch(/VITE_STATS_TZ: \$\{\{ vars\.VITE_STATS_TZ \|\| '0' \}\}/);
      expect(y, f).not.toMatch(/VITE_STATS_TZ: ['"]?1/);
    }
  });
});

describe('P7-15: plain-text native settings that cannot be compiled here', () => {
  it("the Xcode project's marketing version is package.json's (the workflow sets it too)", () => {
    const version = JSON.parse(read('package.json')).version as string;
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    const found = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]);
    expect(found.length).toBeGreaterThan(0);
    for (const v of found) expect(v).toBe(version);
  });
  it('game sound is ambient on iOS (respects the silent switch, mixes with other audio)', () => {
    expect(read('ios/App/App/AppDelegate.swift')).toMatch(/setCategory\(\.ambient/);
  });
});

describe('P7-09 (PUB-12): link previews and install screenshots', () => {
  it('the manifest lists two screenshots that exist, narrow and wide, kept out of the precache', () => {
    const m = JSON.parse(read('public/manifest.webmanifest')) as { screenshots: { src: string; form_factor: string; sizes: string }[] };
    expect(m.screenshots.map((s) => s.form_factor).sort()).toEqual(['narrow', 'wide']);
    const cfg = read('vite.config.ts');
    for (const s of m.screenshots) {
      expect(readFileSync(new URL(`../../public/${s.src}`, import.meta.url)).length).toBeLessThan(150_000);
      expect(cfg).toContain(`'${s.src}'`);
    }
    expect(read('tools/i18n/build.mjs')).toMatch(/screenshots: manifest\.screenshots\.map/);
  });
  it('a build with VITE_PUBLIC_URL writes absolute og:image, twitter:image and og:url; deploy passes it', () => {
    const cfg = read('vite.config.ts');
    expect(cfg).toMatch(/absoluteLinkPreview\(process\.env\.VITE_PUBLIC_URL\)/);
    expect(cfg).toMatch(/og:url/);
    expect(read('.github/workflows/deploy.yml')).toMatch(/VITE_PUBLIC_URL: \$\{\{ vars\.VITE_PUBLIC_URL \}\}/);
  });
});

describe('Beast Mode OPS-04: staging and production native builds', () => {
  it('aab and testflight jobs declare an environment from a target input', () => {
    for (const [file, job] of [['.github/workflows/android.yml', 'aab'], ['.github/workflows/ios-testflight.yml', 'testflight']] as const) {
      const wf = read(file);
      expect(wf, file).toMatch(/workflow_dispatch:\n\s+inputs:\n\s+target:[\s\S]*?options: \[staging, production\]/);
      const body = new RegExp(`\\n  ${job}:\\n([\\s\\S]*?)\\n    steps:`).exec(wf)?.[1] ?? '';
      expect(body, file).toContain("environment: ${{ github.event.inputs.target || 'production' }}");
      expect(wf, file).toContain('VITE_DEPLOY_ENV: ${{ env.DEPLOY_TARGET }}');
    }
    expect(read('.github/workflows/android.yml')).toContain('kagemura-android-release-aab-${{ env.DEPLOY_TARGET }}-${{ env.ANDROID_VERSION_CODE }}');
    // The public web build keeps production.
    expect(read('.github/workflows/deploy.yml')).toContain('VITE_DEPLOY_ENV: production');
  });

  it('main.ts crash reporter environment comes from VITE_DEPLOY_ENV, with the platform as a tag', () => {
    const main = read('src/main.ts');
    expect(main).toMatch(/environment: deployEnvironment\(import\.meta\.env\.VITE_DEPLOY_ENV/);
    expect(main).toMatch(/tags: \{ device: platformName\(\), platform: /);
  });
});

describe('Beast Mode OPS-10: the iPhone app privacy manifest', () => {
  const manifest = read('ios/App/App/PrivacyInfo.xcprivacy');
  /** Collected types from the manifest: type → linked. */
  const collected = new Map([...manifest.matchAll(/NSPrivacyCollectedDataType(\w+)<\/string>\s*<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<(true|false)\/>/g)].map((m) => [m[1], m[2] === 'true']));
  /** The bold Apple types under a heading of PRIVACY.md's "App Store privacy label", spaces removed. */
  const labelTypes = (heading: string) => {
    const doc = read('docs/store/PRIVACY.md');
    const at = doc.indexOf(`- **${heading}`);
    if (at < 0) throw new Error(`PRIVACY.md has no "${heading}"`);
    const block = doc.slice(at).split(/\n- \*\*/)[0];
    return new Set([...block.matchAll(/(?:→|and) \*\*([^*]+)\*\*/g)].map((m) => m[1].replace(/\s+/g, '')));
  };

  it('exists, is a well-formed plist and says the app does not track', () => {
    expect(manifest.startsWith('<?xml')).toBe(true);
    expect(manifest).toMatch(/<plist version="1\.0">[\s\S]*<\/plist>\s*$/);
    expect((manifest.match(/<dict>/g) ?? []).length).toBe((manifest.match(/<\/dict>/g) ?? []).length);
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(manifest).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
    expect(manifest).not.toMatch(/NSPrivacyCollectedDataTypeTracking<\/key>\s*<true\/>/);
  });

  it('is in the App target resources', () => {
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    const ref = /(\w{24}) \/\* PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference;/.exec(pbx)?.[1];
    expect(ref).toBeDefined();
    const build = new RegExp(`(\\w{24}) /\\* PrivacyInfo\\.xcprivacy in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ${ref}`).exec(pbx)?.[1];
    expect(build).toBeDefined();
    const resources = /isa = PBXResourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/.exec(pbx)?.[1] ?? '';
    expect(resources).toContain(`${build} /* PrivacyInfo.xcprivacy in Resources */`);
    expect(resources).toContain('Assets.xcassets in Resources');
  });

  it('declares the collected types PRIVACY.md lists, linked and not linked', () => {
    const linked = labelTypes('Data linked to you');
    const notLinked = labelTypes('Data not linked to you');
    expect(linked.size).toBeGreaterThanOrEqual(5);
    for (const t of linked) expect(collected.get(t), t).toBe(true);
    for (const t of notLinked) if (!linked.has(t)) expect(collected.get(t), t).toBe(false);
    for (const [t, isLinked] of collected) expect(isLinked ? linked.has(t) : notLinked.has(t), t).toBe(true);
  });
});

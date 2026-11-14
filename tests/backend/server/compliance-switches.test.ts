/**
 * Compliance switches (2026-11-14; net/compliance.ts, server/core/compliance.ts): the under-13 modes, the terms of
 * service record, the Apple consumption consent and CONSUMPTION_REQUEST answers (App Store Server API mocked), the
 * hello features and the environment parsing. Safe defaults: nothing new is sent or refused unless switched on.
 */
import { createHash, generateKeyPairSync, sign as cryptoSign, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { policyFromEnv } from '../../../server/config';
import { withholdForReader } from '../../../server/core/compliance';
import { AppleVerifier } from '../../../server/payments/apple';
import { AppleServerApi, appleServerApiFromEnv, dollarsBucket, playTimeBucket, tenureBucket } from '../../../server/payments/appleServerApi';
import type { Fetch } from '../../../server/payments/google';
import { ComplianceRoutes, parseUnder13Mode, under13ModeOf, validTermsVersion, WITHHELD_CHAT_TEXT } from '../../../src/backend/net/compliance';
import { PRESET_CHAT, Routes, type ChatView } from '../../../src/backend/net/protocol';
import { world } from './harness';
import { setup as http } from './httpHarness';

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));

describe('protocol helpers', () => {
  it('reads the under-13 mode from hello features, limited when none is announced', () => {
    expect(under13ModeOf(['pvp', 'under13-offline'])).toBe('offline');
    expect(under13ModeOf(['under13-families'])).toBe('families');
    expect(under13ModeOf(['pvp'])).toBe('limited');
    expect(under13ModeOf(undefined)).toBe('limited');
    expect(under13ModeOf(['under13-nonsense'])).toBe('limited');
    expect(parseUnder13Mode(' offline ')).toBe('offline');
    expect(parseUnder13Mode('open')).toBeNull();
  });

  it('a terms version is a real calendar date', () => {
    expect(validTermsVersion('2027-01-15')).toBe(true);
    expect(validTermsVersion('2027-02-30')).toBe(false);
    expect(validTermsVersion('15.01.2027')).toBe(false);
    expect(validTermsVersion(20270115)).toBe(false);
  });

  it('environment: safe defaults, explicit switches, a bad under-13 mode stops the start', () => {
    expect(policyFromEnv({})).toEqual({});
    expect(policyFromEnv({ UNDER13_MODE: 'offline', EU_JADE_VALUE: '1', APPLE_CONSUMPTION_RESPONSE: '1', SIGNIFICANT_UPDATE_BUILD: '1.4.0' })).toMatchObject({ under13Mode: 'offline', euJadeValue: true, appleConsumptionResponse: true, significantUpdateBuild: '1.4.0' });
    expect(() => policyFromEnv({ UNDER13_MODE: 'everyone' })).toThrow(/UNDER13_MODE/);
    expect(() => policyFromEnv({ SIGNIFICANT_UPDATE_BUILD: 'soon' })).toThrow(/SIGNIFICANT_UPDATE_BUILD/);
  });
});

describe('hello features', () => {
  it('default server: under13-limited and terms-acceptance only', () => {
    const w = world();
    const f = w.core.hello().features;
    expect(f).toContain('under13-limited');
    expect(f).toContain('terms-acceptance');
    expect(f).not.toContain('eu-jade-value');
    expect(f).not.toContain('consumption-consent');
    expect(w.core.hello().significantUpdateBuild).toBeUndefined();
  });

  it('announces the switches the operators turned on; consumption-consent needs the Apple API key too', () => {
    const w = world({ shared: { policy: { under13Mode: 'offline', euJadeValue: true, appleConsumptionResponse: true, significantUpdateBuild: '1.4.0' } } });
    const h = w.core.hello();
    expect(h.features).toContain('under13-offline');
    expect(h.features).toContain('eu-jade-value');
    expect(h.features).not.toContain('consumption-consent');
    expect(h.significantUpdateBuild).toBe('1.4.0');
  });
});

describe('under 13, limited (the default)', () => {
  it('withholds free-text chat from others, keeps presets, system lines and their own', () => {
    const msgs: ChatView[] = [
      { id: '1', at: 1, from: { id: 'adult', name: 'A' }, text: 'free text', kind: 'chat' },
      { id: '2', at: 2, from: { id: 'adult', name: 'A' }, text: PRESET_CHAT[0], kind: 'chat', presetId: 0 },
      { id: '3', at: 3, from: null, text: 'A joined', kind: 'system' },
      { id: '4', at: 4, from: { id: 'kid', name: 'K' }, text: PRESET_CHAT[1], kind: 'chat', presetId: 1 },
      { id: '5', at: 5, from: { id: 'adult', name: 'A' }, text: 'needs 5', kind: 'request' },
    ];
    const out = withholdForReader(msgs, 'kid');
    expect(out[0]).toMatchObject({ text: WITHHELD_CHAT_TEXT, withheld: true });
    expect(out.slice(1)).toEqual(msgs.slice(1));
  });

  it('an under-13 reader of Alliance chat sees only fixed phrases; an adult reader sees everything', async () => {
    const w = world();
    const adult = await w.player('Grown Up');
    const kid = await w.player('Small One');
    await kid.stateAge({ band: 'under13' });
    const g = await adult.createGrove('Hidden Leaf');
    await kid.joinGrove(g.id);
    await adult.postChat('meet me after school');
    await adult.postChat(PRESET_CHAT[2]);
    const seen = (await kid.chat()).messages.filter((m) => m.kind === 'chat');
    expect(seen.map((m) => m.text)).toEqual([WITHHELD_CHAT_TEXT, PRESET_CHAT[2]]);
    expect(seen[0].withheld).toBe(true);
    expect((await adult.chat()).messages.some((m) => m.text === 'meet me after school')).toBe(true);
  });

  it('keeps no push token for an under-13 player', async () => {
    const w = world();
    const kid = await w.player('Small One');
    await kid.stateAge({ band: 'under13' });
    expect(await code(kid.putPushToken({ token: 'a'.repeat(32), platform: 'ios', types: ['raided'], tzOffsetMinutes: 0 }))).toBe('age_restricted');
    const teen = await w.player('Teen');
    await teen.stateAge({ band: '13to17' });
    expect(await code(teen.putPushToken({ token: 'b'.repeat(32), platform: 'ios', types: ['raided'], tzOffsetMinutes: 0 }))).toBe('ok');
  });
});

describe('under 13, offline', () => {
  it('refuses the age statement, then every request except deletion; adults are unaffected', async () => {
    const s = http({ shared: { policy: { under13Mode: 'offline' } } });
    const kid = await s.register('Small One');
    const adult = await s.register('Grown Up');
    const said = await s.call('PUT', Routes.meAge, kid.token, { band: 'under13' });
    expect(said.status).toBe(403);
    expect(said.body.error).toBe('age_restricted');
    // The band is kept (only ever stricter), so the account stays refused.
    expect((await s.call('GET', Routes.me, kid.token)).status).toBe(403);
    expect((await s.call('GET', Routes.friends, kid.token)).status).toBe(403);
    expect((await s.call('GET', ComplianceRoutes.compliance, kid.token)).status).toBe(200);
    expect((await s.call('GET', Routes.hello)).status).toBe(200);
    expect((await s.call('GET', Routes.me, adult.token)).status).toBe(200);
    expect((await s.call('DELETE', Routes.me, kid.token)).status).toBeLessThan(300);
  });

  it('limited mode keeps under-13 players online', async () => {
    const s = http();
    const kid = await s.register('Small One');
    expect((await s.call('PUT', Routes.meAge, kid.token, { band: 'under13' })).status).toBe(200);
    expect((await s.call('GET', Routes.me, kid.token)).status).toBe(200);
  });
});

describe('terms of service record', () => {
  it('keeps the newest effective date accepted, refuses unknown versions, is cleared with the account', async () => {
    const s = http();
    const p = await s.register('Reader');
    expect((await s.call('GET', ComplianceRoutes.compliance, p.token)).body).toEqual({ termsVersion: null, consumptionConsent: false });
    expect((await s.call('PUT', ComplianceRoutes.terms, p.token, { version: '2026-12-01' })).body.termsVersion).toBe('2026-12-01');
    expect((await s.call('PUT', ComplianceRoutes.terms, p.token, { version: '2026-11-01' })).body.termsVersion).toBe('2026-12-01');
    expect((await s.call('PUT', ComplianceRoutes.terms, p.token, { version: 'tomorrow' })).status).toBe(400);
    expect((await s.call('PUT', ComplianceRoutes.terms, p.token, { version: 7 })).status).toBe(400);
    const me = (await s.call('GET', Routes.me, p.token)).body as { id: string };
    expect(await s.repo.getCompliance(me.id)).toMatchObject({ termsVersion: '2026-12-01' });
    await s.call('DELETE', Routes.me, p.token);
    expect(await s.repo.getCompliance(me.id)).toBeNull();
  });
});

// ------------------------------------------------------------------ Apple consumption information

const dir = resolve(__dirname, '../fixtures/appstore');
const pem = (f: string) => readFileSync(resolve(dir, f), 'utf8');
const der = (f: string) => new X509Certificate(pem(f)).raw.toString('base64');
const chain = [der('leaf.pem'), der('inter.pem'), der('root.pem')];
const rootFp = createHash('sha256').update(new X509Certificate(pem('root.pem')).raw).digest('hex');
const BUNDLE = 'com.toadstoolkingdoms.app';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
function jws(payload: Record<string, unknown>): string {
  const head = `${b64({ alg: 'ES256', x5c: chain })}.${b64(payload)}`;
  return `${head}.${cryptoSign('sha256', Buffer.from(head), { key: pem('leaf.key'), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
let txn = 9000;
const transaction = (token: string | null) => {
  const id = String(++txn);
  return { id, jws: jws({ transactionId: id, originalTransactionId: id, bundleId: BUNDLE, productId: 'jade_bag', purchaseDate: Date.UTC(2026, 3, 6), type: 'Consumable', environment: 'Sandbox', ...(token ? { appAccountToken: token } : {}) }) };
};
let uuid = 0;
const notification = (type: string, signedTransactionInfo: string) => ({ signedPayload: jws({ notificationType: type, notificationUUID: `c-${++uuid}`, signedDate: Date.now(), data: { bundleId: BUNDLE, environment: 'Sandbox', signedTransactionInfo } }) });

function fakeAppleApi() {
  const sent: { url: string; auth: string; body: Record<string, unknown> }[] = [];
  const fetch: Fetch = async (url, init) => {
    sent.push({ url, auth: init?.headers?.authorization ?? '', body: JSON.parse(init?.body ?? '{}') });
    return { ok: true, status: 202, json: async () => ({}), text: async () => '' };
  };
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const api = new AppleServerApi({ keyId: 'KEY123', issuerId: 'issuer-1', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), bundleId: BUNDLE, fetch, now: () => Date.now() });
  return { api, sent };
}

async function buyer(on: boolean) {
  const apple = new AppleVerifier({ bundleIds: [BUNDLE], rootFingerprints: [rootFp], now: () => Date.now() });
  const fake = fakeAppleApi();
  const w = world({ shared: { payments: { apple }, appleApi: fake.api, policy: { appleConsumptionResponse: on } } });
  const ann = await w.player('Ann');
  await ann.startVillage();
  await ann.sendCommands({ stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'setProfile', under18: false } }] });
  await ann.stateAge({ band: 'adult' });
  const intent = await ann.purchaseIntent({ store: 'apple', productId: 'moonstones_2', under18: false });
  const t = transaction(intent.accountToken);
  await ann.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt: t.jws });
  return { w, ann, t, fake };
}

describe('Apple CONSUMPTION_REQUEST', () => {
  it('sends nothing while APPLE_CONSUMPTION_RESPONSE is off, even with consent', async () => {
    const { w, ann, t, fake } = await buyer(false);
    expect(w.core.hello().features).not.toContain('consumption-consent');
    await w.core.compliance.setConsumptionConsent(await w.repo.getPlayer(ann.id).then((p) => p!), { consent: true });
    await w.core.appleNotification(notification('CONSUMPTION_REQUEST', t.jws));
    expect(fake.sent).toEqual([]);
  });

  it('sends nothing without the player\'s consent (off by default)', async () => {
    const { w, t, fake } = await buyer(true);
    expect(w.core.hello().features).toContain('consumption-consent');
    await w.core.appleNotification(notification('CONSUMPTION_REQUEST', t.jws));
    expect(fake.sent).toEqual([]);
  });

  it('with the switch and the adult player\'s consent: the information, signed, to the sandbox host', async () => {
    const { w, ann, t, fake } = await buyer(true);
    const me = (await w.repo.getPlayer(ann.id))!;
    expect(await w.core.compliance.setConsumptionConsent(me, { consent: true })).toEqual({ termsVersion: null, consumptionConsent: true });
    await w.core.appleNotification(notification('CONSUMPTION_REQUEST', t.jws));
    expect(fake.sent).toHaveLength(1);
    const s = fake.sent[0];
    expect(s.url).toBe(`https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/consumption/${t.id}`);
    const [head, claims] = s.auth.replace('Bearer ', '').split('.').slice(0, 2).map((p) => JSON.parse(Buffer.from(p, 'base64url').toString('utf8')));
    expect(head).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
    expect(claims).toMatchObject({ iss: 'issuer-1', aud: 'appstoreconnect-v1', bid: BUNDLE });
    expect(s.body).toMatchObject({ customerConsented: true, deliveryStatus: 0, platform: 1, refundPreference: 0, userStatus: 1, lifetimeDollarsPurchased: 2, lifetimeDollarsRefunded: 1, playTime: 0, accountTenure: 1 });
    // Switched off again: nothing more.
    await w.core.compliance.setConsumptionConsent(me, { consent: false });
    await w.core.appleNotification(notification('CONSUMPTION_REQUEST', t.jws));
    expect(fake.sent).toHaveLength(1);
  });

  it('a purchase this server never credited is not answered', async () => {
    const { w, ann, fake } = await buyer(true);
    await w.core.compliance.setConsumptionConsent((await w.repo.getPlayer(ann.id))!, { consent: true });
    await w.core.appleNotification(notification('CONSUMPTION_REQUEST', transaction(null).jws));
    expect(fake.sent).toEqual([]);
  });

  it('only adults may switch the consent on; anyone may switch it off', async () => {
    const w = world();
    const teen = await w.player('Teen');
    await teen.stateAge({ band: '13to17' });
    const me = (await w.repo.getPlayer(teen.id))!;
    expect(await code(w.core.compliance.setConsumptionConsent(me, { consent: true }))).toBe('age_restricted');
    expect(await w.core.compliance.setConsumptionConsent(me, { consent: false })).toMatchObject({ consumptionConsent: false });
    expect(await code(w.core.compliance.setConsumptionConsent(me, { consent: 'yes' as never }))).toBe('bad_request');
  });

  it('Apple\'s buckets', () => {
    expect([tenureBucket(-1), tenureBucket(0), tenureBucket(5), tenureBucket(400)]).toEqual([0, 1, 2, 7]);
    expect([playTimeBucket(null), playTimeBucket(1), playTimeBucket(90), playTimeBucket(1e6)]).toEqual([0, 1, 3, 7]);
    expect([dollarsBucket(0), dollarsBucket(499), dollarsBucket(5000), dollarsBucket(300000)]).toEqual([1, 2, 3, 7]);
    expect(appleServerApiFromEnv({}, async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' }), Date.now)).toBeNull();
  });
});

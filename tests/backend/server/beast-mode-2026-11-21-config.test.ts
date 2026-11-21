/** Beast Mode 2026-11-21: production configuration checks (SEC-12/ECO-07, SEC-17, SEC-01, SEC-03, ECO-06). */
import { describe, expect, it } from 'vitest';
import { checkConfig, securitySwitches } from '../../../server/config';

const prod = { DEPLOY_ENV: 'production', DATABASE_URL: 'postgres://db.internal/k?sslmode=verify-full', ADMIN_TOKENS: `ann:${'a'.repeat(32)}`, CORS_ORIGIN: 'https://game.example', TRUST_PROXY: '1' };

describe('SEC-12 / ECO-07: Sandbox credit needs a daily cap in production', () => {
  it('store checks without SANDBOX_CREDIT_DAILY_CAP_USD are an error; an explicit value (0 too) passes', () => {
    expect(checkConfig({ ...prod, APPLE_BUNDLE_IDS: 'com.example.app' }).errors.join('\n')).toMatch(/SANDBOX_CREDIT_DAILY_CAP_USD/);
    expect(checkConfig({ ...prod, GOOGLE_PLAY_PACKAGE: 'com.example.app' }).errors.join('\n')).toMatch(/SANDBOX_CREDIT_DAILY_CAP_USD/);
    expect(checkConfig({ ...prod, APPLE_BUNDLE_IDS: 'com.example.app', SANDBOX_CREDIT_DAILY_CAP_USD: '50' }).errors).toEqual([]);
    expect(checkConfig({ ...prod, APPLE_BUNDLE_IDS: 'com.example.app', SANDBOX_CREDIT_DAILY_CAP_USD: '0' }).errors).toEqual([]);
  });

  it('no store checks, no error; staging never errors on it', () => {
    expect(checkConfig(prod).errors).toEqual([]);
    expect(checkConfig({ ...prod, DEPLOY_ENV: 'staging', APPLE_BUNDLE_IDS: 'com.example.app' }).errors.join('\n')).not.toMatch(/SANDBOX_CREDIT/);
  });
});

describe('SEC-17: production names every security switch', () => {
  it('each missing switch yields its warning in production only', () => {
    const w = checkConfig({ ...prod, REDIS_URL: 'redis://cache.internal:6379' }).warnings.join('\n');
    for (const name of ['SIGNIN_NONCE_REQUIRED', 'REQUIRE_SERVER_VILLAGE', 'RATE_LIMIT_INSTANCES']) expect(w).toContain(name);
    const staging = checkConfig({ ...prod, DEPLOY_ENV: 'staging', REDIS_URL: 'redis://x' }).warnings.join('\n');
    for (const name of ['SIGNIN_NONCE_REQUIRED', 'REQUIRE_SERVER_VILLAGE', 'RATE_LIMIT_INSTANCES']) expect(staging).not.toContain(name);
    const set = checkConfig({ ...prod, REDIS_URL: 'redis://x', RATE_LIMIT_INSTANCES: '3', SIGNIN_NONCE_REQUIRED: '1', REQUIRE_SERVER_VILLAGE: '1' }).warnings.join('\n');
    for (const name of ['SIGNIN_NONCE_REQUIRED', 'REQUIRE_SERVER_VILLAGE', 'RATE_LIMIT_INSTANCES']) expect(set).not.toContain(name);
  });

  it('the boot line lists the effective switches without secrets', () => {
    const line = securitySwitches({ ...prod, REQUIRE_SERVER_VILLAGE: '1', SANDBOX_CREDIT_DAILY_CAP_USD: '50', METRICS_TOKEN: 'x'.repeat(30) });
    expect(line).toMatchObject({ deploy: 'production', requireServerVillage: true, sandboxDailyCapUsd: 50, signInNonceRequired: false, metricsToken: true });
    expect(JSON.stringify(line)).not.toContain('x'.repeat(30));
    expect(JSON.stringify(line)).not.toContain('db.internal');
  });
});

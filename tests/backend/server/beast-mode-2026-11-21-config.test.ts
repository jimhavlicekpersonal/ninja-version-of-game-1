/** Beast Mode 2026-11-21: production configuration checks (SEC-12/ECO-07, SEC-17, SEC-01, SEC-03, ECO-06). */
import { describe, expect, it } from 'vitest';
import { checkConfig } from '../../../server/config';

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

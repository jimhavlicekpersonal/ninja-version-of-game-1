/**
 * Which deployment this server is (roadmap step 42) and the settings that
 * must differ between them. `DEPLOY_ENV` is development (default), staging
 * or production.
 *
 * - production refuses to start without a database, a staff token or an
 *   explicit CORS list, and with sandbox push or Xcode-signed purchases;
 * - staging accepts test purchases (Apple sandbox, Google license testers)
 *   and APNs sandbox tokens from development builds;
 * - each database remembers which deployment first used it
 *   (`server_meta.environment`, migration 0012), and a server of another kind
 *   refuses to start on it: a staging server can never write to the
 *   production database, or the other way round.
 */
import { AppleVerifier } from './payments/apple';
import { GoogleVerifier, type Fetch, type ServiceAccount } from './payments/google';

export type DeployEnv = 'development' | 'staging' | 'production';

export function deployEnv(env: Record<string, string | undefined>): DeployEnv {
  const v = env.DEPLOY_ENV ?? 'development';
  if (v !== 'development' && v !== 'staging' && v !== 'production') throw new Error(`DEPLOY_ENV must be development, staging or production (got "${v}").`);
  return v;
}

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Problems that stop the server from starting (errors) or deserve a line in the log (warnings). */
export function checkConfig(env: Record<string, string | undefined>): { deploy: DeployEnv; errors: string[]; warnings: string[] } {
  const deploy = deployEnv(env);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (deploy === 'production') {
    if (!env.DATABASE_URL) errors.push('DATABASE_URL is required in production (memory storage loses every player on restart).');
    if (!env.ADMIN_TOKEN) errors.push('ADMIN_TOKEN is required in production (account-deletion requests must be handled).');
    if (!env.CORS_ORIGIN || list(env.CORS_ORIGIN).includes('*')) errors.push('CORS_ORIGIN must list the game\'s origins in production (the web address, capacitor://localhost, https://localhost), not "*".');
    if (env.APNS_SANDBOX === '1') errors.push('APNS_SANDBOX=1 is for development builds (staging), not production.');
    if (list(env.APPLE_ENVIRONMENTS).includes('Xcode')) errors.push('Xcode-signed purchases are for local testing, not production.');
    if (env.GOOGLE_PLAY_ALLOW_TEST === '1') warnings.push('GOOGLE_PLAY_ALLOW_TEST=1: license-tester purchases are credited in production.');
    if (env.MIGRATE_ON_BOOT === '1') warnings.push('MIGRATE_ON_BOOT=1 in production: run "npm run server:migrate" as a release step instead when there is more than one instance.');
    if (!env.SENTRY_DSN) warnings.push('SENTRY_DSN is not set: server errors are only in the log.');
    if (!env.METRICS_TOKEN) warnings.push('METRICS_TOKEN is not set: there is no /metrics for alerts.');
  }
  if (deploy !== 'development' && !env.RELEASE) warnings.push('RELEASE is not set: /healthz and Sentry show the package version instead of the build.');
  if (env.SENTRY_ENVIRONMENT && env.SENTRY_ENVIRONMENT !== deploy) warnings.push(`SENTRY_ENVIRONMENT (${env.SENTRY_ENVIRONMENT}) differs from DEPLOY_ENV (${deploy}).`);
  return { deploy, errors, warnings };
}

/**
 * The store receipt checkers this deployment is set up for.
 * Apple: APPLE_BUNDLE_IDS (default: GAMECENTER_BUNDLE_IDS), optional
 * APPLE_ROOT_CA_SHA256 and APPLE_ENVIRONMENTS (default Production,Sandbox:
 * App Review buys in the sandbox against the production server).
 * Google: GOOGLE_PLAY_PACKAGE + GOOGLE_SERVICE_ACCOUNT_JSON (+ GOOGLE_RTDN_AUDIENCE
 * and GOOGLE_RTDN_SERVICE_ACCOUNT for notifications); test purchases on staging,
 * or with GOOGLE_PLAY_ALLOW_TEST=1.
 */
export function paymentsFromEnv(env: Record<string, string | undefined>, fetch: Fetch, now: () => number): { apple: AppleVerifier | null; google: GoogleVerifier | null } {
  const deploy = deployEnv(env);
  const bundles = list(env.APPLE_BUNDLE_IDS ?? env.GAMECENTER_BUNDLE_IDS);
  const apple = bundles.length ? new AppleVerifier({ bundleIds: bundles, rootFingerprints: list(env.APPLE_ROOT_CA_SHA256), environments: list(env.APPLE_ENVIRONMENTS), now }) : null;
  let google: GoogleVerifier | null = null;
  if (env.GOOGLE_PLAY_PACKAGE && env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    google = new GoogleVerifier({
      packageName: env.GOOGLE_PLAY_PACKAGE,
      account: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as ServiceAccount,
      fetch,
      now,
      allowTest: deploy !== 'production' || env.GOOGLE_PLAY_ALLOW_TEST === '1',
      rtdn: env.GOOGLE_RTDN_AUDIENCE && env.GOOGLE_RTDN_SERVICE_ACCOUNT ? { audience: env.GOOGLE_RTDN_AUDIENCE, serviceAccount: env.GOOGLE_RTDN_SERVICE_ACCOUNT } : null,
    });
  }
  return { apple, google };
}

#!/usr/bin/env node
/**
 * Release order, server first (roadmap step 74): refuse to ship a game build
 * the production server cannot play with. It reads this build's battle rules
 * (`SIM_RULES`) and protocol, asks the server's `/v1/hello`, and fails unless
 * the server lists those rules in `supportedRules` and accepts the protocol.
 *
 *   node tools/release/check-rules.mjs https://api.example.com
 *
 * No address (no server yet, or a fork): it says so and passes. CI runs it
 * before publishing the web game and before building the store apps. Plain
 * Node 20+ (fetch), so it works on Windows too.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const rules = Number(/export const SIM_RULES = (\d+);/.exec(read('src/gameplay/sim/battle/battle.ts'))?.[1]);
const protocol = Number(/export const PROTOCOL_VERSION = (\d+);/.exec(read('src/backend/net/protocol.ts'))?.[1]);
const url = (process.argv[2] ?? process.env.PRODUCTION_SERVER_URL ?? '').replace(/\/+$/, '');

if (!url) {
  console.log('No production server address: skipping the release-order check (set the VITE_SERVER_URL repository variable).');
  process.exit(0);
}

let hello;
try {
  const res = await fetch(`${url}/v1/hello`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  hello = await res.json();
} catch (e) {
  console.error(`Could not ask ${url}/v1/hello: ${e.message}. Release the server first (docs/SHIPPING.md, "Release order").`);
  process.exit(1);
}

const problems = [];
const supported = Array.isArray(hello.supportedRules) ? hello.supportedRules : null;
if (!supported) problems.push(`the server does not list supportedRules (it is older than protocol 8): deploy the server first`);
else if (!supported.includes(rules)) problems.push(`this build plays battle rules ${rules}, but production keeps only ${supported.join(', ')}: deploy the server with rules ${rules} first`);
if (typeof hello.minProtocol === 'number' && hello.minProtocol > protocol) problems.push(`production needs protocol ${hello.minProtocol}, this build speaks ${protocol}`);
if (typeof hello.protocol === 'number' && hello.protocol < protocol) problems.push(`production speaks protocol ${hello.protocol}, older than this build's ${protocol}: deploy the server first`);

if (problems.length) {
  console.error(`Release order check failed against ${url}:\n- ${problems.join('\n- ')}\nSee docs/SHIPPING.md, "Release order".`);
  process.exit(1);
}
console.log(`OK: ${url} keeps battle rules ${supported.join(', ')} and protocol ${hello.minProtocol}-${hello.protocol}; this build plays rules ${rules}, protocol ${protocol}.`);

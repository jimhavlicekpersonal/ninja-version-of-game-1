// Server first (roadmap step 74): a game build may only ship when the server it
// talks to already checks its battle rules. Reads SIM_RULES from the source and
// asks SERVER_URL (the build's VITE_SERVER_URL) for /v1/hello.supportedRules.
//
//   SERVER_URL=https://api.example.com node tools/release/check-server-rules.mjs
//
// Passes (with a note) when no server is configured, or when the server is from
// before protocol 8 and lists no rules. Fails when the server is unreachable or
// does not list this build's rules: deploy the server first (docs/SHIPPING.md,
// "Releasing a balance change").
import { ciNote } from './ci-note.mjs';
import { readFileSync } from 'node:fs';

const url = (process.env.SERVER_URL ?? '').trim().replace(/\/+$/, '');
const src = readFileSync('src/gameplay/sim/battle/battle.ts', 'utf8');
const m = /export const SIM_RULES = (\d+);/.exec(src);
if (!m) {
  console.error('Could not find SIM_RULES in src/gameplay/sim/battle/battle.ts');
  process.exit(1);
}
const rules = Number(m[1]);
if (!url) {
  ciNote('notice', 'Web build without an online server', `VITE_SERVER_URL is not set, so the published game plays offline only (battle rules ${rules}); there was no server to check.`);
  process.exit(0);
}
let hello;
try {
  const res = await fetch(`${url}/v1/hello`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  hello = await res.json();
} catch (e) {
  console.error(`Could not ask ${url}/v1/hello (${e?.message ?? e}). Is the server up? A game must not ship to a server nobody checked.`);
  process.exit(1);
}
if (!Array.isArray(hello.supportedRules)) {
  console.log(`${url} is from before protocol 8 (no supportedRules): it checks battles with its own rules only. Shipping rules ${rules}.`);
  process.exit(0);
}
if (!hello.supportedRules.includes(rules)) {
  console.error(`${url} checks battle rules ${hello.supportedRules.join(', ')}, but this build plays rules ${rules}.`);
  console.error('Deploy the server with these rules first, then release the game (docs/SHIPPING.md, "Releasing a balance change").');
  process.exit(1);
}
console.log(`${url} checks battle rules ${hello.supportedRules.join(', ')}: this build (rules ${rules}) can ship.`);

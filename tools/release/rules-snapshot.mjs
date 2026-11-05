// Battle-rule versions on the server (roadmap step 73).
//
//   npm run rules:fixture    record tests/backend/fixtures/rules/v<SIM_RULES>.json with today's code
//   npm run rules:snapshot   archive today's rules for the server: copy src/gameplay/sim and
//                            src/gameplay/data to server/rules/v<SIM_RULES>/, list it in
//                            server/rules/archive.ts, and record its fixture
//
// Release order (docs/SHIPPING.md, "Releasing a balance change"): run rules:snapshot BEFORE
// bumping SIM_RULES, then bump, change the data, run rules:fixture for the new version, and
// deploy the server before the game. Never edit a snapshot by hand.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const mode = process.argv[2];
if (mode !== 'fixture' && mode !== 'snapshot') {
  console.error('Usage: node tools/release/rules-snapshot.mjs fixture|snapshot');
  process.exit(1);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const reg = await server.ssrLoadModule('/server/rules/registry.ts');
  const fix = await server.ssrLoadModule('/server/rules/fixture.ts');
  const data = (await server.ssrLoadModule('/src/gameplay/sim/data.ts')).defaultData;
  const live = reg.liveEngine(data);
  const n = live.rules;

  if (mode === 'snapshot') {
    const dir = `server/rules/v${n}`;
    if (existsSync(dir)) {
      console.error(`${dir} already exists: SIM_RULES ${n} is archived. Bump SIM_RULES before the next snapshot.`);
      process.exit(1);
    }
    mkdirSync(dir, { recursive: true });
    cpSync('src/gameplay/sim', `${dir}/sim`, { recursive: true });
    cpSync('src/gameplay/data', `${dir}/data`, { recursive: true });
    writeFileSync(
      `${dir}/engine.ts`,
      `/** Archived battle rules v${n} (made by npm run rules:snapshot; never edit by hand). */
import { dataVersionOf } from '../../../src/backend/net/dataVersion';
import type { RulesEngine } from '../registry';
import { runBattle, SIM_RULES } from './sim/battle/battle';
import { defaultData } from './sim/data';
import { opponentForRank } from './sim/matchmaking';

export function engine(): RulesEngine {
  // An archive's types are its own (they drift from the live ones by design); the registry only passes data through.
  return { rules: SIM_RULES, dataVersion: dataVersionOf(defaultData), data: defaultData as unknown as RulesEngine['data'], runBattle: runBattle as unknown as RulesEngine['runBattle'], opponentForRank: opponentForRank as unknown as RulesEngine['opponentForRank'], live: false };
}
`,
    );
    const archive = 'server/rules/archive.ts';
    let src = readFileSync(archive, 'utf8');
    src = src.replace('// rules-snapshot: imports (keep this marker)', `import { engine as v${n} } from './v${n}/engine';\n// rules-snapshot: imports (keep this marker)`);
    src = src.replace('  // rules-snapshot: engines (keep this marker)', `  v${n},\n  // rules-snapshot: engines (keep this marker)`);
    writeFileSync(archive, src);
    console.log(`archived SIM_RULES ${n} in ${dir} and listed it in ${archive}`);
  }

  mkdirSync('tests/backend/fixtures/rules', { recursive: true });
  const file = `tests/backend/fixtures/rules/v${n}.json`;
  if (existsSync(file) && mode === 'snapshot') {
    console.log(`${file} already recorded`);
  } else {
    const f = fix.recordFixture(live);
    writeFileSync(file, `${JSON.stringify(f)}\n`);
    console.log(`recorded ${file}: ${f.stars} stars, ${f.destruction}% (hash ${f.hash})`);
  }
} finally {
  await server.close();
}

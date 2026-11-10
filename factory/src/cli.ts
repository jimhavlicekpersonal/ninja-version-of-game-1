/**
 * The factory's commands.
 *
 *   go        design a new game: template survey, ten stages, the skeleton. Then it stops.
 *   status    list runs, or show one
 *   approve   the owner's yes to a skeleton
 *   build     build the approved game, work order by work order
 *   plan      show what GO would send and to whom, without calling the API
 *   template  show what the template slot holds now
 *
 * Every command can be run again after a stop; finished work is read back, not redone.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTORY_ROOT, loadConfig, type Config } from './config.js';
import { BudgetExceededError, Ledger } from './ledger.js';
import { AnthropicLlm, FactoryError, isBadRequest, type Llm } from './llm.js';
import { MockLlm } from './mock.js';
import { loadPortfolio, type Portfolio } from './prompts.js';
import { BriefSchema, EMPTY_BRIEF, RunStore, type Brief } from './runStore.js';
import { runBuild } from './build/runBuild.js';
import { runSkeleton } from './skeleton/pipeline.js';
import type { Decisions } from './skeleton/schemas.js';
import { STAGES } from './skeleton/stages.js';
import { indexTemplate, loadFiles, renderIndex } from './template/index.js';
import { takeSnapshot } from './template/snapshot.js';
import { cachedBlueprint } from './template/survey.js';

interface Args {
  command: string;
  positional: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (inline !== undefined) flags[name] = inline;
    else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) flags[name] = rest[++i];
    else flags[name] = true;
  }
  return { command, positional, flags };
}

const flag = (args: Args, name: string): string | undefined => (typeof args.flags[name] === 'string' ? (args.flags[name] as string) : undefined);
const isMock = (args: Args): boolean => args.flags.mock === true || process.env.FACTORY_MOCK === '1';

function applyFlags(config: Config, args: Args): Config {
  const depth = flag(args, 'depth');
  if (depth) {
    if (!['quick', 'standard', 'deep'].includes(depth)) throw new FactoryError('--depth is quick, standard or deep.');
    config.skeleton.depth = depth as Config['skeleton']['depth'];
  }
  if (args.flags['no-survey']) config.template.survey = false;
  if (args.flags['no-web']) config.api.webSearch = false;
  const ref = flag(args, 'template-ref');
  if (ref) config.template.ref = ref;
  return config;
}

function readBrief(args: Args): Brief {
  const file = flag(args, 'brief') ?? join(FACTORY_ROOT, 'brief.json');
  let brief: Brief = { ...EMPTY_BRIEF };
  if (existsSync(file)) {
    const parsed = BriefSchema.safeParse({ ...EMPTY_BRIEF, ...(JSON.parse(readFileSync(file, 'utf8')) as object) });
    if (!parsed.success) throw new FactoryError(`${file} is not a valid brief (fields: idea, mustHave, avoid, regions, notes).`);
    brief = parsed.data;
  } else if (flag(args, 'brief')) {
    throw new FactoryError(`There is no brief at ${file}.`);
  }
  const idea = flag(args, 'idea');
  if (idea) brief.idea = idea;
  return brief;
}

function llmFor(config: Config, mock: boolean): Llm {
  return mock ? new MockLlm() : new AnthropicLlm(config);
}

/** Stops the factory expects (budget, credentials, a request the API will not take) get a plain message, not a stack trace. */
function stopReason(err: unknown): string | null {
  if (err instanceof BudgetExceededError || err instanceof FactoryError) return err.message;
  if (isBadRequest(err)) return `The Claude API rejected a request as invalid: ${(err as Error).message}`;
  return null;
}

function openRun(args: Args): RunStore {
  const id = args.positional[0] ?? flag(args, 'run');
  return id ? RunStore.open(id) : RunStore.latest();
}

async function go(args: Args): Promise<void> {
  const config = applyFlags(loadConfig(), args);
  const resume = flag(args, 'run') ?? (args.flags.resume ? RunStore.latest().state.id : undefined);
  const store = resume ? RunStore.open(resume) : RunStore.create(readBrief(args), isMock(args));
  const mock = store.state.mock;
  console.log(`${resume ? 'Continuing' : 'Starting'} run ${store.state.id}${mock ? ' (mock: no API calls)' : ''}. Depth: ${config.skeleton.depth}. Budget for the skeleton: $${config.budget.skeletonUsd}.`);
  try {
    const { ledger } = await runSkeleton(store, config, llmFor(config, mock));
    console.log(`\nThe skeleton is ready: ${store.path('SKELETON.md')}`);
    console.log(`Game: ${store.state.game?.name ?? '(unnamed)'}. ${ledger.summary()}.`);
    console.log(`Read it, then:  npm run approve -- ${store.state.id}   and   npm run build -- ${store.state.id}`);
  } catch (err) {
    const why = stopReason(err);
    if (!why) throw err;
    console.error(`\n${why}\nThe run is saved. Continue it with:  npm run go -- --run ${store.state.id}`);
    process.exitCode = 2;
  }
}

function status(args: Args): void {
  const config = loadConfig();
  const id = args.positional[0];
  if (!id) {
    const ids = RunStore.list();
    if (!ids.length) return console.log('No runs yet. Start one with:  npm run go');
    for (const run of ids.map((x) => RunStore.open(x))) {
      const s = run.state;
      console.log(`${s.id}  ${s.status.padEnd(18)} ${s.game?.name ?? '(no name yet)'}${s.mock ? '  [mock]' : ''}`);
    }
    return;
  }
  const store = RunStore.open(id);
  const s = store.state;
  const ledger = new Ledger(config, store.ledgerFile);
  console.log(`Run ${s.id}: ${s.status}${s.mock ? ' (mock)' : ''}`);
  console.log(`Game: ${s.game ? `${s.game.name} (${s.game.slug})` : 'not named yet'}`);
  console.log(`Template: ${s.template ? `${s.template.source} at ${s.template.sha.slice(0, 12)}` : 'not read yet'}`);
  console.log(`Stages done: ${s.stagesDone.join(', ') || 'none'}`);
  console.log(`Spent (estimate): ${ledger.summary()}`);
  if (s.build.dir) console.log(`Game folder: ${s.build.dir}`);
  for (const [order, o] of Object.entries(s.build.orders)) console.log(`  ${order.padEnd(20)} ${o.status}${o.commit ? `  ${o.commit.slice(0, 10)}` : ''}`);
}

function approve(args: Args): void {
  const store = openRun(args);
  const s = store.state;
  if (s.status === 'designing') throw new FactoryError(`Run ${s.id} has no skeleton yet. Finish it with:  npm run go -- --run ${s.id}`);
  if (s.status !== 'awaiting-approval') return console.log(`Run ${s.id} is already ${s.status}.`);
  s.status = 'approved';
  s.approvedAt = new Date().toISOString();
  store.save();

  // The next game must not repeat this one: it goes into the portfolio the market stage reads.
  const decisions = store.readJson<Decisions>('skeleton/decisions.json');
  const chosen = decisions.market?.theses.find((t) => t.id === decisions.market?.chosen);
  if (s.game && !s.mock) {
    const portfolio: Portfolio = loadPortfolio();
    if (!portfolio.games.some((g) => g.name === s.game!.name)) {
      portfolio.games.push({ name: s.game.name, theme: decisions.brand?.world.setting ?? chosen?.fantasy ?? '', audience: decisions.market?.targetPlayer.who ?? '', status: `approved ${s.approvedAt.slice(0, 10)} (run ${s.id})` });
      writeFileSync(join(FACTORY_ROOT, 'portfolio.json'), JSON.stringify({ $comment: 'Games this factory line has made. The market stage reads it so a new game does not repeat an old one.', games: portfolio.games }, null, 2) + '\n');
    }
  }
  console.log(`Approved: ${s.game?.name ?? s.id}. Build it with:  npm run build -- ${s.id}`);
}

async function build(args: Args): Promise<void> {
  const config = applyFlags(loadConfig(), args);
  const store = openRun(args);
  if (args.flags.approve && store.state.status === 'awaiting-approval') approve({ ...args, positional: [store.state.id] });
  const mock = store.state.mock;
  const only = flag(args, 'only')?.split(',').filter(Boolean);
  console.log(`Building ${store.state.game?.name ?? store.state.id} (run ${store.state.id})${mock ? ' (mock: no API calls)' : ''}. Budget for the build: $${config.budget.buildUsd}.`);
  try {
    await runBuild(store, config, llmFor(config, mock), { checks: mock ? args.flags.checks === true : args.flags['no-checks'] !== true, only });
    console.log(`\nBuild finished. Report: ${store.path('build', 'BUILD_REPORT.md')}`);
    console.log(`Game: ${store.state.build.dir}`);
  } catch (err) {
    const why = stopReason(err);
    if (!why) throw err;
    console.error(`\n${why}\nThe run is saved. Continue it with:  npm run build -- ${store.state.id}`);
    process.exitCode = 2;
  }
}

/** What GO would do, with sizes, without calling the API. */
function plan(args: Args): void {
  const config = applyFlags(loadConfig(), args);
  const index = indexTemplate(takeSnapshot(config), config);
  const kb = (globs: string[]) => {
    const { files, missing } = loadFiles(index, globs);
    return { kb: Math.round(files.reduce((sum, f) => sum + Buffer.byteLength(f.text), 0) / 1024), count: files.length, missing };
  };
  const depth = config.skeleton.depth;
  console.log(renderIndex(index));
  const shared = kb(config.template.shared);
  console.log(`\nDepth: ${depth}. Models: ${JSON.stringify(config.models)}. Web research: ${config.api.webSearch ? 'on' : 'off'}.`);
  console.log(`Survey: ${config.template.survey ? (cachedBlueprint(index.snapshot.key) ? 'cached for this template' : 'will run (one long reading session)') : 'off'}`);
  console.log(`Every call carries: doctrine + lessons + ${shared.count} shared files (${shared.kb} kB, cached after the first call)${shared.missing.length ? `; missing: ${shared.missing.join(', ')}` : ''}`);
  let total = 0;
  for (const id of config.skeleton.stages) {
    const def = STAGES[id];
    const probes = depth === 'quick' ? 0 : def.probes.length;
    const lenses = depth === 'quick' ? 0 : depth === 'deep' ? def.lenses.length : def.standardLenses;
    const calls = probes + lenses + (lenses ? 1 : 0) + 1 + (depth === 'deep' ? 2 : 0) + (id === 'economy' ? Math.ceil(index.entities.length / 80) : 0);
    total += calls;
    const files = kb(config.template.stages[id] ?? []);
    console.log(`- ${def.title}: about ${calls} calls (${probes} research, ${lenses} proposals), ${files.count} template files (${files.kb} kB)${files.missing.length ? `; missing: ${files.missing.join(', ')}` : ''}`);
  }
  console.log(`\nAbout ${total} calls for the skeleton, plus the survey's turns. Budget stop: $${config.budget.skeletonUsd} (skeleton), $${config.budget.buildUsd} (build).`);
}

function template(args: Args): void {
  const config = applyFlags(loadConfig(), args);
  const index = indexTemplate(takeSnapshot(config), config);
  console.log(renderIndex(index));
  console.log(`\nBlueprint: ${cachedBlueprint(index.snapshot.key) ? 'cached for this exact template' : 'not surveyed yet (GO will do it)'}`);
  for (const [id, lane] of Object.entries(config.template.lanes)) {
    if (!index.snapshot.files.includes(lane.brief)) console.log(`settings drift: lane "${id}" points at ${lane.brief}, which the template no longer has`);
  }
}

const HELP = `Game factory

  npm run go                       design a new game (stops at the skeleton for your approval)
  npm run go -- --idea "..."       the same, starting from your idea
  npm run go -- --run <id>         continue a run that stopped
  npm run status [-- <id>]         list runs, or show one
  npm run approve -- <id>          approve a skeleton
  npm run build -- <id>            build the approved game (continue with the same command)
  npm run plan                     show what GO would send, without calling the API
  npm run template                 show what the template slot holds now

Flags: --mock (no API calls, placeholder output)  --depth quick|standard|deep  --no-web  --no-survey
       --template-ref <branch|tag|commit>  --brief <file>  --only <order,order> (build)  --no-checks (build)
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    switch (args.command) {
      case 'go':
        return await go(args);
      case 'status':
        return status(args);
      case 'approve':
        return approve(args);
      case 'build':
        return await build(args);
      case 'plan':
        return plan(args);
      case 'template':
        return template(args);
      default:
        console.log(HELP);
    }
  } catch (err) {
    if (err instanceof FactoryError) {
      console.error(err.message);
      process.exitCode = 2;
      return;
    }
    throw err;
  }
}

await main();

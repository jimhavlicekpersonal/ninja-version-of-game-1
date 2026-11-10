/**
 * The build: after the owner approves the skeleton, every work order is done by one session in one
 * lane. For each order the harness, not the session, decides whether it is done:
 *
 *   1. the session works (tools confined to the game's folder, writes confined to its lane);
 *   2. the harness runs the checks itself and hands failures back, up to `maxFixRounds` times;
 *   3. anything changed outside the lane is put back, and noted;
 *   4. the result is committed and written into the build report, verified and unverified apart.
 *
 * A stop (budget, network) loses nothing: finished orders are skipped next time, and an interrupted
 * order starts a new session that is told to look at what is already there.
 */
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAgent, type AgentResult } from '../agent/loop.js';
import { ToolBox, runCommand, type Report, type WriteLane } from '../agent/tools.js';
import type { Config } from '../config.js';
import { Ledger } from '../ledger.js';
import { FactoryError, type ContentParam, type Llm, type Session, type SystemBlock } from '../llm.js';
import { cacheMark, playbook } from '../prompts.js';
import type { OrderState, RunStore } from '../runStore.js';
import type { Decisions, IdMapEntry } from '../skeleton/schemas.js';
import { matchesAny } from '../template/glob.js';
import { takeSnapshot } from '../template/snapshot.js';
import { changedFiles, commitAll, git, materialize } from './materialize.js';
import type { WorkOrder } from './workOrders.js';

export interface BuildOptions {
  /** Run the template's install command and the checks (off in mock runs unless asked). */
  checks: boolean;
  /** Only these order ids (for a retry of one order). */
  only?: string[];
}

const BUILD_ROLE = `You are one session of a game factory's build. The factory rebuilds a finished, working game (the template) into a new game in place: you are inside a copy of the template that is becoming the new game. The owner approved the design in the game bible and is not watching; nobody will answer questions, so decide and record.

You have one work order and one lane. Read your lane's brief in the repository first: it says how this codebase works and what its rules are, and it outranks habit. Then do the order completely.

How to work here:
- Change what the order asks and what that change needs; leave the rest of the game as it is. The template's systems, ids, save format and tests are assets.
- Your write tools refuse paths outside your lane. When the work needs something from another lane, write the request in the request file named below and carry on with what you can do.
- The harness runs the checks itself when you finish and hands you any failure. Fix failures at their cause. Never skip, delete or weaken a test to get a pass. A test that asserts the old game's visible text is updated to the new game's text.
- Commit nothing unless you want a checkpoint of your own lane's files; never push. The harness commits your work.
- Publisher facts, store accounts, keys, bundle ids, product ids and anything else that is the owner's stay untouched; put them in your report as owner steps.
- When you are finished or cannot go on, call the report tool once. Say what you verified and how, and what you could not verify here. A claim nobody checked goes under unverified, not under done.`;

function laneFor(config: Config, order: WorkOrder): WriteLane {
  const lane = config.template.lanes[order.lane];
  if (!lane) throw new FactoryError(`The work order "${order.id}" names the lane "${order.lane}", which is not in factory.config.json.`);
  const fill = (globs: string[]) => globs.map((g) => (order.code ? g.split('{code}').join(order.code) : g));
  return { owns: fill(lane.owns), generated: fill(lane.generated), requests: lane.requests };
}

function checksFor(config: Config, order: WorkOrder): Array<{ name: string; command: string }> {
  const own = config.template.lanes[order.lane]?.checks;
  if (!own) return config.template.checks;
  return own.map((command) => {
    const filled = order.code ? command.split('{code}').join(order.code) : command;
    return { name: filled, command: filled };
  });
}

export function shellAllowed(config: Config): boolean {
  if (config.build.shell === 'allow') return true;
  if (config.build.shell === 'off') return false;
  return Boolean(process.env.CI) || process.env.FACTORY_ALLOW_SHELL === '1';
}

/** Puts back anything the session (or a tool it ran) changed outside its lane. Returns what was put back. */
export function enforceLane(dir: string, lane: WriteLane): string[] {
  const reverted: string[] = [];
  for (const { path, untracked } of changedFiles(dir)) {
    if (matchesAny(path, lane.owns) || matchesAny(path, lane.generated)) continue;
    if (untracked) rmSync(join(dir, path), { force: true });
    else git(dir, ['checkout', 'HEAD', '--', path]);
    reverted.push(path);
  }
  return reverted;
}

function orderMessage(config: Config, order: WorkOrder, lane: WriteLane, shell: boolean, checks: Array<{ name: string; command: string }>, interrupted: boolean): string {
  const info = config.template.lanes[order.lane];
  return [
    `<work-order id="${order.id}">`,
    `# ${order.title}`,
    '',
    order.brief,
    '',
    order.acceptance.length ? `Done when:\n${order.acceptance.map((a) => `- ${a}`).join('\n')}` : '',
    '</work-order>',
    '',
    `Your lane: ${order.lane} (${info.agent}). Read first: ${info.brief}.`,
    `You may write: ${lane.owns.join(', ')}.`,
    lane.generated.length ? `The template's own tools may also change, as generated output: ${lane.generated.join(', ')}.` : '',
    lane.requests ? `Requests to other lanes go in: ${lane.requests}.` : '',
    `The design you are building is in the game bible above; the same files are in docs/factory/ in this repository.`,
    shell ? `You have a shell (${process.platform}). The harness will run these checks when you finish: ${checks.map((c) => `\`${c.command}\``).join(', ')}.` : 'There is no shell in this build: you cannot run anything, and no check will run. Say so under unverified in your report.',
    interrupted ? 'An earlier session on this order was interrupted. Look at `git status` and the changed files first, and continue from what is already there.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function runBuild(store: RunStore, config: Config, llm: Llm, options: BuildOptions): Promise<void> {
  if (!['approved', 'building', 'built'].includes(store.state.status)) {
    throw new FactoryError(`Run ${store.state.id} is not approved yet (status: ${store.state.status}). Read SKELETON.md, then \`npm run approve -- ${store.state.id}\`.`);
  }
  const mock = store.state.mock;
  const shell = !mock && shellAllowed(config);
  if (!mock && !shell && config.build.shell === 'ci-only') {
    throw new FactoryError(
      'Build sessions run commands that Claude writes (npm scripts, tests, git). By default that is only allowed where the machine is disposable: in CI (the Game Factory workflow), or in a container. ' +
        'To allow it on this machine, set FACTORY_ALLOW_SHELL=1 for this command, or set build.shell to "allow" in factory.config.json. Set it to "off" to build with file edits only (nothing can then be checked).',
    );
  }

  const ledger = new Ledger(config, store.ledgerFile);
  const session: Session = { llm, ledger, recorder: store.recorder() };
  const decisions = store.readJson<Decisions>('skeleton/decisions.json');
  const idMap = store.readJson<IdMapEntry[]>('skeleton/id-map.json');
  const orders = store.readJson<WorkOrder[]>('skeleton/orders.json');

  const dir = materialize(store, config, takeSnapshot(config));
  store.state.status = 'building';
  store.save();

  const runChecks = options.checks && (shell || mock);
  if (runChecks && !store.exists('build', 'installed')) {
    store.log(`install: ${config.template.install}`);
    const install = await runCommand(dir, config.template.install, 1800);
    if (!install.ok) throw new FactoryError(`The template's install command failed in ${dir}:\n${install.output.slice(-3000)}`);
    store.write('build/installed', new Date().toISOString());
  }

  const system: SystemBlock[] = [{ type: 'text', text: `${BUILD_ROLE}\n\n<doctrine>\n${playbook('00-DOCTRINE.md')}\n</doctrine>\n\n<build-method>\n${playbook('10-BUILD.md')}\n</build-method>`, cache_control: cacheMark(config) }];
  const bible: ContentParam = { type: 'text', text: `<game-bible>\n${JSON.stringify(decisions, null, 1)}\n</game-bible>\n<id-map>\n${JSON.stringify(idMap)}\n</id-map>`, cache_control: cacheMark(config) };

  for (let n = 0; n < orders.length; n++) {
    const order = orders[n];
    if (options.only && !options.only.includes(order.id)) continue;
    const before = store.state.build.orders[order.id];
    if (before?.status === 'done' && !options.only) continue;

    const failedDeps = order.dependsOn.filter((dep) => ['failed', 'blocked'].includes(store.state.build.orders[dep]?.status ?? ''));
    if (failedDeps.length) {
      store.state.build.orders[order.id] = { status: 'blocked', commit: null, turns: 0, summary: `Not started: it depends on ${failedDeps.join(', ')}, which did not finish.`, checks: [], laneReverts: [] };
      store.save();
      store.log(`order ${n + 1} of ${orders.length}: ${order.id} skipped (depends on ${failedDeps.join(', ')})`);
      continue;
    }

    store.log(`order ${n + 1} of ${orders.length}: ${order.title} [${order.lane}${order.code ? ` ${order.code}` : ''}]`);
    const lane = laneFor(config, order);
    const checks = checksFor(config, order);
    const interrupted = before?.status === 'pending';
    store.state.build.orders[order.id] = { status: 'pending', commit: null, turns: 0, summary: 'In progress.', checks: [], laneReverts: [] };
    store.save();

    mkdirSync(store.path('build'), { recursive: true });
    const tools = new ToolBox({ root: dir, lane, shell: { enabled: shell, timeoutSeconds: config.build.shellTimeoutSeconds }, log: (line) => appendFileSync(store.path('build', `${order.id}.log`), `${line}\n`) });
    const job = { session, config, phase: 'build' as const, label: `build/${order.id}`, model: order.model, effort: order.effort, system, tools, maxTurns: config.build.maxTurnsPerOrder, onTurn: (turn: number, note: string) => turn % 20 === 0 && store.log(`    turn ${turn} (${note})`) };

    let result: AgentResult = await runAgent({ ...job, say: [bible, { type: 'text', text: orderMessage(config, order, lane, shell, checks, interrupted) }] });
    let turns = result.turns;
    if (result.stoppedBy === 'turn-limit' && !tools.report) {
      result = await runAgent({ ...job, label: `build/${order.id}/wrap-up`, history: result.messages, maxTurns: 3, say: [{ type: 'text', text: 'You have reached the turn limit for this order. Stop working now and call the report tool: what is done, what is left, what you verified.' }] });
      turns += result.turns;
    }

    // The harness's own verdict: its checks, not the session's word.
    let outcomes: Array<{ name: string; ok: boolean; output: string }> = [];
    const reverted = new Set(enforceLane(dir, lane));
    if (runChecks && result.stoppedBy !== 'refusal') {
      for (let round = 0; ; round++) {
        outcomes = [];
        for (const check of checks) {
          store.log(`    check: ${check.name}`);
          const { ok, output } = await runCommand(dir, check.command, 3600);
          outcomes.push({ name: check.name, ok, output });
        }
        const failed = outcomes.filter((o) => !o.ok);
        if (!failed.length || round >= config.build.maxFixRounds) break;
        store.log(`    ${failed.length} check(s) failed; fix round ${round + 1} of ${config.build.maxFixRounds}`);
        tools.report = null;
        result = await runAgent({
          ...job,
          label: `build/${order.id}/fix-${round + 1}`,
          history: result.messages,
          say: [{ type: 'text', text: `The harness ran the checks. These failed:\n\n${failed.map((f) => `## ${f.name}\n${f.output.slice(-12_000)}`).join('\n\n')}\n\nFind the cause and fix it inside your lane. If the cause is outside your lane, write the request and say so. Then call the report tool again.` }],
        });
        turns += result.turns;
        for (const path of enforceLane(dir, lane)) reverted.add(path);
      }
    }

    const report: Report = tools.report ?? { status: 'partial', summary: result.finalText || 'The session ended without a report.', verified: [], unverified: ['The session filed no report; treat its work as unverified.'], requests: [] };
    const failedChecks = outcomes.filter((o) => !o.ok);
    const status: OrderState['status'] = result.stoppedBy === 'refusal' ? 'failed' : failedChecks.length ? 'partial' : report.status;
    const commit = commitAll(dir, `${order.id}: ${order.title}\n\n${report.summary}`);
    const state: OrderState = { status, commit, turns, summary: report.summary, checks: outcomes.map(({ name, ok }) => ({ name, ok })), laneReverts: [...reverted] };
    store.state.build.orders[order.id] = state;
    store.save();
    store.write(
      `build/${String(n + 1).padStart(2, '0')}-${order.id}.md`,
      [
        `# ${order.title} (\`${order.id}\`)`,
        '',
        `**Status:** ${status}. **Lane:** ${order.lane}${order.code ? ` (${order.code})` : ''}. **Turns:** ${turns}. **Commit:** ${commit ?? 'nothing to commit'}.`,
        '',
        report.summary,
        '',
        '## Checks run by the harness',
        '',
        outcomes.length ? outcomes.map((o) => `- ${o.ok ? 'passed' : '**FAILED**'}: ${o.name}`).join('\n') : '_None were run (no shell, or checks switched off): nothing here is verified by the harness._',
        '',
        '## Verified by the session',
        '',
        report.verified.length ? report.verified.map((v) => `- ${v}`).join('\n') : '_Nothing listed._',
        '',
        '## Not verified',
        '',
        report.unverified.length ? report.unverified.map((v) => `- ${v}`).join('\n') : '_Nothing listed._',
        '',
        '## Requests',
        '',
        report.requests.length ? report.requests.map((v) => `- ${v}`).join('\n') : '_None._',
        '',
        reverted.size ? `## Put back (changed outside the lane)\n\n${[...reverted].map((p) => `- ${p}`).join('\n')}\n` : '',
        failedChecks.length ? `## Failing output\n\n${failedChecks.map((f) => `### ${f.name}\n\n\`\`\`\n${f.output.slice(-6000)}\n\`\`\``).join('\n\n')}\n` : '',
      ].join('\n'),
    );
    store.log(`  ${status}${commit ? ` (commit ${commit.slice(0, 10)})` : ''}; ${ledger.summary()}`);
  }

  writeBuildReport(store, orders, dir, ledger, runChecks);
  if (!options.only) {
    store.state.status = 'built';
    store.save();
  }
}

export function writeBuildReport(store: RunStore, orders: WorkOrder[], dir: string, ledger: Ledger, checksRan: boolean): void {
  const states = store.state.build.orders;
  const rows = orders.map((o, i) => {
    const s = states[o.id];
    const checks = s?.checks.length ? `${s.checks.filter((c) => c.ok).length} of ${s.checks.length} passed` : 'not run';
    return `| ${i + 1} | ${o.title} | ${o.lane}${o.code ? ` (${o.code})` : ''} | ${s?.status ?? 'not started'} | ${checks} | ${s?.commit?.slice(0, 10) ?? ''} |`;
  });
  const count = (status: string) => orders.filter((o) => states[o.id]?.status === status).length;
  const text = [
    `# Build report: ${store.state.game?.name ?? store.state.id}`,
    '',
    `Run \`${store.state.id}\`${store.state.mock ? ' (**mock run: no API calls, no real changes**)' : ''}. ${count('done')} of ${orders.length} work orders done, ${count('partial')} partial, ${count('blocked')} blocked, ${count('failed')} failed. Spent on the build: about $${ledger.spent('build').toFixed(2)} over ${ledger.calls('build')} calls (an estimate).`,
    '',
    checksRan ? 'Checks were run by the harness after each order; "passed" below is its result, not a session\'s claim.' : '**No checks were run in this build.** Nothing below is verified.',
    '',
    '| # | Work order | Lane | Status | Checks | Commit |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## What this report does not show',
    '',
    'A passing test suite and a successful build are not a released game. Nobody has played this build on a phone, no store has reviewed it, no lawyer has read its pages, and no real player has touched its economy. Those steps are in `OWNER_TASKS.md`; each order\'s own record (in the run folder under `build/`) lists what it could not verify.',
    '',
  ].join('\n');
  store.write('build/BUILD_REPORT.md', text);
  if (existsSync(join(dir, 'docs', 'factory'))) {
    writeFileSync(join(dir, 'docs', 'factory', 'BUILD_REPORT.md'), text);
    commitAll(dir, 'Build report');
  }
}

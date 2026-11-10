/**
 * Turns the ten decision records into the skeleton the owner approves:
 *
 *   SKELETON.md              the one page to read before approving
 *   skeleton/GAME_BIBLE.md   every decision in full (what the build sessions read)
 *   skeleton/ID_MAP.md       internal id -> old name -> new name
 *   skeleton/BUILD_PLAN.md   the work orders
 *   skeleton/OWNER_TASKS.md  what only the owner can do, gathered from every stage
 *   skeleton/STORE_LISTING.md
 */
import { STAGE_IDS, type Config, type StageId } from '../config.js';
import type { Ledger } from '../ledger.js';
import type { RunStore } from '../runStore.js';
import type { WorkOrder } from '../build/workOrders.js';
import type { Decisions, IdMapEntry } from './schemas.js';
import { STAGES } from './stages.js';

const words = (key: string): string => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const isPlain = (v: unknown): v is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof v);
const cell = (v: unknown): string => (isPlain(v) ? String(v) : Array.isArray(v) ? v.map(cell).join('; ') : JSON.stringify(v)).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');

/** Any record as readable Markdown: fields become headings, lists of things become bullets. */
export function renderRecord(value: unknown, level = 2): string {
  if (isPlain(value)) return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '_None._';
    return value
      .map((item) => {
        if (isPlain(item)) return `- ${item}`;
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const [first, ...rest] = Object.entries(item as Record<string, unknown>);
          const head = `- **${cell(first[1])}**`;
          const tail = rest.filter(([, v]) => !(Array.isArray(v) && !v.length) && v !== '').map(([k, v]) => `  - ${words(k)}: ${cell(v)}`);
          return [head, ...tail].join('\n');
        }
        return `- ${cell(item)}`;
      })
      .join('\n');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        if (isPlain(v)) return `**${words(k)}:** ${v}`;
        return `${'#'.repeat(Math.min(level, 6))} ${words(k)}\n\n${renderRecord(v, level + 1)}`;
      })
      .join('\n\n');
  }
  return '_None._';
}

const table = (head: string[], rows: unknown[][]): string => (rows.length ? [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n') : '_None._');

interface Gathered {
  stage: StageId;
  text: string;
}

function gather(decisions: Decisions, field: 'unverified' | 'conflicts'): Gathered[] {
  const out: Gathered[] = [];
  for (const stage of STAGE_IDS) for (const text of decisions[stage]?.[field] ?? []) out.push({ stage, text });
  return out;
}

export function ownerTasks(decisions: Decisions): Array<{ stage: StageId; task: string; why: string; blocks: string }> {
  const seen = new Set<string>();
  const out: Array<{ stage: StageId; task: string; why: string; blocks: string }> = [];
  for (const stage of STAGE_IDS) {
    for (const t of decisions[stage]?.ownerTasks ?? []) {
      const key = t.task.toLowerCase().replace(/\W+/g, ' ').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ stage, ...t });
    }
  }
  return out;
}

export function renderIdMap(idMap: IdMapEntry[], gameName: string): string {
  return [
    `# Internal id -> player-facing name (${gameName})`,
    '',
    'Internal ids are stable on purpose: they are in saves, the server database, the wire protocol, stored replays and analytics. Only the name the player reads changes. The key is the entry in the template\'s name catalogue.',
    '',
    table(['Key (never changes)', 'Was', 'Now', 'What it is'], idMap.map((e) => [`\`${e.key}\``, e.was, e.name, e.note])),
  ].join('\n');
}

export function renderPlan(orders: WorkOrder[], config: Config): string {
  const parts = ['# Build plan', '', 'Each work order is one session inside one lane. The harness runs the checks after every order and commits the result; a session cannot write outside its lane.', ''];
  orders.forEach((o, i) => {
    const lane = config.template.lanes[o.lane];
    parts.push(`## ${i + 1}. ${o.title} (\`${o.id}\`)`, '', `**Lane:** ${o.lane}${lane ? ` (${lane.agent})` : ''}${o.code ? `, language ${o.code}` : ''}${o.dependsOn.length ? `  \n**After:** ${o.dependsOn.join(', ')}` : ''}`, '', o.brief, '');
    if (o.acceptance.length) parts.push('Done when:', ...o.acceptance.map((a) => `- ${a}`), '');
  });
  return parts.join('\n');
}

export function writeSkeleton(store: RunStore, config: Config, decisions: Decisions, idMap: IdMapEntry[], orders: WorkOrder[], ledger: Ledger): void {
  const { market, brand, monetization, compliance, languages, economy, engine, art, gui, plan } = decisions;
  const name = brand?.name ?? 'the new game';
  const tpl = store.state.template;
  const chosen = market?.theses.find((t) => t.id === market.chosen) ?? market?.theses.slice().sort((a, b) => b.score - a.score)[0];

  // The full record of every stage.
  const bible = [`# ${name}: game bible`, '', `Made by the game factory (run ${store.state.id}) from the template at ${tpl?.sha ?? 'unknown'}. Every stage's decision record in full. Where this bible and a later change disagree, change the bible first.`, ''];
  for (const stage of STAGE_IDS) {
    const record = decisions[stage];
    if (!record) continue;
    bible.push(`# ${STAGES[stage].title}`, '', renderRecord(record), '');
  }
  store.write('skeleton/GAME_BIBLE.md', bible.join('\n'));
  store.writeJson('skeleton/decisions.json', decisions);
  store.writeJson('skeleton/id-map.json', idMap);
  store.write('skeleton/ID_MAP.md', renderIdMap(idMap, name));
  store.write('skeleton/BUILD_PLAN.md', renderPlan(orders, config));
  store.writeJson('skeleton/orders.json', orders);

  const tasks = ownerTasks(decisions);
  store.write(
    'skeleton/OWNER_TASKS.md',
    [`# ${name}: what only the owner can do`, '', 'No code can do these. They are gathered from every stage; the stage that raised each one is named.', '', table(['Task', 'Why', 'Blocks', 'Raised by'], tasks.map((t) => [t.task, t.why, t.blocks, t.stage]))].join('\n'),
  );

  if (brand) {
    store.write(
      'skeleton/STORE_LISTING.md',
      [`# ${name}: store listing (draft)`, '', 'Check every claim against the build you submit. Never mention another game.', '', `- **App name (30):** ${brand.storeTitle}`, `- **Subtitle (30):** ${brand.subtitle}`, `- **Short description (80):** ${brand.listing.shortDescription}`, `- **Promotional text (170):** ${brand.listing.promoText}`, `- **Keywords (100):** ${brand.listing.keywords}`, '', '## Description', '', brand.listing.description].join('\n'),
    );
  }

  // The page the owner reads before approving.
  const unverified = gather(decisions, 'unverified');
  const conflicts = gather(decisions, 'conflicts');
  const page: string[] = [
    `# Skeleton: ${name}`,
    '',
    `Run \`${store.state.id}\`${store.state.mock ? ' (**mock run: placeholder text, no API calls**)' : ''}. Template: ${tpl?.source ?? 'unknown'} at \`${tpl?.sha.slice(0, 12) ?? '?'}\`${tpl?.dirty ? ' with uncommitted changes' : ''}. Spent so far: about $${ledger.spent('skeleton').toFixed(2)} over ${ledger.calls('skeleton')} calls (an estimate).`,
    '',
    'This is the design, not the game. Read it, change what you want (edit the records under `stages/` and run `go` again, or change the brief and start a new run), then approve to build.',
    '',
  ];
  if (brand) page.push('## The game', '', `**${brand.storeTitle}**: ${brand.subtitle}`, '', brand.premise, '', `**Pillars:** ${brand.pillars.join(' · ')}`, '', `**Why a player taps it:** ${brand.appeal}`, '');
  if (market && chosen) {
    page.push('## The gap', '', `**${chosen.title}.** ${chosen.gap}`, '', `**For:** ${market.targetPlayer.who} (${market.targetPlayer.device}). **Positioning:** ${market.positioning}`, '', `**Why this one:** ${market.whyThisOne}`, '');
    page.push('Opportunities weighed:', '', table(['Thesis', 'Audience', 'Score', 'Chosen'], market.theses.map((t) => [t.title, t.audience, t.score, t.id === chosen.id ? 'yes' : ''])), '');
    page.push('Launch waves:', '', table(['Wave', 'Regions', 'Why'], market.launchWaves.map((w) => [w.wave, w.regions.join(', '), w.why])), '');
    page.push('Numbers that decide it:', '', table(['Metric', 'Target', 'Stop and fix below'], market.kpis.map((k) => [k.metric, k.target, k.stopBelow])), '');
    page.push(`**Hook:** ${market.marketing.hook}`, '');
  }
  if (brand) {
    page.push('## Name and cast', '', table(['Candidate', 'Risk', 'What the search found'], brand.nameCandidates.map((c) => [c.name, c.risk, c.conflicts])), '', `**Fallback names:** ${brand.fallbackNames.join(', ')}`, '');
    page.push(table(['Role', 'Name', 'Look', 'Personality'], brand.cast.map((c) => [c.role, c.name, c.look, c.personality])), '');
  }
  if (monetization) {
    page.push('## Money', '', monetization.model, '', table(['Product', 'USD', 'Contents', 'Role'], monetization.products.map((p) => [p.offer, p.priceUsd, p.contents, p.role])), '', `**Free against paid:** ${monetization.faucetsAndSinks.arithmetic}`, '', '**Never:**', ...monetization.neverDo.map((n) => `- ${n}`), '');
  }
  if (compliance) page.push('## Markets', '', table(['Market', 'Decision', 'Languages', 'Gaps'], compliance.markets.map((m) => [m.market, m.decision, m.languages.join(', '), m.gaps.join('; ')])), '');
  if (languages) page.push('## Languages', '', table(['Wave', 'Languages', 'Why'], languages.waves.map((w) => [w.wave, w.codes.join(', '), w.why])), '', `**Translated during the build:** ${languages.buildNow.join(', ') || 'none'}`, '');
  if (economy) {
    page.push('## Game and economy', '', economy.coreLoop, '', table(['Template system', 'Becomes', 'The player sees'], economy.fiction.map((f) => [f.templateSystem, f.becomes, f.playerSees])), '');
    page.push('Changes to rules or numbers:', '', table(['Change', 'Priority', 'Process it costs'], economy.deltas.map((d) => [d.change, d.priority, d.processCost])), '');
  }
  if (idMap.length) page.push(`## Names (${idMap.length} renamed; all in skeleton/ID_MAP.md)`, '', table(['Was', 'Now', 'What it is'], idMap.slice(0, 30).map((e) => [e.was, e.name, e.note])), '');
  if (engine) page.push('## Engine', '', engine.changes.length ? table(['Change', 'Lane', 'Risk'], engine.changes.map((c) => [c.change, c.lane, c.risk])) : 'No engine changes.', '');
  if (art) page.push('## Art', '', art.style, '', table(['Colour', 'Hex', 'Use'], art.palette.map((p) => [p.name, p.hex, p.use])), '', `**Needs a human artist:** ${art.needsHumanArtist.join('; ') || 'nothing listed'}`, '');
  if (gui) page.push('## Interface', '', gui.feel, '');
  if (plan) page.push('## Build plan', '', plan.summary, '', table(['#', 'Order', 'Lane'], orders.map((o, i) => [i + 1, o.title, o.lane + (o.code ? ` (${o.code})` : '')])), '', '**The build will not:**', ...plan.notBuilt.map((n) => `- ${n}`), '');
  if (conflicts.length) page.push('## Stages that disagree (settle before approving)', '', ...conflicts.map((c) => `- **${c.stage}:** ${c.text}`), '');
  page.push(`## Owner tasks (${tasks.length}; all in skeleton/OWNER_TASKS.md)`, '', ...tasks.slice(0, 15).map((t) => `- ${t.task} (blocks: ${t.blocks})`), tasks.length > 15 ? `- ... and ${tasks.length - 15} more` : '', '');
  page.push(`## Not verified (${unverified.length})`, '', 'Nobody has checked these. Research notes with sources are in each stage folder.', '', ...unverified.slice(0, 25).map((u) => `- **${u.stage}:** ${u.text}`), unverified.length > 25 ? `- ... and ${unverified.length - 25} more in skeleton/GAME_BIBLE.md` : '', '');
  page.push('## Approve', '', '```', `npm run approve -- ${store.state.id}`, `npm run build -- ${store.state.id}`, '```', '', `The build copies the template into its own folder and git repository, then runs ${orders.length} work orders. It stops at the budget in factory.config.json and carries on when you run the same command again.`);
  store.write('SKELETON.md', page.filter((l) => l !== undefined).join('\n'));
}

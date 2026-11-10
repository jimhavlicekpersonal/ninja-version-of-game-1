/**
 * The build is a list of work orders, each done by one session inside one lane, the way the
 * template's AGENTS.md runs its own sessions. The standard orders and their sequence are fixed here
 * (the rebuild-in-place method); the plan stage writes each one's brief for the game at hand and may
 * add extra orders. Translation orders and the final order are added by code.
 */
import type { Config, Effort } from '../config.js';
import type { Decisions, Plan } from '../skeleton/schemas.js';
import type { TemplateIndex } from '../template/index.js';

export interface StandardOrder {
  id: string;
  lane: string;
  purpose: string;
}

/** In running order. Later orders build on earlier ones: names before text, text before translation. */
export const STANDARD_ORDERS: StandardOrder[] = [
  { id: 'identity', lane: 'integration', purpose: "the game's name and identity in the root documents, briefs, package, page title and app display name; the new ID map document. Bundle and product ids stay (owner step)." },
  { id: 'names', lane: 'gameplay', purpose: 'every player-facing name and description in the game data, from the ID map and the brand; then regenerate the text catalogues with the template\'s own tools. No number changes.' },
  { id: 'rules', lane: 'gameplay', purpose: 'the economy changes marked "must", each by the process the template demands (rules version, save migration, tests, balance tools). Empty when there are none.' },
  { id: 'text', lane: 'gui', purpose: 'interface, boot and system text in the new voice; the tutorial retold step for step; honesty labels kept.' },
  { id: 'art', lane: 'art', purpose: 'palette, buildings, units, environment, effects, icons, brand mark and audio in the new art direction, under the same asset keys.' },
  { id: 'interface', lane: 'gui', purpose: 'theme tokens, screen changes and the engine changes that belong to rendering.' },
  { id: 'store', lane: 'backend', purpose: 'store listing texts, public and legal pages, server-side names and messages, and the compliance build asks. Publisher facts stay empty for the owner.' },
  { id: 'glossary', lane: 'integration', purpose: "the translators' glossary and language notes rewritten for the new fiction, before any translation starts." },
];

export interface WorkOrder {
  id: string;
  title: string;
  lane: string;
  /** For a translation order: the language code that fills `{code}` in the lane's globs. */
  code: string | null;
  brief: string;
  acceptance: string[];
  dependsOn: string[];
  model: string;
  effort: Effort;
}

function languagesToBuild(config: Config, decisions: Decisions, index: TemplateIndex): string[] {
  const pick = config.build.languages;
  const known = index.languages.map((l) => l.code);
  if (pick === 'none') return [];
  if (pick === 'all') return known.filter((c) => c !== 'en');
  const wanted = pick === 'plan' ? (decisions.languages?.buildNow ?? []) : pick;
  // Only languages the template has a worksheet for; the rest are owner tasks named in the plan.
  return wanted.filter((c) => c !== 'en' && (known.length === 0 || known.includes(c)));
}

/** Standard orders first in their fixed sequence, then the plan's extras wherever their dependencies allow. */
function sequence(plan: Plan): Plan['orders'] {
  const standardIds = STANDARD_ORDERS.map((o) => o.id);
  const byId = new Map(plan.orders.map((o) => [o.id, o]));
  const out: Plan['orders'] = [];
  const placed = new Set<string>();
  const place = (id: string, trail: string[] = []) => {
    const order = byId.get(id);
    if (!order || placed.has(id) || trail.includes(id)) return;
    for (const dep of order.dependsOn) place(dep, [...trail, id]);
    placed.add(id);
    out.push(order);
  };
  for (const id of standardIds) place(id);
  for (const order of plan.orders) place(order.id);
  return out;
}

export function buildOrders(config: Config, decisions: Decisions, index: TemplateIndex): WorkOrder[] {
  const plan = decisions.plan;
  if (!plan) throw new Error('There is no build plan yet.');
  const orders: WorkOrder[] = [];
  const planned = sequence(plan);

  for (const std of STANDARD_ORDERS) {
    if (!planned.some((o) => o.id === std.id)) planned.push({ id: std.id, title: std.id, lane: std.lane, brief: `Do this for the new game: ${std.purpose}`, acceptance: [], dependsOn: [] });
  }
  for (const order of planned) {
    orders.push({ id: order.id, title: order.title, lane: order.lane, code: null, brief: order.brief, acceptance: order.acceptance, dependsOn: order.dependsOn, model: config.models.builder, effort: config.effort.build });
  }

  const lexicon = config.template.themeLexicon;
  for (const code of languagesToBuild(config, decisions, index)) {
    const language = index.languages.find((l) => l.code === code)?.name ?? code;
    orders.push({
      id: `translate-${code}`,
      title: `Translate into ${language}`,
      lane: 'translation',
      code,
      brief:
        `Translate the game into ${language} (${code}), this one language only. Read your brief and follow its session steps exactly. ` +
        'The English source was rewritten for the new game, so earlier translations of this language are out of date: entries that carry an old translation are hints for phrasing, not text to keep. ' +
        'Use the new glossary and the language notes for this language in the decisions. Work in chunks and run the template\'s check for this language after each chunk.',
      acceptance: [`The template's translation check passes for ${code} with no errors.`, 'Every entry of every namespace is translated from the new English.', 'Unclear English is listed in your report, not edited.'],
      dependsOn: ['glossary'],
      model: config.models.translator,
      effort: config.effort.translate,
    });
  }

  orders.push({
    id: 'finish',
    title: 'Leftovers, every check, closure record',
    lane: 'integration',
    code: null,
    brief:
      `Final pass before the owner sees the game.\n` +
      `1. Hunt for leftovers of the old theme. Search the whole project for these words: ${lexicon.join(', ')}; and for every old name in the ID map document. ` +
      'Internal ids keep their old words on purpose (saves, protocol, database); anything a player, a store reviewer or a translator can read must belong to the new game. Fix what you find, in code, data, pages, documents, native project names and tests that assert visible text.\n' +
      '2. Run every check and fix failures at their cause. Never skip, delete or weaken a test to get a pass; if a test asserts the old theme on purpose, change the assertion to the new theme.\n' +
      '3. Regenerate the generated documents with the template\'s own scripts, and bring the root brief and compartment briefs in line with what the build did.\n' +
      '4. Write docs/factory/CLOSURE.md: what each work order changed, what was checked and how, what could not be checked here (devices, stores, legal review, real players), and the owner tasks in the order they unblock a release.',
    acceptance: ['No leftover of the old theme where a player, reviewer or translator can read it.', 'Every check passes, or each failure is listed with its cause in the closure record.', 'docs/factory/CLOSURE.md exists and separates verified from unverified.'],
    dependsOn: [],
    model: config.models.builder,
    effort: config.effort.build,
  });
  return orders;
}

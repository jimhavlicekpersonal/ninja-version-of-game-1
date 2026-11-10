/**
 * The ten stages, in the owner's order: market first, GUI last, then the build plan.
 *
 * A stage is data: its playbook chapter (factory/playbook/, plain Markdown the owner can edit), what
 * to research, the lenses its proposals are written through, what the decision must settle, and
 * the checks code can make on the record. Adding a discipline is adding an entry here and a chapter.
 */
import type { z } from 'zod';
import type { Config, StageId } from '../config.js';
import type { Shared } from '../prompts.js';
import { ArtSchema, BrandSchema, ComplianceSchema, EconomySchema, EngineSchema, GuiSchema, LanguagesSchema, MarketSchema, MonetizationSchema, PlanSchema, type Brand, type Decisions, type Languages, type Market, type Plan } from './schemas.js';
import { STANDARD_ORDERS } from '../build/workOrders.js';

/**
 * A ceiling, not a target: thinking counts toward it, and a cut-off answer is paid for twice. Requests
 * are streamed, so a high ceiling costs nothing by itself.
 */
const STAGE_MAX_TOKENS = 64_000;

export interface Probe {
  id: string;
  /** before = feeds the proposals; after-proposals = checks what they came up with (name conflicts). */
  when: 'before' | 'after-proposals';
  question: string;
}

export interface StageDef {
  id: StageId;
  title: string;
  chapter: string;
  schema: z.ZodType;
  probes: Probe[];
  /** Points of view for independent proposals. Standard depth uses the first `standardLenses`. */
  lenses: string[];
  standardLenses: number;
  /** What the decision record must settle. */
  ask: string;
  /** Facts code knows that the stage needs (rendered into its context). */
  facts?: (shared: Shared, decisions: Decisions) => string;
  /** Problems code can see in a record; non-empty sends it back once for repair. */
  check?: (record: unknown, shared: Shared, decisions: Decisions) => string[];
  maxTokens: number;
}

const market: StageDef = {
  id: 'market',
  title: 'Gaps in the market',
  chapter: '01-MARKET.md',
  schema: MarketSchema,
  probes: [
    { id: 'charts', when: 'before', question: 'The mobile strategy and base-building market today: which games lead revenue and downloads in each major region, what launched or shut down in the last 18 months, how concentrated the revenue is, and what a new small-studio entrant has managed to earn.' },
    { id: 'audiences', when: 'before', question: 'Audiences and regions that mobile strategy games serve badly: growing markets among the regions the template\'s languages reach, with their device mix, connection quality, payment methods, typical install costs and spending per player.' },
    { id: 'complaints', when: 'before', question: 'What players dislike about the leading base-building and raiding games, from store reviews, forums and community posts: pay-to-win, timers, bots, download size, account loss, toxicity, missing languages. What they say they wish existed.' },
    { id: 'themes', when: 'before', question: 'Themes and fantasies: which settings are crowded in mobile strategy games and which are rising in other media (animation, series, books, toys, folklore, history) without a strong base-building game. Include themes with strong pull in the under-served regions.' },
    { id: 'platform', when: 'before', question: 'Changes in the last 12 months that shift the odds for a small free-to-play strategy game: store fees and alternative billing, age-assurance laws, privacy and advertising rules, user-acquisition costs, web and instant-play distribution, and platform featuring programmes.' },
  ],
  lenses: [
    'the numbers: charts, regions, spending, install costs and device mix',
    'the players: what they want and cannot get, and what they resent in the games they play now',
    'the white space: fantasies, cultures and audiences that mobile strategy ignores',
  ],
  standardLenses: 3,
  ask: 'Find the gap this game will fill. List every opportunity you seriously weighed (at least five), each with its evidence and how well the template can deliver it, then choose one. Settle who the player is, where the game launches first and why, the numbers that would prove the choice right or wrong and the level at which to stop spending, and how players will hear about it. The template\'s strengths (a tiny download, cheap phones, weak networks, many languages, honest monetization) are assets to aim at a real gap, not a gap by themselves.',
  check: (record) => {
    const m = record as Market;
    const problems: string[] = [];
    if (!m.theses.some((t) => t.id === m.chosen)) problems.push(`chosen is "${m.chosen}" but no thesis has that id (ids: ${m.theses.map((t) => t.id).join(', ')}).`);
    if (m.theses.length < 3) problems.push('Fewer than three theses: the record must show the opportunities that were rejected.');
    if (!m.kpis.length) problems.push('No KPIs with a stop level.');
    return problems;
  },
  maxTokens: STAGE_MAX_TOKENS,
};

const brand: StageDef = {
  id: 'brand',
  title: 'Brand, name and appeal',
  chapter: '02-BRAND.md',
  schema: BrandSchema,
  probes: [
    { id: 'name-conflicts', when: 'after-proposals', question: 'For every candidate name in the proposals: games, apps, companies and trademarks with the same or a confusingly similar name (app stores, web, trademark registers where searchable), and what the word means or sounds like in each launch language. Also check the candidate cast names and the home-base word the same way.' },
  ],
  lenses: [
    'a name and world that are evocative: a feeling and a place the player wants to belong to',
    'a name and world that say plainly what you do in the game, easy to search and to pronounce in every launch language',
  ],
  standardLenses: 2,
  ask: 'Give the game its identity for the chosen market: name (with the candidates you weighed and what the conflict search found), fallback names, premise, pillars, tone, the words for the home base, the player, alliances and generated rivals, a cast with faces (a mentor, a playable hero, rival leaders), the icon idea, and the store listing texts. Every listing claim must be true of what the build will deliver. The name must be original, safe from famous franchises, pronounceable in the launch languages, and free of bad meanings in them; the final trademark search is an owner task.',
  check: (record) => {
    const b = record as Brand;
    const problems: string[] = [];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.slug)) problems.push(`slug "${b.slug}" must be lowercase letters, digits and single hyphens.`);
    if (b.nameCandidates.length < 3) problems.push('Fewer than three name candidates.');
    if (!b.fallbackNames.length) problems.push('No fallback name.');
    if (b.cast.length < 3) problems.push('The cast needs at least a mentor, a hero and one rival leader.');
    return problems;
  },
  maxTokens: STAGE_MAX_TOKENS,
};

const monetization: StageDef = {
  id: 'monetization',
  title: 'Monetization and player psychology, within the rules',
  chapter: '03-MONETIZATION.md',
  schema: MonetizationSchema,
  probes: [
    { id: 'rules', when: 'before', question: 'Current rules and enforcement on in-game purchases in the planned launch regions: virtual currencies and price display, loot boxes and paid randomness, spending by minors, dark patterns and withdrawal rights, plus what Apple and Google themselves require of in-app purchases. Name the rule, the authority, the date and the practical effect on a free-to-play strategy game.' },
  ],
  lenses: [
    'the business: where revenue comes from for this audience and what each product is for',
    'the player\'s advocate: what a fair deal looks like and where the business plan would feel like a trick',
  ],
  standardLenses: 1,
  ask: 'Design how the game earns money from this audience in these regions, using the template\'s store, offers, pass and currency systems. Decide the product ladder against the template\'s product slots, the pass, the offer rules, what play gives away for free against what packs sell (show the sums), and which human motives the game leans on and why each is honest. List what the game will never do, how minors are treated, the rule in each region that shapes the design, the regional pricing policy, the first experiments, and what the economy stage must make true.',
  maxTokens: STAGE_MAX_TOKENS,
};

const compliance: StageDef = {
  id: 'compliance',
  title: 'App Store and Google Play compliance for every market served',
  chapter: '04-COMPLIANCE.md',
  schema: ComplianceSchema,
  probes: [
    { id: 'apple', when: 'before', question: 'Apple\'s current requirements for a free-to-play online strategy game with in-app purchases, chat and accounts: App Review Guidelines sections that apply, age rating questions and age-assurance APIs, privacy labels and tracking, account deletion, sign-in rules, EU trader status, and any deadline in the next 12 months. Cite Apple\'s own pages with the date read.' },
    { id: 'google', when: 'before', question: 'Google Play\'s current requirements for the same game: Play Billing Library version deadlines, target API level, Data safety, account deletion, user-generated content, the Families and target-audience rules, age signals, testing requirements for new developer accounts, and any deadline in the next 12 months. Cite Google\'s own pages with the date read.' },
    { id: 'countries', when: 'before', question: 'Country rules that decide whether a small foreign studio may ship a free-to-play online game with purchases and chat in the planned launch regions and languages: licensing or registration, local representatives, consumer and children\'s law, data residency. Say which markets are normally excluded and why.' },
  ],
  lenses: ['a submission reviewer and a regulator reading this game market by market'],
  standardLenses: 1,
  ask: 'Build the market matrix for this game: for each market the languages and launch waves reach, decide launch, later or exclude, with what it requires, what the template already does and what is missing. Go through Apple\'s and Google\'s requirements item by item. Settle the position on age and minors, privacy, and community safety for this audience. List the code and text the build must add, by lane, and what must be re-read at the official source before submission. Everything only the owner can do goes to owner tasks. This is a working draft, not legal advice, and the record must say so where it matters.',
  maxTokens: STAGE_MAX_TOKENS,
};

const languages: StageDef = {
  id: 'languages',
  title: 'Languages',
  chapter: '05-LANGUAGES.md',
  schema: LanguagesSchema,
  probes: [],
  lenses: ['a localization lead who has to ship this fiction in every launch language'],
  standardLenses: 1,
  ask: 'Decide the language plan: the waves, which languages the build translates now, and the glossary a translator needs before the first string (setting and tone, names that stay as they are, game terms with guidance). Set the rules names must follow so they survive translation, notes for each language where this fiction is hard, the cultural risks of this theme by language, and the text rules for the interface. Use the template\'s language list and codes; a language outside it is an owner task.',
  check: (record, shared) => {
    const l = record as Languages;
    const known = new Set(shared.index.languages.map((x) => x.code));
    if (!known.size) return [];
    const unknown = [...new Set([...l.buildNow, ...l.waves.flatMap((w) => w.codes)])].filter((c) => !known.has(c));
    return unknown.length ? [`These language codes are not in the template's language list: ${unknown.join(', ')}. Use the template's codes.`] : [];
  },
  maxTokens: STAGE_MAX_TOKENS,
};

const economy: StageDef = {
  id: 'economy',
  title: 'Game theory and economy balance',
  chapter: '06-ECONOMY.md',
  schema: EconomySchema,
  probes: [],
  lenses: [
    'a systems designer: loops, pacing, sinks and faucets, and what the numbers already measured say',
    'an exploiter and a bored player: where this breaks, where it stalls, where paying makes it worse',
  ],
  standardLenses: 1,
  ask: 'Turn the template\'s systems into this game. Say what each system becomes in the new fiction and what the player sees. Set the naming scheme for every family of named things (the full list of names is made right after this record, from your scheme), the currencies, and how the template\'s signature mechanics are retold. Then decide what really changes in rules or numbers: each change with its reason, the process the template demands for it, and a priority; "must" only where the market, the monetization or the compliance decisions require it. Give pacing targets against what the template measures today, the balance gates the build must hold, the live-operations calendar, and the exploits to guard. Internal ids never change.',
  maxTokens: STAGE_MAX_TOKENS,
};

const engine: StageDef = {
  id: 'engine',
  title: 'Graphics engine',
  chapter: '07-ENGINE.md',
  schema: EngineSchema,
  probes: [],
  lenses: ['a rendering engineer with a 2 GB phone on a weak network in one hand'],
  standardLenses: 1,
  ask: 'Decide what the theme needs from the engine and what it may cost. List what stays exactly as the template has it, the changes this game needs (each with its lane and risk), the budgets the art and interface must live inside and how each is measured, what the theme asks of the scene (weather, water, light, particles), and the device checks only real hardware can settle. The default answer is no engine change: argue for every one you add.',
  maxTokens: STAGE_MAX_TOKENS,
};

const art: StageDef = {
  id: 'art',
  title: 'Art and audio',
  chapter: '08-ART.md',
  schema: ArtSchema,
  probes: [],
  lenses: ['an art director who must make fifty units and fifty buildings readable at 40 pixels, in code'],
  standardLenses: 1,
  ask: 'Write the art direction the build will paint from: style, palette with hex values and uses, shape language, lighting, how each building family looks and changes across its tiers, the silhouette and tell of each unit role, the environment, effects, the brand mark, and the audio direction. Stay inside the engine budgets and the template\'s asset keys. Say what to avoid for originality and cultural respect, and what needs a human artist.',
  maxTokens: STAGE_MAX_TOKENS,
};

const gui: StageDef = {
  id: 'gui',
  title: 'Interface',
  chapter: '09-GUI.md',
  schema: GuiSchema,
  probes: [],
  lenses: ['an interaction designer with a 320-pixel-wide phone and a first-time player'],
  standardLenses: 1,
  ask: 'Design the interface in this game\'s voice on the template\'s screens: the feel, the theme tokens (colours, radii, fonts as the template\'s stylesheet names them), typography, what changes on each screen, the tutorial retold step for step (the template\'s step count and order are fixed by saves), the mentor, the microcopy for the moments that matter, the honesty labels, and accessibility. Keep every rule of the template\'s interface brief.',
  maxTokens: STAGE_MAX_TOKENS,
};

const plan: StageDef = {
  id: 'plan',
  title: 'Build plan',
  chapter: '10-BUILD.md',
  schema: PlanSchema,
  probes: [],
  lenses: ['the integration lead who has to hand each session a brief it can finish alone'],
  standardLenses: 1,
  ask: 'Write the build plan: one work order per standard order listed in the stage facts (same ids and lanes), plus extra orders only where a decision needs work that fits none of them. A brief is everything a fresh session needs: what to change, where, in what order, what must not change, and how it will be judged; it points to the session\'s own template brief rather than repeating it. Fold the compliance build asks, the economy "must" changes and the engine changes into the order whose lane owns them. Do not write orders for translation or for the final checks: code adds those. Say what the build will not do.',
  facts: (shared) => planFacts(shared.config),
  check: (record, shared) => {
    const p = record as Plan;
    const problems: string[] = [];
    const lanes = new Set(Object.keys(shared.config.template.lanes));
    const ids = new Set<string>();
    for (const order of p.orders) {
      if (ids.has(order.id)) problems.push(`Two orders share the id "${order.id}".`);
      ids.add(order.id);
      if (!lanes.has(order.lane)) problems.push(`Order "${order.id}" names the lane "${order.lane}", which does not exist (lanes: ${[...lanes].join(', ')}).`);
    }
    for (const order of p.orders) {
      for (const dep of order.dependsOn) if (!ids.has(dep)) problems.push(`Order "${order.id}" depends on "${dep}", which is not an order.`);
    }
    for (const std of STANDARD_ORDERS) {
      const order = p.orders.find((o) => o.id === std.id);
      if (!order) problems.push(`The standard order "${std.id}" is missing.`);
      else if (order.lane !== std.lane) problems.push(`The standard order "${std.id}" belongs to the lane "${std.lane}", not "${order.lane}".`);
    }
    return problems;
  },
  maxTokens: STAGE_MAX_TOKENS,
};

export function planFacts(config: Config): string {
  const lanes = Object.entries(config.template.lanes).map(([id, l]) => `- ${id} (${l.agent}; brief ${l.brief}): owns ${l.owns.join(', ')}${l.requests ? `; asks other lanes through ${l.requests}` : ''}`);
  const orders = STANDARD_ORDERS.map((o, i) => `${i + 1}. ${o.id} (lane ${o.lane}): ${o.purpose}`);
  const checks = config.template.checks.map((c) => `- ${c.name}: ${c.command}`);
  return [
    'Lanes (a session may only write inside its lane):',
    ...lanes,
    '',
    'Standard work orders, in the order they run:',
    ...orders,
    '',
    'After these, code adds one translation order per language and a final order that hunts leftovers of the old theme and runs every check.',
    '',
    'Checks the harness runs after each order and at the end:',
    ...checks,
  ].join('\n');
}

export const STAGES: Record<StageId, StageDef> = { market, brand, monetization, compliance, languages, economy, engine, art, gui, plan };

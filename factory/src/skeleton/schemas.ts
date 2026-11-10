/**
 * The decision record of each stage. A record is what later stages, the owner and the build read, so
 * every field is required (an empty list is an answer) and the descriptions say what belongs in it.
 */
import { z } from 'zod';

const OwnerTask = z.object({
  task: z.string().describe('Something only the owner can do: accounts, money, legal identity, devices, a decision'),
  why: z.string(),
  blocks: z.string().describe('What cannot happen until it is done'),
});

const Claim = z.object({
  claim: z.string(),
  source: z.string().describe('URL or document and the date read; "model knowledge" when there is no source'),
  confidence: z.enum(['verified', 'likely', 'unverified']),
});

/** Fields every record carries. */
const common = {
  ownerTasks: z.array(OwnerTask),
  unverified: z.array(z.string()).describe('Claims in this record that nobody has checked yet'),
  conflicts: z.array(z.string()).describe('Earlier decisions this stage found wrong or risky, and what to change. Empty when consistent.'),
};

export const MarketSchema = z.object({
  theses: z
    .array(
      z.object({
        id: z.string().describe('Short slug'),
        title: z.string(),
        audience: z.string(),
        regions: z.array(z.string()),
        fantasy: z.string().describe('What the player gets to be and do'),
        gap: z.string().describe('What the market lacks today, and for whom'),
        evidence: z.array(Claim),
        competitors: z.array(z.string()),
        templateFit: z.string().describe('Why the template can deliver it, and what it would have to add'),
        risks: z.array(z.string()),
        score: z.number().describe('0 to 100, overall'),
      }),
    )
    .describe('Every opportunity seriously considered, including the rejected ones'),
  chosen: z.string().describe('The id of the thesis to build'),
  whyThisOne: z.string(),
  positioning: z.string().describe('One paragraph: for whom, instead of what, and why this game'),
  differentiators: z.array(z.string()),
  targetPlayer: z.object({ who: z.string(), playsWhen: z.string(), device: z.string(), spending: z.string() }),
  launchWaves: z.array(z.object({ wave: z.string(), regions: z.array(z.string()), why: z.string() })),
  kpis: z.array(z.object({ metric: z.string(), target: z.string(), stopBelow: z.string().describe('The level at which to pause and fix instead of spending more') })),
  marketing: z.object({
    hook: z.string().describe('The one sentence a player repeats to a friend'),
    channels: z.array(z.string()),
    storeAngle: z.string(),
    softLaunch: z.string(),
    webBuildRole: z.string().describe('What the free browser build is for'),
  }),
  ...common,
});

export const BrandSchema = z.object({
  name: z.string().describe('The game\'s name'),
  slug: z.string().describe('Lowercase letters, digits and hyphens: folder and package name'),
  storeTitle: z.string().max(30),
  subtitle: z.string().max(30),
  nameCandidates: z.array(z.object({ name: z.string(), rationale: z.string(), conflicts: z.string().describe('What the search found: same or similar games, apps, marks; meanings in launch languages'), risk: z.enum(['low', 'medium', 'high']) })),
  fallbackNames: z.array(z.string()),
  premise: z.string().describe('The story premise in three to five sentences'),
  pillars: z.array(z.string()).describe('Three to five promises the game keeps everywhere'),
  tone: z.string(),
  voiceExamples: z.array(z.string()).describe('Sample lines in the game\'s voice'),
  world: z.object({
    setting: z.string(),
    homeBase: z.string().describe('What the player\'s base is called'),
    playerTitle: z.string(),
    groupWord: z.string().describe('What an alliance of players is called'),
    rivalWord: z.string().describe('What computer-generated opponents are called (always labelled as generated)'),
  }),
  cast: z.array(z.object({ role: z.string().describe('mentor, hero, rival leader...'), name: z.string(), look: z.string(), personality: z.string(), appearsIn: z.string() })),
  iconConcept: z.string(),
  appeal: z.string().describe('Why the target player taps the icon and stays past the first session'),
  ipSafety: z.array(z.object({ risk: z.string(), avoidance: z.string() })),
  listing: z.object({ shortDescription: z.string().max(80), promoText: z.string().max(170), description: z.string(), keywords: z.string().max(100) }),
  ...common,
});

export const MonetizationSchema = z.object({
  model: z.string(),
  products: z.array(z.object({ templateSlot: z.string().describe('The template store product this replaces or keeps'), offer: z.string(), priceUsd: z.number(), contents: z.string(), role: z.string() })),
  pass: z.object({ structure: z.string(), premiumPriceUsd: z.number(), freeTrackPromise: z.string() }),
  offers: z.array(z.object({ trigger: z.string(), contents: z.string(), limits: z.string(), audience: z.string() })),
  faucetsAndSinks: z.object({
    freePremiumPerMonth: z.string(),
    sinks: z.array(z.string()),
    arithmetic: z.string().describe('The sums that show paid packs stay worth buying next to what play gives for free'),
  }),
  motivation: z.array(z.object({ driver: z.string().describe('The human motive: mastery, collection, belonging, anticipation...'), mechanic: z.string(), honestyCheck: z.string().describe('Why this is not a dark pattern') })),
  neverDo: z.array(z.string()),
  minors: z.string(),
  regionalRules: z.array(z.object({ region: z.string(), rule: z.string(), effect: z.string(), source: z.string(), recheck: z.boolean() })),
  regionalPricing: z.string(),
  experiments: z.array(z.object({ hypothesis: z.string(), change: z.string(), metric: z.string() })),
  economyAsks: z.array(z.string()).describe('What the economy stage must make true for this to work'),
  ...common,
});

const StoreItem = z.object({ item: z.string(), status: z.enum(['template-covers', 'needs-work', 'owner']), note: z.string() });

export const ComplianceSchema = z.object({
  markets: z.array(
    z.object({
      market: z.string(),
      decision: z.enum(['launch', 'later', 'exclude']),
      languages: z.array(z.string()),
      requirements: z.array(z.string()),
      templateStatus: z.string(),
      gaps: z.array(z.string()),
    }),
  ),
  apple: z.array(StoreItem),
  google: z.array(StoreItem),
  ageAndMinors: z.string(),
  privacy: z.string(),
  communityAndSafety: z.string(),
  buildAsks: z.array(z.object({ lane: z.string(), ask: z.string() })).describe('Code or text this game needs for compliance, by lane'),
  recheckBeforeSubmission: z.array(z.object({ what: z.string(), where: z.string() })),
  ...common,
});

export const LanguagesSchema = z.object({
  waves: z.array(z.object({ wave: z.number(), codes: z.array(z.string()), why: z.string() })),
  buildNow: z.array(z.string()).describe('Language codes to translate during the build; the rest wait for the owner'),
  glossary: z.object({
    settingAndTone: z.string(),
    namesThatStay: z.array(z.object({ term: z.string(), note: z.string() })),
    terms: z.array(z.object({ term: z.string(), meaning: z.string(), guidance: z.string() })),
  }),
  namingRules: z.array(z.string()).describe('Rules the names must follow so they survive translation'),
  perLanguage: z.array(z.object({ code: z.string(), note: z.string() })),
  culturalRisks: z.array(z.object({ risk: z.string(), languages: z.array(z.string()), mitigation: z.string() })),
  textRules: z.array(z.string()),
  ...common,
});

export const EconomySchema = z.object({
  coreLoop: z.string(),
  fiction: z.array(z.object({ templateSystem: z.string(), becomes: z.string(), playerSees: z.string() })),
  namingScheme: z.array(z.object({ family: z.string().describe('A group of catalogue keys, e.g. troops, buildings (defenses), leagues'), rule: z.string(), examples: z.array(z.string()) })),
  currencies: z.array(z.object({ templateId: z.string(), name: z.string(), role: z.string() })),
  signatureMechanics: z.array(z.object({ templateMechanic: z.string(), newFiction: z.string(), ruleChange: z.enum(['none', 'tuning', 'new-rule']), detail: z.string() })),
  deltas: z.array(
    z.object({
      change: z.string(),
      why: z.string(),
      processCost: z.string().describe('What the template\'s rules demand for it: a rules version bump and snapshot, a save migration, a protocol change, new tests'),
      priority: z.enum(['must', 'should', 'later']),
    }),
  ),
  pacing: z.array(z.object({ milestone: z.string(), target: z.string(), templateToday: z.string(), action: z.string() })),
  balanceGates: z.array(z.string()),
  liveOps: z.array(z.object({ name: z.string(), cadence: z.string(), what: z.string() })),
  exploitsToGuard: z.array(z.string()),
  ...common,
});

/** One renamed thing. The key never changes; only what the player reads. */
export const IdMapEntrySchema = z.object({
  key: z.string().describe('The catalogue key, copied exactly'),
  name: z.string().describe('The new player-facing name'),
  note: z.string().describe('What it is in the new fiction, in a few words'),
});
export const IdMapChunkSchema = z.object({ entries: z.array(IdMapEntrySchema) });
export type IdMapEntry = z.infer<typeof IdMapEntrySchema> & { was: string };

export const EngineSchema = z.object({
  keep: z.array(z.string()),
  changes: z.array(z.object({ change: z.string(), why: z.string(), lane: z.string(), risk: z.enum(['low', 'medium', 'high']) })),
  budgets: z.array(z.object({ budget: z.string(), limit: z.string(), measuredBy: z.string() })),
  sceneNeeds: z.array(z.string()).describe('What the theme asks of rendering: weather, water, light, particles'),
  deviceChecks: z.array(z.string()),
  ...common,
});

export const ArtSchema = z.object({
  style: z.string(),
  palette: z.array(z.object({ name: z.string(), hex: z.string(), use: z.string() })),
  shapeLanguage: z.string(),
  lighting: z.string(),
  buildingFamilies: z.array(z.object({ family: z.string(), look: z.string(), tiers: z.string() })),
  unitRoles: z.array(z.object({ role: z.string(), silhouette: z.string(), tell: z.string() })),
  environment: z.string(),
  effects: z.array(z.string()),
  brandMark: z.string(),
  audio: z.object({ instruments: z.array(z.string()), mood: z.string(), signatureSounds: z.array(z.string()) }),
  avoid: z.array(z.string()),
  needsHumanArtist: z.array(z.string()),
  ...common,
});

export const GuiSchema = z.object({
  feel: z.string(),
  themeTokens: z.array(z.object({ token: z.string(), value: z.string(), use: z.string() })),
  typography: z.string(),
  screens: z.array(z.object({ screen: z.string(), changes: z.string() })),
  tutorial: z.array(z.object({ step: z.number(), templateStep: z.string(), line: z.string() })),
  mentor: z.string(),
  microcopy: z.array(z.object({ where: z.string(), text: z.string() })),
  honestyLabels: z.array(z.string()),
  accessibility: z.array(z.string()),
  ...common,
});

export const PlanSchema = z.object({
  summary: z.string(),
  orders: z.array(
    z.object({
      id: z.string().describe('One of the standard order ids, or a new slug for an extra order'),
      title: z.string(),
      lane: z.string(),
      brief: z.string().describe('The full instructions for the session that does this order'),
      acceptance: z.array(z.string()),
      dependsOn: z.array(z.string()),
    }),
  ),
  risks: z.array(z.object({ risk: z.string(), mitigation: z.string() })),
  notBuilt: z.array(z.string()).describe('What the build will not do, said plainly'),
  ...common,
});

export const ReviewSchema = z.object({
  verdict: z.enum(['sound', 'fixable', 'rework']),
  findings: z.array(z.object({ severity: z.enum(['blocker', 'major', 'minor']), issue: z.string(), why: z.string(), fix: z.string() })),
  missing: z.array(z.string()),
  doctrineBreaches: z.array(z.string()),
});

export const BlueprintSchema = z.object({
  game: z.object({ name: z.string(), oneLine: z.string(), genre: z.string(), loop: z.string() }),
  systems: z.array(z.object({ name: z.string(), state: z.enum(['live', 'partial', 'design-only', 'missing']), where: z.string(), notes: z.string() })),
  themeSurface: z.array(z.object({ surface: z.string(), paths: z.array(z.string()), notes: z.string() })).describe('Every place the template\'s theme shows'),
  themeLexicon: z.array(z.string()).describe('Words that give the template\'s theme away'),
  invariants: z.array(z.string()),
  extensionPoints: z.array(z.object({ name: z.string(), where: z.string(), risk: z.string() })),
  openItems: z.array(z.object({ item: z.string(), kind: z.enum(['engineering', 'owner', 'legal', 'device', 'store']), source: z.string() })),
  lessons: z.array(z.string()),
  configDrift: z.array(z.string()).describe('Where factory.config.json no longer matches the template: lanes, briefs, checks, listed files'),
});

export type Market = z.infer<typeof MarketSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type Monetization = z.infer<typeof MonetizationSchema>;
export type Compliance = z.infer<typeof ComplianceSchema>;
export type Languages = z.infer<typeof LanguagesSchema>;
export type Economy = z.infer<typeof EconomySchema>;
export type Engine = z.infer<typeof EngineSchema>;
export type Art = z.infer<typeof ArtSchema>;
export type Gui = z.infer<typeof GuiSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type Blueprint = z.infer<typeof BlueprintSchema>;

export interface Decisions {
  market?: Market;
  brand?: Brand;
  monetization?: Monetization;
  compliance?: Compliance;
  languages?: Languages;
  economy?: Economy;
  engine?: Engine;
  art?: Art;
  gui?: Gui;
  plan?: Plan;
}

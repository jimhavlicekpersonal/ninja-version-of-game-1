/**
 * No new unused exports (quality Q14, 2026-11-14 code-debt batch). Every exported name of a module in
 * `src/` or `server/` must be imported by some other file (code, tools or tests); an export nobody imports
 * should lose its `export` (or the code goes). Contract files (`compartments.json` → `contracts`) keep their
 * exports by rule, and so do the entry points. The allow-list holds what was unused when this test came
 * in: gameplay is all contract (`"*"`), so its spare exports were kept on purpose; the list may only
 * shrink (a listed name that is used or gone now fails, so the list stays honest).
 *
 * An exported type that the module's own code uses (in a signature) counts as part of its API.
 *
 * Syntax only (fast): imports, re-exports, `import()` and `import('…').T` types are read with the
 * TypeScript parser and resolved like the bundler does; `export *` and `import * as` count every name.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const rel = (f: string) => relative(ROOT, f).split('\\').join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const compartments = JSON.parse(readFileSync(join(ROOT, 'compartments.json'), 'utf8')) as { compartments: Record<string, { contracts: string[] | '*' }> };
const contracts = Object.values(compartments.compartments).flatMap((c) => (Array.isArray(c.contracts) ? c.contracts : []));
const isContract = (f: string) => contracts.some((c) => f === c || f.startsWith(`${c}/`));

/** Files whose exports something outside the TypeScript import graph uses (runtimes, workers, builds). */
const ENTRY = [/^src\/main\.ts$/, /^server\/main\.ts$/, /^server\/[a-zA-Z]+Main\.ts$/, /^server\/resim\/resimWorker\.ts$/, /^server\/rules\/v\d+\//];

/**
 * Unused when the check came in (2026-11-14; gameplay's spare contract exports include the content batch's,
 * merged the same day). Never add to this list: un-export or use the name.
 */
const ALLOWED = new Set<string>([
  'server/app.ts#COMPRESS_MIN_BYTES',
  'server/app.ts#holdsToken',
  'server/app.ts#maxHousing',
  'server/app.ts#nodeContext',
  'server/app.ts#trustProxyOption',
  'server/app.ts#validLevels',
  'server/core/japanBalance.ts#JP_STOREFRONTS',
  'server/core/villageReplay.ts#resourceDiff',
  'server/migrate.ts#NO_TRANSACTION_HEADER',
  'server/payments/apple.ts#APPLE_ROOT_CA_G3_SHA256',
  'server/payments/google.ts#tokenId',
  'server/push/push.ts#ApnsTransport',
  'server/push/push.ts#FcmTransport',
  'server/push/push.ts#combineTransports',
  'server/redis.ts#REDIS_DEFAULTS',
  'server/rules/fixture.ts#recordFixture',
  'src/backend/platform/links.ts#LINK_PANELS',
  'src/gameplay/sim/age.ts#AGE_BANDS',
  'src/gameplay/sim/age.ts#bandRank',
  'src/gameplay/sim/army.ts#paidFromStorage',
  'src/gameplay/sim/battle/basegen.ts#opponentName',
  'src/gameplay/sim/battle/previewCounters.ts#PREVIEW_KINDS',
  'src/gameplay/sim/battle/previewCounters.ts#stunTroop',
  'src/gameplay/sim/battle/temper.ts#TroopCuts',
  'src/gameplay/sim/battle/temper.ts#temperFamily',
  'src/gameplay/sim/battle/temper.ts#temperFractions',
  'src/gameplay/sim/battle/warriors.ts#WarriorEffect',
  'src/gameplay/sim/calendar.ts#MAX_OFFSET_MINUTES',
  'src/gameplay/sim/calendar.ts#calendarReward',
  'src/gameplay/sim/calendar.ts#localOffsetMinutes',
  'src/gameplay/sim/calendar.ts#nextLocalDayAt',
  'src/gameplay/sim/carry.ts#troopRole',
  'src/gameplay/sim/defense.ts#botName',
  'src/gameplay/sim/defense.ts#shieldThreshold',
  'src/gameplay/sim/economy.ts#interpolate',
  'src/gameplay/sim/economy.ts#rewardScale',
  'src/gameplay/sim/goalEvents.ts#goalEventByKey',
  'src/gameplay/sim/goalEvents.ts#goalProgress',
  'src/gameplay/sim/goalEvents.ts#reachesStep',
  'src/gameplay/sim/heroes.ts#heroHallLevel',
  'src/gameplay/sim/matchmaking.ts#maxHall',
  'src/gameplay/sim/pass.ts#passPointsPerDay',
  'src/gameplay/sim/pass.ts#premiumActive',
  'src/gameplay/sim/plannedContent.ts#previewBuildingDef',
  'src/gameplay/sim/plannedContent.ts#previewLevels',
  'src/gameplay/sim/progression.ts#buildingStage',
  'src/gameplay/sim/progression.ts#buildingUpgradeSeconds',
  'src/gameplay/sim/progression.ts#trainingSeconds',
  'src/gameplay/sim/rating.ts#matchDistance',
  'src/gameplay/sim/resources.ts#collectorRatePerHour',
  'src/gameplay/sim/social/contactFilter.ts#strongerMatch',
  'src/gameplay/sim/social/grove.ts#groveSeedFor',
  'src/gameplay/sim/social/groveRaid.ts#botAttacks',
  'src/gameplay/sim/social/groveRaid.ts#raidWeek',
  'src/gameplay/sim/suggest.ts#suggestedShares',
  'src/gameplay/sim/trials.ts#defenseStrength',
  'src/gameplay/sim/types.ts#PassReward',
  'src/gameplay/sim/types.ts#STAT_KEYS',
  'src/gameplay/sim/village.ts#BattleSetup',
  'src/gameplay/sim/village.ts#Deployment',
  'src/gameplay/sim/village.ts#deployedTroops',
  'src/gameplay/sim/village.ts#hallLevelRequiredFor',
  'src/gameplay/sim/village.ts#hasAny',
  'src/gameplay/sim/village.ts#settleSeasons',
  'src/presentation/render/assets.ts#generatePlaceholders',
  'src/presentation/render/calloutLayout.ts#GAP_PX',
  'src/presentation/render/calloutLayout.ts#MERGE_PX',
  'src/presentation/render/cameraFrame.ts#BUBBLE_SPAN_PX',
  'src/presentation/render/cameraFrame.ts#OPENING_BELOW',
  'src/presentation/render/cameraFrame.ts#OPENING_MAX',
  'src/presentation/render/cameraFrame.ts#TOP_BAND_PX',
  'src/presentation/ui/communityRules.ts#COMMUNITY_RULES_VERSION',
  'src/presentation/ui/feedback.ts#HapticKind',
  'src/presentation/ui/hud.ts#HudDeps',
  'src/presentation/ui/hud.ts#STATS_EXPLAINER',
  'src/presentation/ui/i18n.ts#MessageRef',
  'src/presentation/ui/refusalText.ts#costWords',
  'src/presentation/ui/unlockCeremony.ts#CEREMONY_MS',
]);

const checked = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'server'))];
const importers = [...checked, ...walk(join(ROOT, 'tests')), ...walk(join(ROOT, 'tools')), ...['vite.config.ts', 'vite.server.config.ts'].map((f) => join(ROOT, f))];
const options: ts.CompilerOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, allowImportingTsExtensions: true, resolveJsonModule: true };
const resolve = (spec: string, from: string) => ts.resolveModuleName(spec, from, options, ts.sys).resolvedModule?.resolvedFileName;

/** file → names imported from it by other files ('*' for all). */
const used = new Map<string, Set<string>>();
const use = (file: string | undefined, name: string) => {
  if (!file) return;
  const k = rel(file);
  if (!used.has(k)) used.set(k, new Set());
  used.get(k)!.add(name);
};
/** file → its exported names. */
const exported = new Map<string, Set<string>>();
/** file → exported types (interfaces, aliases) its own other exports use: they are part of that API. */
const apiTypes = new Map<string, Set<string>>();

for (const file of importers) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const own = rel(file);
  const names = new Set<string>();
  const types = new Set<string>();
  const ids = new Map<string, number>();
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n)) ids.set(n.text, (ids.get(n.text) ?? 0) + 1);
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const target = resolve(n.moduleSpecifier.text, file);
      const c = n.importClause;
      if (c?.name) use(target, 'default');
      if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings)) use(target, '*');
      if (c?.namedBindings && ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) use(target, (e.propertyName ?? e.name).text);
      if (!c) use(target, '*'); // side-effect import
    } else if (ts.isExportDeclaration(n)) {
      const target = n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) ? resolve(n.moduleSpecifier.text, file) : undefined;
      if (!n.exportClause) use(target, '*');
      else if (ts.isNamespaceExport(n.exportClause)) {
        use(target, '*');
        names.add(n.exportClause.name.text);
      } else
        for (const e of n.exportClause.elements) {
          names.add(e.name.text);
          if (target) use(target, (e.propertyName ?? e.name).text);
        }
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
      use(resolve(n.arguments[0].text, file), '*');
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      const target = resolve(n.argument.literal.text, file);
      use(target, n.qualifier ? (ts.isIdentifier(n.qualifier) ? n.qualifier.text : n.qualifier.left.getText()) : '*');
    } else if (ts.isExportAssignment(n)) names.add('default');
    else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isEnumDeclaration(n) || ts.isVariableStatement(n)) && n.parent === sf) {
      const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined;
      if (mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
        if (isDefault) names.add('default');
        else if (ts.isVariableStatement(n)) {
          for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text);
        } else if (n.name) {
          names.add(n.name.text);
          if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) types.add(n.name.text);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  exported.set(own, names);
  apiTypes.set(own, new Set([...types].filter((t) => (ids.get(t) ?? 0) > 1)));
}

function unused(): string[] {
  const out: string[] = [];
  for (const file of checked.map(rel)) {
    if (isContract(file) || ENTRY.some((r) => r.test(file))) continue;
    const by = used.get(file) ?? new Set();
    if (by.has('*')) continue;
    const api = apiTypes.get(file) ?? new Set();
    for (const name of exported.get(file) ?? []) if (!by.has(name) && !api.has(name)) out.push(`${file}#${name}`);
  }
  return out.sort();
}

describe('unused exports', () => {
  const found = unused();

  it('finds what a module exports and nobody imports (self-test)', () => {
    expect(exported.get('server/repo.ts')?.size ?? 0).toBeGreaterThan(0);
    expect(used.get('server/stores/compose.ts')?.has('composeStores')).toBe(true);
  });

  it('no module outside the contracts exports a name nobody imports', () => {
    expect(found.filter((x) => !ALLOWED.has(x))).toEqual([]);
  });

  it('the allow-list only holds names that are still unused', () => {
    expect([...ALLOWED].filter((x) => !found.includes(x))).toEqual([]);
  });
});

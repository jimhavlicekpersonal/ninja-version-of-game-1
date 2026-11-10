/**
 * factory.config.json: everything the owner can change without touching code. The file is the source
 * of truth (no hidden defaults), so a new template version or a new price list is an edit there.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

/** The nine disciplines, in the owner's order (market first, GUI last), then the build plan. */
export const STAGE_IDS = ['market', 'brand', 'monetization', 'compliance', 'languages', 'economy', 'engine', 'art', 'gui', 'plan'] as const;
export type StageId = (typeof STAGE_IDS)[number];

const LaneSchema = z.object({
  /** Who works here, as the template's AGENTS.md names the session. */
  agent: z.string(),
  /** The brief the session reads first (path in the template). */
  brief: z.string(),
  /** Globs the session may write. */
  owns: z.array(z.string()),
  /** Globs it may also change as a side effect of the template's own tools (generated files). */
  generated: z.array(z.string()),
  /** Where it writes a request instead of editing another lane's files. */
  requests: z.string().nullable(),
  /** Checks for this lane's orders instead of the template-wide ones (`{code}` = the language code). */
  checks: z.array(z.string()).optional(),
});
export type Lane = z.infer<typeof LaneSchema>;

const PriceSchema = z.object({ input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite5m: z.number(), cacheWrite1h: z.number() });

export const ConfigSchema = z.object({
  template: z.object({
    /** Folder of the game to mimic, relative to factory/. '..' is this repository. */
    path: z.string(),
    /** A git URL to clone instead of `path` (null = use `path`). */
    git: z.string().nullable(),
    /** Branch, tag or commit to mimic (null = the files as they are now in `path`). */
    ref: z.string().nullable(),
    /** Globs never read from, or copied out of, the template. */
    exclude: z.array(z.string()),
    /** Let Claude read the template and write a blueprint (cached per commit). Off = manifest only. */
    survey: z.boolean(),
    /** Files every stage sees. Missing files are skipped and listed in the run log. */
    shared: z.array(z.string()),
    /** Extra files per stage. */
    stages: z.partialRecord(z.enum(STAGE_IDS), z.array(z.string())),
    /** The catalogue of player-facing names (a flat JSON of key -> English): every key matching `entityPattern` must get a new name. */
    nameSurface: z.object({ file: z.string(), entityPattern: z.string() }).nullable(),
    /** Words that give the template's theme away; the build's last step hunts for leftovers. */
    themeLexicon: z.array(z.string()),
    lanes: z.record(z.string(), LaneSchema),
    install: z.string(),
    checks: z.array(z.object({ name: z.string(), command: z.string() })),
  }),
  models: z.object({ thinker: z.string(), builder: z.string(), translator: z.string() }),
  effort: z.object({ survey: z.enum(EFFORTS), research: z.enum(EFFORTS), think: z.enum(EFFORTS), critique: z.enum(EFFORTS), decide: z.enum(EFFORTS), build: z.enum(EFFORTS), translate: z.enum(EFFORTS) }),
  api: z.object({
    /** Server-side fallback when a safety classifier declines a request (Claude API only). */
    fallbacks: z.boolean(),
    /** Live web research in the market, brand, monetization and compliance stages. */
    webSearch: z.boolean(),
    maxSearchesPerProbe: z.number().int().positive(),
    concurrency: z.number().int().positive(),
    /** Server-side compaction for long build sessions. */
    compaction: z.boolean(),
    cacheTtl: z.enum(['5m', '1h']),
    maxRetries: z.number().int().nonnegative(),
  }),
  skeleton: z.object({
    /** quick: one call per stage. standard: research, proposal, review, decision. deep: every lens and two reviews. */
    depth: z.enum(['quick', 'standard', 'deep']),
    stages: z.array(z.enum(STAGE_IDS)),
  }),
  build: z.object({
    /** Where new games are written, relative to factory/. Each game gets its own folder and git repository. */
    outputDir: z.string(),
    /** May build sessions run shell commands? 'ci-only' = only where CI or FACTORY_ALLOW_SHELL is set. */
    shell: z.enum(['ci-only', 'allow', 'off']),
    shellTimeoutSeconds: z.number().int().positive(),
    maxTurnsPerOrder: z.number().int().positive(),
    maxFixRounds: z.number().int().nonnegative(),
    /** 'plan' = the launch wave the languages stage chose; 'all' = every language; or a list of codes. */
    languages: z.union([z.enum(['plan', 'all', 'none']), z.array(z.string())]),
  }),
  budget: z.object({ skeletonUsd: z.number().positive(), buildUsd: z.number().positive() }),
  /** USD per million tokens. Estimates for the budget stop; the Console has the real bill. */
  pricing: z.object({ models: z.record(z.string(), PriceSchema), webSearchPerRequest: z.number() }),
});
export type Config = z.infer<typeof ConfigSchema>;

export const FACTORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(file = join(FACTORY_ROOT, 'factory.config.json')): Config {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  delete raw.$comment;
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`factory.config.json is not valid:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

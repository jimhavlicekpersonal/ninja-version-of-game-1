/**
 * The one seam to the Claude API. Everything the factory asks Claude goes through `Llm.turn`, so the
 * pipeline can be tested with a scripted `Llm` and no network (tests/, `--mock`).
 *
 * Request shape (Claude Opus 5.5 by default, see factory.config.json):
 * - streaming always, read with `finalMessage()` (long outputs, long thinking);
 * - adaptive thinking, depth set by `output_config.effort`;
 * - server-side refusal fallback (`fallbacks: "default"`), on by default;
 * - structured outputs through `output_config.format` (forced tool choice is not available);
 * - prompt caching by explicit breakpoints placed by the callers (prompts.ts, agent/loop.ts).
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import type { Config, Effort } from './config.js';
import type { Ledger, Phase } from './ledger.js';

export type Msg = Anthropic.Beta.Messages.BetaMessageParam;
export type Reply = Anthropic.Beta.Messages.BetaMessage;
export type SystemBlock = Anthropic.Beta.Messages.BetaTextBlockParam;
export type ToolDef = Anthropic.Beta.Messages.BetaToolUnion;
export type ContentParam = Anthropic.Beta.Messages.BetaContentBlockParam;
export type ToolUse = Anthropic.Beta.Messages.BetaToolUseBlock;
export type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export interface TurnRequest {
  phase: Phase;
  /** Names the call in the ledger and the run log, e.g. `market/proposal`. */
  label: string;
  model: string;
  effort: Effort;
  maxTokens: number;
  system: SystemBlock[];
  messages: Msg[];
  tools?: ToolDef[];
  /** Ask for JSON that matches this schema. */
  schema?: z.ZodType;
  /** Long tool loops: let the API summarize old turns when the context fills. */
  compaction?: boolean;
  /** Growing conversations: cache up to the newest block on each request. */
  autoCache?: boolean;
}

export interface Llm {
  turn(req: TurnRequest): Promise<Reply>;
}

/** Keeps what was asked and answered, for the run folder. */
export interface Recorder {
  call(req: TurnRequest, reply: Reply, seconds: number): void;
}

export class FactoryError extends Error {}

export class RefusalError extends FactoryError {
  constructor(label: string, category: string | null) {
    super(
      `Claude declined the request "${label}"${category ? ` (category: ${category})` : ''}, and so did the fallback model if one was tried. ` +
        'Read the stage inputs in the run folder, adjust the brief or the playbook chapter, and run the same command again.',
    );
  }
}

/** The real thing. Credentials come from the environment (ANTHROPIC_API_KEY or an `ant auth login` profile). */
export class AnthropicLlm implements Llm {
  private readonly client: Anthropic;

  constructor(private readonly config: Config) {
    this.client = new Anthropic({ maxRetries: config.api.maxRetries });
  }

  private ready: Promise<void> | null = null;

  /**
   * Before the first paid call: are there credentials, and does this key reach every model the
   * settings name? (The Models API is free.) A wrong model id should stop a run here, not at stage 6.
   */
  private preflight(): Promise<void> {
    this.ready ??= (async () => {
      for (const model of new Set(Object.values(this.config.models))) {
        try {
          await this.client.models.retrieve(model);
        } catch (err) {
          if (err instanceof Anthropic.NotFoundError) throw new FactoryError(`This API key cannot use the model "${model}" (factory.config.json, models). Check the id, or choose a model the key has access to.`);
          if (err instanceof Anthropic.APIError) throw explain(err, 'checking credentials');
          // Not an API answer at all: the SDK found nothing to sign the request with.
          throw new FactoryError(`No Claude API credentials were found (${(err as Error).message}). Set ANTHROPIC_API_KEY, or run \`ant auth login\`. To try the wiring without the API, add --mock.`);
        }
      }
    })();
    return this.ready;
  }

  async turn(req: TurnRequest): Promise<Reply> {
    await this.preflight();
    const betas: string[] = [];
    if (this.config.api.fallbacks) betas.push('server-side-fallback-2026-07-01');
    if (req.compaction) betas.push('compact-2026-01-12');
    const ttl = this.config.api.cacheTtl;
    // Only the schema is sent; the reply is parsed and checked in `completeJson`, the same way for every Llm.
    const format = req.schema ? betaZodOutputFormat(req.schema) : null;
    try {
      const stream = this.client.beta.messages.stream({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages,
        thinking: { type: 'adaptive' },
        output_config: { effort: req.effort, ...(format ? { format: { type: format.type, schema: format.schema } } : {}) },
        ...(req.tools?.length ? { tools: req.tools } : {}),
        ...(betas.length ? { betas } : {}),
        ...(this.config.api.fallbacks ? { fallbacks: 'default' as const } : {}),
        ...(req.compaction ? { context_management: { edits: [{ type: 'compact_20260112' as const }] } } : {}),
        ...(req.autoCache ? { cache_control: { type: 'ephemeral' as const, ttl } } : {}),
      });
      return await stream.finalMessage();
    } catch (err) {
      throw explain(err, req.label);
    }
  }
}

/** Typed API errors, most specific first, turned into something the owner can act on. */
function explain(err: unknown, label: string): unknown {
  if (err instanceof Anthropic.AuthenticationError) {
    return new FactoryError('The Claude API did not accept the credentials. Set ANTHROPIC_API_KEY (or run `ant auth login`) and run the same command again.');
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new FactoryError(`The API key may not do this (${label}): ${err.message}`);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new FactoryError(`Still rate limited after the retries (${label}). Lower api.concurrency in factory.config.json or wait, then run the same command again.`);
  }
  if (err instanceof Anthropic.BadRequestError) return err; // callers may retry in another shape (research without web tools)
  if (err instanceof Anthropic.APIConnectionError) {
    return new FactoryError(`Could not reach the Claude API (${label}): ${err.message}. The run is saved; run the same command again.`);
  }
  if (err instanceof Anthropic.APIError) {
    return new FactoryError(`The Claude API answered ${err.status ?? 'an error'} (${label}): ${err.message}. The run is saved; run the same command again.`);
  }
  return err;
}

export const isBadRequest = (err: unknown): boolean => err instanceof Anthropic.BadRequestError;

/** The words of a reply (thinking and tool blocks left out). */
export function textOf(reply: Reply): string {
  return reply.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

export interface Session {
  llm: Llm;
  ledger: Ledger;
  recorder?: Recorder;
}

const MAX_OUTPUT = 128_000;
const MAX_CONTINUATIONS = 8;

/**
 * One finished answer: checks the budget, sends the turn, books its cost, resumes a turn the server
 * paused (long web research), and stops on a refusal. Returns the reply and the messages that led to
 * it, with the reply already appended, ready for a follow-up turn.
 */
export async function complete(session: Session, req: TurnRequest): Promise<{ reply: Reply; messages: Msg[] }> {
  let messages = req.messages;
  let maxTokens = req.maxTokens;
  for (let attempt = 0; ; attempt++) {
    session.ledger.assertBudget(req.phase);
    const started = Date.now();
    const sent = { ...req, messages, maxTokens };
    const reply = await session.llm.turn(sent);
    const seconds = (Date.now() - started) / 1000;
    session.ledger.record(req.phase, req.label, reply.model, reply.stop_reason, seconds, reply.usage);
    session.recorder?.call(sent, reply, seconds);

    if (reply.stop_reason === 'refusal') throw new RefusalError(req.label, reply.stop_details?.category ?? null);
    if (reply.stop_reason === 'model_context_window_exceeded') {
      throw new FactoryError(`"${req.label}" no longer fits the model's context. Trim the files listed for this stage in factory.config.json (template.stages).`);
    }
    if ((reply.stop_reason === 'pause_turn' || reply.stop_reason === 'compaction') && attempt < MAX_CONTINUATIONS) {
      // The server stopped mid-turn; sending the turn back makes it carry on.
      messages = [...messages, { role: 'assistant', content: reply.content }];
      continue;
    }
    if (reply.stop_reason === 'max_tokens' && maxTokens < MAX_OUTPUT && attempt < 2) {
      // Thinking counts toward max_tokens; a cut-off answer is asked again with more room.
      maxTokens = Math.min(MAX_OUTPUT, maxTokens * 2);
      continue;
    }
    return { reply, messages: [...messages, { role: 'assistant', content: reply.content }] };
  }
}

/** `complete`, with the answer parsed and checked against `schema`. One repair round if it does not fit. */
export async function completeJson<T>(session: Session, req: TurnRequest & { schema: z.ZodType<T> }): Promise<{ value: T; messages: Msg[] }> {
  let turn = req;
  for (let round = 0; ; round++) {
    const { reply, messages } = await complete(session, turn);
    const text = textOf(reply);
    let problem: string;
    try {
      const parsed = req.schema.safeParse(JSON.parse(text));
      if (parsed.success) return { value: parsed.data, messages };
      problem = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    } catch (err) {
      problem = reply.stop_reason === 'max_tokens' ? 'the JSON was cut off before it ended' : `not valid JSON (${(err as Error).message})`;
    }
    if (round >= 1) throw new FactoryError(`"${req.label}" did not return usable JSON after a repair round:\n${problem}`);
    turn = {
      ...req,
      label: `${req.label}/repair`,
      messages: [...messages, { role: 'user', content: `That answer did not fit the required format:\n${problem}\n\nSend the complete, corrected JSON.` }],
    };
  }
}

/** Runs `tasks` with at most `limit` at once, keeping their order. */
export async function pool<T>(limit: number, tasks: Array<() => Promise<T>>): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

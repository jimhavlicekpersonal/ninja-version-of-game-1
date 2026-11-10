/**
 * A working session: Claude asks for tools, the ToolBox runs them, until Claude stops asking.
 *
 * The loop is written out (rather than left to the SDK's tool runner) because the factory needs
 * three things between turns: the budget stop, a ledger line per turn, and a `Llm` it can script in
 * tests. It follows the streaming-loop rules: never run tools from a refused or cut-off turn,
 * resume a turn the server paused, and send all results of one turn back in a single message.
 */
import type { Config, Effort } from '../config.js';
import { BudgetExceededError, type Phase } from '../ledger.js';
import { FactoryError, isBadRequest, textOf, type ContentParam, type Msg, type Session, type SystemBlock, type ToolResult, type ToolUse } from '../llm.js';
import type { Report, ToolBox } from './tools.js';

export interface AgentJob {
  session: Session;
  config: Config;
  phase: Phase;
  label: string;
  model: string;
  effort: Effort;
  system: SystemBlock[];
  /** The opening message, or the next message of a conversation being continued. */
  say: ContentParam[];
  /** Earlier turns of the same conversation (a fix round continues where the session stopped). */
  history?: Msg[];
  tools: ToolBox;
  maxTurns: number;
  onTurn?: (turn: number, note: string) => void;
}

export interface AgentResult {
  messages: Msg[];
  /** The last words Claude wrote. */
  finalText: string;
  report: Report | null;
  turns: number;
  stoppedBy: 'finished' | 'turn-limit' | 'refusal';
}

const MAX_TOKENS = 64_000;
const MAX_OUTPUT = 128_000;

export async function runAgent(job: AgentJob): Promise<AgentResult> {
  const { session, tools } = job;
  const messages: Msg[] = [...(job.history ?? []), { role: 'user', content: job.say }];
  let maxTokens = MAX_TOKENS;
  let badJson = 0;
  let finalText = '';

  for (let turn = 1; turn <= job.maxTurns; turn++) {
    session.ledger.assertBudget(job.phase);
    const request = {
      phase: job.phase,
      label: `${job.label}#${turn}`,
      model: job.model,
      effort: job.effort,
      maxTokens,
      system: job.system,
      messages,
      tools: tools.defs(),
      compaction: job.config.api.compaction,
      autoCache: true,
    };
    const started = Date.now();
    let reply;
    try {
      reply = await session.llm.turn(request);
      badJson = 0;
    } catch (err) {
      // Tool inputs stream unvalidated; one the SDK cannot parse at all rejects the turn. Only that is
      // asked again. API errors and the budget stop are not ours to retry.
      if (err instanceof FactoryError || err instanceof BudgetExceededError || isBadRequest(err) || badJson++ >= 2) throw err;
      turn--;
      continue;
    }
    const seconds = (Date.now() - started) / 1000;
    session.ledger.record(job.phase, request.label, reply.model, reply.stop_reason, seconds, reply.usage);
    session.recorder?.call(request, reply, seconds);

    const said = textOf(reply);
    if (said) finalText = said;

    if (reply.stop_reason === 'refusal') return { messages, finalText, report: tools.report, turns: turn, stoppedBy: 'refusal' };
    if (reply.stop_reason === 'model_context_window_exceeded') throw new FactoryError(`The session "${job.label}" outgrew the model's context. Turn api.compaction on, or split the work order.`);

    const uses = reply.content.filter((b): b is ToolUse => b.type === 'tool_use');

    if (reply.stop_reason === 'max_tokens' && uses.length) {
      // A cut-off tool input can look complete. Ask the turn again with more room instead of running it.
      if (maxTokens >= MAX_OUTPUT) throw new FactoryError(`A tool call in "${job.label}" does not fit in one reply even at the largest size.`);
      maxTokens = Math.min(MAX_OUTPUT, maxTokens * 2);
      turn--;
      continue;
    }

    // An empty reply cannot be sent back as a turn; it only happens when there is nothing left to do.
    if (!reply.content.length) return { messages, finalText, report: tools.report, turns: turn, stoppedBy: 'finished' };
    messages.push({ role: 'assistant', content: reply.content });

    if (reply.stop_reason === 'pause_turn' || reply.stop_reason === 'compaction') continue;
    if (!uses.length) return { messages, finalText, report: tools.report, turns: turn, stoppedBy: 'finished' };

    const results: ToolResult[] = [];
    for (const use of uses) results.push(await tools.run(use));
    messages.push({ role: 'user', content: results });
    job.onTurn?.(turn, uses.map((u) => u.name).join(', '));
  }
  return { messages, finalText, report: tools.report, turns: job.maxTurns, stoppedBy: 'turn-limit' };
}

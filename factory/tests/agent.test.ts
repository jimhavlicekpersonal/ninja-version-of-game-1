import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAgent } from '../src/agent/loop.js';
import { ToolBox } from '../src/agent/tools.js';
import { loadConfig } from '../src/config.js';
import { BudgetExceededError, Ledger } from '../src/ledger.js';
import { complete, completeJson, RefusalError, type Llm, type Reply, type ToolUse, type TurnRequest } from '../src/llm.js';
import { MockLlm } from '../src/mock.js';
import { z } from 'zod';

const config = loadConfig();

/** An Llm that plays back a fixed list of replies. */
function scripted(replies: Array<Partial<Reply>>): Llm & { calls: TurnRequest[] } {
  const calls: TurnRequest[] = [];
  let i = 0;
  return {
    calls,
    async turn(req) {
      calls.push({ ...req, messages: [...req.messages] });
      const next = replies[Math.min(i++, replies.length - 1)];
      return { id: `m${i}`, type: 'message', role: 'assistant', model: req.model, content: [], stop_reason: 'end_turn', stop_sequence: null, stop_details: null, usage: { input_tokens: 1000, output_tokens: 1000 }, ...next } as unknown as Reply;
    },
  };
}

const text = (t: string) => [{ type: 'text', text: t, citations: null }] as unknown as Reply['content'];
const call = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input }) as ToolUse;

function job(llm: Llm, overrides: Partial<Parameters<typeof runAgent>[0]> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'factory-agent-'));
  const tools = new ToolBox({ root, lane: { owns: ['**'], generated: [], requests: null }, shell: { enabled: false, timeoutSeconds: 5 } });
  const ledger = new Ledger(config);
  return { root, tools, ledger, args: { session: { llm, ledger }, config, phase: 'build' as const, label: 'test', model: 'claude-opus-5-5', effort: 'low' as const, system: [], say: [{ type: 'text' as const, text: 'go' }], tools, maxTurns: 10, ...overrides } };
}

describe('the working session loop', () => {
  it('runs the tools Claude asks for and returns all results of a turn in one message', async () => {
    const llm = scripted([
      { stop_reason: 'tool_use', content: [call('a', 'write_file', { path: 'one.txt', content: '1' }), call('b', 'write_file', { path: 'two.txt', content: '2' })] },
      { stop_reason: 'tool_use', content: [call('c', 'report', { status: 'done', summary: 'wrote two files', verified: [], unverified: [], requests: [] })] },
      { content: text('All done.') },
    ]);
    const { root, args } = job(llm);
    const result = await runAgent(args);
    expect(result.stoppedBy).toBe('finished');
    expect(result.turns).toBe(3);
    expect(result.finalText).toBe('All done.');
    expect(result.report?.summary).toBe('wrote two files');
    expect(readFileSync(join(root, 'two.txt'), 'utf8')).toBe('2');
    const second = llm.calls[1].messages;
    const results = second[second.length - 1];
    expect(results.role).toBe('user');
    expect(Array.isArray(results.content) && results.content.map((b) => b.type)).toEqual(['tool_result', 'tool_result']);
  });

  it('never runs the tools of a refused turn', async () => {
    const llm = scripted([{ stop_reason: 'refusal', content: [call('a', 'write_file', { path: 'bad.txt', content: 'x' })] }]);
    const { root, args } = job(llm);
    const result = await runAgent(args);
    expect(result.stoppedBy).toBe('refusal');
    expect(() => readFileSync(join(root, 'bad.txt'))).toThrow();
  });

  it('asks a cut-off tool call again with more room instead of running it', async () => {
    const llm = scripted([
      { stop_reason: 'max_tokens', content: [call('a', 'write_file', { path: 'cut.txt', content: 'half a fi' })] },
      { stop_reason: 'tool_use', content: [call('a', 'write_file', { path: 'cut.txt', content: 'the whole file' })] },
      { content: text('done') },
    ]);
    const { root, args } = job(llm);
    await runAgent(args);
    expect(readFileSync(join(root, 'cut.txt'), 'utf8')).toBe('the whole file');
    expect(llm.calls[1].maxTokens).toBe(llm.calls[0].maxTokens * 2);
    expect(llm.calls[1].messages).toHaveLength(1); // the cut-off turn was not kept
  });

  it('resumes a turn the server paused, and stops at the turn limit', async () => {
    const paused = scripted([{ stop_reason: 'pause_turn', content: text('searching') }, { content: text('found') }]);
    const a = job(paused);
    expect((await runAgent(a.args)).finalText).toBe('found');
    expect(paused.calls[1].messages).toHaveLength(2);

    const endless = scripted([{ stop_reason: 'tool_use', content: [call('a', 'list_files', { pattern: '**' })] }]);
    const b = job(endless, { maxTurns: 3 });
    const result = await runAgent(b.args);
    expect(result.stoppedBy).toBe('turn-limit');
    expect(endless.calls).toHaveLength(3);
  });

  it('stops before a call once the budget is spent, and says how to continue', async () => {
    const tight = { ...config, budget: { skeletonUsd: 0.01, buildUsd: 0.01 } };
    const llm = scripted([{ stop_reason: 'tool_use', content: [call('a', 'list_files', { pattern: '**' })] }]);
    const { args } = job(llm);
    const ledger = new Ledger(tight);
    await expect(runAgent({ ...args, config: tight, session: { llm, ledger } })).rejects.toBeInstanceOf(BudgetExceededError);
    expect(llm.calls).toHaveLength(1); // the first call was allowed; the second was not started
    expect(ledger.spent('build')).toBeGreaterThan(0.01);
  });
});

describe('single answers', () => {
  it('prices a call from its token counts and the price list', () => {
    const ledger = new Ledger(config);
    const usd = ledger.price('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000, server_tool_use: { web_search_requests: 10 } });
    const p = config.pricing.models['claude-opus-5-5'];
    const write = config.api.cacheTtl === '1h' ? p.cacheWrite1h : p.cacheWrite5m;
    expect(usd).toBeCloseTo(p.input + p.output + p.cacheRead + write + 10 * config.pricing.webSearchPerRequest, 6);
  });

  it('keeps its total across a restart of the run', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'factory-ledger-')), 'calls.jsonl');
    const first = new Ledger(config, file);
    first.record('skeleton', 'a', 'claude-opus-5-5', 'end_turn', 1, { input_tokens: 500_000, output_tokens: 0 });
    const second = new Ledger(config, file);
    expect(second.calls('skeleton')).toBe(1);
    expect(second.spent('skeleton')).toBeCloseTo(first.spent('skeleton'), 9);
  });

  it('turns a refusal into an error that names the call', async () => {
    const llm = scripted([{ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null } as Reply['stop_details'] }]);
    const request = { phase: 'skeleton' as const, label: 'market/proposal-1', model: 'claude-opus-5-5', effort: 'low' as const, maxTokens: 1000, system: [], messages: [{ role: 'user' as const, content: 'x' }] };
    await expect(complete({ llm, ledger: new Ledger(config) }, request)).rejects.toThrowError(RefusalError);
    await expect(complete({ llm, ledger: new Ledger(config) }, request)).rejects.toThrow(/market\/proposal-1.*cyber/);
  });

  it('asks again with more room when an answer is cut off, and repairs JSON that does not fit the schema', async () => {
    const schema = z.object({ n: z.number() });
    const request = { phase: 'skeleton' as const, label: 'x', model: 'claude-opus-5-5', effort: 'low' as const, maxTokens: 1000, system: [], messages: [{ role: 'user' as const, content: 'x' }], schema };

    const cut = scripted([{ stop_reason: 'max_tokens', content: text('{"n":') }, { content: text('{"n":7}') }]);
    expect((await completeJson({ llm: cut, ledger: new Ledger(config) }, request)).value).toEqual({ n: 7 });
    expect(cut.calls[1].maxTokens).toBe(2000);

    const wrong = scripted([{ content: text('{"n":"seven"}') }, { content: text('{"n":7}') }]);
    expect((await completeJson({ llm: wrong, ledger: new Ledger(config) }, request)).value).toEqual({ n: 7 });
    expect(JSON.stringify(wrong.calls[1].messages)).toContain('did not fit the required format');

    const hopeless = scripted([{ content: text('not json') }]);
    await expect(completeJson({ llm: hopeless, ledger: new Ledger(config) }, request)).rejects.toThrow(/did not return usable JSON/);
  });

  it('the mock fills any schema with something that fits it', async () => {
    const schema = z.object({ title: z.string().max(5), kind: z.enum(['a', 'b']), list: z.array(z.object({ id: z.string(), n: z.number() })), flag: z.boolean() });
    const { value } = await completeJson({ llm: new MockLlm(), ledger: new Ledger(config) }, { phase: 'skeleton', label: 'x', model: 'm', effort: 'low', maxTokens: 10, system: [], messages: [{ role: 'user', content: 'x' }], schema });
    expect(schema.safeParse(value).success).toBe(true);
    expect(value.list.map((x) => x.id)).toEqual(['mock-1', 'mock-2', 'mock-3']);
  });
});

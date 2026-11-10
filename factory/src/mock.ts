/**
 * A stand-in for the Claude API, for tests and for `--mock` runs: the whole pipeline runs, writes
 * every file and costs nothing. Its answers are placeholders that fit each schema, so a mock run
 * shows the wiring and the shape of the output, never a design.
 */
import { z } from 'zod';
import { STANDARD_ORDERS } from './build/workOrders.js';
import type { Llm, Reply, ToolUse, TurnRequest } from './llm.js';

export type Responder = (req: TurnRequest) => string | object | ToolUse[] | undefined;

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  maxLength?: number;
}

const FIXED: Record<string, unknown> = { chosen: 'mock-1', slug: 'mock-game', hex: '#336699', buildNow: [], codes: [], languages: [] };

function fill(schema: JsonSchema, key: string, n: number): unknown {
  if (key in FIXED) return FIXED[key];
  if (schema.enum) return schema.enum[0];
  if (schema.anyOf) return fill(schema.anyOf[0], key, n);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === 'object') return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, v]) => [k, fill(v, k, n)]));
  if (type === 'array') {
    const count = schema.items?.type === 'object' ? 3 : 2;
    return Array.from({ length: count }, (_, i) => fill(schema.items ?? {}, key, i + 1));
  }
  if (type === 'number' || type === 'integer') return n;
  if (type === 'boolean') return false;
  const text = key === 'id' ? `mock-${n}` : `Mock ${key} ${n}`;
  return schema.maxLength ? text.slice(0, schema.maxLength) : text;
}

export function placeholder(schema: z.ZodType): unknown {
  return fill(z.toJSONSchema(schema) as JsonSchema, 'record', 1);
}

const lastText = (req: TurnRequest): string => {
  const last = req.messages[req.messages.length - 1];
  if (!last?.content) return '';
  if (typeof last.content === 'string') return last.content;
  return last.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
};

/** The id-map calls must answer the keys they were given. */
const names: Responder = (req) => {
  if (!req.label.startsWith('economy/names')) return undefined;
  const things = /<things>\n([\s\S]*?)\n<\/things>/.exec(lastText(req))?.[1] ?? '';
  const entries = things
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { key: string; was: string })
    .map((t) => ({ key: t.key, name: `New ${t.was}`, note: 'mock name' }));
  return { entries };
};

/** The plan must carry the standard orders in their lanes. */
const plan: Responder = (req) => {
  if (!req.label.startsWith('plan/decision')) return undefined;
  return {
    summary: 'Mock plan: the standard orders, nothing else.',
    orders: STANDARD_ORDERS.map((o) => ({ id: o.id, title: `Mock ${o.id}`, lane: o.lane, brief: `Mock brief: ${o.purpose}`, acceptance: ['Mock acceptance'], dependsOn: [] })),
    risks: [],
    notBuilt: ['Anything: this is a mock run.'],
    ownerTasks: [],
    unverified: ['Everything: this is a mock run.'],
    conflicts: [],
  };
};

/** A working session: file the report, then stop. */
const session: Responder = (req) => {
  if (!req.tools?.some((t) => 'name' in t && t.name === 'report')) return undefined;
  const last = req.messages[req.messages.length - 1];
  const answered = Array.isArray(last?.content) && last.content.some((b) => b.type === 'tool_result');
  if (answered) return 'Mock session finished.';
  return [{ type: 'tool_use', id: `mock_${req.label}`, name: 'report', input: { status: 'done', summary: 'Mock session: nothing was changed.', verified: [], unverified: ['Everything: this is a mock run.'], requests: [] } } as ToolUse];
};

export class MockLlm implements Llm {
  readonly calls: TurnRequest[] = [];
  private readonly responders: Responder[];

  /** `first` responders are asked before the built-in ones (tests script specific calls with them). */
  constructor(first: Responder[] = []) {
    this.responders = [...first, names, plan, session];
  }

  async turn(req: TurnRequest): Promise<Reply> {
    // A copy: callers keep appending to their message list after the call.
    this.calls.push({ ...req, messages: [...req.messages] });
    let answer: string | object | ToolUse[] | undefined;
    for (const responder of this.responders) {
      answer = responder(req);
      if (answer !== undefined) break;
    }
    if (answer === undefined) answer = req.schema ? (placeholder(req.schema) as object) : `Mock answer for ${req.label}.`;

    const isTools = Array.isArray(answer);
    const content = isTools ? answer : [{ type: 'text', text: typeof answer === 'string' ? answer : JSON.stringify(answer), citations: null }];
    return {
      id: `msg_mock_${this.calls.length}`,
      type: 'message',
      role: 'assistant',
      model: req.model,
      content,
      stop_reason: isTools ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } as unknown as Reply;
  }
}

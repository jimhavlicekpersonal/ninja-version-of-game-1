/**
 * Request schemas for the HTTP routes (quality Q19): small JSON Schema builders that also carry the
 * TypeScript type they check, so a route hands the core a typed body instead of `req.body as never`.
 *
 * What a schema checks is the JSON shape: each known field, when present, has the JSON type the protocol
 * type (src/backend/net/protocol.ts) gives it, and the body itself is an object. Values (lengths, ranges,
 * which strings are allowed, deep base and battle contents) stay with the core's own checks, which answer
 * with their own message codes. Extra fields are always allowed (older and newer games send fields the
 * other side does not know), and only fields every supported game sends (protocol 7+) are required.
 * `fields<T>()` makes the compiler hold a schema to its protocol type: every field of `T` needs a schema
 * of the matching JSON type (a nullable one only where `T` allows null).
 */

declare const TYPE: unique symbol;

/** A JSON Schema fragment and, as a phantom, the type of the value it accepts. */
export type Schema<V> = { readonly [TYPE]?: V } & Record<string, unknown>;
/** A body schema (see `body` and `requiredBody`). */
export type BodySchema<V> = Schema<V>;

/** The JSON type of a protocol type: literal unions widen to their primitive, objects to `object`. */
type Json<V> = V extends string ? string : V extends number ? number : V extends boolean ? boolean : V extends readonly unknown[] ? unknown[] : V extends object ? object : unknown;
/** The schema a field of type `V` needs (null allowed only where `V` allows it). */
type FieldSchema<V> = null extends V ? Schema<Json<NonNullable<V>> | null> : Schema<Json<V>>;
/** A schema for every field of `T` (optional fields included: they are checked when present). */
export type Fields<T> = { [K in keyof T]-?: FieldSchema<Exclude<T[K], undefined>> };
/** `T` with only the required fields `R` guaranteed. */
export type Checked<T, R extends keyof T> = Pick<T, R> & Partial<Omit<T, R>>;

export const string = (o: { maxLength?: number } = {}): Schema<string> => ({ type: 'string', ...o });
export const number = (): Schema<number> => ({ type: 'number' });
export const boolean = (): Schema<boolean> => ({ type: 'boolean' });
/** Any JSON object (its contents are checked by the core: a base layout, a store credential, …). */
export const object = (): Schema<object> => ({ type: 'object' });
export const array = <V = unknown>(items?: Schema<V>): Schema<V[]> => ({ type: 'array', ...(items ? { items } : {}) });
/** An object whose every value matches `values` (an army: troop id → count). */
export const record = <V>(values: Schema<V>): Schema<Record<string, V>> => ({ type: 'object', additionalProperties: values });
export function nullable<V>(s: Schema<V>): Schema<V | null> {
  return { ...s, type: [s.type, 'null'] } as Schema<V | null>;
}

/** An object schema for protocol type `T`: `fields<T>()({ … }, ['required', …])`. */
export function fields<T>() {
  return <R extends keyof T = never>(props: Fields<T>, required: R[] = []): Schema<Checked<T, R>> => ({
    type: 'object',
    properties: props,
    ...(required.length ? { required } : {}),
  });
}

/**
 * A body the route may also be called without (no content type: the core answers as before). When a body
 * is sent as JSON (or as text), it must match `s`.
 */
export function body<V>(s: Schema<V>): BodySchema<V | undefined> {
  return { content: { 'application/json': { schema: s }, 'text/plain': { schema: s } } } as BodySchema<V | undefined>;
}

/** A body the route cannot work without (a battle report, a base upload, a donation). */
export function requiredBody<V>(s: Schema<V>): BodySchema<V> {
  return s;
}

/** Query parameters, each a single string when present. */
export function query<K extends string>(...names: K[]): Schema<{ [P in K]?: string }> {
  return { type: 'object', properties: Object.fromEntries(names.map((n) => [n, string()])) };
}

/** Path parameters (always strings). */
export function params<K extends string>(...names: K[]): Schema<{ [P in K]: string }> {
  return { type: 'object', properties: Object.fromEntries(names.map((n) => [n, string()])), required: names };
}

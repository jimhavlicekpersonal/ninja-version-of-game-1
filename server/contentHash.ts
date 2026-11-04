/**
 * Content addresses for stored bases (roadmap step 11). A base is stored once
 * per distinct content in `base_versions`, keyed by this hash; tickets and
 * attack records keep only the key. Object keys are sorted first, so two
 * equal bases always get the same key whatever order their fields were in.
 */
import { createHash } from 'node:crypto';

/** JSON with object keys sorted at every level (arrays keep their order; undefined fields are dropped, as JSON does). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** SHA-256 (hex) of the canonical JSON. */
export function contentHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

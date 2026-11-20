// The publisher facts in public/legal-config.js, parsed as values (PUB-04, P7-01). The file's comments use
// example.com on purpose, so checks read the values, never the text.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** The facts as the pages see them: `window.KAGEMURA_LEGAL` from the shipped file. */
export function readLegalConfig(path = new URL('../../public/legal-config.js', import.meta.url)) {
  const window = {};
  vm.runInNewContext(readFileSync(path, 'utf8'), { window });
  return { ...window.KAGEMURA_LEGAL };
}

const URL_KEYS = new Set(['deletionUrl', 'complaintUrl', 'termsUrl']);
const DATE_KEYS = new Set(['termsEffective', 'policyUpdated']);

/** Why a fact is not acceptable, or null: empty (the honest "not decided yet") or well formed is fine. */
export function legalValueProblem(key, value) {
  if (value === '' || value === undefined) return null;
  if (typeof value !== 'string') return 'not text';
  if (/example\.(com|org|net)|<[^>]*>|\b(TODO|TBD|XXX|lorem)\b/i.test(value)) return 'a placeholder';
  if (key === 'supportEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'not an email address';
  if (URL_KEYS.has(key) && !(value.startsWith('https://') || value.startsWith('./'))) return 'not an https:// or ./ link';
  if (DATE_KEYS.has(key) && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'not a YYYY-MM-DD date';
  return null;
}

/** Facts a signed store build must have (the rest are listed, not blocking). */
export const REQUIRED_FOR_STORE = ['operator', 'supportEmail', 'deletionUrl', 'termsEffective'];

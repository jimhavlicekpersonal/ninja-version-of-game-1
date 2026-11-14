/**
 * Backend A17 (2026-11-14 code-debt batch): a server-held village stored in parts, so a command batch
 * rewrites only the parts it changed (migration 0038, `village_parts`). Measured with a model player
 * (tests/backend/server/village-writes.test.ts): most commands change resources, training, army or stats,
 * a collect or an upgrade the buildings, and the progress keys below change in about 3 % of commands.
 *
 * `villages.file` keeps everything else (resources included: tools/ops/restore-check.mjs reads them there)
 * plus `$parts`, the names of the parts it needs; a part row whose content hash is unchanged is not
 * written again. Reading joins them back, and refuses a file whose listed part is missing (better than
 * handing out a village without its buildings, which the next write would make permanent).
 */
import { contentHash } from '../../contentHash';

/** Top-level keys of `file.village` stored in each part. Keys not listed stay in `villages.file`. */
export const VILLAGE_PARTS = {
  layout: ['buildings'],
  progress: ['tasks', 'daily', 'pass', 'grove', 'research', 'trials', 'calendar', 'cosmetics', 'offers', 'profile', 'tutorial', 'flags', 'stipend'],
} as const satisfies Record<string, readonly string[]>;

export type PartName = keyof typeof VILLAGE_PARTS;
export interface VillagePart {
  part: PartName;
  hash: string;
  data: Record<string, unknown>;
}

/** The key in `villages.file` that lists its parts. */
export const PARTS_KEY = '$parts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The file without its parts (and the parts), or null when it is not a save file with a village object. */
export function splitVillageFile(file: unknown): { rest: Obj; parts: VillagePart[] } | null {
  if (!isObj(file) || !isObj(file.village)) return null;
  const village: Obj = { ...file.village };
  const parts: VillagePart[] = [];
  for (const [part, keys] of Object.entries(VILLAGE_PARTS) as [PartName, readonly string[]][]) {
    const data: Obj = {};
    for (const k of keys) {
      if (!(k in village)) continue;
      data[k] = village[k];
      delete village[k];
    }
    parts.push({ part, hash: contentHash(data), data });
  }
  return { rest: { ...file, village, [PARTS_KEY]: parts.map((p) => p.part) }, parts };
}

/** The whole file again from `villages.file` and its part rows (`parts`: part name → data). */
export function joinVillageFile(file: unknown, parts: unknown): unknown {
  if (!isObj(file) || !Array.isArray(file[PARTS_KEY])) return file;
  const { [PARTS_KEY]: listed, ...rest } = file;
  const have = isObj(parts) ? parts : {};
  const village: Obj = { ...(isObj(rest.village) ? rest.village : {}) };
  for (const part of listed as string[]) {
    const data = have[part];
    if (!isObj(data)) throw new Error(`village part "${part}" is missing`);
    Object.assign(village, data);
  }
  return { ...rest, village };
}

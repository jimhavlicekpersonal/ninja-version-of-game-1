import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('.') || specifier.startsWith('/')) && context.parentURL?.startsWith('file:')) {
    const base = specifier.startsWith('/') ? specifier : path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const cand of [base, base + '.ts', base + '.mts', path.join(base, 'index.ts')]) {
      if (existsSync(cand) && statSync(cand).isFile()) {
        const url = pathToFileURL(cand).href;
        if (cand.endsWith('.json')) return { url, shortCircuit: true, format: 'json', importAttributes: { type: 'json' } };
        return { url, shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith('.json')) return { format: 'json', shortCircuit: true, source: readFileSync(fileURLToPath(url), 'utf8') };
  return next(url, context);
}

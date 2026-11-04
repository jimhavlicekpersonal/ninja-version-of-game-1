#!/usr/bin/env node
/**
 * npm run i18n:extract   regenerate locales/en/data.json from src/gameplay/data
 * npm run i18n:sync      bring every worksheet in line with English
 * npm run i18n:status    progress per language, and the next one to translate
 * npm run i18n:check     validate all languages (or: npm run i18n:check -- ja ko)
 * npm run i18n:next      print the next language and its untranslated entries
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LOCALES,
  checkLanguage,
  extractData,
  formatWorksheet,
  namespaces,
  source,
  syncWorksheet,
  targets,
  worksheet,
  worksheetPath,
  writeSource,
} from './lib.mjs';

const [cmd = 'status', ...args] = process.argv.slice(2);

function extract() {
  const data = extractData();
  writeSource('data', data);
  console.log(`locales/en/data.json: ${Object.keys(data).length} strings`);
}

function sync() {
  for (const lang of targets()) {
    mkdirSync(join(LOCALES, lang.code), { recursive: true });
    const notes = [];
    for (const ns of namespaces()) {
      const r = syncWorksheet(source(ns), worksheet(lang.code, ns));
      writeFileSync(worksheetPath(lang.code, ns), formatWorksheet(r.worksheet));
      if (r.added || r.changed || r.removed) notes.push(`${ns} +${r.added} ~${r.changed} -${r.removed}`);
    }
    if (notes.length) console.log(`${lang.code.padEnd(8)} ${notes.join(', ')}`);
  }
  console.log('Worksheets are in sync with English.');
}

function status() {
  let next = null;
  console.log('wave code     done / total');
  for (const lang of targets()) {
    const r = checkLanguage(lang);
    const pct = r.total ? Math.floor((r.done / r.total) * 100) : 0;
    const mark = r.errors.length ? `  ${r.errors.length} errors` : r.done === r.total ? '  complete' : '';
    console.log(`  ${lang.wave}  ${lang.code.padEnd(8)} ${String(r.done).padStart(4)} / ${r.total} (${pct}%)${mark}`);
    if (!next && (r.done < r.total || r.errors.length)) next = lang;
  }
  console.log(next ? `\nNext: ${next.code} (${next.name}). Read locales/CLAUDE.md, then: npm run i18n:next` : '\nAll languages complete.');
}

function check() {
  const want = new Set(args);
  let failed = 0;
  for (const lang of targets().filter((l) => !want.size || want.has(l.code))) {
    const r = checkLanguage(lang);
    if (r.errors.length || (want.size && r.warnings.length)) {
      console.log(`\n${lang.code}: ${r.done}/${r.total} translated`);
      for (const e of r.errors) console.log(`  error: ${e}`);
      if (want.size) for (const w of r.warnings) console.log(`  warning: ${w}`);
    }
    if (r.errors.length) failed++;
  }
  if (failed) {
    console.log(`\n${failed} language(s) have errors.`);
    process.exitCode = 1;
  } else console.log('All checked languages pass.');
}

function next() {
  const code = args[0];
  const lang = targets().find((l) => (code ? l.code === code : (() => { const r = checkLanguage(l); return r.done < r.total || r.errors.length; })()));
  if (!lang) return console.log('All languages complete.');
  console.log(`${lang.code}: ${lang.name} (${lang.native}), script ${lang.script}, ${lang.dir}${lang.note ? `\nNote: ${lang.note}` : ''}`);
  const limit = Number(args[1]) || 40;
  let shown = 0;
  let left = 0;
  for (const ns of namespaces()) {
    for (const [k, e] of Object.entries(worksheet(lang.code, ns))) {
      if (e.text) continue;
      left++;
      if (shown < limit) {
        console.log(`  ${ns}  ${k}: ${JSON.stringify(e.en)}${e.old ? `   (old: ${JSON.stringify(e.old)})` : ''}`);
        shown++;
      }
    }
  }
  console.log(`\n${left} untranslated in locales/${lang.code}/. Fill "text" in place, then: npm run i18n:check -- ${lang.code}`);
}

const commands = { extract, sync, status, check, next };
if (!commands[cmd]) {
  console.error(`Unknown command ${cmd}. Use: ${Object.keys(commands).join(', ')}`);
  process.exitCode = 1;
} else commands[cmd]();


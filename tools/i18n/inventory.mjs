#!/usr/bin/env node
/**
 * Read-only source census; writes documentation, never game data or worksheets.
 * See docs/localization/README.md. Uses the existing TypeScript dev dependency.
 * A census item is NOT automatically a translator-ready message. Preserve its
 * context, resolve `review`, and normalize whole messages before translating.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--check') options.check = true;
  else if (['--source-root', '--source-ref', '--compare-root', '--compare-ref', '--output'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i].slice(2)] = args[++i];
  else throw new Error(`Unknown or incomplete option: ${args[i]}`);
}
const hash = (s) => createHash('sha256').update(s).digest('hex');
const roots = [
  { id: 'primary', root: resolve(options['source-root'] ?? ROOT), ref: options['source-ref'] ?? 'working-tree' },
  ...(options['compare-root'] ? [{ id: 'checkout', root: resolve(options['compare-root']), ref: options['compare-ref'] ?? 'working-tree' }] : []),
];
const output = resolve(options.output ?? join(ROOT, 'docs/localization/INVENTORY.json'));
const groups = new Map();
const files = new Map();
const catalogs = {};
const keyReferences = [];
const runtimeBridges = [];
const excludedFiles = [];
const assets = [];
const parseProblems = [];
const WORD = /[\p{L}\p{N}]/u;
const decode = (s) => s.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[\da-f]+|\d+);/gi, (x) => {
  const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': '\u00a0' };
  if (named[x]) return named[x];
  const n = x.startsWith('&#x') ? Number.parseInt(x.slice(3, -1), 16) : Number(x.slice(2, -1));
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : x;
});
const walk = (dir) => !existsSync(dir) ? [] : readdirSync(dir).sort().flatMap((n) => {
  if (['node_modules', '.git', 'build', 'Pods', 'DerivedData', '.gradle'].includes(n)) return [];
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const owner = (p) => p.startsWith('src/gameplay') ? 'GAME_THEORY' : /^(server|src\/backend|ios|android)\//.test(p) ? 'BACKEND' : p.startsWith('src/presentation') ? 'GUI' : 'INTEGRATION';
function surface(p) {
  if (/^locales\/en\//.test(p)) return 'catalog';
  if (/adminPage|server\/core\/admin/.test(p)) return 'staff';
  if (/accountPage/.test(p)) return 'account_deletion_web';
  if (/^public\/.*\.html$|^public\/legal/.test(p)) return 'public_pages';
  if (/^docs\/store\//.test(p)) return 'store_copy';
  if (/^tools\/store|^tools\/brand|^docs\/art\/brand/.test(p)) return 'store_media';
  if (/tools\/art-gallery/.test(p)) return 'developer_gallery';
  if (/^ios\//.test(p)) return 'native_ios';
  if (/^android\//.test(p)) return 'native_android';
  if (/manifest|capacitor\.config/.test(p)) return 'app_metadata';
  if (/^index\.html$|pwa\/boot/.test(p)) return 'boot';
  if (/reminder|push|notification/i.test(p)) return 'notifications';
  if (/^src\/gameplay\/data\//.test(p)) return 'game_data';
  if (/^src\/gameplay\/sim\//.test(p)) return 'simulation_messages';
  if (/^src\/backend\//.test(p)) return 'client_services';
  if (/^server\//.test(p)) return 'server_messages';
  if (/^src\/presentation\/render\//.test(p)) return 'canvas';
  if (/^src\/presentation\/art|^src\/presentation\/audio/.test(p)) return 'art_audio';
  if (/^src\/presentation\/ui\//.test(p)) return 'interface';
  return 'composition';
}
function fileInfo(b, path, raw) {
  const key = `${b.id}:${path}`;
  const f = { baseline: b.id, path, sha256: hash(raw), bytes: Buffer.byteLength(raw), surface: surface(path), owner: owner(path), included_occurrences: 0, excluded_literals: {} };
  files.set(key, f);
  return f;
}
function exclude(f, why) { f.excluded_literals[why] = (f.excluded_literals[why] ?? 0) + 1; }
function add(b, f, raw, offset, item) {
  const text = item.text;
  if (!text.trim() || (item.kind !== 'catalog_message' && !WORD.test(text) && !/[^\s{}()[\],.;:=<>/'"`\\_-]/u.test(text))) return exclude(f, 'empty_or_structural_punctuation');
  const before = raw.slice(0, Math.max(0, offset));
  const line = before.split('\n').length;
  const column = before.length - before.lastIndexOf('\n');
  const identity = `${f.path}\0${item.kind}\0${item.locator ?? ''}\0${text}`;
  const id = `L10N-${hash(identity).slice(0, 16)}`;
  let entry = groups.get(id);
  if (!entry) {
    entry = { id, path: f.path, surface: f.surface, owner: f.owner, kind: item.kind, disposition: item.disposition ?? 'review', text, ...(item.locator ? { locator: item.locator } : {}), ...(item.catalog_keys?.length ? { catalog_keys: item.catalog_keys } : {}), ...(item.parameters?.length ? { parameters: item.parameters } : {}), occurrences: [] };
    groups.set(id, entry);
  }
  const occurrence = { baseline: b.id, line, column, context: item.context ?? item.locator ?? item.kind };
  if (!entry.occurrences.some((o) => o.baseline === b.id && o.line === line && o.column === column && o.context === occurrence.context)) entry.occurrences.push(occurrence);
  f.included_occurrences++;
}
function machineText(s) {
  return /^(?:https?:|data:|mailto:|\.\.?\/|\/v\d\/|#(?:[\da-f]{3,8})$|tk\.|VITE_|__[A-Z_]+__|com\.[a-z]|\$\(|--)/i.test(s)
    || /^[\w./@-]+\.(?:ts|js|mjs|json|html|css|png|jpg|svg|woff2|sql|webmanifest)$/i.test(s)
    || /^(?:[\w-]+:)?\/\//.test(s)
    || /^(?:rgba?|hsla?)\([^)]*\)$/i.test(s);
}
function html(b, f, raw, htmlText, offset = 0) {
  const ignored = [];
  for (const m of htmlText.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1\s*>|<!--[\s\S]*?-->/gi)) {
    ignored.push([m.index, m.index + m[0].length]);
    if (m[1]?.toLowerCase() === 'script' && m[2].trim()) code(b, f, raw, m[2], offset + m.index + m[0].indexOf('>') + 1, 'inline_script');
    if (m[1]?.toLowerCase() === 'style') css(b, f, raw, m[2], offset + m.index + m[0].indexOf('>') + 1);
  }
  const hidden = (i) => ignored.some(([a, z]) => i >= a && i < z);
  const tokens = /<[^>]*>|[^<]+/g;
  const stack = [];
  for (const m of htmlText.matchAll(tokens)) {
    if (hidden(m.index)) continue;
    if (m[0][0] === '<') {
      if (/^<\//.test(m[0])) { stack.pop(); continue; }
      const tag = /^<([\w-]+)/.exec(m[0])?.[1]?.toLowerCase();
      if (!tag) continue;
      for (const a of m[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        const name = a[1];
        if (['title', 'alt', 'aria-label', 'aria-description', 'placeholder', 'data-unset', 'data-label', 'android:text', 'android:hint', 'accessibilityLabel', 'text'].includes(name) || (name === 'value' && tag === 'button') || (name === 'content' && /name=["'](?:description|application-name|apple-mobile-web-app-title)["']/.test(m[0]))) {
          const text = decode(a[2] ?? a[3]);
          if (/^[@$]/.test(text)) continue;
          add(b, f, raw, offset + m.index + a.index, { text, kind: 'markup_attribute', locator: `${tag}@${name}`, disposition: 'translate' });
        }
      }
      if (!/\/$/.test(m[0].slice(0, -1)) && !['meta', 'link', 'input', 'img', 'br', 'hr', 'source'].includes(tag)) stack.push(tag);
    } else {
      const text = decode(m[0]).replace(/\s+/g, ' ').trim();
      if (text) add(b, f, raw, offset + m.index, { text, kind: 'markup_text', context: stack.slice(-3).join(' > '), disposition: 'translate' });
    }
  }
}
function css(b, f, raw, source, offset = 0) {
  for (const m of source.matchAll(/\bcontent\s*:\s*(['"])(.*?)\1/g)) add(b, f, raw, offset + m.index, { text: m[2], kind: 'css_content', disposition: 'format_or_symbol' });
}
function code(b, f, raw, source = raw, offset = 0, kind = 'code_literal') {
  const sf = ts.createSourceFile(f.path.endsWith('.mjs') || f.path.endsWith('.js') ? `${f.path}.js` : `${f.path}.ts`, source, ts.ScriptTarget.Latest, true);
  if (sf.parseDiagnostics.length) parseProblems.push(...sf.parseDiagnostics.map((d) => ({ baseline: b.id, path: f.path, line: raw.slice(0, offset + (d.start ?? 0)).split('\n').length, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') })));
  const parentProp = (n) => {
    let p = n.parent;
    for (let i = 0; p && i < 5; i++, p = p.parent) if (ts.isPropertyAssignment(p)) return p.name.getText(sf).replace(/^['"]|['"]$/g, '');
    return '';
  };
  const visit = (n) => {
    if (ts.isCallExpression(n) && /(?:\.text|\.setText|\.fillText|\.toast|\.modal|\.confirm|\.notify|\.setAttribute|^t|^h)$/.test(n.expression.getText(sf))) {
      runtimeBridges.push({ baseline: b.id, path: f.path, line: raw.slice(0, offset + n.getStart(sf)).split('\n').length, call: n.expression.getText(sf), expression: n.getText(sf).slice(0, 260) });
    }
    if (ts.isBinaryExpression(n) && /\.(?:textContent|innerText|innerHTML)$/.test(n.left.getText(sf))) runtimeBridges.push({ baseline: b.id, path: f.path, line: raw.slice(0, offset + n.getStart(sf)).split('\n').length, call: n.left.getText(sf), expression: n.right.getText(sf).slice(0, 260) });
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      const parent = n.parent;
      let a = parent;
      while (a && !ts.isStatement(a)) {
        if (ts.isLiteralTypeNode(a) || ts.isImportDeclaration(a) || ts.isExportDeclaration(a) || ts.isModuleDeclaration(a)) { exclude(f, 'type_or_module_specifier'); return; }
        a = a.parent;
      }
      if (ts.isPropertyAssignment(parent) && parent.name === n) {
        if (/[A-Z]|\s/.test(n.text) && !machineText(n.text)) add(b, f, raw, offset + n.getStart(sf), { text: n.text, kind: 'object_key', disposition: 'review', context: 'Object key may be rendered by Object.keys/entries; trace the consumer.' });
        else exclude(f, 'property_key');
        return;
      }
      if (ts.isCallExpression(parent) && parent.arguments[0] === n && parent.expression.getText(sf) === 't') {
        keyReferences.push({ baseline: b.id, path: f.path, line: raw.slice(0, offset + n.getStart(sf)).split('\n').length, key: ts.isTemplateExpression(n) ? n.getText(sf) : n.text, dynamic: ts.isTemplateExpression(n) });
        exclude(f, 'translation_key_reference'); return;
      }
      let text;
      const parameters = [];
      if (ts.isTemplateExpression(n)) {
        text = n.head.text;
        n.templateSpans.forEach((s, i) => { const name = `arg${i + 1}`; parameters.push({ name, expression: s.expression.getText(sf) }); text += `{${name}}${s.literal.text}`; });
      } else text = n.text;
      if (/<(?:!doctype|\/?[a-z][\w:-]*)(?:\s|\/?>)/i.test(text)) {
        // Keep the actual source spelling here: normalizing template parameters
        // first would shift the line/column of later HTML and inline scripts.
        html(b, f, raw, n.getText(sf).slice(1, -1), offset + n.getStart(sf) + 1);
        // Expressions can themselves hold visible alternatives or English.
        if (ts.isTemplateExpression(n)) for (const s of n.templateSpans) visit(s.expression);
        return;
      }
      const prop = parentProp(n);
      if (ts.isBinaryExpression(parent) && /\.(?:font|fillStyle|strokeStyle|textAlign|textBaseline|globalCompositeOperation|lineCap|lineJoin)$/.test(parent.left.getText(sf))) { exclude(f, 'canvas_style_or_font_identifier'); return; }
      const call = ts.isCallExpression(parent) || ts.isNewExpression(parent) ? parent : null;
      const callee = call?.expression.getText(sf) ?? '';
      const arg = call ? [...(call.arguments ?? [])].indexOf(n) : -1;
      if ((callee === 'h' && arg === 0) || ['class', 'className', 'style', 'id', 'type', 'role', 'name', 'autocomplete', 'spellcheck', 'dir', 'lang', 'value', 'href', 'src', 'target', 'rel', 'inputmode'].includes(prop) && !/[A-Z][a-z]|\s/.test(text)) { exclude(f, 'dom_or_internal_attribute'); return; }
      if (['class', 'className', 'style'].includes(prop)) { exclude(f, 'css_class_or_style'); return; }
      if (/^(?:querySelector|querySelectorAll|getElementById|getElementsByClassName|createElement|addEventListener|removeEventListener|setItem|getItem|removeItem|registerPlugin|matchMedia)$/.test(callee.split('.').pop()) && arg === 0) { exclude(f, 'dom_api_or_storage_identifier'); return; }
      if (machineText(text)) { exclude(f, 'path_url_color_or_machine_identifier'); return; }
      const sentence = /\s/.test(text.trim()) || /[.!?。！？]/u.test(text) && !/^[\w.-]+$/.test(text);
      const visibleProp = ['label', 'title', 'body', 'message', 'text', 'description', 'placeholder', 'aria-label', 'aria-description', 'alt', 'reason', 'note', 'summary'].includes(prop);
      const visibleCall = (/Error$/.test(callee) && (!/^(?:ApiError|ServerError)$/.test(callee) || arg >= 2)) || /\.reject$|\.toast$|\.modal$|\.confirm$|\.setText$|\.text$|\.fillText$|bootStatus$|banner$|confirm$/.test(callee) || callee === 'h' && arg >= 2;
      const keys = Object.entries(catalogs[b.id]?.english ?? {}).filter(([, v]) => v === text).map(([k]) => k);
      const disposition = keys.length ? 'catalog_equivalent' : text === 'Kagemura' ? 'preserve_brand' : visibleProp || visibleCall || sentence ? 'translate' : 'review';
      add(b, f, raw, offset + n.getStart(sf), { text, kind, disposition, catalog_keys: keys, parameters, context: `${callee ? `${callee} argument ${arg}` : prop ? `property ${prop}` : ts.SyntaxKind[parent.kind]}` });
      if (ts.isTemplateExpression(n)) for (const s of n.templateSpans) visit(s.expression);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
function json(b, f, raw) {
  const sf = ts.parseJsonText(f.path, raw);
  if (sf.parseDiagnostics.length) parseProblems.push(...sf.parseDiagnostics.map((d) => ({ baseline: b.id, path: f.path, line: raw.slice(0, d.start ?? 0).split('\n').length, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') })));
  const en = /^locales\/en\/(.+)\.json$/.exec(f.path)?.[1];
  const visit = (n, path = []) => {
    if (ts.isObjectLiteralExpression(n)) for (const p of n.properties) {
      if (ts.isPropertyAssignment(p)) visit(p.initializer, [...path, p.name.text]);
    }
    else if (ts.isArrayLiteralExpression(n)) n.elements.forEach((e, i) => visit(e, [...path, String(i)]));
    else if (ts.isStringLiteral(n)) {
      const locator = path.join('.');
      if (!n.text) return exclude(f, 'empty_json_value');
      if (path.some((p) => p.startsWith('$comment')) || path.includes('look') || path.includes('visualStages')) return exclude(f, 'developer_or_art_description');
      if (machineText(n.text)) return exclude(f, 'path_url_color_or_machine_identifier');
      if (en) add(b, f, raw, n.getStart(sf), { text: n.text, kind: 'catalog_message', locator: `${en}.${locator}`, disposition: 'catalog', catalog_keys: [`${en}.${locator}`] });
      else {
        const keys = Object.entries(catalogs[b.id]?.english ?? {}).filter(([, v]) => v === n.text).map(([k]) => k);
        const field = path.at(-1);
        const disposition = path.includes('profanity') ? 'moderation_list' : keys.length ? 'catalog_equivalent' : ['name', 'description', 'displayName', 'label', 'title', 'text', 'summary', 'bio', 'subtitle'].includes(field) || /\s/.test(n.text) ? 'translate' : 'review';
        add(b, f, raw, n.getStart(sf), { text: n.text, kind: 'json_value', locator, disposition, catalog_keys: keys });
      }
    }
  };
  if (sf.statements[0]?.expression) visit(sf.statements[0].expression);
}
function native(b, f, raw) {
  // Java/Swift bridge strings, including interpolation source. Context review
  // separates provider codes/keys from player-visible rejection messages.
  for (const m of raw.matchAll(/"(?:[^"\\]|\\[\s\S])*"/g)) {
    const text = m[0].slice(1, -1);
    if (machineText(text)) { exclude(f, 'native_machine_identifier'); continue; }
    const prefix = raw.slice(Math.max(0, m.index - 100), m.index);
    add(b, f, raw, m.index, { text, kind: 'native_string', disposition: /reject\(|localized|description|title|message/i.test(prefix) || /\s/.test(text) ? 'translate' : 'review', context: prefix.split('\n').at(-1).trim() });
  }
}
function xml(b, f, raw) {
  for (const m of raw.matchAll(/<string\b([^>]*)>([\s\S]*?)<\/string>/g)) {
    const name = /name="([^"]+)"/.exec(m[1])?.[1];
    const precedingKey = /<key>([^<]+)<\/key>\s*$/.exec(raw.slice(0, m.index))?.[1];
    const locator = name ?? precedingKey ?? 'string';
    const value = decode(m[2]);
    if (machineText(value)) { exclude(f, 'native_resource_identifier'); continue; }
    add(b, f, raw, m.index, { text: value, kind: 'native_resource', locator, disposition: /app_name|title_activity|DisplayName|UsageDescription/.test(locator) ? 'translate' : 'review' });
  }
  for (const m of raw.matchAll(/(?:android:)?(?:text|hint|contentDescription|accessibilityLabel|label)="([^"]+)"/g)) {
    if (/^[@$]/.test(m[1])) continue;
    add(b, f, raw, m.index, { text: decode(m[1]), kind: 'native_attribute', disposition: 'translate' });
  }
}
function markdown(b, f, raw) {
  for (const [i, line] of raw.split('\n').entries()) {
    if (!WORD.test(line) || !line.trim()) continue;
    add(b, f, raw, raw.split('\n').slice(0, i).join('\n').length + (i ? 1 : 0), { text: line, kind: 'publishing_source', disposition: 'review', context: 'Separate actual listing/policy/review copy from owner instructions before translation.' });
  }
}
for (const b of roots) {
  const enDir = join(b.root, 'locales/en');
  const english = {};
  const namespaces = {};
  for (const path of walk(enDir).filter((p) => p.endsWith('.json'))) {
    const ns = relative(enDir, path).replace(/\.json$/, '').replaceAll('\\', '/');
    const src = JSON.parse(readFileSync(path, 'utf8'));
    namespaces[ns] = Object.keys(src).length;
    for (const [k, v] of Object.entries(src)) english[`${ns}.${k}`] = v;
  }
  const langs = JSON.parse(readFileSync(join(b.root, 'locales/languages.json'), 'utf8')).languages;
  let filled = 0;
  for (const l of langs.filter((l) => l.code !== 'en')) for (const ns of Object.keys(namespaces)) {
    const p = join(b.root, 'locales', l.code, `${ns}.json`);
    if (existsSync(p)) filled += Object.values(JSON.parse(readFileSync(p, 'utf8'))).filter((v) => typeof v?.text === 'string' && v.text.length > 0).length;
  }
  catalogs[b.id] = { english, namespaces, languages: langs.length, targets: langs.length - 1, filled_target_entries: filled, catalog: langs };
  const paths = [...new Set([
    ...['src', 'server', 'public', 'ios/App/App', 'android/app/src/main', 'locales/en', 'tools/store', 'tools/brand', 'tools/art-gallery', 'docs/art/brand'].flatMap((p) => walk(join(b.root, p))),
    ...['index.html', 'capacitor.config.ts', 'ios/App/Products.storekit', 'docs/store/LISTING.md', 'docs/store/PRIVACY_POLICY.md', 'docs/store/REVIEW_NOTES.md'].map((p) => join(b.root, p)).filter(existsSync),
  ])].sort();
  for (const abs of paths) {
    const path = relative(b.root, abs).replaceAll('\\', '/');
    const ext = extname(path);
    if (/^server\/rules\/v\d+\//.test(path)) { excludedFiles.push({ baseline: b.id, path, reason: 'immutable_simulation_snapshot_localize_at_presentation_boundary' }); continue; }
    if (/\.(?:png|jpg|jpeg|webp|gif|ico|wav|mp3|ogg|aac|woff2|ttf|otf)$/i.test(ext)) { const data = readFileSync(abs); assets.push({ baseline: b.id, path, sha256: hash(data), bytes: data.length, kind: /woff2|ttf|otf/.test(ext) ? 'font' : /wav|mp3|ogg|aac/.test(ext) ? 'audio' : 'image', review: 'Review glyph coverage, baked text, or spoken content; filenames do not establish absence of text.' }); continue; }
    if (!/\.(?:ts|js|mjs|json|html|css|swift|java|xml|plist|storyboard|storekit|webmanifest|svg|md|sql)$/.test(path)) continue;
    if (ext === '.md' && !/^docs\/store\/(?:LISTING|PRIVACY_POLICY|REVIEW_NOTES)\.md$/.test(path)) continue;
    const raw = readFileSync(abs, 'utf8');
    const f = fileInfo(b, path, raw);
    if (/\.(?:ts|js|mjs)$/.test(path)) code(b, f, raw);
    else if (['.json', '.webmanifest', '.storekit'].includes(ext)) json(b, f, raw);
    else if (['.html', '.svg'].includes(ext)) html(b, f, raw, raw);
    else if (ext === '.css') css(b, f, raw, raw);
    else if (ext === '.swift' || ext === '.java') native(b, f, raw);
    else if (['.xml', '.plist', '.storyboard'].includes(ext)) xml(b, f, raw);
    else if (ext === '.md') markdown(b, f, raw);
    else if (ext === '.sql') for (const m of raw.replace(/--[^\n]*/g, (s) => ' '.repeat(s.length)).matchAll(/'((?:''|[^'])*)'/g)) {
      if (/\s/.test(m[1].trim())) add(b, f, raw, m.index, { text: m[1], kind: 'sql_literal', disposition: 'review' });
    }
  }
}
if (parseProblems.length) throw new Error(`Source parse errors: ${JSON.stringify(parseProblems, null, 2)}`);
const units = [...groups.values()].sort((a, b) => a.path.localeCompare(b.path, 'en') || a.occurrences[0].line - b.occurrences[0].line || a.id.localeCompare(b.id, 'en'));
const byBaseline = {};
for (const b of roots) {
  const counts = {};
  for (const u of units.filter((u) => u.occurrences.some((o) => o.baseline === b.id))) counts[u.disposition] = (counts[u.disposition] ?? 0) + 1;
  byBaseline[b.id] = { ref: b.ref, files: [...files.values()].filter((f) => f.baseline === b.id).length, source_units_by_disposition: counts, source_units: Object.values(counts).reduce((a, n) => a + n, 0), catalog_namespaces: catalogs[b.id].namespaces, languages: catalogs[b.id].languages, targets: catalogs[b.id].targets, filled_target_entries: catalogs[b.id].filled_target_entries };
}
const result = {
  schema_version: 1,
  generator: { path: 'tools/i18n/inventory.mjs', sha256: hash(readFileSync(fileURLToPath(import.meta.url))), runtime_dependency: 'existing typescript devDependency' },
  purpose: 'Source inventory and context for translating every player-visible surface. Read README.md before processing units.',
  scope: {
    coverage: 'Primary snapshot plus checkout-only/different strings. Runtime, data, boot, public/deletion pages, native wrappers/resources, store fixtures/copy/media and optional staff/gallery surfaces.',
    limitations: ['Static census, not proof of runtime reachability or a final unique-message count.', 'review units deliberately retain ambiguous identifiers/labels; classify before translating.', 'Template/markup fragments must be rebuilt into whole grammatical messages; argN preserves the original expression, not a proposed final placeholder name.', 'Assets and OS/store-controlled or owner-supplied content require the separate surface and release checks in README.md.', 'Immutable archived rules are listed but not edited or counted as new translation messages. Render old records by versioned message IDs or safe legacy fallback.', 'Native interpolation literals retain their native syntax and need contextual review.'],
    excluded_globally: ['node_modules/**', '.git/**', 'tests/**', 'dist*/**', 'generated native web assets', 'non-player operational/design documentation', 'build-system project files without app display resources'],
  },
  disposition_definitions: {
    catalog: 'English source key already in worksheets. Existence is not runtime consumption or completed translation.',
    catalog_equivalent: 'Exact English matches one or more catalog values; confirm stable key/context and runtime use.',
    translate: 'Visible wording or candidate prose; preserve full-message context and classify reachability before assigning a stable key.',
    review: 'Ambiguous label, enum, technical value, or publishing instruction; translate only after tracing its display consumer.',
    preserve_brand: 'Brand identity retained according to the glossary; surrounding wording still localizes.',
    format_or_symbol: 'Symbol/abbreviation/directional glyph; review locale formatting and accessibility rather than word translation.',
    moderation_list: 'Language-specific moderation work, not literal translation of an English offensive-word list.',
  },
  summary: { baselines: byBaseline, union_source_units: units.length, checkout_only_units: units.filter((u) => u.occurrences.every((o) => o.baseline === 'checkout')).length, note: 'Counts are source units, not distinct production messages. Duplicate English occurs in different contexts, branches, and generated catalogs.' },
  languages: catalogs.primary.catalog,
  files: [...files.values()],
  translation_key_references: keyReferences,
  dynamic_display_calls: runtimeBridges,
  assets,
  immutable_snapshot_files: excludedFiles,
  units,
};
// One item per line makes rg and bounded AI reads useful without expanding a
// multi-megabyte, deeply-indented JSON document into hundreds of thousands of lines.
const serialized = '{\n' + Object.entries(result).map(([key, value]) => `  ${JSON.stringify(key)}: ${Array.isArray(value) ? '[\n' + value.map((item) => '    ' + JSON.stringify(item)).join(',\n') + '\n  ]' : JSON.stringify(value, null, 2)}`).join(',\n') + '\n}\n';
if (options.check) {
  if (!existsSync(output) || readFileSync(output, 'utf8') !== serialized) { process.stderr.write('Inventory differs. Regenerate using the pinned sources and command in README.md.\n'); process.exitCode = 1; }
  else process.stdout.write('Inventory matches the supplied source snapshots.\n');
} else {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, serialized);
  process.stdout.write(`${relative(ROOT, output)}: ${units.length} source units; ${JSON.stringify(byBaseline)}\n`);
}

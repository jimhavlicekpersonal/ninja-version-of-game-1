/** Static rich text: translators can move trusted markup tokens, never add HTML. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { ROOT, formatSource, formatWorksheet, syncWorksheet } from './lib.mjs';
const files = ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai', 'account'];
function htmlFor(name) {
  const path = name === 'account' ? 'server/accountPage.ts' : `public/${name}.html`;
  const s = readFileSync(join(ROOT, path), 'utf8');
  return { path, html: name === 'account' ? s.slice(s.indexOf('return `') + 8, s.lastIndexOf('`;')) : s };
}
const decode = s => s.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&nbsp;', '\u00a0');
const encode = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function pageUnits() {
  const out = {};
  for (const name of files) {
    const {path, html} = htmlFor(name); let i = 0;
    // Whole paragraphs/rows keep grammar and links together. Empty legal spans are publisher facts.
    for (const m of html.matchAll(/<(title|h[1-6]|p|li|th|td|nav|footer|label|button)\b[^>]*>([\s\S]*?)<\/\1>|<div\b[^>]*class="draft"[^>]*>([\s\S]*?)<\/div>/g)) {
      const inner = m[2] ?? m[3]; const tokens = [];
      const en = decode(inner.replace(/<[^>]*>/g, tag => `{t${tokens.push(tag) - 1}}`));
      if (!/\p{L}/u.test(en.replace(/\{t\d+\}/g,''))) continue;
      const start = m.index + m[0].indexOf('>') + 1;
      out[`pages.${name}.${i++}`] = {file: path, name, start, end: start + inner.length, en, tokens, kind: 'html'};
    }
    for (const m of html.matchAll(/\b(data-unset|data-label|aria-label)="([^"]+)"/g)) {
      const start = m.index + m[0].indexOf('"') + 1;
      out[`pages.${name}.${i++}`] = {file:path,name,start,end:start+m[2].length,en:decode(m[2]),tokens:[],kind:'attribute'};
    }
    if (name === 'account') {
      const start = html.indexOf('<script>') + 8, end = html.indexOf('</script>', start);
      const sf = ts.createSourceFile('account.js', html.slice(start,end), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const walk = n => { if(ts.isStringLiteral(n) && /[A-Z][a-z]+(?: [a-z]+|…)/.test(n.text)) out[`pages.account.${i++}`] = {file:path,name,start:start+n.getStart(sf),end:start+n.end,en:n.text,tokens:[],kind:'script'};ts.forEachChild(n,walk); };walk(sf);
    }
  }
  return out;
}
export function extractPages() {
  const units=pageUnits();writeFileSync(join(ROOT,'locales/pages.sources.json'),JSON.stringify(units,null,2)+'\n');
  writeFileSync(join(ROOT,'locales/en/pages.json'),formatSource(Object.fromEntries(Object.entries(units).map(([k,v])=>[k,v.en]))));
  const path=join(ROOT,'locales/es/pages.json');let previous={};try{previous=JSON.parse(readFileSync(path,'utf8'));}catch{}
  writeFileSync(path,formatWorksheet(syncWorksheet(Object.fromEntries(Object.entries(units).map(([k,v])=>[k,v.en])),previous).worksheet));
}
export function buildPages(code) {
  const units=pageUnits(), ws=JSON.parse(readFileSync(join(ROOT,`locales/${code}/pages.json`),'utf8')); const result={};
  for (const name of files) {
    let {html}=htmlFor(name); const edits=[];
    for(const [key,u]of Object.entries(units).filter(([,u])=>u.name===name)) {
      const entry=ws[key]; if(!entry?.text || entry.en!==u.en) throw Error(`Untranslated or stale page: ${code}/${key}`);
      let value=entry.text;
      if(u.kind==='script')value=JSON.stringify(value);
      else {
        value=encode(value).replace(/\{t(\d+)\}/g,(_,i)=>u.tokens[Number(i)] ?? '');
        // Attribute translations inside an enclosing rich block are applied below, after block replacement.
      }
      if(u.kind!=='attribute')edits.push([u.start,u.end,value]);
    }
    for(const [start,end,text]of edits.sort((a,b)=>b[0]-a[0]))html=html.slice(0,start)+text+html.slice(end);
    for(const [key,u]of Object.entries(units).filter(([,u])=>u.name===name&&u.kind==='attribute')) html=html.replaceAll(`="${encode(u.en)}"`,`="${encode(ws[key].text)}"`);
    html=html.replace(/<html lang="[^"]+">/,`<html lang="${code}">`).replaceAll('href="./legal.css"','href="../legal.css"').replaceAll('src="./legal','src="../legal');
    // The account form must not expose English provider/network diagnostics.
    if(name==='account' && code==='es') html=html.replace('err.message;',"'No se pudo enviar la solicitud. Comprueba tus datos y tu conexión e inténtalo de nuevo.';");
    result[name]=html;
  }
  const dir=join(ROOT,'public',code);mkdirSync(dir,{recursive:true});for(const [name,html]of Object.entries(result))if(name!=='account')writeFileSync(join(dir,`${name}.html`),html);
  mkdirSync(join(ROOT,'locales/compiled'),{recursive:true});writeFileSync(join(ROOT,`locales/compiled/pages-${code}.json`),JSON.stringify(result));
  return result;
}
if(process.argv[2]==='extract')extractPages();

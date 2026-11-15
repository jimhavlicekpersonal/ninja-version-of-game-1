import spanishPages from '../locales/compiled/pages-es.json';
import hindiPages from '../locales/compiled/pages-hi.json';
import portuguesePages from '../locales/compiled/pages-pt.json';
import germanPages from '../locales/compiled/pages-de.json';
import frenchPages from '../locales/compiled/pages-fr.json';
import italianPages from '../locales/compiled/pages-it.json';
import chinesePages from '../locales/compiled/pages-zh-Hans.json';
import romanianPages from '../locales/compiled/pages-ro.json';
import catalanPages from '../locales/compiled/pages-ca.json';
import japanesePages from '../locales/compiled/pages-ja.json';
import dutchPages from '../locales/compiled/pages-nl.json';
import swedishPages from '../locales/compiled/pages-sv.json';
import danishPages from '../locales/compiled/pages-da.json';
import norwegianPages from '../locales/compiled/pages-nb.json';
import koreanPages from '../locales/compiled/pages-ko.json';
import thaiPages from '../locales/compiled/pages-th.json';
import traditionalChinesePages from '../locales/compiled/pages-zh-Hant.json';
import vietnamesePages from '../locales/compiled/pages-vi.json';
import arabicPages from '../locales/compiled/pages-ar.json';
import indonesianPages from '../locales/compiled/pages-id.json';
import russianPages from '../locales/compiled/pages-ru.json';
import turkishPages from '../locales/compiled/pages-tr.json';
import malayPages from '../locales/compiled/pages-ms.json';
import ukrainianPages from '../locales/compiled/pages-uk.json';
import polishPages from '../locales/compiled/pages-pl.json';
import czechPages from '../locales/compiled/pages-cs.json';
import slovakPages from '../locales/compiled/pages-sk.json';
import slovenianPages from '../locales/compiled/pages-sl.json';
import croatianPages from '../locales/compiled/pages-hr.json';
import hungarianPages from '../locales/compiled/pages-hu.json';
import finnishPages from '../locales/compiled/pages-fi.json';
import greekPages from '../locales/compiled/pages-el.json';
import hebrewPages from '../locales/compiled/pages-he.json';
import urduPages from '../locales/compiled/pages-ur.json';
import banglaPages from '../locales/compiled/pages-bn.json';
import odiaPages from '../locales/compiled/pages-or.json';
import punjabiPages from '../locales/compiled/pages-pa.json';
import marathiPages from '../locales/compiled/pages-mr.json';
import gujaratiPages from '../locales/compiled/pages-gu.json';
import kannadaPages from '../locales/compiled/pages-kn.json';
import tamilPages from '../locales/compiled/pages-ta.json';
import teluguPages from '../locales/compiled/pages-te.json';
import malayalamPages from '../locales/compiled/pages-ml.json';
import swahiliPages from '../locales/compiled/pages-sw.json';
import hausaPages from '../locales/compiled/pages-ha.json';
import yorubaPages from '../locales/compiled/pages-yo.json';
import igboPages from '../locales/compiled/pages-ig.json';
import zuluPages from '../locales/compiled/pages-zu.json';
import amharicPages from '../locales/compiled/pages-am.json';

/** Completed page translations (tools/i18n/pages.mjs, page `complaints`); every other locale gets English. */
const translatedPages: Record<string, { complaints?: string }> = { es: spanishPages, hi: hindiPages, pt: portuguesePages, de: germanPages, fr: frenchPages, it: italianPages, 'zh-Hans': chinesePages, ro: romanianPages, ca: catalanPages, ja: japanesePages, nl: dutchPages, sv: swedishPages, da: danishPages, nb: norwegianPages, ko: koreanPages, th: thaiPages, 'zh-Hant': traditionalChinesePages, vi: vietnamesePages, ar: arabicPages, id: indonesianPages, ru: russianPages, tr: turkishPages, ms: malayPages, uk: ukrainianPages, pl: polishPages, cs: czechPages, sk: slovakPages, sl: slovenianPages, hr: croatianPages, hu: hungarianPages, fi: finnishPages, el: greekPages, he: hebrewPages, ur: urduPages, bn: banglaPages, or: odiaPages, pa: punjabiPages, mr: marathiPages, gu: gujaratiPages, kn: kannadaPages, ta: tamilPages, te: teluguPages, ml: malayalamPages, sw: swahiliPages, ha: hausaPages, yo: yorubaPages, ig: igboPages, zu: zuluPages, am: amharicPages };

/**
 * The complaint form (GET /complaints, `?lang=<code>` for a completed language; core/complaints.ts takes
 * what it sends), served by the API so it posts to its own origin. Self-contained: no external fonts,
 * scripts or images. The template below is the English source of the `pages.complaints.*` translation
 * units (tools/i18n/pages.mjs reads it): keep it one template literal without `${}`. The support
 * address goes into the empty `data-contact-value` element; without one, the `data-contact` paragraph
 * is dropped. The form checks its fields with the same sentences the server would answer, so a player
 * reads them in the page's language; a refusal it did not foresee shows the server's English only on
 * the English page.
 */
export const COMPLAINT_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

export function complaintPage(supportContact?: string, locale = 'en'): string {
  const html = (Object.hasOwn(translatedPages, locale) ? translatedPages[locale].complaints : undefined) ?? complaintTemplate();
  const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  return supportContact
    ? html.replace('<b data-contact-value></b>', `<b>${esc(supportContact)}</b>`)
    : html.replace(/<p class="muted" data-contact>[\s\S]*?<\/p>\n?/, '');
}

function complaintTemplate(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Report illegal content · Kagemura</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f6f3ee;color:#222}main{max-width:640px;margin:auto;padding:16px}label{display:block;margin:12px 0 4px;font-weight:600}input,textarea{width:100%;box-sizing:border-box;font:inherit;padding:8px;border:1px solid #bbb;border-radius:6px}textarea{min-height:120px}button{margin-top:16px;font:inherit;padding:10px 16px;background:#c8402f;color:#fff;border:0;border-radius:6px}.muted{color:#555;font-size:14px}#out{margin-top:12px}</style>
</head><body><main>
<h1>Report illegal content</h1>
<p>Use this form to tell us about content in Kagemura: Ninja Clans that you believe is illegal or harmful: a player, Alliance or Gang name, or a chat message (EU Digital Services Act, UK Online Safety Act). In the game you can also report and block a player from the ⋯ menu next to their message or name.</p>
<p class="muted">If someone is in danger, contact your local emergency services first.</p>
<p class="muted" data-contact>Other questions: <b data-contact-value></b></p>
<label for="subject">What is it about?</label><input id="subject" maxlength="300" placeholder="A player name, Alliance or Gang name, or the message">
<label for="reason">Why is it illegal or harmful?</label><textarea id="reason" maxlength="2000"></textarea>
<label for="contact">Your email, if you want an answer (optional)</label><input id="contact" type="email" maxlength="200">
<label for="player">Your Player ID, if you play (optional)</label><input id="player" maxlength="64">
<button id="send">Send</button>
<p id="out" role="status"></p>
<p class="muted">We keep the complaint and the optional email address only to handle it, and delete them a year after it was handled.</p>
<script>
document.getElementById('send').onclick = async function () {
  var out = document.getElementById('out');
  var v = function (id) { return document.getElementById(id).value.trim(); };
  if (!v('subject')) { out.textContent = 'Say what the complaint is about (a player name, an Alliance or Gang, a message).'; return; }
  if (v('reason').length < 10) { out.textContent = 'Say why it is illegal or harmful (at least a sentence).'; return; }
  if (v('contact') && !/^[^ @]+@[^ @]+[.][^ @]+$/.test(v('contact'))) { out.textContent = 'The contact must be an email address (or leave it empty).'; return; }
  try {
    var res = await fetch('/v1/complaints', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject: v('subject'), reason: v('reason'), contact: v('contact'), playerId: v('player') }) });
    var data = await res.json();
    out.textContent = res.ok ? 'Thank you. Your complaint was received (reference ' + data.id + ').' : (document.documentElement.lang === 'en' && data.message) || 'The complaint could not be sent. Check what you entered and try again.';
  } catch (e) { out.textContent = 'The complaint could not be sent. Check your connection and try again.'; }
};
</script>
</main></body></html>`;
}

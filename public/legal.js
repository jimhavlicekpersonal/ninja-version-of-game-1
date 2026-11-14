/*
 * Fills the publisher facts from legal-config.js into the pages shipped with the game (privacy, support,
 * community rules, terms, and the Japanese notices). <x data-legal="supportEmail"> gets the value (an email,
 * a web address or a page shipped next to this one, "./terms.html", becomes a link); an empty value shows a
 * visible "not set yet" note instead of an invented one. <x data-legal-if="termsUrl"> shows only when set;
 * <x data-legal-unless="termsEffective"> shows only while it is empty (the draft banner of terms.html).
 */
(function () {
  var cfg = window.KAGEMURA_LEGAL || {};
  // Pages built for a translated language (tools/i18n/pages.mjs) set <html lang>.
  var UNSET = { en: 'not published yet', es: 'aún no publicado', hi: 'अभी प्रकाशित नहीं हुआ', pt: 'ainda não publicado', de: 'noch nicht veröffentlicht', fr: 'pas encore publié', it: 'non ancora pubblicato', 'zh-Hans': '尚未公布', ro: 'nepublicat încă', ca: 'encara no publicat', ja: '未公開', nl: 'nog niet gepubliceerd', sv: 'ännu inte publicerat', da: 'endnu ikke offentliggjort', nb: 'ikke publisert ennå', ko: '미공개', th: 'ยังไม่เผยแพร่', 'zh-Hant': '尚未公布', vi: 'chưa công bố', id: 'belum diterbitkan', ms: 'belum diterbitkan', tr: 'henüz yayımlanmadı', ru: 'пока не опубликовано', uk: 'ще не опубліковано', pl: 'jeszcze nieopublikowane', cs: 'zatím nezveřejněno', sk: 'zatiaľ nezverejnené', sl: 'še ni objavljeno', hr: 'još nije objavljeno', hu: 'még nincs közzétéve', fi: 'ei vielä julkaistu', el: 'δεν έχει δημοσιευτεί ακόμα', he: 'עוד לא פורסם', ur: 'ابھی شائع نہیں ہوا', bn: 'এখনও প্রকাশিত হয়নি', or: 'ଏପର୍ଯ୍ୟନ୍ତ ପ୍ରକାଶିତ ହୋଇନାହିଁ', pa: 'ਅਜੇ ਪ੍ਰਕਾਸ਼ਿਤ ਨਹੀਂ', mr: 'अजून प्रकाशित केलेले नाही', gu: 'હજુ પ્રકાશિત થયું નથી', kn: 'ಇನ್ನೂ ಪ್ರಕಟಿಸಿಲ್ಲ', ta: 'இன்னும் வெளியிடப்படவில்லை', te: 'ఇంకా ప్రచురించలేదు', ml: 'ഇതുവരെ പ്രസിദ്ധീകരിച്ചിട്ടില്ല', sw: 'bado haijachapishwa', ha: 'ba a wallafa ba tukuna', yo: 'a kò tíì tẹ̀ ẹ́ jáde', ig: 'ebipụtabeghị', zu: 'akukashicilelwa', am: 'ገና አልታተመም' };
  function fill() {
    var els = document.querySelectorAll('[data-legal]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-legal');
      var v = String(cfg[key] || '').trim();
      el.textContent = '';
      if (!v) {
        var s = document.createElement('span');
        s.className = 'unset';
        s.textContent = el.getAttribute('data-unset') || UNSET[document.documentElement.lang] || UNSET.en;
        el.appendChild(s);
      } else if (/^[^\s@]+@[^\s@]+$/.test(v) || /^https?:\/\//i.test(v) || /^\.\/[\w.-]+$/.test(v)) {
        var a = document.createElement('a');
        a.href = /^[^\s@]+@[^\s@]+$/.test(v) ? 'mailto:' + v : v;
        var lang = document.documentElement.lang;
        if (key === 'deletionUrl' && lang && lang !== 'en' && UNSET[lang]) a.href += (a.href.indexOf('?') < 0 ? '?' : '&') + 'lang=' + encodeURIComponent(lang);
        a.textContent = el.getAttribute('data-label') || v;
        el.appendChild(a);
      } else {
        el.textContent = v;
      }
    }
    var opt = document.querySelectorAll('[data-legal-if]');
    for (var j = 0; j < opt.length; j++) opt[j].hidden = !String(cfg[opt[j].getAttribute('data-legal-if')] || '').trim();
    var neg = document.querySelectorAll('[data-legal-unless]');
    for (var k = 0; k < neg.length; k++) neg[k].hidden = !!String(cfg[neg[k].getAttribute('data-legal-unless')] || '').trim();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill);
  else fill();
})();

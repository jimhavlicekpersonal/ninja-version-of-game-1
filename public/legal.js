/*
 * Fills the publisher facts from legal-config.js into privacy.html, support.html and community.html.
 * <x data-legal="supportEmail"> gets the value (an email or web address becomes a link); an empty value shows
 * a visible "not set yet" note instead of an invented one. <x data-legal-if="termsUrl"> shows only when set.
 */
(function () {
  var cfg = window.KAGEMURA_LEGAL || {};
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
        s.textContent = el.getAttribute('data-unset') || 'not published yet';
        el.appendChild(s);
      } else if (/^[^\s@]+@[^\s@]+$/.test(v) || /^https?:\/\//i.test(v)) {
        var a = document.createElement('a');
        a.href = /^https?:/i.test(v) ? v : 'mailto:' + v;
        a.textContent = el.getAttribute('data-label') || v;
        el.appendChild(a);
      } else {
        el.textContent = v;
      }
    }
    var opt = document.querySelectorAll('[data-legal-if]');
    for (var j = 0; j < opt.length; j++) opt[j].hidden = !String(cfg[opt[j].getAttribute('data-legal-if')] || '').trim();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill);
  else fill();
})();

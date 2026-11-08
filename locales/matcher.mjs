// ES5-compatible function body: used by the app and inlined before its module.
export var LANGUAGE_ALIASES = { iw: 'he', in: 'id', ji: 'yi', tl: 'fil', no: 'nb', nn: 'nb', 'zh-cn': 'zh-Hans', 'zh-sg': 'zh-Hans', 'zh-tw': 'zh-Hant', 'zh-hk': 'zh-Hant', 'zh-mo': 'zh-Hant', zh: 'zh-Hans' };
export function matchLanguage(device, shipped, aliases) {
  aliases = aliases || LANGUAGE_ALIASES;
  var lower = {}, i, tag, raw, cut, hit;
  for (i = 0; i < shipped.length; i++) lower[shipped[i].toLowerCase()] = shipped[i];
  for (i = 0; i < device.length; i++) {
    raw = device[i]; if (!raw || typeof raw !== 'string') continue;
    tag = raw.replace(/_/g, '-').toLowerCase();
    if (/^zh(?:-|$)/.test(tag)) {
      if (/-hant\b|-(tw|hk|mo)\b/.test(tag) && lower['zh-hant']) return lower['zh-hant'];
      if (lower['zh-hans']) return lower['zh-hans'];
    }
    while (tag) {
      hit = lower[tag] || (aliases[tag] && lower[aliases[tag].toLowerCase()]);
      if (hit) return hit;
      cut = tag.lastIndexOf('-'); tag = cut > 0 ? tag.slice(0, cut) : '';
    }
  }
  return 'en';
}

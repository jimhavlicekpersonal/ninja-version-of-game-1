/** All completed text packs ship with the server. Locale belongs to the device. */
import spanish from '../locales/compiled/es.json';
import hindi from '../locales/compiled/hi.json';
import portuguese from '../locales/compiled/pt.json';
import german from '../locales/compiled/de.json';
import french from '../locales/compiled/fr.json';
import italian from '../locales/compiled/it.json';
import chinese from '../locales/compiled/zh-Hans.json';
import romanian from '../locales/compiled/ro.json';
import catalan from '../locales/compiled/ca.json';
import japanese from '../locales/compiled/ja.json';
import dutch from '../locales/compiled/nl.json';
import swedish from '../locales/compiled/sv.json';
import danish from '../locales/compiled/da.json';
import norwegian from '../locales/compiled/nb.json';
import korean from '../locales/compiled/ko.json';
import thai from '../locales/compiled/th.json';
import { ENGLISH, sourceText, type Catalog } from '../locales/runtime';
const catalogs: Record<string, Catalog> = { en: ENGLISH, es: spanish, hi: hindi, pt: portuguese, de: german, fr: french, it: italian, 'zh-Hans': chinese, ro: romanian, ca: catalan, ja: japanese, nl: dutch, sv: swedish, da: danish, nb: norwegian, ko: korean, th: thai };
export function notificationText(text: string, locale = 'en'): string {
  const code = Object.hasOwn(catalogs, locale) ? locale : 'en';
  return sourceText(text, code, catalogs[code]);
}

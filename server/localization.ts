/** All completed text packs ship with the server. Locale belongs to the device. */
import spanish from '../locales/compiled/es.json';
import hindi from '../locales/compiled/hi.json';
import { ENGLISH, sourceText, type Catalog } from '../locales/runtime';
const catalogs: Record<string, Catalog> = { en: ENGLISH, es: spanish, hi: hindi };
export function notificationText(text: string, locale = 'en'): string {
  const code = Object.hasOwn(catalogs, locale) ? locale : 'en';
  return sourceText(text, code, catalogs[code]);
}

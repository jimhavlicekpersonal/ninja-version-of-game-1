/** Static rich text: translators can move trusted markup tokens, never add HTML. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { ROOT, formatSource, formatWorksheet, syncWorksheet } from './lib.mjs';
const files = ['privacy', 'support', 'community', 'terms', 'tokushoho', 'shikin-kessai', 'account'];
/** The account form's fallback for a failed request (it would otherwise show the browser's English error). Add one per completed language. */
const ACCOUNT_FAILURE = {
  es: 'No se pudo enviar la solicitud. Comprueba tus datos y tu conexión e inténtalo de nuevo.',
  hi: 'अनुरोध नहीं भेजा जा सका। अपनी जानकारी और इंटरनेट कनेक्शन जाँचें और फिर से कोशिश करें।',
  pt: 'Não foi possível enviar o pedido. Confira seus dados e sua conexão e tente de novo.',
  de: 'Die Anfrage konnte nicht gesendet werden. Prüfe deine Angaben und deine Verbindung und versuche es erneut.',
  fr: 'La demande n’a pas pu être envoyée. Vérifie tes informations et ta connexion, puis réessaie.',
  it: 'Non è stato possibile inviare la richiesta. Controlla i dati e la connessione e riprova.',
  'zh-Hans': '请求没有发送成功。请检查你填写的信息和网络连接，然后重试。',
  ro: 'Cererea nu a putut fi trimisă. Verifică datele și conexiunea și încearcă din nou.',
  ca: 'No s’ha pogut enviar la sol·licitud. Comprova les dades i la connexió i torna-ho a provar.',
  ja: 'リクエストを送信できませんでした。入力内容と接続を確認して、もう一度お試しください。',
  nl: 'Het verzoek kon niet worden verstuurd. Controleer je gegevens en je verbinding en probeer het opnieuw.',
  sv: 'Begäran kunde inte skickas. Kontrollera uppgifterna och anslutningen och försök igen.',
  da: 'Anmodningen kunne ikke sendes. Tjek dine oplysninger og din forbindelse, og prøv igen.',
  nb: 'Forespørselen kunne ikke sendes. Sjekk opplysningene og tilkoblingen, og prøv igjen.',
  ko: '요청을 보내지 못했어요. 입력한 내용과 연결을 확인하고 다시 시도하세요.',
  th: 'ส่งคำขอไม่สำเร็จ ตรวจสอบข้อมูลและการเชื่อมต่อแล้วลองอีกครั้ง',
  'zh-Hant': '請求沒有成功送出。請檢查你填寫的資料和網路連線，然後再試一次。',
  vi: 'Không gửi được yêu cầu. Hãy kiểm tra thông tin và kết nối rồi thử lại.',
  id: 'Permintaan tidak bisa dikirim. Periksa datamu dan koneksimu, lalu coba lagi.',
  ms: 'Permintaan tidak dapat dihantar. Semak butiran dan sambungan kamu, kemudian cuba lagi.',
  tr: 'İstek gönderilemedi. Bilgilerini ve bağlantını kontrol edip tekrar dene.',
  ru: 'Не удалось отправить запрос. Проверь данные и подключение к сети и попробуй ещё раз.',
  uk: 'Не вдалося надіслати запит. Перевірте дані та з’єднання з мережею і спробуйте ще раз.',
  pl: 'Nie udało się wysłać prośby. Sprawdź dane i połączenie z internetem, a potem spróbuj ponownie.',
  cs: 'Žádost se nepodařilo odeslat. Zkontroluj své údaje a připojení a zkus to znovu.',
  sk: 'Žiadosť sa nepodarilo odoslať. Skontroluj svoje údaje a pripojenie a skús to znova.',
  sl: 'Zahteve ni bilo mogoče poslati. Preveri svoje podatke in povezavo ter poskusi znova.',
  hr: 'Zahtjev nije moguće poslati. Provjeri svoje podatke i vezu pa pokušaj ponovno.',
  hu: 'A kérést nem sikerült elküldeni. Ellenőrizd az adataidat és a kapcsolatot, majd próbáld újra.',
  fi: 'Pyyntöä ei voitu lähettää. Tarkista tietosi ja yhteytesi ja yritä uudelleen.',
  el: 'Δεν ήταν δυνατή η αποστολή του αιτήματος. Έλεγξε τα στοιχεία σου και τη σύνδεσή σου και δοκίμασε ξανά.',
  he: 'לא ניתן היה לשלוח את הבקשה. בדקו את הפרטים ואת החיבור ונסו שוב.',
  ur: 'درخواست بھیجی نہیں جا سکی۔ اپنی تفصیلات اور کنکشن چیک کریں اور دوبارہ کوشش کریں۔',
  bn: 'অনুরোধটি পাঠানো যায়নি। আপনার তথ্য ও সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।',
  or: 'ଅନୁରୋଧ ପଠାଯାଇପାରିଲା ନାହିଁ। ଆପଣଙ୍କ ବିବରଣୀ ଓ ସଂଯୋଗ ଯାଞ୍ଚ କରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।',
  pa: 'ਬੇਨਤੀ ਭੇਜੀ ਨਹੀਂ ਜਾ ਸਕੀ। ਆਪਣੇ ਵੇਰਵੇ ਅਤੇ ਕਨੈਕਸ਼ਨ ਜਾਂਚੋ ਅਤੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
  mr: 'विनंती पाठवता आली नाही. तुमची माहिती आणि कनेक्शन तपासा आणि पुन्हा प्रयत्न करा.',
  gu: 'વિનંતી મોકલી શકાઈ નહીં. તમારી વિગતો અને કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.',
  kn: 'ವಿನಂತಿಯನ್ನು ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ. ನಿಮ್ಮ ವಿವರಗಳು ಮತ್ತು ಸಂಪರ್ಕವನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  ta: 'கோரிக்கையை அனுப்ப முடியவில்லை. உங்கள் விவரங்களையும் இணைய இணைப்பையும் சரிபார்த்து மீண்டும் முயலுங்கள்.',
  te: 'అభ్యర్థనను పంపలేకపోయాం. మీ వివరాలు, ఇంటర్నెట్ కనెక్షన్ సరిచూసి మళ్లీ ప్రయత్నించండి.',
  ml: 'അഭ്യർത്ഥന അയയ്ക്കാനായില്ല. നിങ്ങളുടെ വിവരങ്ങളും കണക്ഷനും പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കുക.',
  sw: 'Ombi halikuweza kutumwa. Angalia taarifa zako na muunganisho wako, kisha ujaribu tena.',
  ha: 'Ba a iya aika buƙatar ba. Ku duba bayananku da haɗin intanet ɗinku, sannan ku sake gwadawa.',
  yo: 'A kò lè fi ìbéèrè náà ránṣẹ́. Ṣàyẹ̀wò àwọn àlàyé rẹ àti ìsopọ̀ rẹ, kí o sì gbìyànjú lẹ́ẹ̀kan sí i.',
  ig: 'Enweghị ike iziga arịrịọ ahụ. Lelee nkọwa gị na njikọ gị, wee nwaa ọzọ.',
  zu: 'Isicelo asikwazanga ukuthunyelwa. Hlola imininingwane yakho nokuxhumana kwakho, bese uzama futhi.',
  am: 'ጥያቄው ሊላክ አልቻለም። ዝርዝሮችዎንና ግንኙነትዎን አረጋግጠው እንደገና ይሞክሩ።',
};
function htmlFor(name) {
  const path = name === 'account' ? 'server/accountPage.ts' : `public/${name}.html`;
  const s = readFileSync(join(ROOT, path), 'utf8');
  return { path, html: name === 'account' ? s.slice(s.indexOf('return `') + 8, s.lastIndexOf('`;')) : s };
}
const decode = s => s.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&nbsp;', '\u00a0');
const encode = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function pageUnits(names = files) {
  const out = {};
  for (const name of names) {
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
export function buildPages(code, { names = files, writePublic = true } = {}) {
  const units=pageUnits(names), ws=JSON.parse(readFileSync(join(ROOT,`locales/${code}/pages.json`),'utf8')); const result={};
  for (const name of names) {
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
    if(name==='account' && ACCOUNT_FAILURE[code]) html=html.replace('err.message;',JSON.stringify(ACCOUNT_FAILURE[code])+';');
    result[name]=html;
  }
  if (writePublic) {
    const dir=join(ROOT,'public',code);mkdirSync(dir,{recursive:true});for(const [name,html]of Object.entries(result))if(name!=='account')writeFileSync(join(dir,`${name}.html`),html);
  }
  mkdirSync(join(ROOT,'locales/compiled'),{recursive:true});writeFileSync(join(ROOT,`locales/compiled/pages-${code}.json`),JSON.stringify(result));
  return result;
}
if(process.argv[2]==='extract')extractPages();

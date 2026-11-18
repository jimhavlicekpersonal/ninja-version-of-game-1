/**
 * P7-07 (PUB-10): per-language word lists for chat and names. Each list catches its words (chat and names, both
 * matching modes) and lets a corpus of ordinary sentences in every launch language through untouched: every list
 * applies to every line, so a word that is ordinary in another language would be a false positive.
 */
import { describe, expect, it } from 'vitest';
import { censorText, filterText } from '../../../src/gameplay/sim/social/grove';
import { defaultData as data } from '../../../src/gameplay/sim/data';

const CORPUS: Record<string, string[]> = {
  en: ['Great raid, thanks for the warriors!', 'Can someone send Kunai Adepts? I need class help for the assault.', 'The Shadow Trials are hard at tier 40.', 'Assemble at the east gate, the Keep is weak.'],
  es: ['¡Buen ataque! Gracias por los guerreros.', '¿Alguien puede enviar arqueros? Necesito ayuda con la computadora.', 'Vamos con todo contra el clan, la puerta este está débil.', 'Mi hermano juega conmigo, es muy bueno.', 'Esta computadora funciona con el disco nuevo.'],
  pt: ['Ótimo ataque, obrigado pelos guerreiros!', 'Alguém pode mandar arqueiros? Meu computador está lento.', 'Vamos atacar a porta leste, a fortaleza está fraca.', 'Que bela vila, parabéns pelo progresso.'],
  fr: ['Super raid, merci pour les guerriers !', 'Quelqu’un peut envoyer des archers ? Le concert est ce soir.', 'On attaque la porte est, le donjon est faible.', 'Bonne chance pour la saison, connaisseur du clan.'],
  de: ['Toller Angriff, danke für die Krieger!', 'Kann jemand Bogenschützen schicken? Die Schlange ist lang.', 'Wir greifen das Osttor an, die Burg ist schwach.', 'Schöne Grüße an alle, bis morgen.'],
  ru: ['Отличный набег, спасибо за воинов!', 'Кто-нибудь может прислать лучников? Нужна помощь.', 'Атакуем восточные ворота, крепость слабая.', 'Сукно и сахар купили на рынке.'],
  ja: ['ナイスな襲撃、戦士をありがとう！', '約束どおり明日また攻めよう。', '東の門から行こう、城が弱い。', 'みんな、よろしくお願いします。', '死角に気をつけて。'],
  ko: ['좋은 습격이었어요, 전사 고마워요!', '누가 궁수 좀 보내 줄 수 있나요?', '동쪽 문으로 가요, 성이 약해요.', '내일 또 같이 해요.'],
  'zh-Hans': ['打得好，谢谢你的战士！', '谁能派些弓箭手来？', '我妈的手机坏了，明天再玩。', '从东门进攻，城堡很弱。'],
  ar: ['غارة رائعة، شكرًا على المحاربين!', 'هل يمكن لأحد إرسال رماة؟', 'نهاجم البوابة الشرقية، القلعة ضعيفة.', 'الكلب الصغير يلعب في الحديقة.'],
  hi: ['बढ़िया हमला, योद्धाओं के लिए धन्यवाद!', 'क्या कोई तीरंदाज़ भेज सकता है?', 'पूर्वी द्वार से हमला करो, किला कमज़ोर है।', 'कल फिर खेलेंगे, शुभ रात्रि।'],
};

const lists = Object.entries(data.social.profanityByLanguage ?? {}).filter(([k, v]) => !k.startsWith('$') && Array.isArray(v)) as [string, string[]][];

describe('per-language word lists (P7-07)', () => {
  it('ten launch languages have a list, each conservative', () => {
    expect(lists.map(([k]) => k).sort()).toEqual(['ar', 'de', 'es', 'fr', 'hi', 'ja', 'ko', 'pt', 'ru', 'zh-Hans']);
    for (const [, words] of lists) expect(words.length).toBeGreaterThanOrEqual(5);
  });

  for (const [code, sentences] of Object.entries(CORPUS)) {
    it(`${code}: ordinary sentences pass untouched, as chat and as names`, () => {
      for (const s of sentences) {
        expect(censorText(s, data), s).toBe(s.normalize('NFC'));
        expect(filterText(s, data), s).toBe(s.normalize('NFC'));
      }
    });
  }

  it("every list's words are censored in chat and in a name, with word edges and inside unspaced scripts", () => {
    for (const [code, words] of lists) {
      for (const w of words) {
        const line = `ok ${w} ok`;
        expect(censorText(line, data), `${code}: ${w}`).not.toContain(w);
        expect(censorText(`Ninja ${w}`, data), `${code} name: ${w}`).not.toContain(w);
      }
    }
    // Unspaced scripts match inside a run of text; spaced ones only at word edges.
    expect(censorText('お前は死ねと言った', data)).not.toContain('死ね');
    expect(censorText('你这个傻逼啊', data)).not.toContain('傻逼');
    expect(censorText('Mierdas', data)).toBe('Mierdas');
  });
});

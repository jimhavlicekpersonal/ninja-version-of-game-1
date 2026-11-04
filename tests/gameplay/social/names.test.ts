/** Player and Alliance names in every script (src/gameplay/sim/social/names.ts). */
import { describe, expect, it } from 'vitest';
import { checkName, isolateName, nameWidth, sanitizeName, scriptsMayMix } from '../../../src/gameplay/sim/social/names';
import { filterText } from '../../../src/gameplay/sim/social/grove';
import { defaultData as data } from '../../../src/gameplay/sim/data';

const ok = (s: string) => {
  const c = checkName(s);
  expect(c.error, `${s} → ${c.name}`).toBeUndefined();
  return c.name;
};

describe('names in native scripts', () => {
  it('accepts names written in each launch language family', () => {
    for (const n of [
      'Pip the Bold',
      '忍者',
      '影村の風',
      'カゲムラー',
      '李小龍',
      '張ㄅㄆ',
      '김민준',
      'ㅋㅋㅋ',
      'محمد',
      'مـحـمـد',
      'علی‌رضا',
      'نور الهدى',
      'נועה',
      'अर्जुन',
      'नमस्ते',
      'রবীন্দ্র',
      'ਗੁਰਪ੍ਰੀਤ',
      'ગુજરાતી',
      'ଓଡ଼ିଆ',
      'தமிழ்செல்வன்',
      'సాయి',
      'ಕನ್ನಡ',
      'മലയാളം',
      'ภูมิพัฒน์',
      'Ηλίας',
      'Иван Грозный',
      'Тарас',
      'ሰላም',
      'Nguyễn Văn An',
      'Adébáyọ̀',
      'Ọ̀kọ̀nkwọ',
      'Ɗanjuma',
      'Çağrı Öztürk',
      'Zoë-Ann O’Neil',
      'Ali علي',
      '田中 Ken',
      'Kai 🔥',
      '١٢٣ علي',
    ]) {
      expect(ok(n)).toBe(n.normalize('NFC'));
    }
  });

  it('keeps the Persian and Indic joiners the spelling needs, and emoji sequences', () => {
    expect(sanitizeName('می‌خواهم')).toBe('می‌خواهم');
    expect(sanitizeName('क्‍ष')).toBe('क्‍ष');
    expect(sanitizeName('👨‍👩‍👧 Clan')).toBe('👨‍👩‍👧 Clan');
  });

  it('normalises what phones type differently into one spelling', () => {
    expect(sanitizeName('Việt')).toBe('Việt');
    expect(sanitizeName('Ｐｉｐ　Ｔｈｅ　Ｂｏｌｄ')).toBe('Pip The Bold');
    expect(sanitizeName('  多   空格  ')).toBe('多 空格');
  });

  it('removes invisible, direction-flipping and look-alike characters', () => {
    expect(sanitizeName('‮evil‬')).toBe('evil');
    expect(sanitizeName('⁦Pip⁩')).toBe('Pip');
    expect(sanitizeName('a​dmin')).toBe('admin');
    expect(sanitizeName('ad‌min')).toBe('admin');
    expect(sanitizeName('Kai$%^<b>')).toBe('Kaib');
    expect(checkName('𝐀𝐝𝐦𝐢𝐧').error).toBe('empty');
    expect(sanitizeName('\u0000Pip\u0007')).toBe('Pip');
  });

  it('refuses script mixes that fake another name', () => {
    expect(checkName('pаypal').error).toBe('mixed_scripts'); // Cyrillic а
    expect(checkName('Иван Ivan').error).toBe('mixed_scripts');
    expect(checkName('Ηλίας Иван').error).toBe('mixed_scripts');
    expect(checkName('محمد נועה').error).toBe('mixed_scripts');
    expect(scriptsMayMix(new Set(['Latin', 'Han', 'Hiragana', 'Katakana']))).toBe(true);
    expect(scriptsMayMix(new Set(['Latin', 'Arabic']))).toBe(true);
    expect(scriptsMayMix(new Set(['Latin', 'Greek']))).toBe(false);
  });

  it('measures length by what the name looks like, not by bytes', () => {
    expect(nameWidth('Pip')).toBe(3);
    expect(nameWidth('忍者')).toBe(4);
    expect(nameWidth('नमस्ते')).toBe(3);
    expect(nameWidth('ｶｹﾞ')).toBe(2); // half-width kana are narrow; ﾞ joins the letter before it
    expect(sanitizeName('a'.repeat(40))).toHaveLength(24);
    expect(Array.from(sanitizeName('あ'.repeat(40)))).toHaveLength(12);
    // A cut never splits a character in two.
    expect(sanitizeName('🔥'.repeat(20))).toBe('🔥'.repeat(12));
    expect(sanitizeName('नमस्ते'.repeat(10)).endsWith('ते')).toBe(true);
  });

  it('allows a one-character CJK name but not a one-letter Latin one', () => {
    expect(checkName('影').error).toBeUndefined();
    expect(checkName('a').error).toBe('short');
    expect(checkName('   ').error).toBe('empty');
    expect(checkName('🔥🔥').error).toBe('empty');
  });

  it('caps stacked marks so a name cannot bleed over the screen', () => {
    const zalgo = 'Z' + '̶̡̛͍̭̐̊̈́̈́'.repeat(3) + 'ed';
    const clean = sanitizeName(zalgo);
    expect(Array.from(clean.normalize('NFD')).filter((c) => /\p{M}/u.test(c)).length).toBeLessThanOrEqual(5);
    expect(clean.endsWith('ed')).toBe(true);
  });

  it('isolates a name inside a sentence', () => {
    expect(isolateName('محمد')).toBe('⁨محمد⁩');
  });
});

describe('the word filter works in every script', () => {
  it('still filters English and keeps clean text', () => {
    expect(filterText('you are so stupid', data)).not.toContain('stupid');
    expect(filterText('have a lovely day', data)).toBe('have a lovely day');
    expect(filterText('stupidity is a word', data)).toBe('stupidity is a word');
  });

  it('finds words next to non-Latin text and never cuts a character in half', () => {
    expect(filterText('Иван stupid!', data)).toBe('Иван ✿✿✿✿✿!');
    expect(Array.from(filterText('🔥'.repeat(200), data))).toHaveLength(160);
  });

  it('matches words of unspaced scripts inside a sentence', () => {
    const withJa = { ...data, social: { ...data.social, profanity: ['ばか'] } };
    expect(filterText('おまえはばかだ', withJa)).toBe('おまえは✿✿だ');
    const withRu = { ...data, social: { ...data.social, profanity: ['дурак'] } };
    expect(filterText('ты дурак!', withRu)).toBe('ты ✿✿✿✿✿!');
    expect(filterText('дураки', withRu)).toBe('дураки');
  });
});

/**
 * Remnant audit (2026-11-06) merged with the Spanish release: the wording that changed (storage-full,
 * "troops" -> "warriors", the donation chat, preset chat) still reaches Spanish players in Spanish.
 */
import { afterEach, describe, expect, it } from 'vitest';
import spanish from '../../locales/compiled/es.json';
import { installCatalog, sourceText, translate } from '../../locales/runtime';
import { chatText, useLanguage } from '../../src/presentation/ui/i18n';
import { PRESET_CHAT_RETIRED, presetChatId } from '../../src/backend/net/protocol';
import { ledgerReason } from '../../src/presentation/ui/ledgerReason';
import { labelText } from '../../locales/runtime';

afterEach(() => useLanguage('en'));

describe('changed wording in Spanish', () => {
  it('translates the sim and server messages the game now writes', () => {
    expect(sourceText('No room for more Coins. Upgrade your Treasury or build another.', 'es', spanish)).toBe('No hay espacio para más Monedas: mejora tu Tesorería o construye más.');
    expect(sourceText('Not enough of that warrior.', 'es', spanish)).toBe('No hay suficientes guerreros de ese tipo.');
    expect(sourceText('Could anyone spare 6 housing of warriors?', 'es', spanish)).toBe('¿Alguien puede donar guerreros que ocupen 6 espacios?');
    expect(sourceText('Sent 2 × Shinobi to Ann.', 'es', spanish)).toBe('Se enviaron 2 × Shinobi a Ann.');
    expect(sourceText('Ann sent you 3 × Shinobi.', 'es', spanish)).toBe('Ann te envió 3 × Shinobi.');
    // Chat written by older servers keeps translating.
    expect(sourceText('Could anyone spare 6 housing of troops?', 'es', spanish)).toBe('¿Alguien puede donar guerreros que ocupen 6 espacios?');
    expect(sourceText('Sent 2 Shinobis to Ann.', 'es', spanish)).toBe('Se enviaron 2 × Shinobi a Ann.');
  });

  it('translates new interface text, the Scroll bonus from data and the refused-raid reasons', () => {
    expect(translate('store.calendarLook', {}, 'es', spanish)).toBe('Recompensa del calendario de 28 días');
    expect(translate('ui.premium_active_builds_are_20_faster_5eb0f4e244', { pct: 25 }, 'es', spanish)).toBe('Prémium activo: construcciones un 25% más rápidas');
    expect(translate('purchase.refunded', { n: 2 }, 'es', spanish)).toContain('reembolsó 2 compras');
    expect(translate('ui.the_server_did_not_accept_your_raid_on_844fc2eef5', { arg1: 'Ann', arg2: ` ${translate('raid.rejected.expired', {}, 'es', spanish)}` }, 'es', spanish)).toBe('El servidor no aceptó tu saqueo a Ann. Cuenta como práctica: sin botín ni honor. El informe llegó demasiado tarde.');
  });

  it('shows retired preset chat as the phrase it became, in the reader\'s language', async () => {
    installCatalog('es', spanish);
    await useLanguage('es');
    const retired = Object.keys(PRESET_CHAT_RETIRED)[0];
    expect(chatText({ kind: 'chat', text: retired, presetId: presetChatId(retired) })).toBe('¡Gracias por los guerreros!');
  });

  it('has a Spanish word for every ledger reason', () => {
    for (const code of ['purchase:apple', 'refund:google', 'refund-reversed:apple', 'staff:note', 'command:claimStipend', 'gangwar:chest', 'import', 'something:new']) {
      const english = ledgerReason(code);
      expect(labelText(english, 'es', spanish), code).not.toBe(english);
    }
  });
});

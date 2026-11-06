/**
 * Remnant audit (2026-11-06): the player's ledger showed codes ("+600 Jade purchase:apple",
 * "refund:google", a staff note). Every reason the server writes reads as words.
 */
import { expect, it } from 'vitest';
import { PLAYER_COMMANDS } from '../../src/gameplay/sim/serverEconomy';
import { ledgerReason } from '../../src/presentation/ui/ledgerReason';

it('turns every ledger reason the server writes into words, never a code', () => {
  const server = ['start', 'purchase:apple', 'purchase:google', 'refund:apple', 'refund:google', 'refund-reversed:apple', 'refund-reversed:google', 'staff:goodwill after outage', 'staff:age-reset', 'import', 'attack:loot', 'attack:loot:uploaded-base', 'attack:loot:generated-base', 'attack:troops', 'defense:loss', 'war:chest', 'war:troops', 'gangwar:chest', 'gangwar:troops', 'donation:sent', 'donation:received', 'purchase:unverified'];
  const commands = [...PLAYER_COMMANDS].map((c) => `command:${c}`);
  for (const code of [...server, ...commands, 'something:new']) {
    const words = ledgerReason(code);
    expect(words, code).not.toMatch(/[:_]/);
    expect(words, code).not.toBe(code);
  }
  expect(ledgerReason('purchase:apple')).toBe('Purchase');
  expect(ledgerReason('refund:google')).toBe('Refunded purchase taken back');
  expect(ledgerReason('staff:internal note')).toBe('Support adjustment');
});

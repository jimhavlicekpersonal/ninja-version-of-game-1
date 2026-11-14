/**
 * Ledger reasons in words (Settings → Online play → Village on the server → Recent changes). The server
 * writes codes such as `command:collect`, `purchase:apple` or `staff:<note>`; players see words, never a
 * code (remnant audit 2026-11-06: purchases and refunds showed as "+600 Jade purchase:apple").
 */
export function ledgerReason(code: string): string {
  const words: Record<string, string> = {
    start: 'Starting resources',
    'command:collect': 'Collected',
    'command:place': 'Built',
    'command:upgrade': 'Upgrade',
    'command:cancel': 'Cancelled (refund)',
    'command:clear': 'Cleared',
    'command:train': 'Training',
    'command:trainArmy': 'Training',
    'command:dismiss': 'Sent warriors home',
    'command:cancelTraining': 'Training cancelled',
    'command:research': 'Research',
    'command:cancelResearch': 'Research cancelled',
    'command:skip': 'Finished with Jade',
    'command:skipTraining': 'Finished with Jade',
    'command:skipResearch': 'Finished with Jade',
    'command:topUp': 'Bought with Jade',
    'command:openDailyChest': 'Daily chest',
    'command:scout': 'Next opponent',
    'command:trialEnd': 'Shadow Trial',
    'command:buySkin': 'Look bought',
    'command:claimTask': 'Task reward',
    'command:claimTier': 'Pass reward',
    'command:claimAchievement': 'Achievement',
    'purchase:unverified': 'Purchase',
    'attack:loot': 'Raid loot',
    'attack:loot:uploaded-base': 'Raid loot',
    'attack:loot:generated-base': 'Raid loot',
    'defense:loss': 'Raided',
    'war:chest': 'Alliance War chest',
    'donation:sent': 'Warriors sent',
    'donation:received': 'Warriors received',
    // Remnant audit (2026-11-06): these showed as raw codes ("+600 Jade purchase:apple").
    'command:claimStipend': 'Clan Stipend',
    'command:claimCalendar': '28-day calendar',
    'command:bountyEnd': 'Bounty Hunt',
    'command:rematchEnd': 'Settle-the-score rematch',
    'command:trialAlternate': 'Shadow Trial',
    'command:abandonBattle': 'Battle',
    'command:move': 'Moved a building',
    'attack:troops': 'Warriors spent',
    'war:troops': 'Alliance War warriors',
    'gangwar:troops': 'Gang War warriors',
    'gangwar:chest': 'Gang War chest',
    import: 'Village moved to the server',
  };
  if (words[code]) return words[code];
  // Prefixes carry a store name or a staff note (the note is for staff, not shown here).
  if (code.startsWith('purchase:')) return 'Purchase';
  if (code.startsWith('refund-reversed:')) return 'Refund reversed, purchase given back';
  if (code.startsWith('refund:')) return 'Refunded purchase taken back';
  if (code.startsWith('staff:')) return 'Support adjustment';
  // Growth batch 2026-11-14 (G13): the fixed friend-invite reward.
  if (code.startsWith('referral:')) return 'Friend invite reward';
  if (code.startsWith('attack:loot')) return 'Raid loot';
  if (code.startsWith('command:')) return 'Village action';
  return 'Other';
}

/** What to remind the player about, and when (used for push/local notifications). */
import { buildingDef } from './data';
import { collectorCapacity, collectorAmount, effectiveLevel } from './resources';
import { raidPhase } from './social/groveRaid';
import type { GameData, VillageState } from './types';

export interface Reminder {
  id: string;
  at: number;
  title: string;
  body: string;
}

export function upcomingReminders(state: VillageState, now: number, data: GameData): Reminder[] {
  const out: Reminder[] = [];
  for (const b of state.buildings) {
    if (!b.upgrade || b.upgrade.endsAt <= now) continue;
    const def = buildingDef(data, b.type);
    const title = b.upgrade.toLevel === 0 ? `${def.name} cleared` : b.upgrade.toLevel === 1 ? `${def.name} is built!` : `${def.name} reached level ${b.upgrade.toLevel}!`;
    out.push({ id: `up-${b.id}`, at: b.upgrade.endsAt, title, body: 'Your Beaver Builder is free for a new job.' });
  }
  const last = state.training[state.training.length - 1];
  if (last && last.endsAt > now) out.push({ id: 'training', at: last.endsAt, title: 'Your army is ready', body: 'All troops have finished training. Time to raid!' });
  // Earliest time a collector fills up.
  let fullAt = Infinity;
  for (const b of state.buildings) {
    const def = buildingDef(data, b.type);
    if (!def.produces || !b.collector) continue;
    const level = effectiveLevel(b, now);
    const cap = collectorCapacity(b, level, data);
    const rate = cap / data.economy.collectorHoursCap;
    if (!rate) continue;
    const left = cap - collectorAmount(b, now, data);
    if (left <= 0) continue;
    const start = Math.max(now, b.upgrade ? b.upgrade.endsAt : now);
    fullAt = Math.min(fullAt, start + (left / rate) * 3_600_000);
  }
  if (Number.isFinite(fullAt)) out.push({ id: 'collectors', at: Math.ceil(fullAt), title: 'Collectors are full', body: 'Your Acorns and Dew are waiting to be collected.' });
  if (state.shieldUntil > now) out.push({ id: 'shield', at: state.shieldUntil, title: 'Your shield has ended', body: 'Raiders can find your village again.' });
  if (state.grove.joined) {
    const p = raidPhase(now, data);
    if (p.phase !== 'live') out.push({ id: 'grove-raid', at: p.nextStart, title: 'The Grove Raid has started!', body: 'Use both attacks to win the reward chest.' });
  }
  return out.sort((a, b) => a.at - b.at);
}

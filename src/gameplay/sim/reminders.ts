/**
 * What to remind the player about, and when (used for push/local
 * notifications), plus `planNotifications`, which applies the player's choices:
 * notifications are opt-in, each type can be switched off, nothing arrives in
 * quiet hours, and at most `maxPerDay` arrive per local day.
 */
import { buildingDef } from './data';
import { chestReady, nextChestAt } from './daily';
import { upcomingEvents } from './events';
import { collectorCapacity, collectorAmount, effectiveLevel } from './resources';
import { raidPhase } from './social/groveRaid';
import type { GameData, VillageState } from './types';

export type ReminderType = 'builds' | 'army' | 'collectors' | 'shield' | 'groveRaid' | 'dailyChest' | 'events';

export interface Reminder {
  id: string;
  type: ReminderType;
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
    out.push({ id: `up-${b.id}`, type: 'builds', at: b.upgrade.endsAt, title, body: 'Your Village Artisan is free for a new job.' });
  }
  const r = state.research?.active;
  if (r && r.endsAt > now) out.push({ id: 'research', type: 'builds', at: r.endsAt, title: `${data.troops[r.troop]?.name ?? 'Troop'} level ${r.toLevel} researched!`, body: 'The Training Dojo is free to research again.' });
  const last = state.training[state.training.length - 1];
  if (last && last.endsAt > now) out.push({ id: 'training', type: 'army', at: last.endsAt, title: 'Your army is ready', body: 'All troops have finished training. Time to raid!' });
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
  if (Number.isFinite(fullAt)) out.push({ id: 'collectors', type: 'collectors', at: Math.ceil(fullAt), title: 'Collectors are full', body: 'Your Coins and Provisions are waiting to be collected.' });
  if (state.shieldUntil > now) out.push({ id: 'shield', type: 'shield', at: state.shieldUntil, title: 'Your shield has ended', body: 'Raiders can find your village again.' });
  if (state.grove.joined) {
    const p = raidPhase(now, data);
    if (p.phase !== 'live') out.push({ id: 'grove-raid', type: 'groveRaid', at: p.nextStart, title: 'The Alliance War has started!', body: 'Use both attacks to win the reward chest.' });
  }
  // Tomorrow's free chest, if today's is already open (otherwise it's ready now).
  if (state.daily && !chestReady(state, now, data)) out.push({ id: 'daily-chest', type: 'dailyChest', at: nextChestAt(now, data), title: 'A new daily chest is ready', body: "It's free. See the odds before you open it." });
  for (const e of upcomingEvents(now, 2, data)) {
    if (e.start - now > 2 * 86_400_000) continue;
    out.push({ id: `event-${e.key}`, type: 'events', at: e.start, title: `${e.name} has started`, body: `${e.description} Ends ${new Date(e.end).toUTCString().slice(0, 22)} UTC.` });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Apply the player's notification choices. `enabled` lists the types they
 * switched on; `tzOffsetMinutes` is Date#getTimezoneOffset (minutes behind
 * UTC). Reminders in quiet hours wait until quiet hours end; then each local
 * day keeps at most `maxPerDay`, preferring the types listed first in
 * notifications.json.
 */
export function planNotifications(list: Reminder[], enabled: ReadonlySet<string>, now: number, tzOffsetMinutes: number, data: GameData): Reminder[] {
  const cfg = data.notifications;
  const off = tzOffsetMinutes * 60_000;
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const { start, end } = cfg.quietHours;
  const inQuiet = (h: number) => (start > end ? h >= start || h < end : h >= start && h < end);
  const shifted = list
    .filter((r) => enabled.has(r.type) && r.at > now)
    .map((r) => {
      const local = r.at - off;
      const hour = Math.floor((((local % DAY) + DAY) % DAY) / HOUR);
      if (!inQuiet(hour)) return r;
      // Move to the end of quiet hours (today or tomorrow, local time).
      const dayStart = Math.floor(local / DAY) * DAY;
      let wake = dayStart + end * HOUR;
      if (wake <= local) wake += DAY;
      return { ...r, at: wake + off };
    });
  // One reminder per id, earliest first.
  const byId = new Map<string, Reminder>();
  for (const r of shifted.sort((a, b) => a.at - b.at)) if (!byId.has(r.id)) byId.set(r.id, r);
  const rank = (t: string) => {
    const i = cfg.types.findIndex((x) => x.id === t);
    return i < 0 ? cfg.types.length : i;
  };
  const perDay = new Map<number, Reminder[]>();
  for (const r of byId.values()) {
    const day = Math.floor((r.at - off) / DAY);
    const list2 = perDay.get(day) ?? [];
    list2.push(r);
    perDay.set(day, list2);
  }
  const out: Reminder[] = [];
  for (const items of perDay.values()) out.push(...items.sort((a, b) => rank(a.type) - rank(b.type) || a.at - b.at).slice(0, cfg.maxPerDay));
  return out.sort((a, b) => a.at - b.at);
}

/** The types switched on by default (still only after the player turns notifications on). */
export function defaultNotificationTypes(data: GameData): string[] {
  return data.notifications.types.filter((t) => t.default).map((t) => t.id);
}

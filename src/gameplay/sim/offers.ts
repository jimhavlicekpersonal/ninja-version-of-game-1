/** Rule-driven offers read from offers.json. */
import type { ActiveOffer, GameData, OfferRule, OfferTrigger, VillageState } from './types';

const HOUR = 3_600_000;

export function activeOffers(state: VillageState, now: number): ActiveOffer[] {
  return state.offers.active.filter((a) => a.expiresAt > now);
}

export function offerRule(data: GameData, id: string): OfferRule | undefined {
  return data.offers.rules.find((r) => r.id === id);
}

/** May this player be shown offers at all? Only a stated adult. */
export function offersAllowed(state: VillageState): boolean {
  return state.profile.under18 === false && (state.profile.ageBand ?? 'adult') === 'adult';
}

/** Can this offer come back after it ends (a cooldown), or is it once per account? */
export function offerReturns(rule: OfferRule): boolean {
  return !rule.oncePerAccount;
}

/**
 * Activate the first offer matching `trigger`, if its rules allow. Mutates
 * `state`. Returns the rule that was activated, or null. (The "at most once per
 * session" limit is enforced by the caller, which knows what a session is.)
 */
export function triggerOffer(state: VillageState, trigger: OfferTrigger, now: number, data: GameData): OfferRule | null {
  state.offers.active = activeOffers(state, now);
  // Offers pop up only for players who said they are adults: never for under-18 bands, and
  // not before the age is known (re-audit, EU CPC principles on pressure and minors).
  if (!offersAllowed(state)) return null;
  for (const rule of data.offers.rules) {
    if (rule.trigger !== trigger || rule.retired) continue;
    if (state.offers.active.some((a) => a.id === rule.id)) continue;
    if (now - state.createdAt < (rule.minAccountHours ?? 0) * HOUR) continue;
    const last = state.offers.lastShown[rule.id];
    if (rule.oncePerAccount && (last !== undefined || state.offers.bought.includes(rule.id))) continue;
    if (last !== undefined && now - last < rule.cooldownHours * HOUR) continue;
    const hours = Math.max(data.offers.durationHoursMin, Math.min(data.offers.durationHoursMax, rule.durationHours));
    state.offers.active.push({ id: rule.id, shownAt: now, expiresAt: now + hours * HOUR });
    state.offers.lastShown[rule.id] = now;
    return rule;
  }
  return null;
}

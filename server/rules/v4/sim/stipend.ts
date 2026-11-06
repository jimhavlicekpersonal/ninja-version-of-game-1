/**
 * Clan Stipend (store.json `stipend`): a consumable, not a subscription. Buying
 * it adds `payments` daily Jade payments. One payment can be claimed per UTC day,
 * only by opening the game and tapping Claim. A missed day loses nothing: the
 * stipend simply lasts until every payment is claimed, so there is no streak to
 * keep and no reminder to answer. It can be bought again once no payments are
 * left (a store delivery while some are left, e.g. bought on another device,
 * adds its payments on top).
 */
import { dayIndex } from './pass';
import type { GameData, StipendState, VillageState } from './types';

export function emptyStipend(): StipendState {
  return { left: 0, lastDay: -1, jade: 0 };
}

export interface StipendStatus {
  /** The stipend product exists in this build. */
  offered: boolean;
  /** Payments still to claim (the "days left" the UI shows). */
  left: number;
  /** A payment can be claimed right now. */
  claimable: boolean;
  /** Jade per payment. */
  jade: number;
  /** Can be bought now (none left). */
  canBuy: boolean;
}

export function stipendStatus(state: VillageState, now: number, data: GameData): StipendStatus {
  const def = data.store.stipend;
  const st = state.stipend ?? emptyStipend();
  const day = dayIndex(now, data);
  return { offered: Boolean(def), left: st.left, claimable: Boolean(def) && st.left > 0 && st.lastDay < day, jade: st.left > 0 ? nextPayment(st) : def?.jadePerPayment ?? 0, canBuy: Boolean(def) && st.left <= 0 };
}

/** The next payment: the Jade still owed shared over the payments left (the last one takes the remainder). */
function nextPayment(st: StipendState): number {
  return st.left <= 1 ? Math.max(0, st.jade) : Math.floor(st.jade / st.left);
}

/** Add a bought stipend's payments. Mutates. */
export function addStipend(state: VillageState, data: GameData): void {
  const def = data.store.stipend;
  if (!def) return;
  state.stipend = state.stipend ?? emptyStipend();
  state.stipend.left += def.payments;
  state.stipend.jade = (state.stipend.jade ?? 0) + def.payments * def.jadePerPayment;
}

/** Claim today's payment. Mutates; returns the Jade added, or null when nothing can be claimed today. */
export function claimStipend(state: VillageState, now: number, data: GameData): number | null {
  const status = stipendStatus(state, now, data);
  if (!status.claimable) return null;
  state.stipend.left -= 1;
  state.stipend.jade -= status.jade;
  state.stipend.lastDay = dayIndex(now, data);
  state.resources.moonstones += status.jade;
  return status.jade;
}

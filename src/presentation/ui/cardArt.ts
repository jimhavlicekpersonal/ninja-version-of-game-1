/**
 * Battle troop cards (art audit F12): the warrior's badge (role disc + tier ring, `Keys.warriorIcon`) reads at 48 px;
 * the dark field sprite did not. The HUD knows how to paint badges (`HudDeps.warriorIcon`) and registers it here once,
 * so the battle HUD can use it without a new composition-root dependency. A troop without a badge (the hero) keeps
 * its field sprite.
 */
import { WARRIORS } from '../../gameplay/sim/progression';

let badgeOf: ((warriorId: string) => string | null) | null = null;

/** The roster warrior whose live troop is `troop` (badges are keyed by roster id). */
export function badgeIdFor(troop: string): string | null {
  return WARRIORS.find((w) => w.liveTroop === troop)?.id ?? null;
}

export function provideBadges(fn: (warriorId: string) => string | null): void {
  badgeOf = fn;
}

/** The badge for a troop card, else null (use the field sprite). */
export function cardBadge(troop: string): string | null {
  const id = badgeIdFor(troop);
  return id && badgeOf ? badgeOf(id) : null;
}

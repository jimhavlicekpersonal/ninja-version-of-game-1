/**
 * Screens for the content batch's non-live features (GAME THEORY request 2026-11-14), shown ONLY while the
 * game data turns the feature on: `features.heroChoice` (the Hero Hall's hero picker) and `features.mastery`
 * (Warrior Mastery). The shipped data leaves both off, so today they appear only in the testing sandbox with
 * `?sandbox&preview` / `?debug&preview` (sim/plannedContent.ts `withPreview`), each with a "preview" label.
 * Numbers come from the sim (`choosableHeroes`, `heroFor`, `masteryLevelOf`, `masteryBonuses`,
 * `masteryXpTotal`); the picker changes state only through the `chooseHero` command.
 */
import { displayData as localizedData, fmtPercent, t } from './i18n';
import type { GameController } from '../../gameplay/control/controller';
import { choosableHeroes, heroFor, HERO_HALL } from '../../gameplay/sim/heroes';
import { masteryBonuses, masteryLevelOf, masteryOn } from '../../gameplay/sim/mastery';
import { masteryXpTotal } from '../../gameplay/sim/progression';
import type { GameData } from '../../gameplay/sim/types';
import { formatNumber } from './format';
import { h } from './dom';
import { refusalText } from './refusalText';

export function heroChoiceOn(data: GameData): boolean {
  return data.features?.heroChoice === true;
}

type Host = Pick<GameController, 'state' | 'data' | 'dispatch'>;

/**
 * The hero picker on the Hero Hall's sheet; null unless hero choice is on and this is the Hero Hall.
 * Each button sends `chooseHero`; "Let the Keep choose" sends `{ hero: null }`. `redraw` repaints the sheet.
 */
export function heroPickerSection(c: Host, buildingType: string, redraw: () => void, toast: (text: string, kind?: 'info' | 'error' | 'success') => void): HTMLElement | null {
  if (!heroChoiceOn(c.data) || buildingType !== HERO_HALL) return null;
  const gd = localizedData(c.data);
  const options = choosableHeroes(c.state, c.data);
  const joining = heroFor(c.state, c.data);
  const chosen = c.state.hero?.chosen ?? null;
  const name = (id: string) => gd.battle.heroes?.[id]?.name ?? id;
  const send = (hero: string | null) => {
    const r = c.dispatch({ type: 'chooseHero', hero });
    if (!r.ok) toast(refusalText(r), 'error');
    redraw();
  };
  const list = h('div', { class: 'hero-picker-list' });
  for (const id of options) {
    const active = chosen === id;
    list.append(
      h(
        'div',
        { class: `log-row hero-option${active ? ' active' : ''}`, 'data-hero': id },
        h('b', {}, name(id)),
        active ? h('span', { class: 'chip good' }, t('heroPick.chosen')) : h('button', { class: 'btn sky', type: 'button', 'data-id': `choose-hero-${id}`, onclick: () => send(id) }, t('heroPick.choose')),
      ),
    );
  }
  return h(
    'div',
    { class: 'hero-picker', 'data-id': 'hero-picker' },
    h('h3', {}, t('heroPick.title')),
    h('p', { class: 'muted small' }, t('preview.notLive')),
    options.length ? h('p', { class: 'small' }, t('heroPick.intro')) : h('p', { class: 'small' }, t('heroPick.none')),
    joining ? h('p', { class: 'small' }, t('heroPick.joining', { hero: name(joining.id), level: joining.level })) : null,
    list,
    chosen ? h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', 'data-id': 'choose-hero-auto', onclick: () => send(null) }, t('heroPick.auto'))) : null,
  );
}

/** One row per warrior type with mastery EXP: level, bonus, EXP to the next level. */
export function masteryRows(c: Pick<GameController, 'state' | 'data'>): { troop: string; level: number; bonus: number; xp: number; next: number }[] {
  if (!masteryOn(c.data)) return [];
  const bonuses = masteryBonuses(c.state, c.data);
  return Object.entries(c.state.mastery ?? {})
    .filter(([troop, xp]) => c.data.troops[troop] && xp > 0)
    .map(([troop, xp]) => {
      const level = masteryLevelOf(c.state, troop);
      return { troop, level, bonus: bonuses[troop] ?? 0, xp, next: masteryXpTotal(level + 1) };
    })
    .sort((a, b) => b.level - a.level || b.xp - a.xp);
}

/** The Warrior Mastery view (Army → Codex); null unless the feature is on. */
export function masterySection(c: Pick<GameController, 'state' | 'data'>): HTMLElement | null {
  if (!masteryOn(c.data)) return null;
  const gd = localizedData(c.data);
  const rows = masteryRows(c);
  return h(
    'div',
    { class: 'mastery-panel', 'data-id': 'mastery' },
    h('h3', {}, t('mastery.title')),
    h('p', { class: 'muted small' }, t('preview.notLive')),
    rows.length
      ? h(
          'div',
          { class: 'events' },
          ...rows.map((r) =>
            h(
              'div',
              { class: 'log-row', 'data-troop': r.troop },
              h('b', {}, gd.troops[r.troop]?.name ?? r.troop),
              h('span', { class: 'small' }, t('mastery.row', { level: r.level, bonus: fmtPercent(r.bonus * 100, 1) })),
              h('span', { class: 'muted small' }, t('mastery.next', { xp: formatNumber(r.xp), need: formatNumber(r.next) })),
            ),
          ),
        )
      : h('p', { class: 'small' }, t('mastery.none')),
  );
}

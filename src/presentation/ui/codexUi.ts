/**
 * The Warrior Codex (split out of hud.ts, quality 17; loaded on first open, quality 31): every warrior
 * class in the roster with its icon, ability and what unlocks it.
 */
import { displayData as localizedData, labelText as i18nLabel } from './i18n';
import { t as i18nText } from './i18n';
import type { GameController } from '../../gameplay/control/controller';
import { troopUnlock } from '../../gameplay/sim/army';
import { WARRIORS as CANONICAL_WARRIORS, MODEL as CANONICAL_MODEL } from '../../gameplay/sim/progression';
import { troopLevelOf } from '../../gameplay/sim/research';
import { role as canonicalRoleDef, warriorUnlockKeep } from '../../gameplay/sim/progression';
import type { UiKit } from './uiKit';
import { clear, h } from './dom';

const MODEL = localizedData(CANONICAL_MODEL, 'progression');
const WARRIORS = localizedData(CANONICAL_WARRIORS, 'roster.warriors');
const roleDef = (id: Parameters<typeof canonicalRoleDef>[0]) => localizedData(canonicalRoleDef(id), `progression.roles.${id}`);

/** What the Codex needs from the HUD. */
export interface CodexHost {
  c: GameController;
  warriorIcon(id: string): string | null;
  modal: UiKit['modal'];
}

/**
 * Every warrior class in the roster, with its icon and ability. "Unlocked"
 * means trainable now: both the Clan Keep gate and the Training Dojo level
 * are met (the same check the Train button uses).
 */
export function openCodex(host: CodexHost): void {
  const gd = localizedData(host.c.data);
  let tierFilter = 0;
  let roleFilter = '';
  let statusFilter: '' | 'unlocked' | 'locked' = '';
  const body = h('div', { class: 'codex' });
  const render = () => {
    const s = host.c.state;
    clear(body);
    const rows = WARRIORS.map((w) => {
      const u = w.liveTroop && gd.troops[w.liveTroop] ? troopUnlock(s, w.liveTroop, gd) : null;
      let status = i18nText("ui.coming_soon_4f7d640176");
      if (u?.unlocked) status = i18nText("ui.unlocked_531c7b28ab");
      else if (u) {
        const need: string[] = [];
        if (u.needsKeep) need.push(i18nText("ui.clan_keep_2cf84349d4", { arg1: u.keep }));
        if (u.needsDojo) need.push(i18nText("ui.training_dojo_54441bc8cc", { arg1: u.dojo }));
        status = i18nText("ui.needs_5162618d8e", { arg1: need.join(' + ') });
      }
      return { w, u, status, keep: u ? u.earliestKeep : warriorUnlockKeep(w, gd) };
    });
    const unlockedCount = rows.filter((r) => r.u?.unlocked).length;
    const nextUp = rows.filter((r) => r.u && !r.u.unlocked).sort((a, b) => a.keep - b.keep || a.w.tier - b.w.tier)[0];
    body.append(h('p', { class: 'muted small' }, i18nText("ui.of_classes_unlocked_a_class_unlocks_wh_856ddcc6ae", { arg1: unlockedCount, arg2: WARRIORS.length })));
    if (nextUp) body.append(h('p', { class: 'small' }, h('b', {}, i18nLabel('Next: ')), i18nText("ui.message_6aa36c72d4", { arg1: nextUp.w.name, arg2: nextUp.status.replace('Needs ', 'needs ') })));
    const tierSelect = h('select', { 'aria-label': i18nText("ui.filter_classes_by_tier_93298ce75c") }, h('option', { value: '0' }, i18nText("ui.all_tiers_ab6bb77da4")), ...MODEL.tiers.map((tier) => h('option', { value: String(tier.tier) }, tier.name)));
    tierSelect.value = String(tierFilter);
    const roleSelect = h('select', { 'aria-label': i18nText("ui.filter_classes_by_role_ecf50793ab") }, h('option', { value: '' }, i18nText("ui.all_roles_78f133afd3")), ...Object.entries(MODEL.roles).map(([id, r]) => h('option', { value: id }, r.name)));
    roleSelect.value = roleFilter;
    const statusSelect = h('select', { 'aria-label': i18nText("ui.filter_classes_by_status_482f0d5b0b") }, h('option', { value: '' }, i18nText("ui.all_a52ace420f")), h('option', { value: 'unlocked' }, i18nText("ui.unlocked_531c7b28ab")), h('option', { value: 'locked' }, i18nText("ui.locked_a424e33d90")));
    statusSelect.value = statusFilter;
    tierSelect.addEventListener('change', () => { tierFilter = Number(tierSelect.value); render(); });
    roleSelect.addEventListener('change', () => { roleFilter = roleSelect.value; render(); });
    statusSelect.addEventListener('change', () => { statusFilter = statusSelect.value as typeof statusFilter; render(); });
    body.append(h('div', { class: 'actions' }, tierSelect, roleSelect, statusSelect));
    const list = h('div', { class: 'codex-list' });
    const shown = rows
      .filter((r) => (!tierFilter || r.w.tier === tierFilter) && (!roleFilter || r.w.role === roleFilter))
      .filter((r) => !statusFilter || (statusFilter === 'unlocked') === Boolean(r.u?.unlocked))
      .sort((a, b) => Number(Boolean(b.u?.unlocked)) - Number(Boolean(a.u?.unlocked)) || a.keep - b.keep || a.w.tier - b.w.tier);
    for (const { w, u, status } of shown) {
      const src = host.warriorIcon(w.id);
      const def = w.liveTroop ? gd.troops[w.liveTroop] : undefined;
      const lvl = w.liveTroop ? troopLevelOf(s, w.liveTroop) : 0;
      list.append(
        h(
          'div',
          { class: `codex-row${u ? (u.unlocked ? ' unlocked' : ' locked') : ' planned'}` },
          src ? h('img', { src, alt: '' }) : null,
          h(
            'div',
            {},
            h('b', {}, w.name),
            h('div', { class: 'muted small' }, i18nText("ui.tier_3727d897fe", { arg1: roleDef(w.role).name, arg2: w.tier, arg3: u?.unlocked ? i18nText("ui.lv_6dd209682a", { arg1: lvl }) : '' })),
            h('div', { class: `small codex-status${u?.unlocked ? ' ok' : ''}` }, i18nLabel(status)),
            h('div', { class: 'small' }, h('b', {}, `${w.ability.name}: `), w.ability.text),
            def ? h('div', { class: 'muted small' }, i18nText("ui.range_space_cab15814a7", { arg1: def.air ? i18nText("ui.flies_3bbdc6c9fb") : i18nText("ui.ground_151bf49394"), arg2: def.range, arg3: def.housing })) : null,
          ),
        ),
      );
    }
    if (!shown.length) list.append(h('p', { class: 'muted' }, i18nText("ui.no_classes_match_these_filters_b1ef0c3097")));
    body.append(list);
  };
  render();
  const unsub = host.c.subscribe(() => render());
  host.modal(i18nText("ui.warrior_codex_931b3f69ae"), body, [], 'wide', () => unsub());
}


import { labelText } from './i18n';
import { t as i18nText } from './i18n';
/** Resource names and cost chips shared by the HUD panels. */
import { RESOURCE_KINDS, type Cost, type ResourceKind } from '../../gameplay/sim/types';
import { h, icon } from './dom';
import { formatNumber } from './format';
import { icons } from './icons';

export const RES_LABEL: Record<ResourceKind, string> = { get acorns() { return labelText('Coins'); }, get dew() { return labelText('Provisions'); }, get nightsap() { return labelText('Shadow Ink'); }, get moonstones() { return labelText('Jade'); } };

export function costChips(cost: Cost, missing: Cost = {}): HTMLElement {
  const wrap = h('span', { class: 'cost' });
  const kinds = RESOURCE_KINDS.filter((k) => cost[k]);
  if (!kinds.length) wrap.append(h('span', { class: 'chip free' }, i18nText("ui.free_f411a1fb62")));
  for (const k of kinds) {
    wrap.append(h('span', { class: `chip${missing[k] ? ' short' : ''}`, title: RES_LABEL[k] }, icon(icons[k as keyof typeof icons] ?? ''), formatNumber(cost[k]!)));
  }
  return wrap;
}

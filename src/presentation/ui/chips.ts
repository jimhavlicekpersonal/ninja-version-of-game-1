/** Resource names and cost chips shared by the HUD panels. */
import { RESOURCE_KINDS, type Cost, type ResourceKind } from '../../gameplay/sim/types';
import { h, icon } from './dom';
import { formatNumber } from './format';
import { icons } from './icons';

export const RES_LABEL: Record<ResourceKind, string> = { acorns: 'Coins', dew: 'Provisions', nightsap: 'Shadow Ink', moonstones: 'Jade' };

export function costChips(cost: Cost, missing: Cost = {}): HTMLElement {
  const wrap = h('span', { class: 'cost' });
  const kinds = RESOURCE_KINDS.filter((k) => cost[k]);
  if (!kinds.length) wrap.append(h('span', { class: 'chip free' }, 'Free'));
  for (const k of kinds) {
    wrap.append(h('span', { class: `chip${missing[k] ? ' short' : ''}`, title: RES_LABEL[k] }, icon(icons[k as keyof typeof icons] ?? ''), formatNumber(cost[k]!)));
  }
  return wrap;
}

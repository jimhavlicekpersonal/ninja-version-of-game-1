/**
 * The Army panel: what is ready, what is training, what to train next, research.
 *
 * Warriors finish while it is open, so it redraws often. It is split into a
 * status strip that stays pinned at the top and one tab below it. Each part is
 * rebuilt only when what it shows has changed, never while a finger is down, and
 * the scroll position stays where the player left it.
 */
import { troopLevelOf, researchLanes } from '../../gameplay/sim/research';
import { troopLevel } from '../../gameplay/sim/data';
import { MODEL, WARRIORS } from '../../gameplay/sim/progression';
import { missingFor } from '../../gameplay/sim/resources';
import { RESOURCE_KINDS } from '../../gameplay/sim/types';
import { troopUnlock, trainingSpeed } from '../../gameplay/sim/army';
import { armyView, researchRow, trainRow, type ArmyView, type BuildState, type QueueStack, type TrainRow } from '../../gameplay/sim/armyView';
import { dismissPreview, hallLevel, lastAttackArmy, lodgeTroops, practiceArmy, researchSkipQuote } from '../../gameplay/sim/village';
import { costChips, RES_LABEL } from './chips';
import { clear, h, icon } from './dom';
import type { EconomyUi, UiKit } from './economyUi';
import { formatDuration, formatNumber } from './format';
import { icons } from './icons';

type ArmyTab = 'train' | 'army' | 'research';

export interface ArmyUiDeps {
  kit: UiKit;
  econ: EconomyUi;
  troopThumb(type: string): string | null;
  onPractice(army: Record<string, number>): void;
  /** Open the Build menu on its Army tab. */
  openBuildArmy(): void;
  openCodex(): void;
}

const BUILD_TEXT: Record<BuildState, string> = { ready: 'Built', building: 'Being built', missing: 'Not built yet' };
/** Warrior stacks are listed in this order under these headings. */
const NEXT_ARMY = ['next', 'waiting'] as const;

export class ArmyUi {
  /** The tab stays where the player left it, between visits too. */
  private tab: ArmyTab = 'train';

  constructor(private readonly d: ArmyUiDeps) {}

  private get c() {
    return this.d.kit.c;
  }

  private get gd() {
    return this.d.kit.c.data;
  }

  private armyText(army: Record<string, number>): string {
    return Object.entries(army).map(([t, n]) => `${n} ${this.gd.troops[t]?.name ?? t}`).join(', ');
  }

  private thumb(troop: string): HTMLElement | null {
    const src = this.d.troopThumb(troop);
    return src ? h('img', { src, alt: '' }) : null;
  }

  open(): void {
    const { c, gd } = this;
    const body = h('div', { class: 'training' });
    const strip = h('div', { class: 'army-strip' });
    const tabs = h('div', { class: 'shop-tabs army-tabs', role: 'tablist' });
    const pane = h('div', { class: 'army-pane' });
    const codex = h('button', { class: 'btn sky', type: 'button', onclick: () => this.d.openCodex() }, icon(icons.scroll), `Warrior Codex (${WARRIORS.length} classes)`);
    body.append(strip, tabs, pane, h('div', { class: 'actions' }, codex));

    let tierFilter = 0;
    let roleFilter = '';
    let onlyUnlocked = true;
    let stripSig = '';
    let tabSig = '';
    let paneSig = '';
    let pressed = false;
    /** Warrior cards kept between redraws: only a card whose contents changed is rebuilt. */
    const cards = new Map<string, { sig: string; el: HTMLElement }>();

    const redraw = () => {
      stripSig = '';
      tabSig = '';
      paneSig = '';
      cards.clear();
      draw();
    };

    // The filters live outside the rebuilt area, so a warrior finishing never closes an open dropdown.
    const scope = h('select', { 'aria-label': 'Show unlocked or all warriors' }, h('option', { value: '1' }, 'Unlocked'), h('option', { value: '0' }, `All (${Object.keys(gd.troops).length})`));
    const tierSelect = h('select', { 'aria-label': 'Filter warriors by tier' }, h('option', { value: '0' }, 'All tiers'), ...MODEL.tiers.map((tier) => h('option', { value: String(tier.tier) }, tier.name)));
    const roleSelect = h('select', { 'aria-label': 'Filter warriors by role' }, h('option', { value: '' }, 'All roles'), ...Object.entries(MODEL.roles).map(([id, role]) => h('option', { value: id }, role.name)));
    scope.addEventListener('change', () => { onlyUnlocked = scope.value === '1'; redraw(); });
    tierSelect.addEventListener('change', () => { tierFilter = Number(tierSelect.value); redraw(); });
    roleSelect.addEventListener('change', () => { roleFilter = roleSelect.value; redraw(); });
    const filters = h('div', { class: 'actions army-filters' }, scope, tierSelect, roleSelect);
    const trainList = h('div', { class: 'army-list' });
    const trainEmpty = h('p', { class: 'muted' }, 'No warriors match these filters.');

    const visibleTroops = (v: ArmyView) =>
      Object.keys(gd.troops).filter((id) => {
        const warrior = WARRIORS.find((w) => w.liveTroop === id);
        if (onlyUnlocked && !troopUnlock(v.state, id, gd).unlocked) return false;
        return (!tierFilter || warrior?.tier === tierFilter) && (!roleFilter || warrior?.role === roleFilter);
      });

    const drawTabs = (v: ArmyView) => {
      const units = Object.values(v.state.army).reduce((a, b) => a + b, 0);
      const labels: [ArmyTab, string][] = [['train', 'Train'], ['army', units ? `Army (${units})` : 'Army'], ['research', v.state.research.active.length ? `Research (${v.state.research.active.length})` : 'Research']];
      const sig = JSON.stringify([this.tab, labels]);
      if (sig === tabSig) return;
      tabSig = sig;
      tabs.replaceChildren(
        ...labels.map(([id, label]) =>
          h('button', {
            type: 'button',
            role: 'tab',
            class: id === this.tab ? 'on' : '',
            'aria-selected': id === this.tab ? 'true' : 'false',
            onclick: () => {
              if (this.tab === id) return;
              this.tab = id;
              redraw();
              body.closest('.modal-body')?.scrollTo({ top: 0 });
            },
          }, label),
        ),
      );
    };

    const drawTrainPane = (v: ArmyView, now: number) => {
      const ready = v.dojo === 'ready' && v.camp === 'ready';
      const troops = visibleTroops(v);
      const scopeCount = Object.keys(gd.troops).filter((t) => troopUnlock(v.state, t, gd).unlocked).length;
      (scope.options[0] as HTMLOptionElement).textContent = `Unlocked (${scopeCount})`;
      const rows = troops.map((t) => {
        const row = trainRow(v, t, now, gd);
        const sig = JSON.stringify([t, row.quote.ok, !row.quote.ok && row.quote.message, row.quote.quote, row.fill, row.ahead, v.state.resources.dew >= (row.quote.quote?.cost.dew ?? 0)]);
        return { t, row, sig };
      });
      const sig = JSON.stringify(['train', v.dojo, v.camp, rows.map((r) => r.sig), ready]);
      if (sig === paneSig) return;
      paneSig = sig;
      const list: HTMLElement[] = rows.map(({ t, row, sig: cardSig }) => {
        let card = cards.get(t);
        if (!card || card.sig !== cardSig) {
          card = { sig: cardSig, el: this.trainCard(t, row, v, draw) };
          cards.set(t, card);
        }
        return card.el;
      });
      trainList.replaceChildren(...list);
      const speed = trainingSpeed(v.state, gd);
      pane.replaceChildren(
        ...[
          !ready ? this.setupCard(v) : null,
          v.dojo === 'ready' ? filters : null,
          speed > 1 ? h('p', { class: 'muted small' }, `Your Training Dojo trains ${speed}× faster than a level 1 Dojo.`) : null,
          trainList,
          !list.length && v.dojo === 'ready' ? trainEmpty : null,
        ].filter((x): x is HTMLElement => x !== null),
      );
    };

    const drawArmyPane = (v: ArmyView) => {
      const s = v.state;
      const sig = JSON.stringify(['army', s.army, lodgeTroops(s), v.stacks.map((st) => [st.troop, st.status, st.count, st.lastIndex, st.endsAt]), s.armyPresets, lastAttackArmy(s)]);
      if (sig === paneSig) return;
      paneSig = sig;
      pane.replaceChildren(this.armyPane(v, redraw));
    };

    const drawResearchPane = (v: ArmyView, now: number) => {
      const s = v.state;
      const rows = visibleTroops(v).map((t) => {
        const q = researchRow(v, t, now, gd);
        return [t, q.ok, !q.ok && q.message, q.quote];
      });
      const sig = JSON.stringify(['research', s.research, rows, s.resources.moonstones]);
      if (sig === paneSig) return;
      paneSig = sig;
      pane.replaceChildren(filters, this.researchPane(v, now, visibleTroops(v), redraw));
    };

    const draw = () => {
      if (pressed) return;
      const now = c.now();
      const v = armyView(c.state, now, gd);
      const nextStrip = JSON.stringify([v.capacity, v.readyHousing, v.trainingHousing, v.nextHousing, v.waiting, v.active?.troop, v.active?.endsAt, v.armyDoneAt, v.skip?.moonstones]);
      if (nextStrip !== stripSig) {
        stripSig = nextStrip;
        this.drawStrip(strip, v, now, redraw);
      }
      drawTabs(v);
      const scroller = body.closest('.modal-body');
      const top = scroller?.scrollTop ?? 0;
      if (this.tab === 'train') drawTrainPane(v, now);
      else if (this.tab === 'army') drawArmyPane(v);
      else drawResearchPane(v, now);
      if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
      // Timers and progress bars tick without rebuilding anything.
      body.querySelectorAll<HTMLElement>('[data-ends]').forEach((el) => {
        el.textContent = formatDuration(Number(el.dataset.ends) - now);
      });
      body.querySelectorAll<HTMLElement>('[data-from]').forEach((el) => {
        const from = Number(el.dataset.from);
        const to = Number(el.dataset.to);
        el.style.width = `${Math.min(100, Math.max(0, ((now - from) / Math.max(1, to - from)) * 100))}%`;
      });
    };

    // Never swap a button out from under a finger: a tap that lands on a rebuilt
    // button is lost. Whatever changed meanwhile is drawn when the finger lifts.
    // Only buttons count: a dropdown never reports its pointerup to the page.
    body.addEventListener('pointerdown', (e) => {
      pressed = Boolean((e.target as Element).closest('button'));
    });
    const release = () => window.setTimeout(() => { pressed = false; draw(); }, 80);
    body.addEventListener('pointerup', release);
    body.addEventListener('pointercancel', release);
    body.addEventListener('pointerleave', release);

    draw();
    const timer = window.setInterval(draw, 1000);
    const unsub = c.subscribe(() => draw());
    this.d.kit.modal('Army', body, [], 'wide', () => {
      window.clearInterval(timer);
      unsub();
    });
  }

  /** The pinned summary: how full the Courtyards are, who is training, and why anything is waiting. */
  private drawStrip(strip: HTMLElement, v: ArmyView, now: number, redraw: () => void): void {
    clear(strip);
    strip.hidden = v.capacity === 0 && !v.stacks.length;
    if (strip.hidden) return;
    const cap = Math.max(1, v.capacity);
    const bar = h(
      'div',
      { class: 'army-bar' },
      h('i', { class: 'ready', style: `width:${Math.min(100, (v.readyHousing / cap) * 100)}%` }),
      h('i', { class: 'coming', style: `width:${Math.min(100 - Math.min(100, (v.readyHousing / cap) * 100), (v.trainingHousing / cap) * 100)}%` }),
    );
    strip.append(
      h(
        'div',
        { class: 'army-strip-head' },
        bar,
        h('b', {}, `Army ${v.readyHousing} / ${v.capacity}`),
      ),
    );
    const detail: string[] = [];
    if (v.trainingHousing) detail.push(`${v.trainingHousing} training`);
    if (v.nextHousing) detail.push(`${v.nextHousing} next army`);
    if (v.waiting) detail.push(`${v.waiting} waiting for room`);
    const line = h('div', { class: 'army-strip-line' });
    if (v.active) {
      const name = this.gd.troops[v.active.troop]?.name ?? v.active.troop;
      line.append(
        this.thumb(v.active.troop) ?? '',
        h(
          'div',
          { class: 'army-active' },
          h('div', { class: 'small' }, h('b', {}, name), ' ', h('span', { 'data-ends': String(v.active.endsAt) }, formatDuration(v.active.endsAt - now))),
          h('div', { class: 'progress thin' }, h('i', { 'data-from': String(v.active.startedAt), 'data-to': String(v.active.endsAt) })),
        ),
      );
    } else {
      line.append(h('span', { class: 'muted small army-active' }, v.waiting ? 'Training finished' : 'Nobody is training'));
    }
    if (v.armyDoneAt !== null && v.armyDoneAt > now) {
      line.append(h('span', { class: 'chip', title: 'Time until everyone who fits in the Courtyards has finished' }, icon(icons.clock), h('span', { 'data-ends': String(v.armyDoneAt) }, formatDuration(v.armyDoneAt - now))));
    }
    if (v.skip) {
      const quote = v.skip;
      const fin = h('button', { class: 'btn gold', type: 'button' }, 'Finish ', h('span', { class: 'chip' }, icon(icons.moonstones), String(quote.moonstones)));
      fin.addEventListener('click', () => void this.d.econ.spendMoonstones('Finish training', 'Finish training the warriors who fit in your Squad Courtyards', quote.moonstones, () => this.c.dispatch({ type: 'skipTraining' }).ok).then(redraw));
      line.append(fin);
    }
    // Always one line, even an empty one: the strip keeps its height, so nothing below it moves under a finger.
    strip.append(line, h('p', { class: 'muted small army-detail' }, detail.join(' · ') || '\u00a0'));
  }

  /** Shown until training is possible, so an empty panel always says what to do next. */
  private setupCard(v: ArmyView): HTMLElement {
    const { gd } = this;
    const item = (name: string, st: BuildState) => h('li', { class: st === 'ready' ? 'ok' : '' }, h('b', {}, name), ` · ${BUILD_TEXT[st]}`);
    const missing = v.dojo === 'missing' || v.camp === 'missing';
    return h(
      'div',
      { class: 'army-setup' },
      h('p', {}, 'Warriors need two buildings: the Dojo trains them and the Courtyard houses them.'),
      h('ul', {}, item(gd.buildings.burrow_barracks.name, v.dojo), item(gd.buildings.army_camp.name, v.camp)),
      missing ? h('button', { class: 'btn primary', type: 'button', onclick: () => this.d.openBuildArmy() }, icon(icons.hammer), 'Go to Build') : h('p', { class: 'muted small' }, 'Training opens as soon as the work is done.'),
    );
  }

  private trainCard(t: string, row: TrainRow, v: ArmyView, draw: () => void): HTMLElement {
    const { c, gd } = this;
    const s = v.state;
    const def = gd.troops[t];
    const { quote, fill, ahead } = row;
    const lvl = troopLevelOf(s, t);
    const cost = quote.quote?.cost ?? troopLevel(gd, t, lvl).cost;
    const locked = !quote.ok && quote.code === 'LOCKED';
    const train = (count: number) => {
      const r = c.dispatch({ type: 'train', troop: t, count });
      if (!r.ok) {
        this.d.kit.toast(r.message, 'error');
      } else {
        const e = r.events.find((x) => x.kind === 'train_start');
        if (e && e.kind === 'train_start' && (e.count ?? 1) > 1) this.d.kit.toast(`Queued ${e.count} ${def.name}.`, 'success');
      }
      draw();
    };
    const buttons = h('div', { class: 'army-actions' });
    const add = (label: string, cls: string, disabled: boolean, onClick: () => void, title?: string) => {
      const b = h('button', { class: `btn ${cls}`, type: 'button', disabled, title }, label);
      b.addEventListener('click', onClick);
      buttons.append(b);
    };
    add('+1', 'primary', !quote.ok, () => train(1));
    add('+5', 'ghost', !quote.ok, () => train(5));
    add(`${ahead ? 'Next' : 'Fill'} ${fill}`, 'ghost', !quote.ok || fill < 1, () => train(fill), ahead ? 'The Squad Courtyards are spoken for: train ahead for the next army' : 'Fill the Squad Courtyards');
    if (troopUnlock(s, t, gd).unlocked && v.capacity > 0) {
      add('Try', 'ghost', false, () => {
        this.d.kit.closeAllModals();
        this.d.onPractice(practiceArmy(c.state, t, gd));
      }, `Practice battle with a squad of ${def.name}: nothing is spent or won`);
    }
    return h(
      'div',
      { class: `troop-row army-card${locked ? ' locked' : ''}` },
      this.thumb(t),
      h(
        'div',
        { class: 'army-card-body' },
        h('b', {}, `${def.name} `, h('span', { class: 'muted small' }, `Lv ${lvl}`)),
        h('span', { class: 'muted small army-desc' }, def.description),
        h(
          'span',
          { class: 'row' },
          costChips(cost, missingFor(s.resources, cost)),
          h('span', { class: 'chip' }, icon(icons.clock), formatDuration((quote.quote?.seconds ?? def.trainSeconds) * 1000)),
          h('span', { class: 'chip', title: 'Courtyard space' }, icon(icons.troops), String(def.housing)),
        ),
      ),
      buttons,
      !quote.ok ? h('span', { class: 'note' }, quote.message) : null,
    );
  }

  private armyPane(v: ArmyView, redraw: () => void): HTMLElement {
    const { c, gd } = this;
    const s = v.state;
    const wrap = h('div', {});
    const ready = h('div', { class: 'army-row' });
    for (const [t, n] of Object.entries(s.army)) {
      if (n <= 0) continue;
      const x = h('button', { class: 'qx', type: 'button', 'aria-label': `Dismiss ${gd.troops[t]?.name ?? t}` }, '×');
      x.addEventListener('click', () => this.dismiss(t, n, redraw));
      ready.append(h('span', { class: 'army-chip' }, this.thumb(t), `${gd.troops[t]?.name ?? t} ×${n}`, x));
    }
    if (!ready.childElementCount) ready.append(h('span', { class: 'muted' }, 'No warriors ready yet.'));
    wrap.append(h('h3', {}, 'Ready to attack'), ready);
    const lodge = Object.entries(lodgeTroops(s));
    if (lodge.length) {
      wrap.append(
        h('h3', {}, 'Donated by your Alliance'),
        h('div', { class: 'army-row' }, ...lodge.map(([t, l]) => h('span', { class: 'army-chip' }, this.thumb(t), `${gd.troops[t]?.name ?? t} ×${l.count} `, h('span', { class: 'muted small' }, `Lv ${l.level}`)))),
        h('p', { class: 'muted small' }, 'They fight first in your next attack and take no Courtyard space.'),
      );
    }

    const training = v.stacks.filter((st) => st.status === 'training');
    if (training.length) wrap.append(h('h3', {}, 'Training'), ...training.map((st) => this.stackRow(st, redraw)));
    const next = NEXT_ARMY.flatMap((status) => v.stacks.filter((st) => st.status === status));
    if (next.length) {
      wrap.append(
        h('h3', {}, 'Next army'),
        v.waiting
          ? h('p', { class: 'army-note small' }, `${v.waiting} finished warrior${v.waiting > 1 ? 's are' : ' is'} waiting for room in the Squad Courtyards. They walk in by themselves after a raid, or when you dismiss warriors.`)
          : h('p', { class: 'muted small' }, 'Trained ahead. They join your army when the Squad Courtyards have room.'),
        ...next.map((st) => this.stackRow(st, redraw)),
      );
    }

    wrap.append(h('h3', {}, 'Refill in one tap'));
    const lastArmy = lastAttackArmy(s);
    if (lastArmy) wrap.append(this.refillRow('Last raid', lastArmy, redraw));
    s.armyPresets.forEach((p, i) => {
      const del = h('button', { class: 'btn ghost', type: 'button', 'aria-label': `Delete saved army ${p.name}` }, '×');
      del.addEventListener('click', () => {
        c.dispatch({ type: 'deleteArmyPreset', index: i });
        redraw();
      });
      wrap.append(this.refillRow(p.name, p.army, redraw, del));
    });
    const current: Record<string, number> = { ...s.army };
    for (const q of s.training) current[q.troop] = (current[q.troop] ?? 0) + 1;
    if (Object.keys(current).length && s.armyPresets.length < gd.economy.maxArmyPresets) {
      const save = h('button', { class: 'btn ghost', type: 'button', title: this.armyText(current) }, 'Save this army');
      save.addEventListener('click', () => {
        const r = c.dispatch({ type: 'saveArmyPreset', name: '', army: current });
        this.d.kit.toast(r.ok ? 'Army saved: refill it with one tap.' : r.message, r.ok ? 'success' : 'error');
        redraw();
      });
      wrap.append(h('div', { class: 'actions' }, save));
    } else if (Object.keys(current).length) {
      wrap.append(h('p', { class: 'muted small' }, `You can keep ${gd.economy.maxArmyPresets} saved armies. Delete one to save this army.`));
    } else if (!lastArmy && !s.armyPresets.length) {
      wrap.append(h('p', { class: 'muted small' }, 'Train some warriors, then save the mix here to refill it later.'));
    }
    return wrap;
  }

  private stackRow(st: QueueStack, redraw: () => void): HTMLElement {
    const { c, gd } = this;
    const name = gd.troops[st.troop]?.name ?? st.troop;
    const cancel = (count: number) => {
      const r = c.dispatch({ type: 'cancelTraining', index: st.lastIndex, troop: st.troop, count });
      if (!r.ok) this.d.kit.toast(r.message, 'error');
      redraw();
    };
    const one = h('button', { class: 'btn ghost', type: 'button', 'aria-label': `Cancel one ${name}` }, '−1');
    one.addEventListener('click', () => cancel(1));
    const all = h('button', { class: 'btn ghost', type: 'button', 'aria-label': `Cancel all ${st.count} ${name}` }, 'All');
    all.addEventListener('click', () => {
      void this.d.kit.confirm(`Cancel ${st.count} ${name}?`, 'Their full training cost comes back, as far as your storage allows.', 'Cancel them', true).then((ok) => {
        if (ok) cancel(st.count);
      });
    });
    return h(
      'div',
      { class: 'stack-row' },
      this.thumb(st.troop),
      h('b', {}, `${name} ×${st.count}`),
      st.status === 'waiting' ? h('span', { class: 'chip good' }, 'Ready, needs room') : h('span', { class: 'chip' }, icon(icons.clock), h('span', { 'data-ends': String(st.endsAt) }, '')),
      h('span', { class: 'row' }, one, st.count > 1 ? all : null),
    );
  }

  private refillRow(name: string, army: Record<string, number>, redraw: () => void, extra?: HTMLElement): HTMLElement {
    const go = h('button', { class: 'btn sky', type: 'button' }, 'Train');
    go.addEventListener('click', () => {
      const r = this.c.dispatch({ type: 'trainArmy', army });
      if (!r.ok) {
        this.d.kit.toast(r.message, 'error');
      } else {
        const queued = r.events.reduce((sum, e) => sum + (e.kind === 'train_start' ? e.count ?? 1 : 0), 0);
        const short = r.events.find((e) => e.kind === 'train_short');
        if (short && short.kind === 'train_short') this.d.kit.toast(`Queued ${queued}. ${short.missing} more could not be queued. ${short.why}`, 'info');
        else this.d.kit.toast(`Queued ${queued} warrior${queued > 1 ? 's' : ''}.`, 'success');
      }
      redraw();
    });
    return h('div', { class: 'stack-row refill' }, h('div', { class: 'grow' }, h('b', {}, name), h('div', { class: 'muted small' }, this.armyText(army))), h('span', { class: 'row' }, go, extra ?? null));
  }

  /** Send warriors home, one or all of a kind, with the refund and space shown first. */
  private dismiss(troop: string, have: number, redraw: () => void): void {
    const { c, gd } = this;
    const name = gd.troops[troop]?.name ?? troop;
    const text = (count: number) => {
      const p = dismissPreview(c.state, troop, count, gd);
      const refund = RESOURCE_KINDS.filter((k) => p.refund[k]).map((k) => `${formatNumber(p.refund[k]!)} ${RES_LABEL[k]}`).join(' and ');
      return `${count === have && have > 1 ? 'All of them' : 'One'}: ${p.housing} Courtyard space free${refund ? `, ${refund} back` : ''}`;
    };
    const go = (count: number) => {
      close();
      const r = c.dispatch({ type: 'dismiss', troop, count });
      if (!r.ok) this.d.kit.toast(r.message, 'error');
      redraw();
    };
    const body = h(
      'div',
      {},
      h('p', {}, `They go home for good. You get back ${Math.round(gd.economy.dismissRefundFraction * 100)}% of their training cost, as far as your storage allows.`),
      h('p', { class: 'muted small' }, text(1)),
      have > 1 ? h('p', { class: 'muted small' }, text(have)) : null,
    );
    const close = this.d.kit.modal(`Dismiss ${name}?`, body, [
      { label: 'Keep them', onClick: () => close() },
      have > 1 ? { label: 'Dismiss 1', onClick: () => go(1) } : null,
      { label: have > 1 ? `Dismiss all ${have}` : 'Dismiss', danger: true, onClick: () => go(have) },
    ]);
  }

  private researchPane(v: ArmyView, now: number, troops: string[], redraw: () => void): HTMLElement {
    const { c, gd } = this;
    const s = v.state;
    const wrap = h('div', {});
    const lanes = researchLanes(hallLevel(s, gd), gd);
    wrap.append(h('p', { class: 'muted small' }, `The Training Dojo researches ${lanes > 1 ? `${lanes} warriors at a time` : 'one warrior at a time'} (a higher Clan Keep opens more research lanes). A new level makes every warrior of that kind stronger, and costs a little more to train. Your Clan Keep level sets the highest level.`));
    for (const active of s.research.active) {
      const ad = gd.troops[active.troop];
      const row = h('div', { class: 'progress-row' }, h('span', {}, `${ad?.name ?? active.troop} → level ${active.toLevel}`), h('span', { class: 'chip', 'data-ends': String(active.endsAt) }, formatDuration(active.endsAt - now)));
      const acts = h('div', { class: 'actions' });
      const rsq = researchSkipQuote(s, now, gd, active.troop);
      if (rsq) {
        const fin = h('button', { class: 'btn gold', type: 'button' }, 'Finish now ', h('span', { class: 'chip' }, icon(icons.moonstones), String(rsq.moonstones)));
        fin.addEventListener('click', () => void this.d.econ.spendMoonstones('Finish research', `Finish ${ad?.name ?? 'research'} level ${active.toLevel} now`, rsq.moonstones, () => c.dispatch({ type: 'skipResearch', troop: active.troop }).ok).then(redraw));
        acts.append(fin);
      }
      const cancel = h('button', { class: 'btn ghost', type: 'button' }, 'Cancel');
      cancel.addEventListener('click', () => {
        void this.d.kit.confirm('Cancel research?', `You'll get back ${Math.round(gd.economy.cancelRefundFraction * 100)}% of what you paid.`, 'Cancel research', true).then((ok) => {
          if (!ok) return;
          const r = c.dispatch({ type: 'cancelResearch', troop: active.troop });
          if (!r.ok) this.d.kit.toast(r.message, 'error');
          redraw();
        });
      });
      acts.append(cancel);
      wrap.append(row, acts);
    }
    if (s.research.active.length < lanes) wrap.append(h('p', { class: 'muted small' }, `${lanes - s.research.active.length} research lane${lanes - s.research.active.length > 1 ? 's' : ''} free.`));
    const list = h('div', { class: 'army-list' });
    for (const t of troops) {
      const def = gd.troops[t];
      const lvl = troopLevelOf(s, t);
      const rq = researchRow(v, t, now, gd);
      if (!rq.ok && (rq.code === 'LOCKED' || (rq.code === 'MAX_LEVEL' && !rq.quote))) {
        list.append(h('div', { class: 'troop-row army-card locked' }, this.thumb(t), h('div', { class: 'army-card-body' }, h('b', {}, `${def.name} `, h('span', { class: 'muted small' }, `Lv ${lvl}`)), h('span', { class: 'note' }, rq.message))));
        continue;
      }
      const cur = troopLevel(gd, t, lvl);
      const nxt = rq.quote ? troopLevel(gd, t, rq.quote.toLevel) : null;
      const btn = h('button', { class: 'btn primary', type: 'button', disabled: !rq.ok }, 'Research');
      btn.addEventListener('click', () => {
        const r = c.dispatch({ type: 'research', troop: t });
        if (!r.ok) this.d.kit.toast(r.message, 'error');
        redraw();
      });
      list.append(
        h(
          'div',
          { class: `troop-row army-card${rq.ok ? '' : ' locked'}` },
          this.thumb(t),
          h(
            'div',
            { class: 'army-card-body' },
            h('b', {}, `${def.name} `, h('span', { class: 'muted small' }, nxt ? `Lv ${lvl} → ${nxt.level}` : `Lv ${lvl}`)),
            nxt ? h('span', { class: 'muted small' }, `HP ${cur.hp} → ${nxt.hp} · Damage ${cur.damage} → ${nxt.damage}`) : null,
            rq.quote ? h('span', { class: 'row' }, costChips(rq.quote.cost, missingFor(s.resources, rq.quote.cost)), h('span', { class: 'chip' }, icon(icons.clock), formatDuration(rq.quote.seconds * 1000))) : null,
          ),
          nxt ? h('div', { class: 'army-actions' }, btn) : null,
          !rq.ok ? h('span', { class: 'note' }, rq.message) : null,
        ),
      );
    }
    if (!troops.length) wrap.append(h('p', { class: 'muted' }, 'No warriors match these filters.'));
    wrap.append(list);
    return wrap;
  }
}

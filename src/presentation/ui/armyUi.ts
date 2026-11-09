import { messageText as i18nMessage, listText as i18nList } from './i18n';
import { displayData as localizedData, labelText as i18nLabel } from './i18n';
import { t as i18nText } from './i18n';
/**
 * The Army panel: what is ready, what is training, what to train next, research.
 *
 * Warriors finish while it is open, so it redraws often. It is split into a
 * status strip that stays pinned at the top and one tab below it. Each part is
 * rebuilt only when what it shows has changed, never while a finger is down, and
 * the scroll position stays where the player left it.
 */
import { t } from './i18n';
import { suggestedArmy } from '../../gameplay/sim/suggest';
import { troopLevelOf, researchLanes } from '../../gameplay/sim/research';
import { troopLevel } from '../../gameplay/sim/data';
import { MODEL as CANONICAL_MODEL, WARRIORS as CANONICAL_WARRIORS } from '../../gameplay/sim/progression';
import { missingFor } from '../../gameplay/sim/resources';
import { RESOURCE_KINDS, type ResourceKind } from '../../gameplay/sim/types';
import { troopUnlock, trainingSpeed } from '../../gameplay/sim/army';
import { armyView, researchRow, researchTopUp, trainRow, type ArmyView, type BuildState, type QueueStack, type TrainRow } from '../../gameplay/sim/armyView';
import { dismissPreview, hallLevel, lastAttackArmy, lodgeTroops, practiceArmy, researchSkipQuote, topUpQuote } from '../../gameplay/sim/village';
import { costChips, RES_LABEL } from './chips';
import { clear, h, icon } from './dom';
import type { EconomyUi, UiKit } from './economyUi';
import { formatDuration, formatNumber } from './format';
import { icons } from './icons';

const MODEL = localizedData(CANONICAL_MODEL, 'progression');
const WARRIORS = localizedData(CANONICAL_WARRIORS, 'roster.warriors');

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

/** "600 Coins and 2,000 Provisions" for a buy confirmation. */
const missingText = (m: Partial<Record<ResourceKind, number>>) =>
  i18nList((Object.entries(m) as [ResourceKind, number][]).filter(([, v]) => v > 0).map(([k, v]) => i18nText("ui.message_14677cb26f", { arg1: formatNumber(v), arg2: RES_LABEL[k] })), 'conjunction');

const BUILD_TEXT: Record<BuildState, string> = { ready: 'Built', building: 'Being built', missing: 'Not built yet' };

export class ArmyUi {
  /** The tab stays where the player left it, between visits too. */
  private tab: ArmyTab = 'train';

  constructor(private readonly d: ArmyUiDeps) {}

  private get c() {
    return this.d.kit.c;
  }

  private get gd() {
    return localizedData(this.d.kit.c.data);
  }

  private armyText(army: Record<string, number>): string {
    return i18nList(Object.entries(army).map(([t, n]) => i18nText("ui.message_14677cb26f", { arg1: n, arg2: this.gd.troops[t]?.name ?? t })));
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
    // Strip and tabs are pinned together: another tab is always one tap away. The Codex sits beside the tabs
    // (re-audit design item 7), a small button rather than a "50 classes" banner on a new player's first visit.
    const codex = h('button', { class: 'btn ghost codex-btn', type: 'button', title: i18nText("ui.warrior_codex_all_classes_03eb859e9c", { arg1: WARRIORS.length }), onclick: () => this.d.openCodex() }, icon(icons.scroll), i18nText("ui.codex_616efbe968"));
    const head = h('div', { class: 'army-head' }, strip, h('div', { class: 'army-tabrow' }, tabs, codex));
    const pane = h('div', { class: 'army-pane' });
    body.append(head, pane);

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
    const scope = h('select', { 'aria-label': i18nText("ui.show_unlocked_or_all_warriors_3f4ca5edfc") }, h('option', { value: '1' }, i18nText("ui.unlocked_531c7b28ab")), h('option', { value: '0' }, i18nText("ui.all_5f0213b783", { arg1: Object.keys(gd.troops).length })));
    const tierSelect = h('select', { 'aria-label': i18nText("ui.filter_warriors_by_tier_6a68d83b0e") }, h('option', { value: '0' }, i18nText("ui.all_tiers_ab6bb77da4")), ...MODEL.tiers.map((tier) => h('option', { value: String(tier.tier) }, tier.name)));
    const roleSelect = h('select', { 'aria-label': i18nText("ui.filter_warriors_by_role_96a096c67b") }, h('option', { value: '' }, i18nText("ui.all_roles_78f133afd3")), ...Object.entries(MODEL.roles).map(([id, role]) => h('option', { value: id }, role.name)));
    scope.addEventListener('change', () => { onlyUnlocked = scope.value === '1'; redraw(); });
    tierSelect.addEventListener('change', () => { tierFilter = Number(tierSelect.value); redraw(); });
    roleSelect.addEventListener('change', () => { roleFilter = roleSelect.value; redraw(); });
    const filters = h('div', { class: 'actions army-filters' }, scope, tierSelect, roleSelect);
    const trainList = h('div', { class: 'army-list' });
    const trainEmpty = h('p', { class: 'muted' }, i18nText("ui.no_warriors_match_these_filters_e406f7f775"));

    const visibleTroops = (v: ArmyView) =>
      Object.keys(gd.troops).filter((id) => {
        const warrior = WARRIORS.find((w) => w.liveTroop === id);
        if (onlyUnlocked && !troopUnlock(v.state, id, gd).unlocked) return false;
        return (!tierFilter || warrior?.tier === tierFilter) && (!roleFilter || warrior?.role === roleFilter);
      });

    const drawTabs = (v: ArmyView) => {
      const labels: [ArmyTab, string][] = [['train', 'Train'], ['army', 'Army'], ['research', v.state.research.active.length ? i18nText("ui.research_2372f176dd", { arg1: v.state.research.active.length }) : i18nText("ui.research_979d6300fd")]];
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
          }, i18nLabel(label)),
        ),
      );
    };

    const drawTrainPane = (v: ArmyView, now: number) => {
      const ready = v.dojo === 'ready' && v.camp === 'ready';
      const troops = visibleTroops(v);
      const scopeCount = Object.keys(gd.troops).filter((t) => troopUnlock(v.state, t, gd).unlocked).length;
      (scope.options[0] as HTMLOptionElement).textContent = i18nText("ui.unlocked_a4d304f69f", { arg1: scopeCount });
      const rows = troops.map((t) => {
        const row = trainRow(v, t, now, gd);
        const sig = JSON.stringify([t, row.quote.ok, !row.quote.ok && row.quote.message, row.quote.quote, row.fill, row.ahead, v.state.resources.dew >= (row.quote.quote?.cost.dew ?? 0), row.topUp]);
        return { t, row, sig };
      });
      // A one-tap army that fills the camps from warriors trainable now (sim/suggest.ts).
      const suggestion = ready ? suggestedArmy(v.state, gd) : {};
      const sig = JSON.stringify(['train', v.dojo, v.camp, rows.map((r) => r.sig), ready, suggestion, scopeCount >= 5]);
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
          Object.values(suggestion).some((n) => n > 0) ? this.refillRow(i18nText("ui.suggested_army_5963c5c4f7"), suggestion, draw) : null,
          // Filters only once there is something to filter (re-audit design item 4: 5 tiers and 10 roles for 2 warriors).
          v.dojo === 'ready' && scopeCount >= 5 ? filters : null,
          speed > 1 ? h('p', { class: 'muted small' }, i18nText("ui.your_training_dojo_trains_faster_than__0f817a20eb", { arg1: speed })) : null,
          trainList,
          !list.length && v.dojo === 'ready' ? trainEmpty : null,
        ].filter((x): x is HTMLElement => x !== null),
      );
    };

    const drawArmyPane = (v: ArmyView) => {
      const s = v.state;
      const sig = JSON.stringify(['army', s.army, v.freeHousing, v.waitingNeeds, lodgeTroops(s), v.stacks.map((st) => [st.troop, st.status, st.count, st.lastIndex, st.endsAt]), s.armyPresets, lastAttackArmy(s)]);
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
      const sig = JSON.stringify(['research', s.research, rows, s.resources]);
      if (sig === paneSig) return;
      paneSig = sig;
      pane.replaceChildren(filters, this.researchPane(v, now, visibleTroops(v), redraw));
    };

    const draw = () => {
      if (pressed) return;
      const now = c.now();
      const v = armyView(c.state, now, gd);
      const nextStrip = JSON.stringify([v.capacity, v.readyHousing, v.training, v.trainingHousing, v.next, v.waiting, v.active?.troop, v.active?.endsAt, v.activeStatus, v.armyDoneAt, v.skip?.moonstones]);
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
    this.d.kit.modal(i18nText("ui.army_99b3c46652"), body, [], 'wide', () => {
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
    strip.append(h('div', { class: 'army-strip-head' }, bar, h('b', { title: i18nText("ui.space_taken_in_the_squad_courtyards_1c399ecabc") }, i18nText("ui.space_cd35e035c6", { arg1: v.readyHousing, arg2: v.capacity }))));
    // Warriors, like every stack below; only the bar above counts space.
    const detail: string[] = [];
    if (v.training) detail.push(i18nText("ui.training_5a98af7086", { arg1: v.training }));
    if (v.next) detail.push(i18nText("ui.next_army_1eead92ed4", { arg1: v.next }));
    if (v.waiting) detail.push(i18nText("ui.waiting_4d88af2107", { arg1: v.waiting }));
    const line = h('div', { class: 'army-strip-line' });
    if (v.active) {
      const name = this.gd.troops[v.active.troop]?.name ?? v.active.troop;
      line.append(
        this.thumb(v.active.troop) ?? '',
        h(
          'div',
          { class: 'army-active' },
          h('div', { class: 'small army-active-name' }, h('b', {}, v.activeStatus === 'training' ? name : i18nText("ui.next_army_6229cadd79", { arg1: name })), h('span', { 'data-ends': String(v.active.endsAt) }, formatDuration(v.active.endsAt - now))),
          h('div', { class: 'progress thin' }, h('i', { 'data-from': String(v.active.startedAt), 'data-to': String(v.active.endsAt) })),
        ),
      );
    } else {
      line.append(h('span', { class: 'muted small army-active' }, v.waiting ? i18nText("ui.training_finished_2d132d7738") : i18nText("ui.nobody_is_training_3ebeed1802")));
    }
    if (v.armyDoneAt !== null && v.armyDoneAt > now && v.armyDoneAt !== v.active?.endsAt) {
      line.append(h('span', { class: 'chip', title: i18nText("ui.time_until_everyone_who_fits_in_the_sq_e22da4525e") }, icon(icons.clock), h('span', { 'data-ends': String(v.armyDoneAt) }, formatDuration(v.armyDoneAt - now))));
    }
    if (v.skip) {
      const quote = v.skip;
      const fin = h('button', { class: 'btn gold', type: 'button' }, i18nText("ui.finish_5fca98995d"), h('span', { class: 'chip' }, icon(icons.moonstones), String(quote.moonstones)));
      fin.addEventListener('click', () => void this.d.econ.spendMoonstones(i18nText("ui.finish_training_8f7c45cb3a"), i18nText("ui.finish_training_the_warriors_who_fit_i_3cd38c859b"), quote.moonstones, () => this.c.dispatch({ type: 'skipTraining' }).ok).then(redraw));
      line.append(fin);
    } else if (v.active) {
      // Jade only finishes warriors who fit, so say why there is no button.
      line.append(h('span', { class: 'chip army-noroom' }, i18nText("ui.no_room_to_finish_4a74b86b51")));
    }
    // Always one line, even an empty one: the strip keeps its height, so nothing below it moves under a finger.
    strip.append(line, h('p', { class: 'muted small army-detail' }, detail.length ? i18nText("ui.warriors_56148a7f40", { arg1: detail.join(' · ') }) : '\u00a0'));
  }

  /** Shown until training is possible, so an empty panel always says what to do next. */
  private setupCard(v: ArmyView): HTMLElement {
    const { gd } = this;
    const item = (name: string, st: BuildState) => h('li', { class: st === 'ready' ? 'ok' : '' }, h('b', {}, name), i18nText("ui.message_c4f174b2a5", { arg1: i18nLabel(BUILD_TEXT[st]) }));
    const missing = v.dojo === 'missing' || v.camp === 'missing';
    return h(
      'div',
      { class: 'army-setup' },
      h('p', {}, i18nText("ui.warriors_need_two_buildings_the_dojo_t_be7a3ece47")),
      h('ul', {}, item(gd.buildings.burrow_barracks.name, v.dojo), item(gd.buildings.army_camp.name, v.camp)),
      missing ? h('button', { class: 'btn primary', type: 'button', onclick: () => this.d.openBuildArmy() }, icon(icons.hammer), i18nText("ui.go_to_build_7d4ff141de")) : h('p', { class: 'muted small' }, i18nText("ui.training_opens_as_soon_as_the_work_is__589ba95a38")),
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
        this.d.kit.toast(i18nMessage(r.message, true), 'error');
      } else {
        const e = r.events.find((x) => x.kind === 'train_start');
        if (e && e.kind === 'train_start' && (e.count ?? 1) > 1) this.d.kit.toast(i18nText("ui.queued_14e0e4f109", { arg1: e.count, arg2: def.name }), 'success');
      }
      draw();
    };
    const buttons = h('div', { class: 'army-actions' });
    const add = (label: string, cls: string, disabled: boolean, onClick: () => void, title?: string) => {
      const b = h('button', { class: `btn ${cls}`, type: 'button', disabled, title }, i18nLabel(label));
      b.addEventListener('click', onClick);
      buttons.append(b);
    };
    add('+1', 'primary', !quote.ok, () => train(1));
    add('+5', 'ghost', !quote.ok, () => train(5));
    add(i18nText("ui.message_14677cb26f", { arg1: ahead ? i18nText("ui.next_1ff57a29d7") : i18nText("ui.fill_033955d469"), arg2: fill }), 'ghost', !quote.ok || fill < 1, () => train(fill), ahead ? i18nText("ui.the_squad_courtyards_are_spoken_for_tr_517004050c") : i18nText("ui.fill_the_squad_courtyards_47ea4f0fe9"));
    if (troopUnlock(s, t, gd).unlocked && v.capacity > 0) {
      add(i18nText("ui.try_85d6c0718c"), 'ghost', false, () => {
        this.d.kit.closeAllModals();
        this.d.onPractice(practiceArmy(c.state, t, gd));
      }, i18nText("ui.practice_battle_with_a_squad_of_nothin_bcdcdb0816", { arg1: def.name }));
    }
    // Below the row, full width, so a stray tap on +1 or Fill never lands on a purchase.
    const tu = row.topUp;
    if (tu) {
      const what = i18nText("ui.the_missing_and_queue_5af8353596", { arg1: missingText(tu.missing), arg2: tu.count, arg3: def.name });
      const b = h('button', { class: 'btn gold buy', type: 'button', title: i18nText("ui.buy_a95681848f", { arg1: what }) }, i18nText("ui.buy_64fe2149d3", { arg1: ahead ? i18nText("ui.next_1ff57a29d7") : i18nText("ui.fill_033955d469"), arg2: tu.count }), h('span', { class: 'chip' }, icon(icons.moonstones), String(tu.moonstones)));
      b.addEventListener('click', () => {
        const action = { type: 'train', troop: t, count: tu.count } as const;
        const price = topUpQuote(c.state, action, c.now(), gd)?.moonstones ?? tu.moonstones;
        void this.d.econ.spendMoonstones(i18nText("ui.buy_missing_provisions_afac263163"), i18nText("ui.buy_a95681848f", { arg1: what }), price, () => c.dispatch({ type: 'topUp', then: action }).ok).then(draw);
      });
      buttons.append(b);
    }
    return h(
      'div',
      { class: `troop-row army-card${locked ? ' locked' : ''}` },
      this.thumb(t),
      h(
        'div',
        { class: 'army-card-body' },
        h('b', {}, `${def.name} `, h('span', { class: 'muted small' }, i18nText("ui.lv_445f51ab9e", { arg1: lvl }))),
        h('span', { class: 'muted small army-desc' }, def.description),
        h(
          'span',
          { class: 'row' },
          costChips(cost, missingFor(s.resources, cost)),
          h('span', { class: 'chip' }, icon(icons.clock), formatDuration((quote.quote?.seconds ?? def.trainSeconds) * 1000)),
          h('span', { class: 'chip', title: i18nText("ui.courtyard_space_cc3c8e6bee") }, icon(icons.troops), String(def.housing)),
        ),
      ),
      buttons,
      !quote.ok ? h('span', { class: 'note' }, i18nMessage(quote.message)) : null,
    );
  }

  private armyPane(v: ArmyView, redraw: () => void): HTMLElement {
    const { c, gd } = this;
    const s = v.state;
    const wrap = h('div', {});
    const ready = h('div', { class: 'army-row' });
    for (const [t, n] of Object.entries(s.army)) {
      if (n <= 0) continue;
      const x = h('button', { class: 'qx', type: 'button', 'aria-label': i18nText("ui.dismiss_8e63f52b79", { arg1: gd.troops[t]?.name ?? t }) }, '×');
      x.addEventListener('click', () => this.dismiss(t, n, redraw));
      ready.append(h('span', { class: 'army-chip' }, this.thumb(t), i18nText("ui.message_fb705db4f9", { arg1: gd.troops[t]?.name ?? t, arg2: n }), x));
    }
    if (!ready.childElementCount) ready.append(h('span', { class: 'muted' }, i18nText("ui.no_warriors_ready_yet_0132a774ac")));
    const units = Object.values(s.army).reduce((a, b) => a + b, 0);
    wrap.append(h('h3', {}, units ? t('army.readyN', { n: units }) : t('army.ready')), ready);
    const lodge = Object.entries(lodgeTroops(s));
    if (lodge.length) {
      wrap.append(
        h('h3', {}, i18nText("ui.donated_by_your_alliance_07bb504dfc")),
        h('div', { class: 'army-row' }, ...lodge.map(([t, l]) => h('span', { class: 'army-chip' }, this.thumb(t), i18nText("ui.message_cf83918ca6", { arg1: gd.troops[t]?.name ?? t, arg2: l.count }), h('span', { class: 'muted small' }, i18nText("ui.lv_445f51ab9e", { arg1: l.level }))))),
        h('p', { class: 'muted small' }, i18nText("ui.they_fight_first_in_your_next_attack_a_889c0c0bce")),
      );
    }

    const training = v.stacks.filter((st) => st.status === 'training');
    if (training.length) wrap.append(h('h3', {}, i18nText("ui.training_36a798e3f3")), ...training.map((st) => this.stackRow(st, redraw)));
    // Queue order: whoever finished first is listed first, right under the note about them.
    const next = v.stacks.filter((st) => st.status !== 'training');
    if (next.length) {
      const who = t('army.finishedN', { n: v.waiting });
      const why = v.freeHousing > 0 ? i18nText("ui.can_t_fit_yet_space_free_and_the_small_d08ae53ec8", { arg1: who, arg2: v.freeHousing, arg3: v.waitingNeeds }) : i18nText("ui.can_t_fit_yet_the_squad_courtyards_are_6f165cc3f9", { arg1: who });
      wrap.append(
        h('h3', {}, i18nText("ui.next_army_d22ec6ad45")),
        v.waiting
          ? h('p', { class: 'army-note small' }, i18nText("ui.they_walk_in_by_themselves_after_a_rai_44b4659384", { arg1: why }))
          : h('p', { class: 'muted small' }, i18nText("ui.trained_ahead_they_join_your_army_when_9bb1987498")),
        ...next.map((st) => this.stackRow(st, redraw)),
      );
    }

    wrap.append(h('h3', {}, i18nText("ui.refill_in_one_tap_25afd91239")));
    const lastArmy = lastAttackArmy(s);
    if (lastArmy) wrap.append(this.refillRow(i18nText("ui.last_raid_64f8c08b89"), lastArmy, redraw));
    s.armyPresets.forEach((p, i) => {
      // The game creates these canonical default titles; custom titles stay literal.
      const name = /^Army [1-9]\d*$/.test(p.name) ? i18nMessage(p.name) : p.name;
      const del = h('button', { class: 'btn ghost', type: 'button', 'aria-label': i18nText("ui.delete_saved_army_8b557a5dd8", { arg1: name }) }, '×');
      del.addEventListener('click', () => {
        c.dispatch({ type: 'deleteArmyPreset', index: i });
        redraw();
      });
      wrap.append(this.refillRow(name, p.army, redraw, del));
    });
    const current: Record<string, number> = { ...s.army };
    for (const q of s.training) current[q.troop] = (current[q.troop] ?? 0) + 1;
    if (Object.keys(current).length && s.armyPresets.length < gd.economy.maxArmyPresets) {
      const save = h('button', { class: 'btn ghost', type: 'button', title: this.armyText(current) }, i18nText("ui.save_this_army_1dc1c01780"));
      save.addEventListener('click', () => {
        const r = c.dispatch({ type: 'saveArmyPreset', name: '', army: current });
        this.d.kit.toast(r.ok ? i18nText("ui.army_saved_refill_it_with_one_tap_de4b64b839") : r.message, r.ok ? 'success' : 'error');
        redraw();
      });
      wrap.append(h('div', { class: 'actions' }, save));
    } else if (Object.keys(current).length) {
      wrap.append(h('p', { class: 'muted small' }, i18nText("ui.you_can_keep_saved_armies_delete_one_t_8e05eb37ec", { arg1: gd.economy.maxArmyPresets })));
    } else if (!lastArmy && !s.armyPresets.length) {
      wrap.append(h('p', { class: 'muted small' }, i18nText("ui.train_some_warriors_then_save_the_mix__b5c6068bc8")));
    }
    return wrap;
  }

  private stackRow(st: QueueStack, redraw: () => void): HTMLElement {
    const { c, gd } = this;
    const name = gd.troops[st.troop]?.name ?? st.troop;
    const cancel = (count: number) => {
      const r = c.dispatch({ type: 'cancelTraining', index: st.lastIndex, troop: st.troop, count });
      if (!r.ok) this.d.kit.toast(i18nMessage(r.message, true), 'error');
      redraw();
    };
    const one = h('button', { class: 'btn ghost', type: 'button', 'aria-label': i18nText("ui.cancel_one_68bad9c098", { arg1: name }) }, '−1');
    one.addEventListener('click', () => cancel(1));
    const all = h('button', { class: 'btn ghost', type: 'button', 'aria-label': i18nText("ui.cancel_all_a27367487b", { arg1: st.count, arg2: name }) }, i18nText("ui.all_a52ace420f"));
    all.addEventListener('click', () => {
      void this.d.kit.confirm(i18nText("ui.cancel_f255be5c54", { arg1: st.count, arg2: name }), i18nText("ui.their_full_training_cost_comes_back_as_f041503b5b"), i18nText("ui.cancel_them_cc3b34ee3a"), true).then((ok) => {
        if (ok) cancel(st.count);
      });
    });
    return h(
      'div',
      { class: 'stack-row' },
      this.thumb(st.troop),
      h('b', {}, i18nText("ui.message_fb705db4f9", { arg1: name, arg2: st.count })),
      st.status === 'waiting' ? h('span', { class: 'chip good' }, i18nText("ui.ready_needs_space_66ff28a442", { arg1: gd.troops[st.troop]?.housing ?? 0 })) : h('span', { class: 'chip', title: i18nText("ui.when_the_last_of_this_stack_finishes_a_7a43f240f3") }, icon(icons.clock), i18nText("ui.done_in_29027c7d03"), h('span', { 'data-ends': String(st.endsAt) }, '')),
      h('span', { class: 'row' }, one, st.count > 1 ? all : null),
    );
  }

  private refillRow(name: string, army: Record<string, number>, redraw: () => void, extra?: HTMLElement): HTMLElement {
    const go = h('button', { class: 'btn sky', type: 'button' }, i18nText("ui.train_e99c90db87"));
    go.addEventListener('click', () => {
      const r = this.c.dispatch({ type: 'trainArmy', army });
      if (!r.ok) {
        this.d.kit.toast(i18nMessage(r.message, true), 'error');
      } else {
        const queued = r.events.reduce((sum, e) => sum + (e.kind === 'train_start' ? e.count ?? 1 : 0), 0);
        const short = r.events.find((e) => e.kind === 'train_short');
        if (short && short.kind === 'train_short') this.d.kit.toast(i18nText("ui.queued_more_could_not_be_queued_61c350a031", { arg1: queued, arg2: short.missing, arg3: short.why }), 'info');
        else this.d.kit.toast(t('army.queued', { n: queued }), 'success');
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
      const refund = i18nList(RESOURCE_KINDS.filter((k) => p.refund[k]).map((k) => i18nText("ui.message_14677cb26f", { arg1: formatNumber(p.refund[k]!), arg2: RES_LABEL[k] })), 'conjunction');
      return i18nText("ui.courtyard_space_free_cc8f5dedb2", { arg1: count === have && have > 1 ? i18nText("ui.all_of_them_29c88933c2") : i18nText("ui.one_8b12507783"), arg2: p.housing, arg3: refund ? i18nText("ui.back_b6a11177c0", { arg1: refund }) : '' });
    };
    const go = (count: number) => {
      close();
      const r = c.dispatch({ type: 'dismiss', troop, count });
      if (!r.ok) this.d.kit.toast(i18nMessage(r.message, true), 'error');
      redraw();
    };
    const body = h(
      'div',
      {},
      h('p', {}, i18nText("ui.they_go_home_for_good_you_get_back_of__78006a5afa", { arg1: Math.round(gd.economy.dismissRefundFraction * 100) })),
      h('p', { class: 'muted small' }, text(1)),
      have > 1 ? h('p', { class: 'muted small' }, text(have)) : null,
    );
    const close = this.d.kit.modal(i18nText("ui.dismiss_1afe5c883f", { arg1: name }), body, [
      { label: i18nText("ui.keep_them_0d472b0953"), onClick: () => close() },
      have > 1 ? { label: i18nText("ui.dismiss_1_46f826e660"), onClick: () => go(1) } : null,
      { label: have > 1 ? i18nText("ui.dismiss_all_ed025e80a6", { arg1: have }) : i18nText("ui.dismiss_48845bff33"), danger: true, onClick: () => go(have) },
    ]);
  }

  private researchPane(v: ArmyView, now: number, troops: string[], redraw: () => void): HTMLElement {
    const { c, gd } = this;
    const s = v.state;
    const wrap = h('div', {});
    const lanes = researchLanes(hallLevel(s, gd), gd);
    wrap.append(h('p', { class: 'muted small' }, i18nText("ui.the_training_dojo_researches_a_higher__86a9e8dcd1", { arg1: lanes > 1 ? i18nText("ui.warriors_at_a_time_29a1f7a91f", { arg1: lanes }) : i18nText("ui.one_warrior_at_a_time_4e52f26427") })));
    for (const active of s.research.active) {
      const ad = gd.troops[active.troop];
      const row = h('div', { class: 'progress-row' }, h('span', {}, i18nText("ui.level_ab12f81e7d", { arg1: ad?.name ?? active.troop, arg2: active.toLevel })), h('span', { class: 'chip', 'data-ends': String(active.endsAt) }, formatDuration(active.endsAt - now)));
      const acts = h('div', { class: 'actions' });
      const rsq = researchSkipQuote(s, now, gd, active.troop);
      if (rsq) {
        const fin = h('button', { class: 'btn gold', type: 'button' }, i18nText("ui.finish_now_3e2c46dd09"), h('span', { class: 'chip' }, icon(icons.moonstones), String(rsq.moonstones)));
        fin.addEventListener('click', () => void this.d.econ.spendMoonstones(i18nText("ui.finish_research_2c3546dabb"), i18nText("ui.finish_level_now_6451145ae3", { arg1: ad?.name ?? 'research', arg2: active.toLevel }), rsq.moonstones, () => c.dispatch({ type: 'skipResearch', troop: active.troop }).ok).then(redraw));
        acts.append(fin);
      }
      const cancel = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.cancel_19766ed6cc"));
      cancel.addEventListener('click', () => {
        void this.d.kit.confirm(i18nText("ui.cancel_research_a54ee5db99"), i18nText("ui.you_ll_get_back_of_what_you_paid_59199c43a7", { arg1: Math.round(gd.economy.cancelRefundFraction * 100) }), i18nText("ui.cancel_research_8c536089ad"), true).then((ok) => {
          if (!ok) return;
          const r = c.dispatch({ type: 'cancelResearch', troop: active.troop });
          if (!r.ok) this.d.kit.toast(i18nMessage(r.message, true), 'error');
          redraw();
        });
      });
      acts.append(cancel);
      wrap.append(row, acts);
    }
    if (s.research.active.length < lanes) wrap.append(h('p', { class: 'muted small' }, t('research.lanesFree', { n: lanes - s.research.active.length })));
    const list = h('div', { class: 'army-list' });
    for (const t of troops) {
      const def = gd.troops[t];
      const lvl = troopLevelOf(s, t);
      const rq = researchRow(v, t, now, gd);
      if (!rq.ok && (rq.code === 'LOCKED' || (rq.code === 'MAX_LEVEL' && !rq.quote))) {
        list.append(h('div', { class: 'troop-row army-card locked' }, this.thumb(t), h('div', { class: 'army-card-body' }, h('b', {}, `${def.name} `, h('span', { class: 'muted small' }, i18nText("ui.lv_445f51ab9e", { arg1: lvl }))), h('span', { class: 'note' }, i18nMessage(rq.message)))));
        continue;
      }
      const cur = troopLevel(gd, t, lvl);
      const nxt = rq.quote ? troopLevel(gd, t, rq.quote.toLevel) : null;
      const btn = h('button', { class: 'btn primary', type: 'button', disabled: !rq.ok }, i18nText('common.researchAction'));
      btn.addEventListener('click', () => {
        const r = c.dispatch({ type: 'research', troop: t });
        if (!r.ok) this.d.kit.toast(i18nMessage(r.message, true), 'error');
        redraw();
      });
      const rtu = researchTopUp(v, t, now, gd);
      let buy: HTMLElement | null = null;
      if (rtu) {
        const what = i18nText("ui.the_missing_and_start_level_7ee43d338d", { arg1: missingText(rtu.missing), arg2: def.name, arg3: rq.quote?.toLevel });
        buy = h('button', { class: 'btn gold buy', type: 'button', title: i18nText("ui.buy_a95681848f", { arg1: what }) }, i18nText("ui.buy_missing_60a848c106"), h('span', { class: 'chip' }, icon(icons.moonstones), String(rtu.moonstones)));
        buy.addEventListener('click', () => {
          const action = { type: 'research', troop: t } as const;
          const price = topUpQuote(c.state, action, c.now(), gd)?.moonstones ?? rtu.moonstones;
          void this.d.econ.spendMoonstones(i18nText("ui.buy_missing_provisions_afac263163"), i18nText("ui.buy_a95681848f", { arg1: what }), price, () => c.dispatch({ type: 'topUp', then: action }).ok).then(redraw);
        });
      }
      list.append(
        h(
          'div',
          { class: `troop-row army-card${rq.ok || rtu ? '' : ' locked'}` },
          this.thumb(t),
          h(
            'div',
            { class: 'army-card-body' },
            h('b', {}, `${def.name} `, h('span', { class: 'muted small' }, nxt ? i18nText("ui.lv_99eff11c93", { arg1: lvl, arg2: nxt.level }) : i18nText("ui.lv_445f51ab9e", { arg1: lvl }))),
            nxt ? h('span', { class: 'muted small' }, i18nText("ui.hp_damage_f5da8dfe3f", { arg1: cur.hp, arg2: nxt.hp, arg3: cur.damage, arg4: nxt.damage })) : null,
            rq.quote ? h('span', { class: 'row' }, costChips(rq.quote.cost, missingFor(s.resources, rq.quote.cost)), h('span', { class: 'chip' }, icon(icons.clock), formatDuration(rq.quote.seconds * 1000))) : null,
          ),
          nxt ? h('div', { class: 'army-actions research-actions' }, btn, buy) : null,
          !rq.ok ? h('span', { class: 'note' }, i18nMessage(rq.message)) : null,
        ),
      );
    }
    if (!troops.length) wrap.append(h('p', { class: 'muted' }, i18nText("ui.no_warriors_match_these_filters_e406f7f775")));
    wrap.append(list);
    return wrap;
  }
}

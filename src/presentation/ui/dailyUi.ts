import { messageText as ownedError } from './i18n';
import { dateText as i18nDate, listText as i18nList } from './i18n';
import { displayData as localizedData, labelText as i18nLabel } from './i18n';
import { t as i18nText } from './i18n';
/**
 * Daily chest (odds always shown before opening, free, one a day) and the
 * limited-time events panel (fixed schedule, real countdowns).
 */
import { t } from './i18n';
import { chestContents, chestOdds, chestReady, nextChestAt, streakAfterClaim, streakJadeDue } from '../../gameplay/sim/daily';
import { activeEvents, upcomingEvents, type EventWindow } from '../../gameplay/sim/events';
import { goalEventView } from '../../gameplay/sim/goalEvents';
import type { BaseLayout } from '../../gameplay/sim/battle/types';
import { dayIndex } from '../../gameplay/sim/pass';
import { calendarView } from '../../gameplay/sim/calendar';
import { dailyChestOverflowRisk, hallLevel } from '../../gameplay/sim/village';
import type { Cost } from '../../gameplay/sim/types';
import { clear, h, icon } from './dom';
import { rewardChips, type UiKit } from './economyUi';
import { formatDuration } from './format';
import { icons } from './icons';
import { uiArt } from './feedback';
import { sound } from '../audio/sound';

const pct = (p: number) => `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
const when = (t: number) => i18nDate(t, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

export interface DailyOpts {
  /** The Clan Stipend's claim card (EconomyUi.stipendCard), shown on top of the daily chest. */
  stipendCard?(redraw: () => void): HTMLElement | null;
  /** Attack a goal event's bounty fortress (app.ts: a battle settled with `bountyEnd`). */
  onBounty?(eventKey: string, base: BaseLayout): void;
}

export class DailyUi {
  constructor(
    private readonly kit: UiKit,
    private readonly opts: DailyOpts = {},
  ) {}

  /**
   * Report section 5 step 8 (growth 19): the 28-day calendar. Fixed rewards, one a day on the player's own
   * calendar, never random and never sold; a missed day loses nothing.
   */
  private calendarSection(redraw: () => void): HTMLElement {
    const c = this.kit.c;
    const gd = localizedData(c.data);
    const now = c.now();
    const view = calendarView(c.state, now, hallLevel(c.state, gd), gd);
    const wrap = h('div', { class: 'calendar' });
    if (!view) return wrap;
    const grid = h('div', { class: 'calendar-grid', role: 'list' });
    for (const d of view.days) {
      const isNext = d.day === view.next;
      const label = d.reward.skin ? t('calendar.look') : '';
      grid.append(
        h(
          'div',
          { class: `calendar-day${d.claimed ? ' done' : ''}${isNext ? ' current' : ''}${d.reward.skin ? ' big' : ''}`, role: 'listitem', 'aria-label': i18nText("ui.day_d3662af346", { arg1: d.day, arg2: d.claimed ? i18nText("ui.claimed_e3340580c9") : '' }) },
          h('b', {}, String(d.day)),
          d.reward.skin ? h('span', { class: 'small' }, i18nLabel(label)) : rewardChips(d.reward as Cost),
        ),
      );
    }
    const actions = h('div', { class: 'actions' });
    if (view.ready) {
      const btn = h('button', { class: 'btn primary', type: 'button' }, icon(icons.check), t('calendar.claim', { n: view.next }));
      btn.addEventListener('click', () => {
        const r = c.dispatch({ type: 'claimCalendar' });
        if (!r.ok) this.kit.toast(ownedError(r.message, true), 'error');
        else this.kit.toast(view.days[view.next - 1].reward.skin ? t('calendar.gotLook') : t('calendar.claimed', { n: view.next }), 'success');
        redraw();
      });
      actions.append(btn);
    } else {
      actions.append(h('p', { class: 'muted' }, t('calendar.next', { time: formatDuration(view.nextAt - now) })));
    }
    wrap.append(h('h3', {}, t('calendar.title')), h('p', { class: 'muted small' }, t('calendar.about')), grid, actions);
    return wrap;
  }

  openDaily(): void {
    const c = this.kit.c;
    const body = h('div', { class: 'daily' });
    let opened: { outcome: string; grants: Record<string, number>; overflow?: Cost; skipped: number; steppedBack: number } | null = null;
    /** Play the reveal once, right after the chest is opened (re-audit design item 15). */
    let revealNext = false;
    const render = () => {
      clear(body);
      const s = c.state;
      const gd = localizedData(c.data);
      const now = c.now();
      const hall = hallLevel(s, gd);
      const ready = chestReady(s, now, gd);
      const preview = streakAfterClaim(s.daily, dayIndex(now, gd), gd);
      const step = ready ? preview.step : s.daily.step;
      const steps = gd.daily.streak.steps;
      const stipend = this.opts.stipendCard?.(render);
      if (stipend) body.append(stipend);

      // Streak ladder
      const ladder = h('div', { class: 'streak' });
      steps.forEach((st, i) => {
        const n = i + 1;
        ladder.append(
          h(
            'div',
            { class: `streak-step${n <= s.daily.step ? ' done' : ''}${n === step ? ' current' : ''}` },
            h('b', {}, i18nText("ui.day_d3662af346", { arg1: n, arg2: n === steps.length ? '+' : '' })),
            h('span', { class: 'small' }, st.bonus > 1 ? `+${Math.round((st.bonus - 1) * 100)}%` : i18nText("ui.base_7b47361aad")),
            st.moonstones ? h('span', { class: 'small' }, icon(icons.moonstones), `+${st.moonstones}${gd.daily.streak.jadeEveryDays && gd.daily.streak.jadeEveryDays > 1 ? i18nText("ui.a_week_689b7cedf5") : ''}`) : '',
          ),
        );
      });
      const skips = ready ? preview.skipsLeft : s.daily.skipsLeft;
      // The chest itself (ART's honest reveal: the lid opens, then what was really granted rises out; the same
      // animation for every outcome). Without the art, the panel is as before.
      if (uiArt.chestSvg) {
        const stage = h('div', { class: 'chest-stage', 'aria-hidden': 'true' });
        if (opened && revealNext && uiArt.revealChest) {
          revealNext = false;
          const reward = h('div', { class: 'chest-reveal-reward' }, rewardChips(opened.grants));
          void uiArt.revealChest(stage, reward, { onOpen: () => { sound.play('magic'); uiArt.haptic('success'); } });
        } else {
          stage.innerHTML = uiArt.chestSvg(ready ? 'closed' : 'open');
        }
        body.append(stage);
      }
      body.append(
        h('h3', {}, i18nText("ui.your_streak_696f2354e7")),
        ladder,
        h('p', { class: 'muted small' }, i18nText("ui.open_a_chest_each_day_to_climb_missing_86aed20bd2", { arg1: skips })),
      );

      // Result of the chest just opened
      if (opened) {
        const label = gd.daily.chest.outcomes.find((o) => o.id === opened!.outcome)?.label ?? opened.outcome;
        const notes: string[] = [];
        if (opened.skipped) notes.push(i18nText("ui.a_free_skip_covered_you_missed_d762c066c0", { arg1: opened.skipped === 1 ? i18nText("ui.the_day_9f7fd2ef42") : i18nText("ui.days_d7f711040e", { arg1: opened.skipped }) }));
        if (opened.steppedBack) notes.push(t('daily.missed', { n: opened.steppedBack }));
        // Only what was really added is shown as received; anything that did not fit is listed as such.
        const lost = opened.overflow && Object.values(opened.overflow).some((v) => (v ?? 0) > 0) ? h('p', { class: 'note' }, i18nText("ui.did_not_fit_in_your_storage_e281ba747c"), rewardChips(opened.overflow)) : null;
        body.append(h('div', { class: 'chest-result' }, h('b', {}, i18nText("ui.you_got_16558d9a7d", { arg1: label })), rewardChips(opened.grants), lost, ...notes.map((n) => h('p', { class: 'muted small' }, n))));
      }

      // Odds, always visible before opening
      const table = h('div', { class: 'odds' });
      for (const o of chestOdds(gd)) {
        table.append(
          h(
            'div',
            { class: `log-row${opened?.outcome === o.id ? ' current' : ''}` },
            h('div', {}, h('b', {}, o.label), h('div', { class: 'muted small' }, i18nText("ui.chance_715bf06fb1", { arg1: pct(o.percent) }))),
            rewardChips(chestContents(o.id, hall, Math.max(1, step), gd, streakJadeDue(s.daily, dayIndex(now, gd), gd))),
          ),
        );
      }
      body.append(h('h3', {}, i18nText("ui.what_s_inside_exact_odds_410a56fa88")), table, h('p', { class: 'muted small' }, i18nText("ui.contents_are_sized_for_your_clan_keep__e282ce8f31", { arg1: hall, arg2: Math.max(1, step) })));

      const actions = h('div', { class: 'actions' });
      if (ready) {
        const btn = h('button', { class: 'btn primary', type: 'button' }, icon(icons.chest), t('daily.open'));
        btn.addEventListener('click', async () => {
          // The chest is one a day: if storage is too full for it, say so before it is used up.
          const risk = dailyChestOverflowRisk(c.state, c.now(), gd);
          if (Object.keys(risk).length) {
            const ok = await this.kit.confirm(i18nText("ui.storage_is_nearly_full_d2d896dc65"), i18nText("ui.some_of_what_this_chest_can_hold_may_n_247bf6be70"), i18nText("ui.open_anyway_91b985dfcf"), false, i18nText("ui.not_now_a0e63d7c71"));
            if (!ok) return;
          }
          const r = c.dispatch({ type: 'openDailyChest' });
          if (!r.ok) {
            this.kit.toast(ownedError(r.message, true), 'error');
            return;
          }
          const e = r.events.find((x) => x.kind === 'daily_chest');
          if (e && e.kind === 'daily_chest') opened = { outcome: e.outcome, grants: e.grants as Record<string, number>, overflow: e.overflow, skipped: e.skipped, steppedBack: e.steppedBack };
          revealNext = true;
          render();
        });
        actions.append(btn);
      } else {
        actions.append(h('p', { class: 'muted' }, t('daily.next', { time: formatDuration(nextChestAt(now, gd) - now) })));
      }
      body.append(actions);
      body.append(this.calendarSection(render));
    };
    render();
    this.kit.modal(i18nText("ui.daily_chest_f40fff0e7c"), body, [], 'normal');
  }

  openEvents(): void {
    const c = this.kit.c;
    const gd = localizedData(c.data);
    const now = c.now();
    const body = h('div', { class: 'events-panel' });
    const row = (e: EventWindow, live: boolean) =>
      h(
        'div',
        { class: `log-row${live ? ' current' : ''}` },
        h('div', {}, h('b', {}, e.name), h('div', { class: 'small' }, e.description), h('div', { class: 'muted small' }, i18nText("ui.message_3730dc16f8", { arg1: when(e.start), arg2: when(e.end) }))),
        h('span', { class: 'chip' }, icon(icons.clock), live ? i18nText("ui.left_4bf724512e", { arg1: formatDuration(e.end - now) }) : i18nText("ui.in_05653906ff", { arg1: formatDuration(e.start - now) })),
      );
    const live = activeEvents(now, gd);
    body.append(h('h3', {}, live.length ? i18nText("ui.running_now_cb9581b3d2") : i18nText("ui.nothing_running_right_now_a010eefe12")));
    for (const e of live) body.append(row(e, true));
    // A goal event (sim/goalEvents.ts): its ladder, what each step pays at this Keep, what is paid, the best try.
    const view = goalEventView(c.state, now, gd);
    if (view) {
      const best = view.progress.key === view.event.key ? view.progress : { best: 0, bestDestruction: 0 };
      const ladder = h('div', { class: 'goal-ladder' });
      for (const l of view.ladder) {
        const need = i18nList([l.step.at > 0 ? `${l.step.at}★` : '', l.step.destruction !== undefined ? `${l.step.destruction}%` : ''].filter(Boolean), 'disjunction');
        ladder.append(h('div', { class: `log-row${l.paid ? ' current' : ''}` }, h('b', {}, need), rewardChips(l.reward), l.paid ? h('span', { class: 'chip good' }, i18nText("ui.paid_cdc49c0e76")) : h('span', { class: 'claim-flat' }, i18nText("ui.not_yet_a9549d7d06"))));
      }
      const attack = h('button', { class: 'btn danger', type: 'button' }, i18nText("ui.attack_the_bounty_fortress_0d8fd46d63"));
      attack.addEventListener('click', () => {
        this.kit.closeAllModals();
        this.opts.onBounty?.(view.event.key, view.base);
      });
      body.append(
        h('h3', {}, i18nText("ui.the_bounty_5926de348f", { arg1: view.event.name })),
        h('p', { class: 'small' }, h('b', {}, i18nText("ui.bounty_fortress_generated_f5b15022f2")), i18nText("ui.a_computer_made_fortress_at_your_keep__c3734d68ef")),
        h('p', { class: 'muted small' }, i18nText("ui.your_best_1a23394f2a", { arg1: best.best, arg2: best.bestDestruction })),
        ladder,
      );
      if (this.opts.onBounty) body.append(h('div', { class: 'actions' }, attack));
    }
    body.append(h('h3', {}, i18nText("ui.coming_up_b743c76082")));
    for (const e of upcomingEvents(now, 4, gd)) body.append(row(e, false));
    body.append(h('p', { class: 'muted small' }, i18nText("ui.events_follow_a_fixed_schedule_that_re_423f6e2134")));
    this.kit.modal(i18nText("ui.events_8d14f6e72d"), body, [], 'normal');
  }

  /** Short text for the HUD chip. */
  static chipText(now: number, c: UiKit['c']): string {
    const gd = localizedData(c.data);
    const live = activeEvents(now, gd)[0];
    if (live) return i18nText("ui.left_12f73d4584", { arg1: live.name, arg2: formatDuration(live.end - now) });
    const next = upcomingEvents(now, 1, gd)[0];
    return next ? i18nText("ui.next_in_ac5ddfc0d1", { arg1: next.name, arg2: formatDuration(next.start - now) }) : i18nText("ui.events_8d14f6e72d");
  }
}

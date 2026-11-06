/**
 * Daily chest (odds always shown before opening, free, one a day) and the
 * limited-time events panel (fixed schedule, real countdowns).
 */
import { chestContents, chestOdds, chestReady, nextChestAt, streakAfterClaim, streakJadeDue } from '../../gameplay/sim/daily';
import { activeEvents, upcomingEvents, type EventWindow } from '../../gameplay/sim/events';
import { goalEventView } from '../../gameplay/sim/goalEvents';
import type { BaseLayout } from '../../gameplay/sim/battle/types';
import { dayIndex } from '../../gameplay/sim/pass';
import { dailyChestOverflowRisk, hallLevel } from '../../gameplay/sim/village';
import type { Cost } from '../../gameplay/sim/types';
import { clear, h, icon } from './dom';
import { rewardChips, type UiKit } from './economyUi';
import { formatDuration } from './format';
import { icons } from './icons';
import { uiArt } from './feedback';
import { sound } from '../audio/sound';

const pct = (p: number) => `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

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

  openDaily(): void {
    const c = this.kit.c;
    const body = h('div', { class: 'daily' });
    let opened: { outcome: string; grants: Record<string, number>; overflow?: Cost; skipped: number; steppedBack: number } | null = null;
    /** Play the reveal once, right after the chest is opened (re-audit design item 15). */
    let revealNext = false;
    const render = () => {
      clear(body);
      const s = c.state;
      const gd = c.data;
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
            h('b', {}, `Day ${n}${n === steps.length ? '+' : ''}`),
            h('span', { class: 'small' }, st.bonus > 1 ? `+${Math.round((st.bonus - 1) * 100)}%` : 'Base'),
            st.moonstones ? h('span', { class: 'small' }, icon(icons.moonstones), `+${st.moonstones}${gd.daily.streak.jadeEveryDays && gd.daily.streak.jadeEveryDays > 1 ? ' a week' : ''}`) : '',
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
        h('h3', {}, 'Your streak'),
        ladder,
        h('p', { class: 'muted small' }, `Open a chest each day to climb. Missing a day never resets your streak: a free skip covers one missed day a week (${skips} left this week), and after that you move back one step per missed day.`),
      );

      // Result of the chest just opened
      if (opened) {
        const label = gd.daily.chest.outcomes.find((o) => o.id === opened!.outcome)?.label ?? opened.outcome;
        const notes: string[] = [];
        if (opened.skipped) notes.push(`A free skip covered ${opened.skipped === 1 ? 'the day' : `${opened.skipped} days`} you missed.`);
        if (opened.steppedBack) notes.push(`You missed ${opened.steppedBack} day${opened.steppedBack > 1 ? 's' : ''} without a skip, so your streak moved back ${opened.steppedBack} step${opened.steppedBack > 1 ? 's' : ''}.`);
        // Only what was really added is shown as received; anything that did not fit is listed as such.
        const lost = opened.overflow && Object.values(opened.overflow).some((v) => (v ?? 0) > 0) ? h('p', { class: 'note' }, 'Did not fit in your storage: ', rewardChips(opened.overflow)) : null;
        body.append(h('div', { class: 'chest-result' }, h('b', {}, `You got: ${label}`), rewardChips(opened.grants), lost, ...notes.map((n) => h('p', { class: 'muted small' }, n))));
      }

      // Odds, always visible before opening
      const table = h('div', { class: 'odds' });
      for (const o of chestOdds(gd)) {
        table.append(
          h(
            'div',
            { class: `log-row${opened?.outcome === o.id ? ' current' : ''}` },
            h('div', {}, h('b', {}, o.label), h('div', { class: 'muted small' }, `Chance: ${pct(o.percent)}`)),
            rewardChips(chestContents(o.id, hall, Math.max(1, step), gd, streakJadeDue(s.daily, dayIndex(now, gd), gd))),
          ),
        );
      }
      body.append(h('h3', {}, "What's inside (exact odds)"), table, h('p', { class: 'muted small' }, `Contents are sized for your Clan Keep level ${hall} and streak day ${Math.max(1, step)}. The chest is free and can't be bought or reopened.`));

      const actions = h('div', { class: 'actions' });
      if (ready) {
        const btn = h('button', { class: 'btn primary', type: 'button' }, icon(icons.chest), " Open today's chest (free)");
        btn.addEventListener('click', async () => {
          // The chest is one a day: if storage is too full for it, say so before it is used up.
          const risk = dailyChestOverflowRisk(c.state, c.now(), gd);
          if (Object.keys(risk).length) {
            const ok = await this.kit.confirm('Storage is nearly full', 'Some of what this chest can hold may not fit in your storage, and anything that does not fit is lost. Spend or collect some resources first, or open it anyway.', 'Open anyway', false, 'Not now');
            if (!ok) return;
          }
          const r = c.dispatch({ type: 'openDailyChest' });
          if (!r.ok) {
            this.kit.toast(r.message, 'error');
            return;
          }
          const e = r.events.find((x) => x.kind === 'daily_chest');
          if (e && e.kind === 'daily_chest') opened = { outcome: e.outcome, grants: e.grants as Record<string, number>, overflow: e.overflow, skipped: e.skipped, steppedBack: e.steppedBack };
          revealNext = true;
          render();
        });
        actions.append(btn);
      } else {
        actions.append(h('p', { class: 'muted' }, `Next chest in ${formatDuration(nextChestAt(now, gd) - now)}.`));
      }
      body.append(actions);
    };
    render();
    this.kit.modal('Daily chest', body, [], 'normal');
  }

  openEvents(): void {
    const c = this.kit.c;
    const gd = c.data;
    const now = c.now();
    const body = h('div', { class: 'events-panel' });
    const row = (e: EventWindow, live: boolean) =>
      h(
        'div',
        { class: `log-row${live ? ' current' : ''}` },
        h('div', {}, h('b', {}, e.name), h('div', { class: 'small' }, e.description), h('div', { class: 'muted small' }, `${when(e.start)} – ${when(e.end)}`)),
        h('span', { class: 'chip' }, icon(icons.clock), live ? `${formatDuration(e.end - now)} left` : `in ${formatDuration(e.start - now)}`),
      );
    const live = activeEvents(now, gd);
    body.append(h('h3', {}, live.length ? 'Running now' : 'Nothing running right now'));
    for (const e of live) body.append(row(e, true));
    // A goal event (sim/goalEvents.ts): its ladder, what each step pays at this Keep, what is paid, the best try.
    const view = goalEventView(c.state, now, gd);
    if (view) {
      const best = view.progress.key === view.event.key ? view.progress : { best: 0, bestDestruction: 0 };
      const ladder = h('div', { class: 'goal-ladder' });
      for (const l of view.ladder) {
        const need = [l.step.at > 0 ? `${l.step.at}★` : '', l.step.destruction !== undefined ? `${l.step.destruction}%` : ''].filter(Boolean).join(' or ');
        ladder.append(h('div', { class: `log-row${l.paid ? ' current' : ''}` }, h('b', {}, need), rewardChips(l.reward), l.paid ? h('span', { class: 'chip good' }, '✓ Paid') : h('span', { class: 'claim-flat' }, 'Not yet')));
      }
      const attack = h('button', { class: 'btn danger', type: 'button' }, 'Attack the bounty fortress');
      attack.addEventListener('click', () => {
        this.kit.closeAllModals();
        this.opts.onBounty?.(view.event.key, view.base);
      });
      body.append(
        h('h3', {}, `${view.event.name}: the bounty`),
        h('p', { class: 'small' }, h('b', {}, 'Bounty fortress (generated). '), 'A computer-made fortress at your Keep level, the same one every try. Each step of the ladder pays once; no honor or loot changes hands.'),
        h('p', { class: 'muted small' }, `Your best: ${best.best}★ · ${best.bestDestruction}%`),
        ladder,
      );
      if (this.opts.onBounty) body.append(h('div', { class: 'actions' }, attack));
    }
    body.append(h('h3', {}, 'Coming up'));
    for (const e of upcomingEvents(now, 4, gd)) body.append(row(e, false));
    body.append(h('p', { class: 'muted small' }, 'Events follow a fixed schedule that repeats every two weeks. Their times never move or get extended, so the countdown is always the real one.'));
    this.kit.modal('Events', body, [], 'normal');
  }

  /** Short text for the HUD chip. */
  static chipText(now: number, c: UiKit['c']): string {
    const gd = c.data;
    const live = activeEvents(now, gd)[0];
    if (live) return `${live.name} · ${formatDuration(live.end - now)} left`;
    const next = upcomingEvents(now, 1, gd)[0];
    return next ? `Next: ${next.name} in ${formatDuration(next.start - now)}` : 'Events';
  }
}

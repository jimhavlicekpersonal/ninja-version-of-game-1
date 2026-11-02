/**
 * Daily chest (odds always shown before opening, free, one a day) and the
 * limited-time events panel (fixed schedule, real countdowns).
 */
import { chestContents, chestOdds, chestReady, nextChestAt, streakAfterClaim } from '../sim/daily';
import { activeEvents, upcomingEvents, type EventWindow } from '../sim/events';
import { dayIndex } from '../sim/pass';
import { hallLevel } from '../sim/village';
import { clear, h, icon } from './dom';
import { rewardChips, type UiKit } from './economyUi';
import { formatDuration } from './format';
import { icons } from './icons';

const pct = (p: number) => `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

export class DailyUi {
  constructor(private readonly kit: UiKit) {}

  openDaily(): void {
    const c = this.kit.c;
    const body = h('div', { class: 'daily' });
    let opened: { outcome: string; grants: Record<string, number>; skipped: number; steppedBack: number } | null = null;
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
            st.moonstones ? h('span', { class: 'small' }, icon(icons.moonstones), `+${st.moonstones}`) : '',
          ),
        );
      });
      const skips = ready ? preview.skipsLeft : s.daily.skipsLeft;
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
        body.append(h('div', { class: 'chest-result' }, h('b', {}, `You got: ${label}`), rewardChips(opened.grants), ...notes.map((n) => h('p', { class: 'muted small' }, n))));
      }

      // Odds, always visible before opening
      const table = h('div', { class: 'odds' });
      for (const o of chestOdds(gd)) {
        table.append(
          h(
            'div',
            { class: `log-row${opened?.outcome === o.id ? ' current' : ''}` },
            h('div', {}, h('b', {}, o.label), h('div', { class: 'muted small' }, `Chance: ${pct(o.percent)}`)),
            rewardChips(chestContents(o.id, hall, Math.max(1, step), gd)),
          ),
        );
      }
      body.append(h('h3', {}, "What's inside (exact odds)"), table, h('p', { class: 'muted small' }, `Contents are sized for your Elder Toadstool level ${hall} and streak day ${Math.max(1, step)}. The chest is free and can't be bought or reopened.`));

      const actions = h('div', { class: 'actions' });
      if (ready) {
        const btn = h('button', { class: 'btn primary', type: 'button' }, icon(icons.chest), " Open today's chest (free)");
        btn.addEventListener('click', () => {
          const r = c.dispatch({ type: 'openDailyChest' });
          if (!r.ok) {
            this.kit.toast(r.message, 'error');
            return;
          }
          const e = r.events.find((x) => x.kind === 'daily_chest');
          if (e && e.kind === 'daily_chest') opened = { outcome: e.outcome, grants: e.grants as Record<string, number>, skipped: e.skipped, steppedBack: e.steppedBack };
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

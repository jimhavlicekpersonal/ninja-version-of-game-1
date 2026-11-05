/**
 * Gang Wars in the Gang tab (roadmap step 67): find a war (leader), the
 * search and its generated-Gang fallback, prep (countdown, both rosters, copy
 * my village in again), the battle day (score, attacks left, enemy bases with
 * Attack and Relay strike and each relay's hand-off state, what they did to
 * ours), the war log, and recent wars with their chests. My own war attacks
 * are in the battle log, with replays.
 */
import type { Connection } from '../../backend/net/connection';
import type { GangWarBaseView, GangWarResponse, GangWarView } from '../../backend/net/protocol';
import { h } from './dom';
import type { UiKit } from './economyUi';
import { formatDuration } from './format';

export interface GangWarUiDeps {
  kit: UiKit;
  connection: Connection;
  /** Start a war strike (closes Friends and opens the battle). */
  onAttack?(target: number, relay: boolean, enemyName: string, bot: boolean): void;
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));

export class GangWarUi {
  private data: GangWarResponse | null = null;
  private error = '';
  private busy = false;
  private loadedAt = 0;

  constructor(private readonly d: GangWarUiDeps) {}

  private now(): number {
    return this.d.kit.c.now();
  }

  async load(redraw: () => void): Promise<void> {
    try {
      this.data = await this.d.connection.gangWar();
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    }
    this.loadedAt = Date.now();
    redraw();
  }

  private async run(fn: () => Promise<GangWarResponse | unknown>, redraw: () => void, done?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    redraw();
    try {
      const r = await fn();
      if (r && typeof r === 'object' && 'recent' in r) this.data = r as GangWarResponse;
      if (done) this.d.kit.toast(done, 'success');
    } catch (e) {
      this.d.kit.toast((e as Error).message, 'error');
    } finally {
      this.busy = false;
    }
    await this.load(redraw);
  }

  /** Draw into the Gang tab. `leader`: may start or stop a search; `members`: Gang size. */
  draw(body: HTMLElement, redraw: () => void, leader: boolean, members: number): void {
    if (!this.d.connection.canGangWars) return;
    body.append(h('h3', {}, 'Gang War'));
    // Fresh when the tab is drawn (at most every 30 s; buttons reload at once).
    if (Date.now() - this.loadedAt > 30_000) {
      this.loadedAt = Date.now();
      void this.load(redraw);
    }
    if (this.error) body.append(h('div', { class: 'note error-note' }, `Can't load the Gang War: ${this.error}`));
    const d = this.data;
    if (!d) {
      body.append(h('p', { class: 'muted small' }, 'Loading…'));
      return;
    }
    if (d.war) {
      this.war(body, d.war, redraw);
      body.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.load(redraw) }, 'Refresh war'));
    }
    else if (d.queued) {
      const wait = d.queued.botAt - this.now();
      body.append(
        h('p', {}, `Looking for a Gang of ${members}…`),
        h('p', { class: 'muted small' }, wait > 0 ? `If nobody fits within ${formatDuration(wait)}, you'll face a generated Gang (clearly labelled).` : 'No Gang fits right now: a generated Gang is ready. Refresh to start.'),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.load(redraw) }, 'Refresh'), leader ? h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.d.connection.gangWarCancel(), redraw, 'Search stopped.') }, 'Stop looking') : null),
      );
    } else {
      body.append(h('p', { class: 'muted small' }, 'Two to four friends against another Gang of the same size: 2 hours to prepare, then 22 hours with 2 attacks each. Strike alone, or relay: each strike starts from the damage your Gang already did to that base. No honor is won or lost; everyone gets a chest.'));
      if (leader) body.append(h('button', { class: 'btn primary', type: 'button', disabled: this.busy || members < 2, onclick: () => void this.run(() => this.d.connection.gangWarQueue(), redraw) }, members < 2 ? 'Invite a friend to start a war' : 'Find a Gang War'));
      else body.append(h('p', { class: 'muted small' }, 'Your leader starts Gang Wars.'));
    }
    this.recent(body, d);
  }

  private war(body: HTMLElement, w: GangWarView, redraw: () => void): void {
    const vs = `vs ${w.opponent.name}`;
    const score = `${w.ours.stars}★ ${Math.round(w.ours.destruction)}% — ${w.theirs.stars}★ ${Math.round(w.theirs.destruction)}%`;
    if (w.phase === 'prep') {
      body.append(
        h('p', {}, h('b', {}, vs), ` · battle day in ${formatDuration(Math.max(0, w.prepEndsAt - this.now()))}`),
        h('p', { class: 'muted small' }, 'Prepare: move your defenses, then copy your village into the war again. Ask your Gang for troops for your Lodge. Rosters are locked until the war ends.'),
      );
      if (w.myIndex !== null) body.append(h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.d.connection.gangWarBase(), redraw, 'Your war base now matches your village.') }, 'Copy my village into the war'));
    } else if (w.phase === 'battle') {
      body.append(h('p', {}, h('b', {}, vs), ` · ${score} · ends in ${formatDuration(Math.max(0, w.endsAt - this.now()))}`), h('p', { class: 'muted small' }, w.myIndex === null ? 'You joined after this war started: cheer your Gang on.' : `${w.attacksLeft} attack${w.attacksLeft === 1 ? '' : 's'} left.`));
    } else {
      const o = w.outcome === 'win' ? 'Victory!' : w.outcome === 'loss' ? 'Defeat' : 'A draw';
      body.append(h('p', {}, h('b', {}, `${o} ${vs}`), ` · ${score}`));
    }
    body.append(h('h4', {}, 'Their bases'));
    for (const b of w.enemy) body.append(this.enemyRow(w, b, redraw));
    body.append(h('h4', {}, 'Our bases'));
    for (const b of w.mine) body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, `${b.index + 1}. ${b.name}`), h('div', { class: 'muted small' }, `Clan Keep ${b.keep} · they got ${stars(b.best.stars)} ${Math.round(b.best.destruction)}%`))));
    if (w.log.length) {
      body.append(h('h4', {}, 'War log'));
      for (const l of w.log.slice(0, 12)) {
        body.append(h('div', { class: 'muted small' }, `${l.ours ? '⚔' : '🛡'} ${l.by} → ${l.target}: ${stars(l.stars)} ${Math.round(l.destruction)}%${l.relay ? ' (relay)' : ''} · ${formatDuration(this.now() - l.at)} ago`));
      }
      body.append(h('p', { class: 'muted small' }, 'Replays of your own war attacks are in your battle log.'));
    }
  }

  private enemyRow(w: GangWarView, b: GangWarBaseView, redraw: () => void): HTMLElement {
    const r = b.relay;
    const relayText = r && r.strikes ? ` · relay: ${r.strikes} strike${r.strikes === 1 ? '' : 's'} so far (${stars(r.stars)} ${Math.round(r.destruction)}%, last by ${r.lastBy})` : '';
    const busy = r?.busy ? ' · a Gang mate is striking it now' : '';
    const can = w.phase === 'battle' && w.attacksLeft > 0 && !!this.d.onAttack;
    const go = (relay: boolean) => {
      this.d.kit.closeAllModals();
      this.d.onAttack!(b.index, relay, b.name, w.opponent.bot);
      void redraw;
    };
    return h(
      'div',
      { class: 'log-row' },
      h('div', {}, h('b', {}, `${b.index + 1}. ${b.name}`), h('div', { class: 'muted small' }, `Clan Keep ${b.keep} · best ${stars(b.best.stars)} ${Math.round(b.best.destruction)}%${relayText}${busy}`)),
      can ? h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => go(false) }, 'Attack'), h('button', { class: 'btn primary', type: 'button', disabled: Boolean(r?.busy), title: 'Start from the damage your Gang already did', onclick: () => go(true) }, r && r.strikes ? 'Continue relay' : 'Start relay')) : null,
    );
  }

  private recent(body: HTMLElement, d: GangWarResponse): void {
    if (!d.recent.length) return;
    body.append(h('h4', {}, 'Recent wars'));
    for (const r of d.recent.slice(0, 5)) {
      const o = r.outcome === 'win' ? 'Won' : r.outcome === 'loss' ? 'Lost' : 'Draw';
      body.append(h('div', { class: 'muted small' }, `${o} vs ${r.opponent} · ${r.ours}★ to ${r.theirs}★ · ${r.claimed ? 'chest collected' : 'chest on its way'}`));
    }
  }
}

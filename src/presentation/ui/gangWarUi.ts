import { messageText as ownedError } from './i18n';
import { t as i18nText } from './i18n';
import { labelText as i18nLabel, t } from './i18n';
import { isolateName } from '../../gameplay/sim/social/names';
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

interface GangWarUiDeps {
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
      this.d.kit.toast(ownedError((e as Error).message, true), 'error');
    } finally {
      this.busy = false;
    }
    await this.load(redraw);
  }

  /** Draw into the Gang tab. `leader`: may start or stop a search; `members`: Gang size. */
  draw(body: HTMLElement, redraw: () => void, leader: boolean, members: number): void {
    if (!this.d.connection.canGangWars) return;
    body.append(h('h3', {}, i18nText("ui.gang_war_d4e65acc95")));
    // Fresh when the tab is drawn (at most every 30 s; buttons reload at once).
    if (Date.now() - this.loadedAt > 30_000) {
      this.loadedAt = Date.now();
      void this.load(redraw);
    }
    if (this.error) body.append(h('div', { class: 'note error-note' }, i18nText("ui.can_t_load_the_gang_war_f7bc4e6a93", { arg1: this.error })));
    const d = this.data;
    if (!d) {
      body.append(h('p', { class: 'muted small' }, i18nText("ui.loading_ba3bbbe10d")));
      return;
    }
    if (d.war) {
      this.war(body, d.war, redraw);
      body.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.load(redraw) }, i18nText("ui.refresh_war_be8b1f8d5a")));
    }
    else if (d.queued) {
      const wait = d.queued.botAt - this.now();
      body.append(
        h('p', {}, i18nText("ui.looking_for_a_gang_of_c57557b098", { arg1: members })),
        h('p', { class: 'muted small' }, wait > 0 ? i18nText("ui.if_nobody_fits_within_you_ll_face_a_ge_3893e5d9fe", { arg1: formatDuration(wait) }) : i18nText("ui.no_gang_fits_right_now_a_generated_gan_5b3f6f74c9")),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.load(redraw) }, i18nText("ui.refresh_0e91610117")), leader ? h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.d.connection.gangWarCancel(), redraw, i18nText("ui.search_stopped_acf16c738e")) }, i18nText("ui.stop_looking_86f92968c2")) : null),
      );
    } else {
      body.append(h('p', { class: 'muted small' }, i18nText("ui.two_to_four_friends_against_another_ga_8528f39c66")));
      if (leader) body.append(h('button', { class: 'btn primary', type: 'button', disabled: this.busy || members < 2, onclick: () => void this.run(() => this.d.connection.gangWarQueue(), redraw) }, members < 2 ? i18nText("ui.invite_a_friend_to_start_a_war_ec641931af") : i18nText("ui.find_a_gang_war_f2ed18ac25")));
      else body.append(h('p', { class: 'muted small' }, i18nText("ui.your_leader_starts_gang_wars_fe4ca360b3")));
    }
    this.recent(body, d);
  }

  private war(body: HTMLElement, w: GangWarView, redraw: () => void): void {
    const vs = i18nText("ui.vs_f471e2dc90", { arg1: isolateName(w.opponent.name) });
    const score = i18nText("ui.message_81627edc88", { arg1: w.ours.stars, arg2: Math.round(w.ours.destruction), arg3: w.theirs.stars, arg4: Math.round(w.theirs.destruction) });
    if (w.phase === 'prep') {
      body.append(
        h('p', {}, h('b', {}, vs), i18nText("ui.battle_day_in_e7f5c5d1e2", { arg1: formatDuration(Math.max(0, w.prepEndsAt - this.now())) })),
        h('p', { class: 'muted small' }, i18nText("ui.prepare_move_your_defenses_then_copy_y_74aa408120")),
      );
      if (w.myIndex !== null) body.append(h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.d.connection.gangWarBase(), redraw, i18nText("ui.your_war_base_now_matches_your_village_5aeb57c0b0")) }, i18nText("ui.copy_my_village_into_the_war_3691bb278d")));
    } else if (w.phase === 'battle') {
      body.append(h('p', {}, h('b', {}, vs), i18nText("ui.ends_in_43b4b377c2", { arg1: score, arg2: formatDuration(Math.max(0, w.endsAt - this.now())) })), h('p', { class: 'muted small' }, w.myIndex === null ? i18nText("ui.you_joined_after_this_war_started_chee_0db3122411") : t('war.attacksLeft', { n: w.attacksLeft })));
    } else {
      const o = w.outcome === 'win' ? i18nText("ui.victory_d32cecd931") : w.outcome === 'loss' ? i18nText("ui.defeat_2be4cda831") : i18nText("ui.a_draw_106f4ee671");
      body.append(h('p', {}, h('b', {}, i18nText("ui.message_14677cb26f", { arg1: o, arg2: vs })), i18nText("ui.message_c4f174b2a5", { arg1: score })));
    }
    body.append(h('h4', {}, i18nText("ui.their_bases_007c13066e")));
    for (const b of w.enemy) body.append(this.enemyRow(w, b, redraw));
    body.append(h('h4', {}, i18nText("ui.our_bases_437dd673b5")));
    for (const b of w.mine) body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, i18nText("ui.message_59480bd082", { arg1: b.index + 1, arg2: isolateName(b.name) })), h('div', { class: 'muted small' }, i18nText("ui.clan_keep_they_got_8e27e141aa", { arg1: b.keep, arg2: stars(b.best.stars), arg3: Math.round(b.best.destruction) })))));
    if (w.log.length) {
      body.append(h('h4', {}, i18nText("ui.war_log_dc4ff4d287")));
      for (const l of w.log.slice(0, 12)) {
        body.append(h('div', { class: 'muted small' }, i18nText("ui.ago_e411ba9ec3", { arg1: l.ours ? '⚔' : '🛡', arg2: l.by, arg3: l.target, arg4: stars(l.stars), arg5: Math.round(l.destruction), arg6: l.relay ? i18nLabel(' (relay)') : '', arg7: formatDuration(this.now() - l.at) })));
      }
      body.append(h('p', { class: 'muted small' }, i18nText("ui.replays_of_your_own_war_attacks_are_in_84e4295282")));
    }
  }

  private enemyRow(w: GangWarView, b: GangWarBaseView, redraw: () => void): HTMLElement {
    const r = b.relay;
    const relayText = r && r.strikes ? t('war.relay', { n: r.strikes, stars: stars(r.stars), pct: Math.round(r.destruction), by: r.lastBy ?? '' }) : '';
    const busy = r?.busy ? i18nText("ui.a_gang_mate_is_striking_it_now_ef64c3cbbc") : '';
    const can = w.phase === 'battle' && w.attacksLeft > 0 && !!this.d.onAttack;
    const go = (relay: boolean) => {
      this.d.kit.closeAllModals();
      this.d.onAttack!(b.index, relay, b.name, w.opponent.bot);
      void redraw;
    };
    return h(
      'div',
      { class: 'log-row' },
      h('div', {}, h('b', {}, i18nText("ui.message_59480bd082", { arg1: b.index + 1, arg2: isolateName(b.name) })), h('div', { class: 'muted small' }, i18nText("ui.clan_keep_best_fc792f1385", { arg1: b.keep, arg2: stars(b.best.stars), arg3: Math.round(b.best.destruction), arg4: relayText, arg5: busy }))),
      can ? h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => go(false) }, i18nText("ui.attack_4cd548f3cc")), h('button', { class: 'btn primary', type: 'button', disabled: Boolean(r?.busy), title: i18nText("ui.start_from_half_the_damage_your_gang_l_023da5856e"), onclick: () => go(true) }, r && r.strikes ? i18nText("ui.continue_relay_b92a95cd59") : i18nText("ui.start_relay_f1d9596276"))) : null,
    );
  }

  private recent(body: HTMLElement, d: GangWarResponse): void {
    if (!d.recent.length) return;
    body.append(h('h4', {}, i18nText("ui.recent_wars_4e1700c208")));
    for (const r of d.recent.slice(0, 5)) {
      const o = r.outcome === 'win' ? i18nText("ui.won_acdf2907db") : r.outcome === 'loss' ? i18nText("ui.lost_51e1357de8") : i18nText("ui.draw_61517c08b3");
      body.append(h('div', { class: 'muted small' }, i18nText("ui.vs_to_5f33c739b1", { arg1: o, arg2: r.opponent, arg3: r.ours, arg4: r.theirs, arg5: r.claimed ? i18nText("ui.chest_collected_1bc9b17d91") : i18nText("ui.chest_on_its_way_61e7058c23") })));
    }
  }
}

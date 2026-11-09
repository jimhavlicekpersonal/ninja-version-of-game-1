import { messageText as ownedError } from './i18n';
import { labelText as i18nLabel } from './i18n';
import { t as i18nText } from './i18n';
import { isolateName } from '../../gameplay/sim/social/names';
/**
 * The Friends screen (roadmap steps 59-60): your friend code (copy, share as a
 * link, or show as a QR code), find a player by exact name or friend code,
 * requests, the friends list with when each was last online, suggestions
 * (recent real raiders and Alliance mates), and privacy. Every player card
 * has Report and Block (Apple 1.2). Online only (`connection.canFriends`).
 */
import type { Connection } from '../../backend/net/connection';
import { NAME_MAX } from '../../backend/net/connection';
import { REPORT_REASONS, type ChallengesResponse, type DuelsResponse, type DuelView, type Findable, type FriendsResponse, type FriendView, type PlayerCard, type ReportReason } from '../../backend/net/protocol';
import type { BattleRecord } from '../../gameplay/sim/battle/types';
import { GangUi } from './gangUi';
import { clear, h, isSubmitEnter } from './dom';
import type { UiKit } from './economyUi';
import { formatDuration } from './format';
import { REASON_LABELS } from './groveUi';
import { qrSvg } from './qr';
import type { SignInSource } from '../../backend/platform/auth';
import { communityRulesAccepted, ensureCommunityRules } from './communityRules';

export interface FriendsUiDeps {
  kit: UiKit;
  connection: Connection;
  /** The address a friend link opens (the web game, or VITE_PUBLIC_URL in the apps); null: no links, codes only. */
  shareBase(): string | null;
  /** Names worth suggesting: real players who raided you recently, and your Alliance mates. */
  suggestions(): string[];
  /** Platform friends lists this device can read (step 61; Game Center on iPhone). */
  platform?: SignInSource;
  /** Start a Friendly Duel (step 62). */
  onDuel?(friendId: string, friendName: string, opts?: { layout?: 'live' | 'duel'; challengeId?: string }): void;
  /** Watch a duel's replay. */
  onReplay?(record: BattleRecord): void;
  /** The Gang War section of the Gang tab (step 67). */
  war?(body: HTMLElement, redraw: () => void, leader: boolean, members: number): void;
}

/** The league's display name from the game data ("Bamboo League"), never a capitalized id. */
const LEAGUE = (id: string) => { const key = `data.ranks.leagues.${id}.name`; const name = i18nText(key); return name === key ? id : name; };

const FINDABLE_LABEL: Record<Findable, string> = {
  everyone: 'Everyone',
  friends_of_friends: 'Friends of friends',
  nobody: 'Nobody (friend code only)',
};

export class FriendsUi {
  private data: FriendsResponse | null = null;
  private found: PlayerCard | null = null;
  private error = '';
  private busy = false;
  /** Step 61: Kagemura players among the player's platform friends, once they asked. */
  private platformFound: PlayerCard[] | null = null;
  private body: HTMLElement | null = null;
  private query = '';
  private tab: 'friends' | 'gang' = 'friends';
  /** Duels and challenges (step 62), when the server has them. */
  private duelData: DuelsResponse | null = null;
  private challengeData: ChallengesResponse | null = null;
  readonly gang: GangUi;

  constructor(private readonly d: FriendsUiDeps) {
    this.gang = new GangUi({ kit: d.kit, connection: d.connection, friends: () => this.data?.friends ?? [], redraw: () => this.draw(), war: d.war ? (body, leader, members) => d.war!(body, () => this.draw(), leader, members) : undefined });
  }

  private get conn() {
    return this.d.connection;
  }

  private now(): number {
    return this.d.kit.c.now();
  }

  /** Open the screen; `search` (a name or a code from a friend link) is looked up straight away. */
  open(search?: string, tab: 'friends' | 'gang' = 'friends'): void {
    // Friends, Gangs and duels are with real players: the community rules first, once (audit R06).
    if (!communityRulesAccepted()) {
      void ensureCommunityRules(this.d.kit).then((ok) => ok && this.open(search, tab));
      return;
    }
    this.tab = tab;
    const body = h('div', { class: 'friends' });
    this.body = body;
    this.found = null;
    this.error = '';
    this.query = search ?? '';
    this.d.kit.modal(i18nText("ui.friends_bd104d1b98"), body, [], 'wide', () => {
      this.body = null;
    });
    this.draw();
    void this.load().then(() => (search ? this.find(search) : undefined));
    if (tab === 'gang') void this.gang.load();
  }

  private async load(): Promise<void> {
    try {
      this.data = await this.conn.friends();
      if (this.conn.canDuels) [this.duelData, this.challengeData] = await Promise.all([this.conn.duels(), this.conn.challenges()]);
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    }
    this.draw();
  }

  /** Run a server call, then reload; errors become toasts. */
  private async run(fn: () => Promise<unknown>, done?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.draw();
    try {
      await fn();
      if (done) this.d.kit.toast(done, 'success');
    } catch (e) {
      this.d.kit.toast(ownedError((e as Error).message, true), 'error');
    } finally {
      this.busy = false;
    }
    await this.load();
    if (this.found) {
      // The card's relation may have changed.
      try {
        this.found = await this.conn.findPlayer(this.found.name);
      } catch {
        this.found = null;
      }
      this.draw();
    }
  }

  private async find(text: string): Promise<void> {
    const q = text.trim();
    if (!q) return;
    this.query = q;
    this.busy = true;
    this.draw();
    try {
      this.found = await this.conn.findPlayer(q);
    } catch (e) {
      this.found = null;
      this.d.kit.toast(ownedError((e as Error).message, true), 'error');
    } finally {
      this.busy = false;
    }
    this.draw();
  }

  private draw(): void {
    const body = this.body;
    if (!body) return;
    const keepFocus = document.activeElement?.matches?.(".friends input.find");
    clear(body);
    if (!this.conn.canFriends) {
      body.append(h('p', { class: 'muted' }, i18nText("ui.friends_need_online_play_when_the_game_39dbb4e4c1")));
      return;
    }
    if (this.conn.canGangs) {
      const tabBtn = (t: 'friends' | 'gang', label: string) =>
        h('button', { class: this.tab === t ? 'on' : '', type: 'button', role: 'tab', 'aria-selected': this.tab === t ? 'true' : 'false', onclick: () => { this.tab = t; if (t === 'gang') void this.gang.load(); this.draw(); } }, i18nLabel(label));
      body.append(h('div', { class: 'shop-tabs', role: 'tablist' }, tabBtn('friends', i18nText("ui.friends_bd104d1b98")), tabBtn('gang', i18nText("ui.gang_2c426c370c"))));
      if (this.tab === 'gang') {
        this.gang.draw(body);
        return;
      }
    }
    if (this.error) body.append(h('div', { class: 'note error-note' }, i18nText("ui.can_t_load_your_friends_right_now_3979edbedd", { arg1: this.error })));
    this.findBox(body, keepFocus === true);
    if (this.found) body.append(this.cardRow(this.found));
    const f = this.data;
    if (!f) {
      body.append(h('p', { class: 'muted' }, i18nText("ui.loading_your_friends_ad3e39524a")));
      return;
    }
    this.codeBox(body, f);
    if (f.incoming.length) {
      body.append(h('h3', {}, i18nText("ui.requests_fc6d2bd2a0", { arg1: f.incoming.length })));
      for (const r of f.incoming) {
        body.append(
          h(
            'div',
            { class: 'log-row' },
            this.who(r.player, i18nText("ui.asked_ago_25aaa30a12", { arg1: formatDuration(this.now() - r.at) })),
            h(
              'div',
              { class: 'row' },
              h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.answerFriendRequest(r.id, true), i18nText("ui.you_and_are_friends_52da6d1ce1", { arg1: isolateName(r.player.name) })) }, i18nText("ui.accept_89713b9c9c")),
              h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.answerFriendRequest(r.id, false)) }, i18nText("ui.decline_a2d285b352")),
              this.moreButton(r.player),
            ),
          ),
        );
      }
    }
    this.challengesBox(body);
    body.append(h('h3', {}, i18nText("ui.friends_7e143b835a", { arg1: f.friends.length, arg2: f.max })));
    if (!f.friends.length) body.append(h('p', { class: 'muted small' }, i18nText("ui.no_friends_yet_share_your_friend_code__c6b2efa87e")));
    for (const fr of f.friends) body.append(this.friendRow(fr));
    if (f.outgoing.length) {
      body.append(h('h3', {}, i18nText("ui.waiting_for_an_answer_db6a34e107")));
      for (const r of f.outgoing) {
        body.append(
          h(
            'div',
            { class: 'log-row' },
            this.who(r.player, i18nText("ui.expires_in_b1ad314585", { arg1: formatDuration(Math.max(0, r.expiresAt - this.now())) })),
            h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.cancelFriendRequest(r.id)) }, i18nText("ui.take_back_7d2a64f508")),
          ),
        );
      }
    }
    this.duelsBox(body);
    this.suggestionsBox(body, f);
    this.platformBox(body);
    this.privacyBox(body, f);
  }

  private findBox(body: HTMLElement, focus: boolean): void {
    const input = h('input', { class: 'text find', type: 'text', dir: 'auto', placeholder: i18nText("ui.exact_name_or_friend_code_8a23ecea09"), value: this.query, 'aria-label': i18nText("ui.exact_name_or_friend_code_8a23ecea09") }) as HTMLInputElement;
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (isSubmitEnter(e)) void this.find(input.value);
    });
    input.addEventListener('input', () => (this.query = input.value));
    body.append(
      h('div', { class: 'row find-row' }, input, h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: () => void this.find(input.value) }, i18nText("ui.find_822b2ae454"))),
      h('p', { class: 'muted small' }, i18nText("ui.names_can_use_any_script_up_to_display_1cc9984a44", { arg1: NAME_MAX })),
    );
    if (focus) input.focus();
  }

  private codeBox(body: HTMLElement, f: FriendsResponse): void {
    const base = this.d.shareBase();
    const link = base ? `${base}${base.includes('?') ? '&' : '?'}friend=${encodeURIComponent(f.code)}` : null;
    const qrHost = h('div', { class: 'friend-qr' });
    qrHost.hidden = true;
    const copy = (text: string, what: string) =>
      void navigator.clipboard?.writeText(text).then(
        () => this.d.kit.toast(i18nText("ui.copied_fea92fb5ab", { arg1: what }), 'success'),
        () => this.d.kit.toast(text, 'info'),
      );
    const share = () => {
      const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url?: string }) => Promise<void> };
      if (link && nav.share) void nav.share({ title: i18nText("ui.be_my_friend_in_kagemura_1adcadc4c7"), text: i18nText("ui.add_me_in_kagemura_4b94ebc055", { arg1: f.code }), url: link }).catch(() => undefined);
      else copy(link ?? f.code, link ? i18nText("ui.friend_link_7357b3113d") : i18nText("ui.friend_code_fbc7fe31b1"));
    };
    const qrBtn = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.qr_code_2c24d35a11"));
    qrBtn.addEventListener('click', () => {
      if (!qrHost.childElementCount) {
        const svg = qrSvg(link ?? f.code, 200);
        if (svg) qrHost.append(h('div', { html: svg }), h('p', { class: 'muted small' }, i18nText("ui.a_friend_scans_this_with_their_phone_c_a21a44e47b")));
      }
      qrHost.hidden = !qrHost.hidden;
    });
    body.append(
      h('h3', {}, i18nText("ui.your_friend_code_893e2bdb2a")),
      h(
        'div',
        { class: 'row friend-code' },
        h('b', { class: 'code' }, f.code),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => copy(f.code, i18nText("ui.friend_code_fbc7fe31b1")) }, i18nText("ui.copy_e21f935f11")),
        h('button', { class: 'btn ghost', type: 'button', onclick: share }, link ? i18nText("ui.share_link_712a4823cc") : i18nText("ui.share_29887a5ff9")),
        qrBtn,
      ),
      qrHost,
    );
  }

  private who(p: PlayerCard, extra?: string): HTMLElement {
    const bits = [i18nText("ui.clan_keep_2cf84349d4", { arg1: p.keep }), LEAGUE(p.league), p.alliance ? isolateName(p.alliance) : null, extra ?? null].filter(Boolean).join(' · ');
    return h(
      'div',
      {},
      h('b', {}, h('bdi', {}, p.name)),
      p.staff ? h('span', { class: 'chip staff', title: i18nText("ui.kagemura_staff_7a8dfa11fc") }, i18nText("ui.staff_681927e34b")) : null,
      p.formerly ? h('span', { class: 'muted small' }, i18nText("ui.formerly_46029d3386", { arg1: isolateName(p.formerly) })) : null,
      h('div', { class: 'muted small' }, bits),
    );
  }

  private lastSeen(fr: FriendView): string {
    if (fr.lastSeen === undefined) return i18nText("ui.online_status_hidden_b8a25699e4");
    const ago = this.now() - fr.lastSeen;
    return ago < 5 * 60_000 ? i18nText("ui.online_now_b9537ec73a") : i18nText("ui.seen_ago_bb8847742f", { arg1: formatDuration(ago) });
  }

  private friendRow(fr: FriendView): HTMLElement {
    const online = fr.lastSeen !== undefined && this.now() - fr.lastSeen < 5 * 60_000;
    const r = this.duelData?.rivalries.find((x) => x.friendId === fr.id);
    const rivalry = r && (r.duels || r.theirDuels) ? i18nText("ui.duels_you_won_they_won_1f51a0b281", { arg1: r.wins, arg2: r.duels, arg3: r.theirWins, arg4: r.theirDuels }) : '';
    const duel = this.conn.canDuels && this.d.onDuel ? h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => (this.d.kit.closeAllModals(), this.d.onDuel!(fr.id, fr.name)) }, i18nText("ui.duel_15ea5c59d2")) : null;
    return h('div', { class: 'log-row' }, this.who(fr, `${this.lastSeen(fr)}${rivalry}`), h('div', { class: 'row' }, h('span', { class: `dot ${online ? 'on' : ''}` }), duel, this.moreButton(fr, true)));
  }

  /** Duel challenges (step 62): attack each other within 24 hours. */
  private challengesBox(body: HTMLElement): void {
    const list = (this.challengeData?.challenges ?? []).filter((c) => c.outcome === null || this.now() - c.expiresAt < 24 * 3_600_000).slice(0, 6);
    if (!list.length) return;
    body.append(h('h3', {}, i18nText("ui.duel_challenges_b106843a9b")));
    for (const c of list) {
      const score = (r: { stars: number; destruction: number } | null) => (r ? i18nText("ui.message_784772efcd", { arg1: r.stars, arg2: Math.round(r.destruction) }) : '—');
      const status = c.outcome ? (c.outcome === 'win' ? i18nText("ui.you_won_82574d87e6") : c.outcome === 'loss' ? i18nText("ui.won_cf6247318b", { arg1: isolateName(c.opponent.name) }) : i18nText("ui.a_draw_106f4ee671")) : i18nText("ui.ends_in_21a1790280", { arg1: formatDuration(Math.max(0, c.expiresAt - this.now())) });
      const attack = !c.outcome && !c.my && this.d.onDuel ? h('button', { class: 'btn primary', type: 'button', onclick: () => (this.d.kit.closeAllModals(), this.d.onDuel!(c.opponent.id, c.opponent.name, { challengeId: c.id })) }, i18nText("ui.attack_4cd548f3cc")) : null;
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, i18nText("ui.vs_f471e2dc90", { arg1: isolateName(c.opponent.name) })), h('div', { class: 'muted small' }, i18nText("ui.you_them_a83f03066c", { arg1: score(c.my), arg2: score(c.their), arg3: status }))), attack));
    }
  }

  /** Recent duels both ways, with replays. */
  private duelsBox(body: HTMLElement): void {
    const list = (this.duelData?.duels ?? []).slice(0, 8);
    if (!list.length) return;
    body.append(h('h3', {}, i18nText("ui.recent_duels_d3197cc79e")));
    for (const d of list) {
      const watch = this.d.onReplay ? h('button', { class: 'btn ghost', type: 'button', onclick: () => (this.d.kit.closeAllModals(), this.d.onReplay!(duelRecord(d))) }, i18nText("ui.watch_a71e757324")) : null;
      const what = d.side === 'attack' ? i18nText("ui.you_dueled_5d407abedb", { arg1: isolateName(d.opponent.name) }) : i18nText("ui.dueled_you_72ccf75d9c", { arg1: isolateName(d.opponent.name) });
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, i18nLabel(what)), h('div', { class: 'muted small' }, i18nText("ui.ago_92237af6f6", { arg1: d.result.stars, arg2: Math.round(d.result.destruction), arg3: formatDuration(this.now() - d.at), arg4: d.challengeId ? i18nText("ui.challenge_e3a42a51cb") : '' }))), watch));
    }
  }

  private cardRow(p: PlayerCard): HTMLElement {
    const action =
      p.relation === 'self'
        ? h('span', { class: 'muted small' }, i18nText("ui.that_is_you_86a278d0d7"))
        : p.relation === 'friend'
          ? h('span', { class: 'chip' }, i18nText("ui.friends_bd104d1b98"))
          : p.relation === 'requested'
            ? h('span', { class: 'chip' }, i18nText("ui.request_sent_a73f99f6bf"))
            : h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.addFriend({ playerId: p.id }), p.relation === 'incoming' ? i18nText("ui.you_and_are_friends_52da6d1ce1", { arg1: isolateName(p.name) }) : i18nText("ui.friend_request_sent_to_e5f21b576f", { arg1: isolateName(p.name) })) }, p.relation === 'incoming' ? i18nText("ui.accept_89713b9c9c") : i18nText("ui.add_friend_c1f8728197"));
    return h('div', { class: 'log-row current found' }, this.who(p), h('div', { class: 'row' }, action, p.relation === 'self' ? null : this.moreButton(p, p.relation === 'friend')));
  }

  /** "⋯": remove (friends), report, block. */
  private moreButton(p: PlayerCard, friend = false): HTMLElement {
    const btn = h('button', { class: 'chat-more', type: 'button', title: i18nText("ui.more_d47d7cb0e4"), 'aria-label': i18nText("ui.more_for_635cb7ebd9", { arg1: isolateName(p.name) }) }, '⋯');
    btn.addEventListener('click', () => {
      let close = () => {};
      close = this.d.kit.modal(p.name, this.who(p), [
        friend && this.conn.canDuels && this.d.onDuel && {
          label: i18nText("ui.challenge_to_a_duel_fe2762924a"),
          onClick: () => {
            close();
            void this.run(() => this.conn.challenge(p.id), i18nText("ui.challenge_sent_to_attack_each_other_wi_40ca8ee168", { arg1: isolateName(p.name) }));
          },
        },
        friend && this.conn.canDuels && this.d.onDuel && {
          label: i18nText("ui.duel_their_duel_layout_60ecaf6641"),
          onClick: () => (close(), this.d.kit.closeAllModals(), this.d.onDuel!(p.id, p.name, { layout: 'duel' })),
        },
        friend && {
          label: i18nText("ui.remove_friend_f2c4fc85b7"),
          onClick: () => {
            close();
            void this.d.kit.confirm(i18nText("ui.remove_3927e8c442", { arg1: isolateName(p.name) }), i18nText("ui.you_can_add_each_other_again_later_016d69d605"), i18nText("ui.remove_c3812fc4ac"), true).then((ok) => (ok ? this.run(() => this.conn.unfriend(p.id), i18nText("ui.is_no_longer_your_friend_60382341dc", { arg1: isolateName(p.name) })) : undefined));
          },
        },
        { label: i18nText("ui.report_b6ce788d97"), onClick: () => (close(), this.report(p)) },
        {
          label: i18nText("ui.block_211d0bb8cf"),
          danger: true,
          onClick: () => {
            close();
            void this.d.kit.confirm(i18nText("ui.block_1c07e5a131", { arg1: isolateName(p.name) }), i18nText("ui.you_stop_being_friends_and_neither_of__5116cceb5f"), i18nText("ui.block_211d0bb8cf"), true).then((ok) => (ok ? this.run(() => this.conn.blockPlayer(p.id), i18nText("ui.is_blocked_042f7fc41b", { arg1: isolateName(p.name) })) : undefined));
          },
        },
      ]);
    });
    return btn;
  }

  private report(p: PlayerCard): void {
    const body = h('div', { class: 'report-form' }, h('p', { class: 'muted small' }, i18nText("ui.tell_the_moderators_what_did_0abde97331", { arg1: isolateName(p.name) })));
    const reasons = h('div', { class: 'report-reasons', role: 'radiogroup', 'aria-label': i18nText("ui.reason_f81ab834de") });
    for (const r of REPORT_REASONS) reasons.append(h('label', { class: 'report-reason' }, h('input', { type: 'radio', name: 'friend-report-reason', value: r }), i18nLabel(REASON_LABELS[r])));
    const note = h('textarea', { class: 'text', maxlength: 500, rows: 2, placeholder: i18nText("ui.anything_else_they_should_know_optiona_1ecfe6847d") }) as HTMLTextAreaElement;
    note.addEventListener('keydown', (e) => e.stopPropagation());
    const also = h('input', { type: 'checkbox' }) as HTMLInputElement;
    body.append(reasons, note, h('label', { class: 'report-block' }, also, i18nText("ui.also_block_87576e2627", { arg1: isolateName(p.name) })));
    let close = () => {};
    close = this.d.kit.modal(i18nText("ui.report_e70c48c496", { arg1: isolateName(p.name) }), body, [
      {
        label: i18nText("ui.send_report_a44d353113"),
        primary: true,
        onClick: () => {
          const reason = body.querySelector<HTMLInputElement>('input[name="friend-report-reason"]:checked')?.value as ReportReason | undefined;
          if (!reason) {
            this.d.kit.toast(i18nText("ui.pick_a_reason_first_5bb42bdd4f"), 'error');
            return;
          }
          close();
          void this.run(() => this.conn.reportPlayer(p.id, reason, note.value, also.checked), i18nText("ui.thanks_the_moderators_will_look_at_it_9a9d7d9319"));
        },
      },
    ]);
  }

  private suggestionsBox(body: HTMLElement, f: FriendsResponse): void {
    const known = new Set([...f.friends, ...f.outgoing.map((r) => r.player), ...f.incoming.map((r) => r.player)].map((p) => p.name.toLowerCase()));
    const names = [...new Set(this.d.suggestions())].filter((n) => !known.has(n.toLowerCase())).slice(0, 6);
    if (!names.length) return;
    body.append(h('h3', {}, i18nText("ui.people_you_may_know_e6e3de17c0")), h('p', { class: 'muted small' }, i18nText("ui.real_players_who_raided_you_lately_and_a9c1c11651")));
    for (const n of names) {
      body.append(h('div', { class: 'log-row' }, h('b', {}, n), h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.addFriend({ name: n }), i18nText("ui.friend_request_sent_to_e5f21b576f", { arg1: n })) }, i18nText("ui.add_friend_c1f8728197"))));
    }
  }

  /** Opt-in: which Game Center (or Play Games) friends play Kagemura. Nothing is read until the player asks. */
  private platformBox(body: HTMLElement): void {
    const providers = this.d.platform?.friendProviders?.() ?? [];
    if (!providers.length || !this.conn.server?.features.includes('platform-friends')) return;
    const provider = providers[0];
    const label = provider === 'gamecenter' ? i18nText("ui.game_center_ddbb5729df") : i18nText("ui.play_games_05503d1e76");
    body.append(h('h3', {}, i18nText("ui.friends_from_2a8f6f5f72", { arg1: label })));
    if (!this.platformFound) {
      body.append(
        h('p', { class: 'muted small' }, i18nText("ui.see_which_of_your_friends_play_kagemur_adafe3ba39", { arg1: label, arg2: label })),
        h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.importPlatform(provider, label) }, i18nText("ui.find_my_friends_974b86f5f1", { arg1: label })),
      );
      return;
    }
    if (!this.platformFound.length) body.append(h('p', { class: 'muted small' }, i18nText("ui.none_of_your_friends_play_kagemura_yet_266d500cbf", { arg1: label })));
    for (const p of this.platformFound) body.append(this.cardRow(p));
  }

  private async importPlatform(provider: 'gamecenter' | 'playgames', label: string): Promise<void> {
    try {
      if (!(await this.conn.linkedProviders()).includes(provider)) {
        this.d.kit.toast(i18nText("ui.link_first_settings_online_play_sign_i_fbd954503e", { arg1: label }), 'info');
        return;
      }
      const ids = await this.d.platform!.friendIds!(provider);
      this.platformFound = await this.conn.platformFriends(provider, ids);
    } catch (e) {
      this.d.kit.toast(ownedError((e as Error).message, true), 'error');
    }
    this.draw();
  }

  private privacyBox(body: HTMLElement, f: FriendsResponse): void {
    const select = h('select', { class: 'text', 'aria-label': i18nText("ui.who_can_find_me_by_name_ed481ead6d") }) as HTMLSelectElement;
    for (const k of Object.keys(FINDABLE_LABEL) as Findable[]) select.append(h('option', { value: k, selected: f.findable === k }, i18nLabel(FINDABLE_LABEL[k])));
    select.addEventListener('change', () => void this.run(() => this.conn.setPrivacy({ findable: select.value as Findable }), 'Saved.'));
    // Under 13 (re-audit): found by friend code only; the server refuses anything else.
    const young = this.conn.ageBand === 'under13';
    if (young) select.disabled = true;
    const online = h('input', { type: 'checkbox', checked: f.showOnline }) as HTMLInputElement;
    online.addEventListener('change', () => void this.run(() => this.conn.setPrivacy({ showOnline: online.checked }), 'Saved.'));
    body.append(
      h('h3', {}, i18nText("ui.privacy_54a57c3147")),
      h('label', { class: 'row' }, i18nText("ui.who_can_find_me_by_name_64ffa21978"), select),
      h('label', { class: 'row' }, online, i18nText("ui.friends_can_see_when_i_was_last_online_33a79e69ea")),
      h('p', { class: 'muted small' }, young ? i18nText("ui.players_under_13_can_only_be_found_by__f3c16e1ffc") : i18nText("ui.your_friend_code_always_works_share_it_03f3694869")),
    );
    if (this.conn.canDuels) {
      body.append(
        h('h3', {}, i18nText("ui.duel_layout_bef5bcb759")),
        h('p', { class: 'muted small' }, i18nText("ui.friends_duel_your_village_save_a_duel__66f1ca555e")),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.setDuelLayoutFromVillage(true), i18nText("ui.your_current_layout_is_now_your_duel_l_93aaa5703c")) }, i18nText("ui.save_current_layout_for_duels_c331d83b02")),
          h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.setDuelLayoutFromVillage(false), i18nText("ui.friends_duel_your_village_again_14b9b2fc3b")) }, i18nText("ui.use_my_village_a97171e5b9")),
        ),
      );
    }
  }
}

/** A duel as a battle-log record, for the replay viewer. */
export function duelRecord(d: DuelView): BattleRecord {
  return {
    id: `duel-${d.id}`,
    kind: d.side,
    at: d.at,
    opponentName: d.opponent.name,
    setup: { seed: d.seed, base: d.base, army: d.army, levels: d.levels, infiltration: true },
    deployments: d.deployments,
    ...(d.endTick !== undefined ? { endTick: d.endTick } : {}),
    result: d.result,
    rules: d.rules,
  };
}

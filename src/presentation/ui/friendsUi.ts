/**
 * Friends, Gang and Friendly Duels (roadmap steps 59-63), online only.
 * Friends: your name, friend code, share link and QR code; add by exact name
 * or code; requests; the list (Keep, Honor, league, Gang, last seen,
 * "formerly …"), with Duel, Challenge, Invite to Gang, Remove, Block and
 * Report; suggestions (recent opponents, Alliance mates, Game Center friends
 * on request); who can find you. Gang: start one, invites, members, chat,
 * troop gifts, hand over, leave, and the Gang War (step 67). Duels: rivalries, challenges, replays, and
 * your own duel layout. Everything goes through the server.
 */
import type { Connection } from '../../backend/net/connection';
import type { DuelView, Findable, FriendView, GangWarAttackView, GangWarBaseView, GangWarView, MyGangResponse, ProfileCard } from '../../backend/net/protocol';
import { REPORT_REASONS, type ReportReason } from '../../backend/net/protocol';
import { villageToBase } from '../../gameplay/sim/defense';
import { reinforcementCapacity, reinforcementHousing } from '../../gameplay/sim/social/grove';
import { troopLevels } from '../../gameplay/sim/research';
import { scaleReward } from '../../gameplay/sim/economy';
import { hallLevel } from '../../gameplay/sim/village';
import type { BattleRecord } from '../../gameplay/sim/battle/types';
import { clear, h } from './dom';
import { rewardChips, type UiKit } from './economyUi';
import { formatDuration } from './format';
import { qrSvg } from './qr';

export interface FriendsUiDeps {
  kit: UiKit;
  connection: Connection;
  troopThumb(type: string): string | null;
  /** Start a Friendly Duel against a friend's base (their duel layout when `layout` is 'duel'). */
  onDuel(friend: { id: string; name: string }, layout: 'live' | 'duel', challengeId?: string): void;
  onReplay(record: BattleRecord): void;
  /** A Gang War strike on enemy base `target` (roadmap step 67); `generated`: the enemy Gang is generated. */
  onGangWarAttack?(target: number, relay: boolean, generated: boolean): void;
  /** Game Center friends' ids, when the device can ask (step 61). */
  gameCenterFriends?: () => Promise<string[]>;
}

type Tab = 'friends' | 'gang' | 'duels';

const FINDABLE: Record<Findable, string> = { everyone: 'Everyone', friends_of_friends: 'Friends of friends', nobody: 'Nobody (friend code only)' };

const ago = (t: number | null, now: number) => (t === null ? 'hidden' : now - t < 5 * 60_000 ? 'online now' : `seen ${formatDuration(now - t)} ago`);

export class FriendsUi {
  private tab: Tab = 'friends';
  private gangChatTimer = 0;
  constructor(private readonly d: FriendsUiDeps) {}

  private get port() {
    const p = this.d.connection.port;
    if (!p || !this.d.connection.online) throw new Error('Connect to the server first.');
    return p;
  }

  private async act<T>(fn: () => Promise<T>, done?: string): Promise<T | null> {
    try {
      const r = await fn();
      if (done) this.d.kit.toast(done, 'success');
      return r;
    } catch (e) {
      const err = e as Error & { suggestions?: string[] };
      this.d.kit.toast(err.message, 'error');
      return null;
    }
  }

  /** Open the panel; `addCode` comes from a share link (?friend=KAGE-…). */
  open(tab: Tab = 'friends', addCode?: string): void {
    this.tab = tab;
    const body = h('div', { class: 'friends-ui' });
    const draw = () => void this.draw(body, draw, addCode).then(() => (addCode = undefined));
    draw();
    this.d.kit.modal('Friends', body, [], 'wide', () => window.clearInterval(this.gangChatTimer));
  }

  private async draw(body: HTMLElement, redraw: () => void, addCode?: string): Promise<void> {
    window.clearInterval(this.gangChatTimer);
    clear(body);
    const tabs = h('div', { class: 'shop-tabs' });
    for (const [id, label] of [
      ['friends', 'Friends'],
      ['gang', 'Gang'],
      ['duels', 'Duels'],
    ] as [Tab, string][]) {
      const b = h('button', { type: 'button', class: id === this.tab ? 'on' : '' }, label);
      b.addEventListener('click', () => {
        this.tab = id;
        redraw();
      });
      tabs.append(b);
    }
    const content = h('div', {}, 'Loading…');
    body.append(tabs, content);
    try {
      if (this.tab === 'friends') await this.friendsTab(content, redraw, addCode);
      else if (this.tab === 'gang') await this.gangTab(content, redraw);
      else await this.duelsTab(content, redraw);
    } catch (e) {
      content.textContent = (e as Error).message;
    }
  }

  private cardLine(p: ProfileCard, extra = ''): HTMLElement {
    return h(
      'div',
      {},
      h('b', {}, p.name),
      p.staff ? h('span', { class: 'chip staff-badge', title: 'Kagemura staff' }, '✔ Staff') : null,
      h('div', { class: 'muted small' }, `Clan Keep ${p.hallLevel} · ${p.honor} Honor · ${p.league}${p.gang ? ` · Gang ${p.gang}` : ''}${extra}`),
    );
  }

  // ------------------------------------------------------------ Friends

  private async friendsTab(el: HTMLElement, redraw: () => void, addCode?: string): Promise<void> {
    const port = this.port;
    const [f, sugg] = await Promise.all([port.friends(), port.friendSuggestions().catch(() => ({ players: [] }))]);
    const now = Date.now();
    clear(el);
    const conn = this.d.connection;
    const share = `${conn.url}/f/${f.code}`;
    const qr = h('img', { class: 'friend-qr', alt: `QR code for ${f.code}`, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(share, 3))}` });
    const copy = h('button', { class: 'btn ghost', type: 'button' }, 'Copy link');
    copy.addEventListener('click', () => {
      const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
      if (nav.share) void nav.share({ title: 'Add me in Kagemura', url: share }).catch(() => undefined);
      else void navigator.clipboard?.writeText(share).then(() => this.d.kit.toast('Link copied.', 'success'));
    });
    el.append(
      h('div', { class: 'friend-me' }, qr, h('div', {}, h('p', {}, 'Your friend code'), h('p', { class: 'friend-code' }, f.code), h('p', { class: 'muted small' }, 'Friends scan this, open your link, or type your code or your exact name.'), copy)),
    );
    // Add a friend by exact name or code.
    const input = h('input', { class: 'text', type: 'text', maxlength: 24, placeholder: 'Exact name or friend code', value: addCode ?? '' }) as HTMLInputElement;
    input.addEventListener('keydown', (e) => e.stopPropagation());
    const found = h('div', {});
    const add = h('button', { class: 'btn', type: 'button' }, 'Find');
    const isCode = (v: string) => /^kage[-\s]?[2-9a-z]{6}$/i.test(v.trim()) || /^[2-9a-hjkmnp-z]{6}$/i.test(v.trim());
    add.addEventListener('click', () => {
      const v = input.value.trim();
      if (!v) return;
      clear(found);
      if (isCode(v)) {
        void this.act(() => port.requestFriend({ code: v })).then((r) => r && (this.d.kit.toast(r.status === 'friends' ? 'You are friends now.' : 'Friend request sent.', 'success'), redraw()));
        return;
      }
      void this.act(() => port.lookup(v)).then((p) => {
        if (!p) return;
        const b = h('button', { class: 'btn ghost', type: 'button' }, 'Add friend');
        b.addEventListener('click', () => void this.act(() => port.requestFriend({ name: p.name })).then((r) => r && (this.d.kit.toast(r.status === 'friends' ? 'You are friends now.' : 'Friend request sent.', 'success'), redraw())));
        found.append(h('div', { class: 'log-row' }, this.cardLine(p), b));
      });
    });
    el.append(h('h3', {}, 'Add a friend'), h('div', { class: 'chat-input-row' }, input, add), found);
    // Requests.
    if (f.incoming.length || f.outgoing.length) el.append(h('h3', {}, 'Requests'));
    for (const r of f.incoming) {
      const yes = h('button', { class: 'btn', type: 'button' }, 'Accept');
      const no = h('button', { class: 'btn ghost', type: 'button' }, 'Decline');
      yes.addEventListener('click', () => void this.act(() => port.answerFriendRequest(r.id, true), 'Friends now.').then(redraw));
      no.addEventListener('click', () => void this.act(() => port.answerFriendRequest(r.id, false)).then(redraw));
      el.append(h('div', { class: 'log-row' }, this.cardLine(r.player, ' · wants to be friends'), h('div', { class: 'row' }, yes, no)));
    }
    for (const r of f.outgoing) {
      const undo = h('button', { class: 'btn ghost', type: 'button' }, 'Withdraw');
      undo.addEventListener('click', () => void this.act(() => port.answerFriendRequest(r.id, false)).then(redraw));
      el.append(h('div', { class: 'log-row' }, this.cardLine(r.player, ' · waiting for them'), undo));
    }
    // The list.
    el.append(h('h3', {}, `Friends (${f.friends.length}/${f.max})`));
    if (!f.friends.length) el.append(h('p', { class: 'muted' }, 'No friends yet. Share your code, or add a recent opponent below.'));
    for (const fr of f.friends) el.append(this.friendRow(fr, now, redraw));
    // Suggestions.
    const gc = this.d.gameCenterFriends;
    if (sugg.players.length || gc) el.append(h('h3', {}, 'People you may know'));
    for (const p of sugg.players) el.append(this.suggestionRow(p, redraw));
    if (gc) {
      const b = h('button', { class: 'btn ghost', type: 'button' }, 'Find my Game Center friends');
      b.addEventListener('click', () => {
        void this.act(async () => {
          const ids = await gc();
          const r = await port.importFriends({ provider: 'gamecenter', ids });
          if (!r.players.length) this.d.kit.toast('None of your Game Center friends play online yet (or they hide).', 'info');
          for (const p of r.players) el.append(this.suggestionRow(p, redraw));
        });
      });
      el.append(h('p', { class: 'muted small' }, 'Only if you ask: the game reads your Game Center friends once to find the ones who play. No contacts are ever uploaded.'), b);
    }
    // Privacy.
    const sel = h('select', { class: 'text' }, ...(Object.keys(FINDABLE) as Findable[]).map((k) => h('option', { value: k, selected: f.findable === k }, FINDABLE[k]))) as HTMLSelectElement;
    sel.addEventListener('change', () => void this.act(() => port.setPrivacy({ findable: sel.value as Findable }), 'Saved.'));
    const hide = h('input', { type: 'checkbox', checked: f.hideOnline }) as HTMLInputElement;
    hide.addEventListener('change', () => void this.act(() => port.setPrivacy({ hideOnline: hide.checked }), 'Saved.'));
    el.append(h('h3', {}, 'Privacy'), h('label', { class: 'muted small' }, 'Who can find me by name'), sel, h('label', { class: 'toggle' }, hide, ' Hide when I was last online'));
  }

  private suggestionRow(p: ProfileCard & { reason: string }, redraw: () => void): HTMLElement {
    const why = p.reason === 'opponent' ? ' · a recent opponent' : p.reason === 'alliance' ? ' · in your Alliance' : ' · a Game Center friend';
    const b = h('button', { class: 'btn ghost', type: 'button' }, 'Add friend');
    b.addEventListener('click', () => void this.act(() => this.port.requestFriend({ name: p.name })).then((r) => r && (this.d.kit.toast('Friend request sent.', 'success'), redraw())));
    return h('div', { class: 'log-row' }, this.cardLine(p, why), b);
  }

  private friendRow(fr: FriendView, now: number, redraw: () => void): HTMLElement {
    const duel = h('button', { class: 'btn', type: 'button' }, 'Duel');
    duel.addEventListener('click', () => {
      this.d.kit.closeAllModals();
      this.d.onDuel({ id: fr.id, name: fr.name }, 'live');
    });
    const more = h('button', { class: 'btn ghost more-btn', type: 'button', title: `More for ${fr.name}` }, '⋯');
    more.addEventListener('click', () => this.friendMenu(fr, redraw));
    return h('div', { class: 'log-row' }, this.cardLine(fr, ` · ${ago(fr.lastSeen, now)}${fr.formerly ? ` · formerly ${fr.formerly}` : ''}`), h('div', { class: 'row' }, duel, more));
  }

  private friendMenu(fr: FriendView, redraw: () => void): void {
    const port = this.port;
    const body = h('div', {});
    const close = this.d.kit.modal(fr.name, body, []);
    const btn = (label: string, fn: () => Promise<unknown>, cls = 'btn ghost') => {
      const b = h('button', { class: cls, type: 'button' }, label);
      b.addEventListener('click', () => {
        close();
        void fn().then(redraw);
      });
      body.append(b);
    };
    btn('Duel their duel layout', async () => {
      this.d.kit.closeAllModals();
      this.d.onDuel({ id: fr.id, name: fr.name }, 'duel');
    });
    btn('Challenge to a duel (24 h)', () => this.act(() => port.challengeFriend(fr.id), 'Challenge sent: attack each other\'s base within 24 hours.'));
    btn('Invite to my Gang', () => this.act(() => port.inviteToGang(fr.id), 'Invite sent.'));
    btn('Remove friend', async () => {
      if (await this.d.kit.confirm('Remove friend', `Stop being friends with ${fr.name}?`, 'Remove', true, 'Keep')) await this.act(() => port.removeFriend(fr.id));
    });
    btn('Block', async () => {
      if (await this.d.kit.confirm('Block', `Block ${fr.name}? You stop being friends, and their messages and requests are hidden.`, 'Block', true, 'Cancel')) await this.act(() => port.block(fr.id), 'Blocked.');
    }, 'btn danger');
    const reasons = h('select', { class: 'text' }, ...REPORT_REASONS.map((r) => h('option', { value: r }, r))) as HTMLSelectElement;
    const report = h('button', { class: 'btn ghost', type: 'button' }, 'Report');
    report.addEventListener('click', () => {
      close();
      void this.act(() => port.report({ kind: 'player', playerId: fr.id, reason: reasons.value as ReportReason }), 'Reported. Our staff will look at it.');
    });
    body.append(h('div', { class: 'row' }, reasons, report));
  }

  // ------------------------------------------------------------ Gang

  private async gangTab(el: HTMLElement, redraw: () => void): Promise<void> {
    const port = this.port;
    const g: MyGangResponse = await port.myGang();
    clear(el);
    for (const inv of g.invites) {
      const yes = h('button', { class: 'btn', type: 'button' }, 'Join');
      const no = h('button', { class: 'btn ghost', type: 'button' }, 'Decline');
      yes.addEventListener('click', () => void this.act(() => port.answerGangInvite(inv.id, true), `Welcome to ${inv.gang.name}!`).then(redraw));
      no.addEventListener('click', () => void this.act(() => port.answerGangInvite(inv.id, false)).then(redraw));
      el.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, inv.gang.name), h('div', { class: 'muted small' }, `${inv.from} invites you · ${inv.gang.members} member${inv.gang.members === 1 ? '' : 's'}`)), h('div', { class: 'row' }, yes, no)));
    }
    if (!g.gang) {
      el.append(h('p', { class: 'muted' }, 'A Gang is 2 to 4 friends who fight Gang Wars together, with their own chat and troop gifts. You can be in a Gang and an Alliance at the same time.'));
      if (g.canJoinAt) el.append(h('p', { class: 'note' }, `You left a Gang recently: you can join or start one in ${formatDuration(g.canJoinAt - Date.now())}.`));
      const name = h('input', { class: 'text', type: 'text', maxlength: 20, placeholder: 'Gang name' }) as HTMLInputElement;
      name.addEventListener('keydown', (e) => e.stopPropagation());
      const make = h('button', { class: 'btn', type: 'button' }, 'Start a Gang');
      make.addEventListener('click', () => void this.act(() => port.createGang(name.value), 'Gang started. Invite friends from the Friends tab.').then(redraw));
      el.append(h('div', { class: 'chat-input-row' }, name, make));
      return;
    }
    const gang = g.gang;
    const leader = gang.you.role === 'leader';
    el.append(h('h3', {}, `${gang.name} (${gang.members.length}/${gang.max})`));
    for (const m of gang.members) {
      const row = h('div', { class: 'log-row' }, h('div', {}, h('b', {}, m.name), m.role === 'leader' ? h('span', { class: 'chip' }, 'Leader') : null, h('div', { class: 'muted small' }, `Clan Keep ${m.hallLevel} · ${m.honor} Honor · ${ago(m.lastSeen, Date.now())}`)));
      if (leader && m.role !== 'leader') {
        const lead = h('button', { class: 'btn ghost', type: 'button' }, 'Make leader');
        lead.addEventListener('click', () => void this.act(() => port.handOverGang(m.id), `${m.name} leads now.`).then(redraw));
        row.append(lead);
      }
      el.append(row);
    }
    for (const i of gang.invites) {
      const undo = h('button', { class: 'btn ghost', type: 'button' }, 'Withdraw');
      undo.addEventListener('click', () => void this.act(() => port.answerGangInvite(i.id, false)).then(redraw));
      el.append(h('div', { class: 'log-row' }, this.cardLine(i.player, ' · invited'), undo));
    }
    if (leader && gang.members.length + gang.invites.length < gang.max) el.append(h('p', { class: 'muted small' }, 'Invite friends with ⋯ → Invite to my Gang in the Friends tab.'));
    await this.gangWarSection(el, redraw, leader, gang.members.length);
    // Troop gifts inside the Gang.
    const c = this.d.kit.c;
    const free = reinforcementCapacity(c.state, c.data) - reinforcementHousing(c.state, c.data);
    const ask = h('button', { class: 'btn ghost', type: 'button', disabled: free <= 0 }, free > 0 ? `Ask the Gang for ${free} housing of warriors` : 'Your Lodge is full (or not built)');
    ask.addEventListener('click', () => void this.act(() => port.gangRequestTroops(free), 'Asked your Gang.').then(redraw));
    el.append(h('h3', {}, 'Warriors for each other'), ask);
    for (const r of (await port.gangRequests()).requests.filter((x) => !x.mine)) {
      const btns = h('div', { class: 'row' });
      for (const [t, n] of Object.entries(c.state.army)) {
        if (n <= 0) continue;
        const th = this.d.troopThumb(t);
        const b = h('button', { class: 'btn ghost donate-btn', type: 'button', title: `Send ${c.data.troops[t]?.name}` }, th ? h('img', { src: th, alt: '' }) : null, `×${n}`);
        b.addEventListener('click', () =>
          void this.act(async () => {
            const level = troopLevels(c.state, c.data)[t] ?? 1;
            await port.gangDonate(r.id, { troop: t, count: 1, level });
            // The server took the warrior from your army: the same here (no Alliance XP for Gang gifts).
            c.dispatch({ type: 'spendDonation', troop: t, count: 1, xp: 0 });
          }).then(redraw),
        );
        btns.append(b);
      }
      el.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, r.name), h('div', { class: 'muted small' }, `${r.filled}/${r.size}`)), btns.childElementCount ? btns : h('span', { class: 'muted small' }, 'Train warriors to send.')));
    }
    // Gang chat.
    const log = h('div', { class: 'chat-log' });
    const msg = h('input', { class: 'text', type: 'text', maxlength: 160, placeholder: 'Message your Gang' }) as HTMLInputElement;
    msg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') send.click();
    });
    const send = h('button', { class: 'btn', type: 'button' }, 'Send');
    let cursor: string | undefined;
    const pull = async () => {
      const r = await port.gangChat(cursor).catch(() => null);
      if (!r) return;
      cursor = r.cursor;
      for (const m of r.messages) log.append(h('div', { class: m.from ? 'chat-msg' : 'chat-msg system' }, m.from ? h('b', {}, `${m.from.name}: `) : null, m.text));
      log.scrollTop = log.scrollHeight;
    };
    send.addEventListener('click', () => {
      const text = msg.value.trim();
      if (!text) return;
      msg.value = '';
      void this.act(() => port.postGangChat(text)).then(() => pull());
    });
    el.append(h('h3', {}, 'Gang chat'), log, h('div', { class: 'chat-input-row' }, msg, send));
    await pull();
    this.gangChatTimer = window.setInterval(() => void pull(), 8000);
    const leave = h('button', { class: 'btn danger', type: 'button' }, 'Leave the Gang');
    leave.addEventListener('click', async () => {
      if (await this.d.kit.confirm('Leave the Gang', 'You can join or start another Gang after 24 hours.', 'Leave', true, 'Stay')) await this.act(() => port.leaveGang(), 'You left the Gang.').then(redraw);
    });
    el.append(h('div', { class: 'actions' }, leave));
  }

  // ------------------------------------------------------------ Gang War (step 67)

  /**
   * The Gang War: find one (leader), prep (set my war base, fill the Lodge),
   * the battle day (both Gangs' bases, Solo and Relay strikes with the relay's
   * state), the war log with replays, and the chest at the end.
   */
  private async gangWarSection(el: HTMLElement, redraw: () => void, leader: boolean, members: number): Promise<void> {
    if (!this.d.connection.server?.features.includes('gang-wars')) return;
    const port = this.port;
    const c = this.d.kit.c;
    const gw = c.data.social.gangWar;
    const r = await port.gangWar();
    const now = Date.now();
    const w = r.war;
    el.append(h('h3', {}, 'Gang War'));
    if (r.rating !== null) el.append(h('p', { class: 'muted small' }, `Gang Rating ${r.rating} (only your Gang sees it; wars against generated Gangs never change it).`));
    const running = w && w.phase !== 'ended';
    if (!running) {
      if (w) {
        const verdict = w.outcome === 'win' ? 'Victory' : w.outcome === 'loss' ? 'Defeat' : 'Draw';
        el.append(h('div', { class: 'raid-score' }, h('div', {}, h('b', {}, w.ours.name), h('span', { class: 'big' }, `★ ${w.ours.stars}`)), h('div', { class: 'muted' }, verdict), h('div', {}, h('b', {}, w.theirs.name), h('span', { class: 'big' }, `★ ${w.theirs.stars}`))));
        if (!w.claimed) {
          // The same chest the server pays (scaled to the Keep), shown before collecting it.
          const chest = w.outcome ? scaleReward(gw.rewards[w.outcome], hallLevel(c.state, c.data), c.data) : {};
          const take = h('button', { class: 'btn gold', type: 'button' }, 'Collect the war chest');
          take.addEventListener('click', () => void this.act(() => this.d.connection.claimGangWar(), 'War chest collected.').then(redraw));
          el.append(h('div', { class: 'row' }, rewardChips(chest)), take);
        }
        this.warLog(el, w);
      }
      if (r.queued) {
        el.append(h('p', {}, `Looking for an enemy Gang of ${members}… (${formatDuration(Math.max(0, now - r.queued.since))}). If none fits within ${gw.botAfterMinutes} minutes, you get a generated Gang: labelled as generated, and it never changes your Gang Rating.`));
        if (leader) {
          const stop = h('button', { class: 'btn ghost', type: 'button' }, 'Stop looking');
          stop.addEventListener('click', () => void this.act(() => port.leaveGangWarQueue(), 'Stopped looking.').then(redraw));
          el.append(stop);
        }
        return;
      }
      el.append(h('p', { class: 'muted' }, `A Gang War is your Gang against another Gang of the same size: ${gw.prepHours} hours of prep, then a ${gw.battleHours}-hour battle day. Each member has ${gw.attacksPerMember} strikes; the best result on each enemy base counts. Relay: Gang mates take turns on one base, each strike starting from the damage the last one left, sharing ${gw.relayHousingShare} armies between them. The roster is locked from the search until the war ends.`));
      if (leader && members >= gw.minMembers) {
        const go = h('button', { class: 'btn', type: 'button' }, 'Find a Gang War');
        go.addEventListener('click', () => void this.act(() => port.queueGangWar()).then(redraw));
        el.append(go);
      } else el.append(h('p', { class: 'muted small' }, members < gw.minMembers ? `A Gang War needs at least ${gw.minMembers} members.` : 'Your leader starts the search.'));
      return;
    }
    // Running: prep or battle day.
    const prep = w.phase === 'prep';
    el.append(
      h('div', { class: 'raid-score' }, h('div', {}, h('b', {}, w.ours.name), h('span', { class: 'big' }, `★ ${w.ours.stars}`)), h('div', { class: 'muted' }, 'vs'), h('div', {}, h('b', {}, w.theirs.name), h('span', { class: 'big' }, `★ ${w.theirs.stars}`))),
      h('p', { class: 'muted small' }, prep ? `Prep: the battle starts in ${formatDuration(w.prepUntil - now)}.` : `Battle day: ends in ${formatDuration(w.endsAt - now)} · you have ${w.attacksLeft} strike${w.attacksLeft === 1 ? '' : 's'} left · ${w.ours.destruction}% to ${w.theirs.destruction}% decides a tie.`),
    );
    if (w.theirs.generated) el.append(h('p', { class: 'note' }, 'No Gang fitted yours, so this enemy Gang is generated. Its strikes on your bases are simulated, and the war never changes your Gang Rating.'));
    if (prep) {
      const set = h('button', { class: 'btn ghost', type: 'button' }, 'Use my village now as my war base');
      set.addEventListener('click', () => void this.act(() => port.setGangWarBase(villageToBase(c.state, c.now(), c.data, this.d.connection.player?.name)), 'War base saved for this war.').then(redraw));
      const free = reinforcementCapacity(c.state, c.data) - reinforcementHousing(c.state, c.data);
      el.append(
        h('h4', {}, 'Prepare'),
        h('p', { class: 'muted small' }, 'Your war base is a copy of your village from when the war was found. Rearrange your village, save it here, then move things back: raiders keep attacking your real village.'),
        set,
        h('p', { class: 'muted small' }, free > 0 ? `Your Lodge has room for ${free} housing of warriors: ask your Gang below. Gifts fight beside your own army on battle day.` : 'Your Lodge is full: your Gang\'s gifts fight beside your army on battle day.'),
      );
    }
    el.append(h('h4', {}, `Enemy bases (${w.theirs.name})`));
    for (const b of w.theirs.bases) el.append(this.warBaseRow(b, w, prep));
    el.append(h('h4', {}, `Our bases (${w.ours.name})`));
    for (const b of w.ours.bases) el.append(this.warBaseRow(b, w, true));
    this.warLog(el, w);
  }

  private warBaseRow(b: GangWarBaseView, w: GangWarView, readOnly: boolean): HTMLElement {
    const starEl = h('span', { class: 'stars-mini' });
    for (let k = 0; k < 3; k++) starEl.append(h('span', { class: k < (b.best?.stars ?? 0) ? '' : 'off' }, '★'));
    const best = b.best ? `best ${b.best.destruction}%` : 'not attacked yet';
    const relay = b.relay;
    const relayText = relay && relay.strikes > 0 ? ` · relay: ${relay.strikes} strike${relay.strikes === 1 ? '' : 's'}, ${relay.damaged}% of buildings damaged, last ${relay.lastBy ?? '?'}${relay.busy ? ' · a mate is striking now' : ''} · ${Math.round(relay.armyLeft * 100)}% army left` : '';
    const row = h('div', { class: 'log-row' }, h('div', {}, h('b', {}, `${b.index + 1}. ${b.name}`), h('div', { class: 'row' }, h('span', { class: 'muted small' }, `Clan Keep ${b.hallLevel} · ${best}${relayText}`), starEl)));
    if (!readOnly && relay) {
      const none = w.attacksLeft <= 0;
      const solo = h('button', { class: 'btn danger', type: 'button', disabled: none, title: 'A strike with your full army' }, 'Solo');
      solo.addEventListener('click', () => {
        this.d.kit.closeAllModals();
        this.d.onGangWarAttack?.(b.index, false, w.theirs.generated);
      });
      const canRelay = !none && !relay.busy && relay.armyLeft >= 0.1 && (b.best?.stars ?? 0) < 3;
      const label = relay.strikes > 0 ? `Relay (${Math.round(relay.armyLeft * 100)}% army)` : 'Open a relay';
      const rel = h('button', { class: 'btn ghost', type: 'button', disabled: !canRelay, title: 'Start from the damage your Gang left on this base' }, label);
      rel.addEventListener('click', () => {
        this.d.kit.closeAllModals();
        this.d.onGangWarAttack?.(b.index, true, w.theirs.generated);
      });
      row.append(h('div', { class: 'row' }, solo, rel));
    }
    return row;
  }

  private warLog(el: HTMLElement, w: GangWarView): void {
    if (!w.attacks.length) return;
    el.append(h('h4', {}, 'War log'));
    for (const a of w.attacks.slice().sort((x, y) => y.at - x.at)) {
      const watch = h('button', { class: 'btn ghost', type: 'button' }, 'Watch');
      watch.addEventListener('click', () => {
        this.d.kit.closeAllModals();
        this.d.onReplay(this.warRecord(a, w));
      });
      const who = a.side === 'ours' ? `${a.attacker} → ${a.targetName}` : `${a.attacker} → ${a.targetName} (ours)`;
      el.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, who), h('div', { class: 'muted small' }, `${a.stars}★ · ${Math.round(a.destruction)}%${a.relay ? ' · relay strike' : ' · solo'}`)), watch));
    }
  }

  /** A war strike as a battle record, only for watching. */
  private warRecord(a: GangWarAttackView, w: GangWarView): BattleRecord {
    const x = a.replay;
    const enemy = a.side === 'ours' ? w.theirs : w.ours;
    return {
      id: a.id,
      kind: a.side === 'ours' ? 'attack' : 'defense',
      at: a.at,
      opponentName: `${a.side === 'ours' ? a.targetName : a.attacker}${enemy.generated && a.side === 'ours' ? ' (generated Gang)' : ''} (Gang War)`,
      setup: { seed: x.seed, base: x.base, army: x.army, levels: x.levels, ...(x.reinforcements ? { reinforcements: x.reinforcements } : {}), ...(x.startDamage ? { startDamage: x.startDamage } : {}), infiltration: true },
      deployments: x.deployments,
      endTick: x.endTick,
      result: x.result,
      rules: x.rules,
    } as BattleRecord;
  }

  // ------------------------------------------------------------ Duels

  private async duelsTab(el: HTMLElement, redraw: () => void): Promise<void> {
    const port = this.port;
    const d = await port.duels();
    clear(el);
    el.append(h('p', { class: 'muted' }, 'Friendly duels never change Honor, loot, troops or ratings: they are for fun and practice. Your friend gets the replay.'));
    const open = d.challenges.filter((c) => c.status === 'open');
    if (open.length) el.append(h('h3', {}, 'Challenges'));
    for (const c of open) {
      const row = h('div', { class: 'log-row' }, h('div', {}, h('b', {}, c.with.name), h('div', { class: 'muted small' }, `${c.myDone ? 'You attacked' : 'Your turn'} · ${c.theirDone ? 'they attacked' : 'waiting for them'} · ends in ${formatDuration(Math.max(0, c.endsAt - Date.now()))}`)));
      if (!c.myDone) {
        const go = h('button', { class: 'btn', type: 'button' }, 'Attack');
        go.addEventListener('click', () => {
          this.d.kit.closeAllModals();
          this.d.onDuel(c.with, 'live', c.id);
        });
        row.append(go);
      }
      el.append(row);
    }
    const done = d.challenges.filter((c) => c.status !== 'open').slice(0, 5);
    for (const c of done) el.append(h('p', { class: 'muted small' }, `Challenge with ${c.with.name}: ${c.winner === 'me' ? 'you won' : c.winner === 'them' ? 'they won' : 'a draw'}.`));
    if (d.rivalries.length) el.append(h('h3', {}, 'Rivalries'));
    for (const r of d.rivalries) el.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, r.name), h('div', { class: 'muted small' }, `${r.duels} duel${r.duels === 1 ? '' : 's'} · you won ${r.myWins}, they won ${r.theirWins} · your best ${r.myBest}★, theirs ${r.theirBest}★`))));
    el.append(h('h3', {}, 'Recent duels'));
    if (!d.duels.length) el.append(h('p', { class: 'muted' }, 'No duels yet: tap Duel next to a friend.'));
    for (const x of d.duels) {
      const watch = h('button', { class: 'btn ghost', type: 'button' }, 'Watch');
      watch.addEventListener('click', () => {
        this.d.kit.closeAllModals();
        this.d.onReplay(this.record(x));
      });
      el.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, x.mine ? `You → ${x.defender.name}` : `${x.attacker.name} → you`), h('div', { class: 'muted small' }, `${x.result.stars}★ · ${Math.round(x.result.destruction)}%${x.layout === 'duel' ? ' · duel layout' : ''} · Friendly duel`)), watch));
    }
    // My duel layout.
    const c = this.d.kit.c;
    const set = h('button', { class: 'btn ghost', type: 'button' }, d.hasDuelLayout ? 'Replace my duel layout with my village now' : 'Use my village now as my duel layout');
    set.addEventListener('click', () => void this.act(() => port.setDuelLayout(villageToBase(c.state, c.now(), c.data, this.d.connection.player?.name)), 'Duel layout saved: friends can try it.').then(redraw));
    el.append(h('h3', {}, 'My duel layout'), h('p', { class: 'muted small' }, 'A copy of your layout for friends to try, separate from the base real raiders attack. Change your village, save it here, then move things back.'), set);
    if (d.hasDuelLayout) {
      const clr = h('button', { class: 'btn ghost', type: 'button' }, 'Remove it');
      clr.addEventListener('click', () => void this.act(() => port.setDuelLayout(null), 'Removed.').then(redraw));
      el.append(clr);
    }
  }

  /** A duel as a battle record, only for watching (never saved in the village). */
  private record(x: DuelView): BattleRecord {
    return {
      id: x.id,
      kind: 'attack',
      at: x.at,
      opponentName: x.mine ? `${x.defender.name} (friendly duel)` : `${x.attacker.name} (friendly duel)`,
      setup: { seed: x.replay.seed, base: x.replay.base, army: x.replay.army, levels: x.replay.levels, ...(x.replay.reinforcements ? { reinforcements: x.replay.reinforcements } : {}), infiltration: true },
      deployments: x.replay.deployments,
      endTick: x.replay.endTick,
      result: x.result,
      rules: x.replay.rules,
    } as BattleRecord;
  }
}

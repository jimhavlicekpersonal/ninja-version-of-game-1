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
import { clear, h } from './dom';
import type { UiKit } from './economyUi';
import { formatDuration } from './format';
import { REASON_LABELS } from './groveUi';
import { qrSvg } from './qr';
import type { SignInSource } from '../../backend/platform/auth';

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

const LEAGUE = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

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
    this.tab = tab;
    const body = h('div', { class: 'friends' });
    this.body = body;
    this.found = null;
    this.error = '';
    this.query = search ?? '';
    this.d.kit.modal('Friends', body, [], 'wide', () => {
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
      this.d.kit.toast((e as Error).message, 'error');
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
      this.d.kit.toast((e as Error).message, 'error');
    } finally {
      this.busy = false;
    }
    this.draw();
  }

  private draw(): void {
    const body = this.body;
    if (!body) return;
    const keepFocus = document.activeElement?.matches?.('.friends input.find');
    clear(body);
    if (!this.conn.canFriends) {
      body.append(h('p', { class: 'muted' }, 'Friends need online play. When the game is online, you can find friends by name or friend code here.'));
      return;
    }
    if (this.conn.canGangs) {
      const tabBtn = (t: 'friends' | 'gang', label: string) =>
        h('button', { class: this.tab === t ? 'on' : '', type: 'button', role: 'tab', 'aria-selected': this.tab === t ? 'true' : 'false', onclick: () => { this.tab = t; if (t === 'gang') void this.gang.load(); this.draw(); } }, label);
      body.append(h('div', { class: 'shop-tabs', role: 'tablist' }, tabBtn('friends', 'Friends'), tabBtn('gang', 'Gang')));
      if (this.tab === 'gang') {
        this.gang.draw(body);
        return;
      }
    }
    if (this.error) body.append(h('div', { class: 'note error-note' }, `Can't load your friends right now: ${this.error}`));
    this.findBox(body, keepFocus === true);
    if (this.found) body.append(this.cardRow(this.found));
    const f = this.data;
    if (!f) {
      body.append(h('p', { class: 'muted' }, 'Loading your friends…'));
      return;
    }
    this.codeBox(body, f);
    if (f.incoming.length) {
      body.append(h('h3', {}, `Requests (${f.incoming.length})`));
      for (const r of f.incoming) {
        body.append(
          h(
            'div',
            { class: 'log-row' },
            this.who(r.player, `Asked ${formatDuration(this.now() - r.at)} ago`),
            h(
              'div',
              { class: 'row' },
              h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.answerFriendRequest(r.id, true), `You and ${r.player.name} are friends.`) }, 'Accept'),
              h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.answerFriendRequest(r.id, false)) }, 'Decline'),
              this.moreButton(r.player),
            ),
          ),
        );
      }
    }
    this.challengesBox(body);
    body.append(h('h3', {}, `Friends (${f.friends.length}/${f.max})`));
    if (!f.friends.length) body.append(h('p', { class: 'muted small' }, 'No friends yet. Share your friend code, or find someone by their exact name.'));
    for (const fr of f.friends) body.append(this.friendRow(fr));
    if (f.outgoing.length) {
      body.append(h('h3', {}, 'Waiting for an answer'));
      for (const r of f.outgoing) {
        body.append(
          h(
            'div',
            { class: 'log-row' },
            this.who(r.player, `Expires in ${formatDuration(Math.max(0, r.expiresAt - this.now()))}`),
            h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.cancelFriendRequest(r.id)) }, 'Take back'),
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
    const input = h('input', { class: 'text find', type: 'text', maxlength: 24, placeholder: `Exact name or friend code`, value: this.query, 'aria-label': 'Exact name or friend code' }) as HTMLInputElement;
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.find(input.value);
    });
    input.addEventListener('input', () => (this.query = input.value));
    body.append(
      h('div', { class: 'row find-row' }, input, h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: () => void this.find(input.value) }, 'Find')),
      h('p', { class: 'muted small' }, `Names are 3–${NAME_MAX} characters; capitals, spaces, _ and - don't matter. Only exact names are found.`),
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
        () => this.d.kit.toast(`${what} copied.`, 'success'),
        () => this.d.kit.toast(text, 'info'),
      );
    const share = () => {
      const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url?: string }) => Promise<void> };
      if (link && nav.share) void nav.share({ title: 'Be my friend in Kagemura', text: `Add me in Kagemura: ${f.code}`, url: link }).catch(() => undefined);
      else copy(link ?? f.code, link ? 'Friend link' : 'Friend code');
    };
    const qrBtn = h('button', { class: 'btn ghost', type: 'button' }, 'QR code');
    qrBtn.addEventListener('click', () => {
      if (!qrHost.childElementCount) {
        const svg = qrSvg(link ?? f.code, 200);
        if (svg) qrHost.append(h('div', { html: svg }), h('p', { class: 'muted small' }, 'A friend scans this with their phone camera.'));
      }
      qrHost.hidden = !qrHost.hidden;
    });
    body.append(
      h('h3', {}, 'Your friend code'),
      h(
        'div',
        { class: 'row friend-code' },
        h('b', { class: 'code' }, f.code),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => copy(f.code, 'Friend code') }, 'Copy'),
        h('button', { class: 'btn ghost', type: 'button', onclick: share }, link ? 'Share link' : 'Share'),
        qrBtn,
      ),
      qrHost,
    );
  }

  private who(p: PlayerCard, extra?: string): HTMLElement {
    const bits = [`Clan Keep ${p.keep}`, `${LEAGUE(p.league)} league`, p.alliance ? p.alliance : null, extra ?? null].filter(Boolean).join(' · ');
    return h(
      'div',
      {},
      h('b', {}, p.name),
      p.staff ? h('span', { class: 'chip staff', title: 'Kagemura staff' }, 'Staff') : null,
      p.formerly ? h('span', { class: 'muted small' }, ` (formerly ${p.formerly})`) : null,
      h('div', { class: 'muted small' }, bits),
    );
  }

  private lastSeen(fr: FriendView): string {
    if (fr.lastSeen === undefined) return 'Online status hidden';
    const ago = this.now() - fr.lastSeen;
    return ago < 5 * 60_000 ? 'Online now' : `Seen ${formatDuration(ago)} ago`;
  }

  private friendRow(fr: FriendView): HTMLElement {
    const online = fr.lastSeen !== undefined && this.now() - fr.lastSeen < 5 * 60_000;
    const r = this.duelData?.rivalries.find((x) => x.friendId === fr.id);
    const rivalry = r && (r.duels || r.theirDuels) ? ` · duels: you won ${r.wins}/${r.duels}, they won ${r.theirWins}/${r.theirDuels}` : '';
    const duel = this.conn.canDuels && this.d.onDuel ? h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => (this.d.kit.closeAllModals(), this.d.onDuel!(fr.id, fr.name)) }, 'Duel') : null;
    return h('div', { class: 'log-row' }, this.who(fr, `${this.lastSeen(fr)}${rivalry}`), h('div', { class: 'row' }, h('span', { class: `dot ${online ? 'on' : ''}` }), duel, this.moreButton(fr, true)));
  }

  /** Duel challenges (step 62): attack each other within 24 hours. */
  private challengesBox(body: HTMLElement): void {
    const list = (this.challengeData?.challenges ?? []).filter((c) => c.outcome === null || this.now() - c.expiresAt < 24 * 3_600_000).slice(0, 6);
    if (!list.length) return;
    body.append(h('h3', {}, 'Duel challenges'));
    for (const c of list) {
      const score = (r: { stars: number; destruction: number } | null) => (r ? `${r.stars}★ ${Math.round(r.destruction)}%` : '—');
      const status = c.outcome ? (c.outcome === 'win' ? 'You won' : c.outcome === 'loss' ? `${c.opponent.name} won` : 'A draw') : `Ends in ${formatDuration(Math.max(0, c.expiresAt - this.now()))}`;
      const attack = !c.outcome && !c.my && this.d.onDuel ? h('button', { class: 'btn primary', type: 'button', onclick: () => (this.d.kit.closeAllModals(), this.d.onDuel!(c.opponent.id, c.opponent.name, { challengeId: c.id })) }, 'Attack') : null;
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, `vs ${c.opponent.name}`), h('div', { class: 'muted small' }, `You ${score(c.my)} · them ${score(c.their)} · ${status}`)), attack));
    }
  }

  /** Recent duels both ways, with replays. */
  private duelsBox(body: HTMLElement): void {
    const list = (this.duelData?.duels ?? []).slice(0, 8);
    if (!list.length) return;
    body.append(h('h3', {}, 'Recent duels'));
    for (const d of list) {
      const watch = this.d.onReplay ? h('button', { class: 'btn ghost', type: 'button', onclick: () => (this.d.kit.closeAllModals(), this.d.onReplay!(duelRecord(d))) }, 'Watch') : null;
      const what = d.side === 'attack' ? `You dueled ${d.opponent.name}` : `${d.opponent.name} dueled you`;
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, what), h('div', { class: 'muted small' }, `${d.result.stars}★ ${Math.round(d.result.destruction)}% · ${formatDuration(this.now() - d.at)} ago${d.challengeId ? ' · challenge' : ''}`)), watch));
    }
  }

  private cardRow(p: PlayerCard): HTMLElement {
    const action =
      p.relation === 'self'
        ? h('span', { class: 'muted small' }, 'That is you')
        : p.relation === 'friend'
          ? h('span', { class: 'chip' }, 'Friends')
          : p.relation === 'requested'
            ? h('span', { class: 'chip' }, 'Request sent')
            : h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.addFriend({ playerId: p.id }), p.relation === 'incoming' ? `You and ${p.name} are friends.` : `Friend request sent to ${p.name}.`) }, p.relation === 'incoming' ? 'Accept' : 'Add friend');
    return h('div', { class: 'log-row current found' }, this.who(p), h('div', { class: 'row' }, action, p.relation === 'self' ? null : this.moreButton(p, p.relation === 'friend')));
  }

  /** "⋯": remove (friends), report, block. */
  private moreButton(p: PlayerCard, friend = false): HTMLElement {
    const btn = h('button', { class: 'chat-more', type: 'button', title: 'More', 'aria-label': `More for ${p.name}` }, '⋯');
    btn.addEventListener('click', () => {
      let close = () => {};
      close = this.d.kit.modal(p.name, this.who(p), [
        friend && this.conn.canDuels && this.d.onDuel && {
          label: 'Challenge to a duel',
          onClick: () => {
            close();
            void this.run(() => this.conn.challenge(p.id), `Challenge sent to ${p.name}: attack each other within 24 hours.`);
          },
        },
        friend && this.conn.canDuels && this.d.onDuel && {
          label: 'Duel their duel layout',
          onClick: () => (close(), this.d.kit.closeAllModals(), this.d.onDuel!(p.id, p.name, { layout: 'duel' })),
        },
        friend && {
          label: 'Remove friend',
          onClick: () => {
            close();
            void this.d.kit.confirm(`Remove ${p.name}?`, 'You can add each other again later.', 'Remove', true).then((ok) => (ok ? this.run(() => this.conn.unfriend(p.id), `${p.name} is no longer your friend.`) : undefined));
          },
        },
        { label: 'Report', onClick: () => (close(), this.report(p)) },
        {
          label: 'Block',
          danger: true,
          onClick: () => {
            close();
            void this.d.kit.confirm(`Block ${p.name}?`, 'You stop being friends, and neither of you can find or ask the other.', 'Block', true).then((ok) => (ok ? this.run(() => this.conn.blockPlayer(p.id), `${p.name} is blocked.`) : undefined));
          },
        },
      ]);
    });
    return btn;
  }

  private report(p: PlayerCard): void {
    const body = h('div', { class: 'report-form' }, h('p', { class: 'muted small' }, `Tell the moderators what ${p.name} did.`));
    const reasons = h('div', { class: 'report-reasons', role: 'radiogroup', 'aria-label': 'Reason' });
    for (const r of REPORT_REASONS) reasons.append(h('label', { class: 'report-reason' }, h('input', { type: 'radio', name: 'friend-report-reason', value: r }), REASON_LABELS[r]));
    const note = h('textarea', { class: 'text', maxlength: 500, rows: 2, placeholder: 'Anything else they should know (optional)' }) as HTMLTextAreaElement;
    note.addEventListener('keydown', (e) => e.stopPropagation());
    const also = h('input', { type: 'checkbox' }) as HTMLInputElement;
    body.append(reasons, note, h('label', { class: 'report-block' }, also, ` Also block ${p.name}`));
    let close = () => {};
    close = this.d.kit.modal(`Report ${p.name}`, body, [
      {
        label: 'Send report',
        primary: true,
        onClick: () => {
          const reason = body.querySelector<HTMLInputElement>('input[name="friend-report-reason"]:checked')?.value as ReportReason | undefined;
          if (!reason) {
            this.d.kit.toast('Pick a reason first.', 'error');
            return;
          }
          close();
          void this.run(() => this.conn.reportPlayer(p.id, reason, note.value, also.checked), 'Thanks. The moderators will look at it.');
        },
      },
    ]);
  }

  private suggestionsBox(body: HTMLElement, f: FriendsResponse): void {
    const known = new Set([...f.friends, ...f.outgoing.map((r) => r.player), ...f.incoming.map((r) => r.player)].map((p) => p.name.toLowerCase()));
    const names = [...new Set(this.d.suggestions())].filter((n) => !known.has(n.toLowerCase())).slice(0, 6);
    if (!names.length) return;
    body.append(h('h3', {}, 'People you may know'), h('p', { class: 'muted small' }, 'Real players who raided you lately, and your Alliance mates.'));
    for (const n of names) {
      body.append(h('div', { class: 'log-row' }, h('b', {}, n), h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.addFriend({ name: n }), `Friend request sent to ${n}.`) }, 'Add friend')));
    }
  }

  /** Opt-in: which Game Center (or Play Games) friends play Kagemura. Nothing is read until the player asks. */
  private platformBox(body: HTMLElement): void {
    const providers = this.d.platform?.friendProviders?.() ?? [];
    if (!providers.length || !this.conn.server?.features.includes('platform-friends')) return;
    const provider = providers[0];
    const label = provider === 'gamecenter' ? 'Game Center' : 'Play Games';
    body.append(h('h3', {}, `Friends from ${label}`));
    if (!this.platformFound) {
      body.append(
        h('p', { class: 'muted small' }, `See which of your ${label} friends play Kagemura. ${label} asks you first; the list is checked once and not kept.`),
        h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.importPlatform(provider, label) }, `Find my ${label} friends`),
      );
      return;
    }
    if (!this.platformFound.length) body.append(h('p', { class: 'muted small' }, `None of your ${label} friends play Kagemura yet (or they hide from search).`));
    for (const p of this.platformFound) body.append(this.cardRow(p));
  }

  private async importPlatform(provider: 'gamecenter' | 'playgames', label: string): Promise<void> {
    try {
      if (!(await this.conn.linkedProviders()).includes(provider)) {
        this.d.kit.toast(`Link ${label} first: Settings → Online play → Sign-ins.`, 'info');
        return;
      }
      const ids = await this.d.platform!.friendIds!(provider);
      this.platformFound = await this.conn.platformFriends(provider, ids);
    } catch (e) {
      this.d.kit.toast((e as Error).message, 'error');
    }
    this.draw();
  }

  private privacyBox(body: HTMLElement, f: FriendsResponse): void {
    const select = h('select', { class: 'text', 'aria-label': 'Who can find me by name' }) as HTMLSelectElement;
    for (const k of Object.keys(FINDABLE_LABEL) as Findable[]) select.append(h('option', { value: k, selected: f.findable === k }, FINDABLE_LABEL[k]));
    select.addEventListener('change', () => void this.run(() => this.conn.setPrivacy({ findable: select.value as Findable }), 'Saved.'));
    const online = h('input', { type: 'checkbox', checked: f.showOnline }) as HTMLInputElement;
    online.addEventListener('change', () => void this.run(() => this.conn.setPrivacy({ showOnline: online.checked }), 'Saved.'));
    body.append(
      h('h3', {}, 'Privacy'),
      h('label', { class: 'row' }, 'Who can find me by name ', select),
      h('label', { class: 'row' }, online, ' Friends can see when I was last online'),
      h('p', { class: 'muted small' }, 'Your friend code always works: share it only with people you want to add.'),
    );
    if (this.conn.canDuels) {
      body.append(
        h('h3', {}, 'Duel layout'),
        h('p', { class: 'muted small' }, 'Friends duel your village. Save a duel layout to let them test a design instead: your current layout is kept for duels while you change your village.'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.setDuelLayoutFromVillage(true), 'Your current layout is now your duel layout.') }, 'Save current layout for duels'),
          h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.setDuelLayoutFromVillage(false), 'Friends duel your village again.') }, 'Use my village'),
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

/**
 * The Grove screen. It renders a GroveSnapshot from a GroveSource, so the
 * same screen shows the offline bot Grove or a real Grove on a server.
 * The Grove Lodge (donated troops) and raid history are village state.
 */
import { REPORT_REASONS, type ReportReason } from '../../backend/net/protocol';
import type { GroveSnapshot, GroveSource, ReportTarget } from '../../backend/social/groveSource';
import { reinforcementCapacity, reinforcementHousing } from '../../gameplay/sim/social/grove';
import { NAME_ERROR_TEXT, checkName, isolateName } from '../../gameplay/sim/social/names';
import { groveRaidChest } from '../../gameplay/sim/social/groveRaid';
import { hallLevel } from '../../gameplay/sim/village';
import { clear, h, icon } from './dom';
import type { UiKit } from './economyUi';
import { rewardChips } from './economyUi';
import { formatDuration, formatNumber } from './format';
import { icons } from './icons';
import { ensureCommunityRules } from './communityRules';

export interface GroveUiDeps {
  kit: UiKit;
  source: GroveSource;
  troopThumb(type: string): string | null;
  onGroveAttack(target: number): void;
}

type Tab = 'chat' | 'requests' | 'members' | 'raid';

export const REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Bullying or harassment',
  hate: 'Hate or slurs',
  sexual: 'Sexual content',
  spam: 'Spam or scams',
  cheating: 'Cheating',
  name: 'Offensive name',
  other: 'Something else',
};

export class GroveUi {
  private tab: Tab = 'chat';
  private busy = false;
  constructor(private readonly d: GroveUiDeps) {}

  private get c() {
    return this.d.kit.c;
  }

  private get src() {
    return this.d.source;
  }

  open(tab?: Tab): void {
    if (tab) this.tab = tab;
    const body = h('div', { class: 'grove' });
    let lastSig = '';
    const draw = (force = false) => {
      const snap = this.src.snapshot();
      const s = this.c.state;
      const sig = JSON.stringify([snap, s.army, s.grove.reinforcements, s.grove.raidHistory.length, this.tab, this.busy, Math.floor(this.c.now() / 30000)]);
      if (!force && sig === lastSig) return;
      lastSig = sig;
      const keepInput = body.querySelector<HTMLInputElement>('input.text')?.value ?? '';
      const keepFocus = document.activeElement?.matches?.('.grove input.text') ?? false;
      clear(body);
      if (snap.loading) {
        body.append(h('p', { class: 'muted' }, 'Finding your Alliance…'));
        return;
      }
      if (snap.error) body.append(h('div', { class: 'note error-note' }, `Can't reach the Alliance right now: ${snap.error}`));
      if (!snap.joined) {
        this.joinScreen(body, snap, () => draw(true));
        return;
      }
      body.append(
        h(
          'div',
          { class: 'grove-head' },
          h('span', { class: 'grove-badge', style: `background:${snap.color}` }, icon(icons.leaf)),
          h('div', {}, h('b', {}, h('bdi', {}, snap.name)), h('div', { class: 'muted small' }, `${snap.members.length}${snap.kind === 'online' ? `/${snap.maxMembers}` : ''} members · your Alliance level ${snap.level} (${formatNumber(snap.xp)} XP)${snap.kind === 'online' ? ' · online' : ''}`)),
        ),
      );
      const tabs: [Tab, string][] = [
        ['chat', 'Chat'],
        ['requests', `Troops${snap.requests.length ? ` (${snap.requests.length})` : ''}`],
        ['members', 'Members'],
        ['raid', 'Alliance War'],
      ];
      body.append(
        h(
          'div',
          { class: 'shop-tabs' },
          ...tabs.map(([id, label]) => {
            const b = h('button', { type: 'button', class: id === this.tab ? 'on' : '' }, label);
            b.addEventListener('click', () => {
              this.tab = id;
              draw(true);
            });
            return b;
          }),
        ),
      );
      if (this.tab === 'chat') this.chatTab(body, snap, keepInput, keepFocus, () => draw(true));
      else if (this.tab === 'requests') this.requestsTab(body, snap, () => draw(true));
      else if (this.tab === 'members') this.membersTab(body, snap, () => draw(true));
      else this.raidTab(body, snap);
    };
    draw(true);
    const timer = window.setInterval(() => draw(), 2000);
    const unsub = this.src.subscribe(() => draw());
    const stopWatch = this.src.watch();
    this.d.kit.modal('Alliance', body, [], 'wide', () => {
      window.clearInterval(timer);
      unsub();
      stopWatch();
    });
  }

  /** Run a source action with a busy flag and a toast for the outcome. */
  private async run(action: () => Promise<{ ok: boolean; message?: string }>, redraw: () => void, quietOk = true): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    redraw();
    try {
      const r = await action();
      if (!r.ok) this.d.kit.toast(r.message ?? 'That did not work.', 'error');
      else if (r.message || !quietOk) this.d.kit.toast(r.message ?? 'Done!', 'success');
      return r.ok;
    } finally {
      this.busy = false;
      redraw();
    }
  }

  private joinScreen(body: HTMLElement, snap: GroveSnapshot, redraw: () => void): void {
    body.append(
      h('p', {}, 'Alliances are friendly bands of ninja clans. Members chat, share troops and team up for the weekly Alliance War.'),
      h('p', { class: 'muted small' }, 'Chat is always filtered to keep it friendly.'),
    );
    if (snap.kind === 'local') {
      const btn = h('button', { class: 'btn primary', type: 'button' }, 'Find an Alliance and join');
      btn.addEventListener('click', () => void this.run(() => this.src.join(), redraw));
      body.append(h('div', { class: 'actions' }, btn));
      return;
    }
    // Online: real Groves to browse, or found a new one.
    const search = h('input', { class: 'text', type: 'search', maxlength: 24, placeholder: 'Search Alliances…' }) as HTMLInputElement;
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.src.search(search.value);
    });
    body.append(h('div', { class: 'chat-input-row' }, search, h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.src.search(search.value) }, 'Search')));
    if (!snap.listings.length) body.append(h('p', { class: 'muted' }, 'No Alliances with free places right now. Found one and invite your friends!'));
    for (const g of snap.listings) {
      const join = h('button', { class: 'btn primary', type: 'button', disabled: this.busy }, 'Join');
      join.addEventListener('click', () => void this.run(() => this.src.join(g.id), redraw, false));
      body.append(
        h(
          'div',
          { class: 'log-row' },
          h('div', { class: 'row' }, h('span', { class: 'grove-badge', style: `background:${g.color}` }, icon(icons.leaf)), h('div', {}, h('b', {}, h('bdi', {}, g.name)), h('div', { class: 'muted small' }, `${g.members}/${g.maxMembers} members · about ${formatNumber(g.averageTrophies)} honor`))),
          join,
        ),
      );
    }
    const name = h('input', { class: 'text', type: 'text', dir: 'auto', spellcheck: 'false', placeholder: 'Alliance name' }) as HTMLInputElement;
    name.addEventListener('keydown', (e) => e.stopPropagation());
    const create = h('button', { class: 'btn sky', type: 'button', disabled: this.busy }, 'Found Alliance');
    create.addEventListener('click', () => {
      // Any script works (names.ts); the server applies the same rules.
      const checked = checkName(name.value);
      if (checked.error) return this.d.kit.toast(NAME_ERROR_TEXT[checked.error], 'error');
      name.value = checked.name;
      void this.run(() => this.src.create(checked.name), redraw, false);
    });
    body.append(h('h3', {}, 'Found your own Alliance'), h('div', { class: 'chat-input-row' }, name, create));
  }

  private chatTab(body: HTMLElement, snap: GroveSnapshot, keep: string, keepFocus: boolean, redraw: () => void): void {
    const list = h('div', { class: 'chat-list' });
    for (const m of snap.chat.slice(-50)) {
      // Report or block another player's message (Apple 1.2); never on your own, system lines or bots.
      const more = snap.moderation && m.fromId && !m.mine ? h('button', { class: 'chat-more', type: 'button', title: 'Report or block', 'aria-label': `Report or block ${m.who}` }, '⋯') : null;
      more?.addEventListener('click', () => this.moderate({ playerId: m.fromId, name: m.who, messageId: m.id }, m.text, false, redraw));
      list.append(
        h(
          'div',
          { class: `chat-msg ${m.mine ? 'mine' : ''} ${m.kind}` },
          m.who ? h('bdi', { class: 'chat-who' }, m.who, more) : null,
          h('span', { class: 'chat-text', dir: 'auto', style: 'unicode-bidi:plaintext' }, m.text),
          h('span', { class: 'chat-time' }, `${formatDuration(Math.max(0, this.c.now() - m.at))} ago`),
        ),
      );
    }
    if (!snap.chat.length) list.append(h('p', { class: 'muted' }, 'No messages yet. Say hello!'));
    const input = h('input', { class: 'text', type: 'text', maxlength: 160, placeholder: 'Say something nice…', value: keep }) as HTMLInputElement;
    const send = async () => {
      const text = input.value;
      // Real players (an online Alliance): the community rules, once (audit R06).
      if (snap.moderation && !(await ensureCommunityRules(this.d.kit))) return;
      void this.run(() => this.src.send(text), redraw).then((ok) => {
        if (ok) {
          const el = body.querySelector<HTMLInputElement>('input.text');
          if (el) el.value = '';
        }
      });
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void send();
    });
    body.append(list, h('div', { class: 'chat-input-row' }, input, h('button', { class: 'btn primary', type: 'button', onclick: () => void send(), disabled: this.busy }, 'Send')));
    window.setTimeout(() => {
      list.scrollTop = list.scrollHeight;
      if (keepFocus) input.focus();
    }, 0);
  }

  private requestsTab(body: HTMLElement, snap: GroveSnapshot, redraw: () => void): void {
    const s = this.c.state;
    const gd = this.c.data;
    const now = this.c.now();
    const cap = reinforcementCapacity(s, gd);
    const used = reinforcementHousing(s, gd);
    const rein = h('div', { class: 'army-row' });
    for (const [t, n] of Object.entries(s.grove.reinforcements)) {
      if (n <= 0) continue;
      const th = this.d.troopThumb(t);
      rein.append(h('span', { class: 'army-chip' }, th ? h('img', { src: th, alt: '' }) : null, `${gd.troops[t]?.name ?? t} ×${n}`));
    }
    const can = snap.ask;
    const ask = h('button', { class: 'btn sky', type: 'button', disabled: !can.ok || this.busy }, 'Ask for troops');
    ask.addEventListener('click', () => void this.run(() => this.src.ask(), redraw));
    body.append(
      h('h3', {}, 'Your Alliance Lodge'),
      cap ? h('div', { class: 'progress-row' }, h('div', { class: 'progress' }, h('i', { style: `width:${(used / cap) * 100}%` })), h('span', {}, `${used}/${cap} donated troops`)) : h('p', { class: 'muted' }, 'Build an Alliance Lodge (Clan Keep 2) to receive troops from friends.'),
      rein,
      h('div', { class: 'actions' }, ask, !can.ok ? h('span', { class: 'note' }, can.readyAt ? `Ask again in ${formatDuration(can.readyAt - now)}` : can.message) : ''),
      h('p', { class: 'muted small' }, snap.kind === 'online' ? 'Donated troops join your next battle and are used before your own. Every troop you donate earns Alliance XP. Troops from friends arrive when they donate.' : 'Donated troops join your next battle and are used before your own. Every troop you donate earns Alliance XP, and friends send troops back to fill your Lodge.'),
      h('h3', {}, 'Friends asking for troops'),
    );
    if (!snap.requests.length) body.append(h('p', { class: 'muted' }, 'No requests right now.'));
    for (const r of snap.requests) {
      const row = h('div', { class: 'log-row' }, h('div', {}, h('b', {}, h('bdi', {}, r.name)), h('div', { class: 'progress-row' }, h('div', { class: 'progress' }, h('i', { style: `width:${(r.filled / r.size) * 100}%` })), h('span', { class: 'small' }, `${r.filled}/${r.size}`))));
      const btns = h('div', { class: 'row' });
      for (const [t, n] of Object.entries(s.army)) {
        if (n <= 0) continue;
        const th = this.d.troopThumb(t);
        const b = h('button', { class: 'btn ghost donate-btn', type: 'button', title: `Donate ${gd.troops[t]?.name}`, disabled: this.busy }, th ? h('img', { src: th, alt: '' }) : null, `×${n}`);
        b.addEventListener('click', () => void this.run(() => this.src.donate(r.id, t), redraw));
        btns.append(b);
      }
      if (!btns.childElementCount) btns.append(h('span', { class: 'muted small' }, 'Train troops to donate.'));
      row.append(btns);
      body.append(row);
    }
  }

  private membersTab(body: HTMLElement, snap: GroveSnapshot, redraw: () => void): void {
    snap.members.forEach((r, i) => {
      const more = snap.moderation && !r.you ? h('button', { class: 'chat-more', type: 'button', title: 'Report or block', 'aria-label': `Report or block ${r.name}` }, '⋯') : null;
      more?.addEventListener('click', () => this.moderate({ playerId: r.id, name: r.name }, null, r.blocked, redraw));
      body.append(
        h(
          'div',
          { class: `log-row${r.you ? ' current' : ''}` },
          h('div', {}, h('b', {}, `${i + 1}. ${isolateName(r.name)}`), h('div', { class: 'muted small' }, `${r.role} · Clan Keep ${r.hall}`)),
          h('div', { class: 'row' }, r.blocked ? h('span', { class: 'chip blocked' }, 'Blocked') : null, h('span', { class: `dot ${r.online ? 'on' : ''}` }), h('span', { class: 'chip' }, icon(icons.leaf), String(r.trophies)), more),
        ),
      );
    });
    if (snap.canLeave) {
      const leave = h('button', { class: 'btn danger', type: 'button', disabled: this.busy }, 'Leave Alliance');
      leave.addEventListener('click', async () => {
        const ok = await this.d.kit.confirm('Leave this Alliance?', 'You can join another Alliance straight away. Troops in your Alliance Lodge stay with you.', 'Leave', true);
        if (ok) void this.run(() => this.src.leave(), redraw);
      });
      body.append(h('div', { class: 'actions' }, leave));
    }
  }

  /**
   * Report a message or a player to the moderators, with a reason, an
   * optional note and an "also block" box; or just block (or unblock) them.
   */
  private moderate(target: ReportTarget, quote: string | null, blocked: boolean, redraw: () => void): void {
    const body = h('div', { class: 'report-form' });
    if (quote) body.append(h('blockquote', { class: 'report-quote' }, h('b', {}, target.name), ' ', quote));
    body.append(h('p', { class: 'muted small' }, quote ? 'Moderators see the message exactly as it was sent.' : `Tell the moderators what ${target.name} did.`));
    const reasons = h('div', { class: 'report-reasons', role: 'radiogroup', 'aria-label': 'Reason' });
    for (const r of REPORT_REASONS) reasons.append(h('label', { class: 'report-reason' }, h('input', { type: 'radio', name: 'report-reason', value: r }), REASON_LABELS[r]));
    const note = h('textarea', { class: 'text', maxlength: 500, rows: 2, placeholder: 'Anything else they should know (optional)' }) as HTMLTextAreaElement;
    note.addEventListener('keydown', (e) => e.stopPropagation());
    const also = h('input', { type: 'checkbox' }) as HTMLInputElement;
    body.append(reasons, note);
    if (!blocked) body.append(h('label', { class: 'report-block' }, also, ` Also block ${target.name}`));
    const close = this.d.kit.modal(
      quote ? 'Report message' : `Report ${target.name}`,
      body,
      [
        blocked
          ? { label: 'Unblock', onClick: () => (close(), void this.run(() => this.src.unblock(target.playerId), redraw, false)) }
          : { label: 'Block only', onClick: () => (close(), void this.run(() => this.src.block(target.playerId), redraw, false)) },
        {
          label: 'Send report',
          primary: true,
          onClick: () => {
            const reason = body.querySelector<HTMLInputElement>('input[name="report-reason"]:checked')?.value as ReportReason | undefined;
            if (!reason) {
              this.d.kit.toast('Pick a reason first.', 'error');
              return;
            }
            close();
            void this.run(() => this.src.report(target, reason, also.checked, note.value), redraw, false);
          },
        },
      ],
      'normal',
    );
  }

  private raidTab(body: HTMLElement, snap: GroveSnapshot): void {
    const s = this.c.state;
    const gd = this.c.data;
    const now = this.c.now();
    const p = snap.raid;
    const hall = hallLevel(s, gd);
    if (p.phase !== 'live') {
      body.append(h('p', {}, `The next Alliance War starts in ${formatDuration(p.nextStart - now)} and lasts ${gd.social.groveRaid.durationHours / 24} days. Every member gets ${gd.social.groveRaid.attacksPerMember} attacks; the best stars on each enemy base add up, and the Alliance with more stars wins.`));
      if (snap.kind === 'online') body.append(h('p', { class: 'muted small' }, 'Your Alliance is matched with a real Alliance of similar size and strength, or with a band of wild bots when none is free. Only members who were in the Alliance when the raid starts take part.'));
      const chest = (o: 'win' | 'draw' | 'loss') => {
        const { xp, ...c } = groveRaidChest(o, hall, gd);
        void xp;
        return rewardChips(c);
      };
      body.append(h('h3', {}, 'Reward chest'), h('p', { class: 'muted small' }, `Sized for your Clan Keep level ${hall}.`), h('div', {}, h('div', { class: 'row' }, h('b', {}, 'Win '), chest('win')), h('div', { class: 'row' }, h('b', {}, 'Draw '), chest('draw')), h('div', { class: 'row' }, h('b', {}, 'Loss '), chest('loss'))));
      const last = s.grove.raidHistory[s.grove.raidHistory.length - 1];
      if (last) body.append(h('h3', {}, 'Last Alliance War'), h('p', {}, `${last.outcome === 'win' ? 'Victory' : last.outcome === 'draw' ? 'Draw' : 'Defeat'} · ${last.ours} – ${last.theirs} stars. Reward: `, rewardChips(last.reward)));
      return;
    }
    if (!p.enemyName) {
      body.append(h('p', { class: 'muted' }, 'Looking for an enemy Alliance…'));
      return;
    }
    const left = p.attacksLeft;
    body.append(
      h('div', { class: 'raid-score' }, h('div', {}, h('b', {}, 'Us'), h('span', { class: 'big' }, `★ ${p.ours}`)), h('div', { class: 'muted' }, 'vs'), h('div', {}, h('b', {}, h('bdi', {}, p.enemyName)), h('span', { class: 'big' }, `★ ${p.theirs}`))),
      h('p', { class: 'muted small' }, p.eligible ? `Ends in ${formatDuration(p.end - now)} · You have ${left} attack${left === 1 ? '' : 's'} left.` : `Ends in ${formatDuration(p.end - now)} · You joined during this raid, so you can attack from next week.`),
      h('h3', {}, 'Enemy bases'),
    );
    for (const b of p.bases) {
      const starEl = h('span', { class: 'stars-mini' });
      for (let k = 0; k < 3; k++) starEl.append(h('span', { class: k < b.stars ? '' : 'off' }, '★'));
      const atk = h('button', { class: 'btn danger', type: 'button', disabled: left <= 0 || b.stars >= 3 }, 'Attack');
      atk.addEventListener('click', () => {
        this.d.kit.closeAllModals();
        this.d.onGroveAttack(b.index);
      });
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, `${b.index + 1}. ${isolateName(b.name)}`), h('div', { class: 'row' }, h('span', { class: 'muted small' }, `Clan Keep ${b.hall}`), starEl)), atk));
    }
  }
}

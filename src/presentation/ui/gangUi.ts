import { isolateName } from '../../gameplay/sim/social/names';
/**
 * The Gang tab of Friends (roadmap step 63; Gang Wars are drawn by
 * gangWarUi.ts): found a Gang or answer invites, members with leader
 * controls, invite friends, leave, Gang chat (Report / Block on every
 * message) and troop requests inside the Gang. Online only
 * (`connection.canGangs`).
 */
import type { Connection } from '../../backend/net/connection';
import { REPORT_REASONS, type ChatView, type FriendView, type ReportReason, type RequestView, type SquadResponse } from '../../backend/net/protocol';
import { h } from './dom';
import type { UiKit } from './economyUi';
import { formatDuration } from './format';
import { presetChatRow } from './ageScreen';
import { REASON_LABELS } from './groveUi';

export interface GangUiDeps {
  kit: UiKit;
  connection: Connection;
  /** My friends (the people a leader can invite). */
  friends(): FriendView[];
  /** Redraw the whole Friends screen. */
  redraw(): void;
  /** Gang War section (step 67), drawn under the Gang. */
  war?(body: HTMLElement, leader: boolean, members: number): void;
}

export class GangUi {
  private data: SquadResponse | null = null;
  private chat: ChatView[] = [];
  private cursor: string | undefined;
  private requests: RequestView[] = [];
  private error = '';
  busy = false;

  constructor(private readonly d: GangUiDeps) {}

  private get conn() {
    return this.d.connection;
  }

  private now(): number {
    return this.d.kit.c.now();
  }

  get squad() {
    return this.data?.squad ?? null;
  }

  /** Load the Gang, its chat and its requests (call when the tab opens). */
  async load(): Promise<void> {
    try {
      this.data = await this.conn.squad();
      if (this.data.squad) {
        const c = await this.conn.squadChat(this.cursor);
        this.chat = [...this.chat, ...c.messages].filter((m) => !c.hidden?.includes(m.id)).slice(-60);
        this.cursor = c.cursor;
        this.requests = (await this.conn.squadRequests()).requests;
      } else {
        this.chat = [];
        this.cursor = undefined;
        this.requests = [];
      }
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    }
    this.d.redraw();
  }

  private async run(fn: () => Promise<unknown>, done?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.d.redraw();
    try {
      await fn();
      if (done) this.d.kit.toast(done, 'success');
    } catch (e) {
      this.d.kit.toast((e as Error).message, 'error');
    } finally {
      this.busy = false;
    }
    await this.load();
  }

  draw(body: HTMLElement): void {
    if (!this.conn.canGangs) {
      body.append(h('p', { class: 'muted' }, 'Gangs need online play with a server that has them.'));
      return;
    }
    if (this.error) body.append(h('div', { class: 'note error-note' }, `Can't load your Gang right now: ${this.error}`));
    const d = this.data;
    if (!d) {
      body.append(h('p', { class: 'muted' }, 'Loading your Gang…'));
      return;
    }
    if (!d.squad) {
      this.noGang(body, d);
      return;
    }
    this.gang(body, d);
  }

  private noGang(body: HTMLElement, d: SquadResponse): void {
    body.append(h('p', { class: 'muted' }, 'A Gang is 2–4 friends who attack and defend together in Gang Wars. You can be in a Gang and an Alliance at the same time.'));
    if (d.invites.length) {
      body.append(h('h3', {}, 'Invites'));
      for (const i of d.invites) {
        body.append(
          h(
            'div',
            { class: 'log-row' },
            h('div', {}, h('b', {}, h('bdi', {}, i.squad.name)), h('div', { class: 'muted small' }, `${i.squad.members}/4 members · from ${isolateName(i.from.name)}`)),
            h(
              'div',
              { class: 'row' },
              h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.answerSquadInvite(i.id, true), `You joined ${isolateName(i.squad.name)}.`) }, 'Join'),
              h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.answerSquadInvite(i.id, false)) }, 'Decline'),
            ),
          ),
        );
      }
    }
    if (d.canJoinAt) body.append(h('p', { class: 'note' }, `You left a Gang lately: you can found or join one in ${formatDuration(d.canJoinAt - this.now())}.`));
    const name = h('input', { class: 'text', type: 'text', dir: 'auto', placeholder: 'Gang name (3–24 characters)', 'aria-label': 'Gang name' }) as HTMLInputElement;
    name.addEventListener('keydown', (e) => e.stopPropagation());
    body.append(
      h('h3', {}, 'Found a Gang'),
      h('div', { class: 'row find-row' }, name, h('button', { class: 'btn primary', type: 'button', disabled: this.busy || d.canJoinAt > 0, onclick: () => void this.run(() => this.conn.createSquad(name.value), 'Gang founded. Invite your friends.') }, 'Found')),
    );
  }

  private gang(body: HTMLElement, d: SquadResponse): void {
    const g = d.squad!;
    const me = g.members.find((m) => m.you);
    const leader = me?.role === 'leader';
    body.append(h('div', { class: 'grove-head' }, h('div', {}, h('b', {}, h('bdi', {}, g.name)), h('div', { class: 'muted small' }, `${g.members.length}/${g.max} members · Gang Rating ${g.rating}${g.locked ? ' · in a war (roster locked)' : ''}`))));
    for (const m of g.members) {
      const seen = m.lastSeen === undefined ? '' : this.now() - m.lastSeen < 5 * 60_000 ? ' · online now' : ` · seen ${formatDuration(this.now() - m.lastSeen)} ago`;
      const lead = leader && !m.you ? h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.d.kit.confirm(`Make ${isolateName(m.name)} the leader?`, 'They will be able to invite and to start Gang Wars. You stay in the Gang.', 'Make leader').then((ok) => (ok ? this.run(() => this.conn.squadLeader(m.id), `${isolateName(m.name)} leads the Gang now.`) : undefined)) }, 'Make leader') : null;
      body.append(h('div', { class: `log-row${m.you ? ' current' : ''}` }, h('div', {}, h('b', {}, h('bdi', {}, m.name)), h('div', { class: 'muted small' }, `${m.role === 'leader' ? 'Leader' : 'Member'} · Clan Keep ${m.keep} · ${m.honor} honor${seen}`)), lead));
    }
    for (const i of g.invited) body.append(h('div', { class: 'log-row' }, h('div', { class: 'muted' }, `${isolateName(i.name)} (invited)`)));
    if (leader && g.members.length + g.invited.length < g.max && !g.locked) {
      const inGang = new Set(g.members.map((m) => m.id));
      const invited = new Set(g.invited.map((i) => i.name));
      const can = this.d.friends().filter((f) => !inGang.has(f.id) && !invited.has(f.name));
      if (can.length) {
        const pick = h('select', { class: 'text', 'aria-label': 'Friend to invite' }) as HTMLSelectElement;
        for (const f of can) pick.append(h('option', { value: f.id }, f.name));
        body.append(h('div', { class: 'row find-row' }, pick, h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.squadInvite(pick.value), 'Invite sent.') }, 'Invite')));
      } else body.append(h('p', { class: 'muted small' }, 'Every friend you could invite is already here or invited. Add friends in the Friends tab.'));
    }
    this.d.war?.(body, leader, g.members.length);
    this.requestsBox(body);
    this.chatBox(body);
    const leave = h('button', { class: 'btn danger', type: 'button', disabled: this.busy || g.locked }, 'Leave Gang');
    leave.addEventListener('click', () => void this.d.kit.confirm('Leave this Gang?', 'You can found or join a Gang again after 24 hours.', 'Leave', true).then((ok) => (ok ? this.run(() => this.conn.leaveSquad(), 'You left the Gang.') : undefined)));
    body.append(h('div', { class: 'actions' }, leave));
  }

  private requestsBox(body: HTMLElement): void {
    body.append(h('h3', {}, 'Warriors'));
    body.append(h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.squadAsk(), 'Request sent to your Gang.') }, 'Ask the Gang for warriors'));
    const army = this.d.kit.c.state.army;
    for (const r of this.requests) {
      if (r.mine) {
        body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, 'Your request'), h('div', { class: 'muted small' }, `${r.filled}/${r.size} space filled`))));
        continue;
      }
      const give = Object.entries(army)
        .filter(([, n]) => n > 0)
        .slice(0, 4)
        .map(([t]) => h('button', { class: 'btn ghost', type: 'button', disabled: this.busy || r.filled >= r.size, onclick: () => void this.run(() => this.conn.squadDonate(r.id, t), 'Sent.') }, `Give ${this.d.kit.c.data.troops[t]?.name ?? t}`));
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, h('bdi', {}, r.name)), h('div', { class: 'muted small' }, `${r.filled}/${r.size} space filled`)), h('div', { class: 'row' }, ...give)));
    }
  }

  private chatBox(body: HTMLElement): void {
    body.append(h('h3', {}, 'Gang chat'));
    const list = h('div', { class: 'chat' });
    for (const m of this.chat) {
      const more = m.from && m.kind === 'chat' ? h('button', { class: 'chat-more', type: 'button', title: 'Report or block', 'aria-label': `Report or block ${isolateName(m.from.name)}` }, '⋯') : null;
      more?.addEventListener('click', () => this.report(m));
      list.append(h('div', { class: `chat-msg ${m.kind}` }, m.from ? h('span', { class: 'chat-who' }, `${isolateName(m.from.name)} `) : null, h('span', { class: 'chat-text', dir: 'auto', style: 'unicode-bidi:plaintext' }, m.text), more));
    }
    if (!this.chat.length) list.append(h('p', { class: 'muted small' }, 'No messages yet.'));
    const input = h('input', { class: 'text', type: 'text', dir: 'auto', /* 160 code points, as the server's chat filter (a UTF-16 maxlength splits emoji and counts other scripts wrongly) */ oninput: (e: Event) => { const el = e.target as HTMLInputElement; const cps = Array.from(el.value); if (cps.length > 160) el.value = cps.slice(0, 160).join(''); }, placeholder: 'Message your Gang', 'aria-label': 'Message your Gang' }) as HTMLInputElement;
    const send = () => {
      const text = input.value;
      if (!text.trim()) return;
      void this.run(() => this.conn.postSquadChat(text));
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') send();
    });
    // Under 13 (re-audit): ready-made messages only (the server refuses free text).
    if (this.conn.ageBand === 'under13') body.append(list, presetChatRow((text) => void this.run(() => this.conn.postSquadChat(text)), this.busy), h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.load() }, 'Refresh'));
    else body.append(list, h('div', { class: 'row find-row' }, input, h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: send }, 'Send'), h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.load() }, 'Refresh')));
  }

  private report(m: ChatView): void {
    if (!m.from) return;
    const who = m.from;
    const body = h('div', { class: 'report-form' }, h('blockquote', { class: 'report-quote' }, h('b', {}, h('bdi', {}, who.name)), ' ', m.text));
    const reasons = h('div', { class: 'report-reasons', role: 'radiogroup', 'aria-label': 'Reason' });
    for (const r of REPORT_REASONS) reasons.append(h('label', { class: 'report-reason' }, h('input', { type: 'radio', name: 'gang-report-reason', value: r }), REASON_LABELS[r]));
    const note = h('textarea', { class: 'text', maxlength: 500, rows: 2, placeholder: 'Anything else they should know (optional)' }) as HTMLTextAreaElement;
    note.addEventListener('keydown', (e) => e.stopPropagation());
    const also = h('input', { type: 'checkbox' }) as HTMLInputElement;
    body.append(reasons, note, h('label', { class: 'report-block' }, also, ` Also block ${isolateName(who.name)}`));
    let close = () => {};
    close = this.d.kit.modal('Report message', body, [
      { label: 'Block only', onClick: () => (close(), void this.run(() => this.conn.blockPlayer(who.id), `${isolateName(who.name)} is blocked.`)) },
      {
        label: 'Send report',
        primary: true,
        onClick: () => {
          const reason = body.querySelector<HTMLInputElement>('input[name="gang-report-reason"]:checked')?.value as ReportReason | undefined;
          if (!reason) {
            this.d.kit.toast('Pick a reason first.', 'error');
            return;
          }
          close();
          void this.run(() => this.conn.reportChat(m.id, reason, note.value, also.checked), 'Thanks. The moderators will look at it.');
        },
      },
    ]);
  }

}

import { messageText as ownedError } from './i18n';
import { chatText } from './i18n';
import { displayData as localizedData, labelText as i18nLabel } from './i18n';
import { t as i18nText } from './i18n';
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
import { h, isSubmitEnter, limitCodePoints } from './dom';
import type { UiKit } from './economyUi';
import { formatDuration } from './format';
import { presetChatRow } from './ageScreen';
import { REASON_LABELS } from './groveUi';

interface GangUiDeps {
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
      this.d.kit.toast(ownedError((e as Error).message, true), 'error');
    } finally {
      this.busy = false;
    }
    await this.load();
  }

  draw(body: HTMLElement): void {
    if (!this.conn.canGangs) {
      body.append(h('p', { class: 'muted' }, i18nText("ui.gangs_need_online_play_with_a_server_t_19ca53ce84")));
      return;
    }
    if (this.error) body.append(h('div', { class: 'note error-note' }, i18nText("ui.can_t_load_your_gang_right_now_7df6fda21c", { arg1: this.error })));
    const d = this.data;
    if (!d) {
      body.append(h('p', { class: 'muted' }, i18nText("ui.loading_your_gang_af081e3d61")));
      return;
    }
    if (!d.squad) {
      this.noGang(body, d);
      return;
    }
    this.gang(body, d);
  }

  private noGang(body: HTMLElement, d: SquadResponse): void {
    body.append(h('p', { class: 'muted' }, i18nText("ui.a_gang_is_2_4_friends_who_attack_and_d_14abd3e72f")));
    if (d.invites.length) {
      body.append(h('h3', {}, i18nText("ui.invites_f212a985ab")));
      for (const i of d.invites) {
        body.append(
          h(
            'div',
            { class: 'log-row' },
            h('div', {}, h('b', {}, h('bdi', {}, i.squad.name)), h('div', { class: 'muted small' }, i18nText("ui.4_members_from_286c8c5db4", { arg1: i.squad.members, arg2: isolateName(i.from.name) }))),
            h(
              'div',
              { class: 'row' },
              h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.answerSquadInvite(i.id, true), i18nText("ui.you_joined_aa6cc92a8c", { arg1: isolateName(i.squad.name) })) }, i18nText("ui.join_fd30fe681b")),
              h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.answerSquadInvite(i.id, false)) }, i18nText("ui.decline_a2d285b352")),
            ),
          ),
        );
      }
    }
    if (d.canJoinAt) body.append(h('p', { class: 'note' }, i18nText("ui.you_left_a_gang_lately_you_can_found_o_fbfb6c47c5", { arg1: formatDuration(d.canJoinAt - this.now()) })));
    const name = h('input', { class: 'text', type: 'text', dir: 'auto', placeholder: i18nText("ui.gang_name_3_24_characters_35459b0e2e"), 'aria-label': i18nText("ui.gang_name_295fbb1fdf") }) as HTMLInputElement;
    name.addEventListener('keydown', (e) => e.stopPropagation());
    body.append(
      h('h3', {}, i18nText("ui.found_a_gang_d342525f46")),
      h('div', { class: 'row find-row' }, name, h('button', { class: 'btn primary', type: 'button', disabled: this.busy || d.canJoinAt > 0, onclick: () => void this.run(() => this.conn.createSquad(name.value), i18nText("ui.gang_founded_invite_your_friends_ec02262d86")) }, i18nText("ui.found_b0ee315f4a"))),
    );
  }

  private gang(body: HTMLElement, d: SquadResponse): void {
    const g = d.squad!;
    const me = g.members.find((m) => m.you);
    const leader = me?.role === 'leader';
    body.append(h('div', { class: 'grove-head' }, h('div', {}, h('b', {}, h('bdi', {}, g.name)), h('div', { class: 'muted small' }, i18nText("ui.members_gang_rating_35d8073dcb", { arg1: g.members.length, arg2: g.max, arg3: g.rating, arg4: g.locked ? i18nText("ui.in_a_war_roster_locked_2807f916b7") : '' })))));
    for (const m of g.members) {
      const seen = m.lastSeen === undefined ? '' : this.now() - m.lastSeen < 5 * 60_000 ? i18nText("ui.online_now_361e041154") : i18nText("ui.seen_ago_de6612691c", { arg1: formatDuration(this.now() - m.lastSeen) });
      const lead = leader && !m.you ? h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.d.kit.confirm(i18nText("ui.make_the_leader_070955488c", { arg1: isolateName(m.name) }), i18nText("ui.they_will_be_able_to_invite_and_to_sta_38d779b720"), i18nText("ui.make_leader_6d6f0831c3")).then((ok) => (ok ? this.run(() => this.conn.squadLeader(m.id), i18nText("ui.leads_the_gang_now_be1c0f505a", { arg1: isolateName(m.name) })) : undefined)) }, i18nText("ui.make_leader_6d6f0831c3")) : null;
      body.append(h('div', { class: `log-row${m.you ? ' current' : ''}` }, h('div', {}, h('b', {}, h('bdi', {}, m.name)), h('div', { class: 'muted small' }, i18nText("ui.clan_keep_honor_799290a291", { arg1: m.role === 'leader' ? i18nText("ui.leader_3f53871b08") : i18nText("ui.member_7c968fb71f"), arg2: m.keep, arg3: m.honor, arg4: seen }))), lead));
    }
    for (const i of g.invited) body.append(h('div', { class: 'log-row' }, h('div', { class: 'muted' }, i18nText("ui.invited_28548e5783", { arg1: isolateName(i.name) }))));
    if (leader && g.members.length + g.invited.length < g.max && !g.locked) {
      const inGang = new Set(g.members.map((m) => m.id));
      const invited = new Set(g.invited.map((i) => i.name));
      const can = this.d.friends().filter((f) => !inGang.has(f.id) && !invited.has(f.name));
      if (can.length) {
        const pick = h('select', { class: 'text', 'aria-label': i18nText("ui.friend_to_invite_68cd6f8d69") }) as HTMLSelectElement;
        for (const f of can) pick.append(h('option', { value: f.id }, f.name));
        body.append(h('div', { class: 'row find-row' }, pick, h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.squadInvite(pick.value), i18nText("ui.invite_sent_112f9e8679")) }, i18nText("ui.invite_1fd9ae1607"))));
      } else body.append(h('p', { class: 'muted small' }, i18nText("ui.every_friend_you_could_invite_is_alrea_8c210a2cb8")));
    }
    this.d.war?.(body, leader, g.members.length);
    this.requestsBox(body);
    this.chatBox(body);
    const leave = h('button', { class: 'btn danger', type: 'button', disabled: this.busy || g.locked }, i18nText("ui.leave_gang_9e9ffeb561"));
    leave.addEventListener('click', () => void this.d.kit.confirm(i18nText("ui.leave_this_gang_620ca4b4bd"), i18nText("ui.you_can_found_or_join_a_gang_again_aft_1887cc6559"), i18nText("ui.leave_fc6e4a408d"), true).then((ok) => (ok ? this.run(() => this.conn.leaveSquad(), i18nText("ui.you_left_the_gang_741945b0ce")) : undefined)));
    body.append(h('div', { class: 'actions' }, leave));
  }

  private requestsBox(body: HTMLElement): void {
    body.append(h('h3', {}, i18nText("ui.troops_5d47e163e9")));
    body.append(h('button', { class: 'btn ghost', type: 'button', disabled: this.busy, onclick: () => void this.run(() => this.conn.squadAsk(), i18nText("ui.request_sent_to_your_gang_66e1cdc73a")) }, i18nText("ui.ask_the_gang_for_troops_406922c3e8")));
    const army = this.d.kit.c.state.army;
    for (const r of this.requests) {
      if (r.mine) {
        body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, i18nText("ui.your_request_73023a3991")), h('div', { class: 'muted small' }, i18nText("ui.space_filled_20d9ffb14e", { arg1: r.filled, arg2: r.size })))));
        continue;
      }
      const give = Object.entries(army)
        .filter(([, n]) => n > 0)
        .slice(0, 4)
        .map(([t]) => h('button', { class: 'btn ghost', type: 'button', disabled: this.busy || r.filled >= r.size, onclick: () => void this.run(() => this.conn.squadDonate(r.id, t), 'Sent.') }, i18nText("ui.give_c470198396", { arg1: localizedData(this.d.kit.c.data).troops[t]?.name ?? t })));
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, h('bdi', {}, r.name)), h('div', { class: 'muted small' }, i18nText("ui.space_filled_20d9ffb14e", { arg1: r.filled, arg2: r.size }))), h('div', { class: 'row' }, ...give)));
    }
  }

  private chatBox(body: HTMLElement): void {
    body.append(h('h3', {}, i18nText("ui.gang_chat_bcfd263ec3")));
    const list = h('div', { class: 'chat' });
    for (const m of this.chat) {
      const more = m.from && m.kind === 'chat' ? h('button', { class: 'chat-more', type: 'button', title: i18nText("ui.report_or_block_82eba729f4"), 'aria-label': i18nText("ui.report_or_block_b1e0527c7b", { arg1: isolateName(m.from.name) }) }, '⋯') : null;
      more?.addEventListener('click', () => this.report(m));
      list.append(h('div', { class: `chat-msg ${m.kind}` }, m.from ? h('span', { class: 'chat-who' }, `${isolateName(m.from.name)} `) : null, h('span', { class: 'chat-text', dir: 'auto', style: 'unicode-bidi:plaintext' }, chatText(m)), more));
    }
    if (!this.chat.length) list.append(h('p', { class: 'muted small' }, i18nText("ui.no_messages_yet_f0d5968f61")));
    const input = h('input', { class: 'text', type: 'text', dir: 'auto', placeholder: i18nText("ui.message_your_gang_6dc45a51d6"), 'aria-label': i18nText("ui.message_your_gang_6dc45a51d6") }) as HTMLInputElement;
    limitCodePoints(input, 160); // as the server's chat filter
    const send = () => {
      const text = input.value;
      if (!text.trim()) return;
      void this.run(() => this.conn.postSquadChat(text));
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (isSubmitEnter(e)) send();
    });
    // Under 13 (re-audit): ready-made messages only (the server refuses free text).
    if (this.conn.ageBand === 'under13') body.append(list, presetChatRow((text) => void this.run(() => this.conn.postSquadChat(text)), this.busy), h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.load() }, i18nText("ui.refresh_0e91610117")));
    else body.append(list, h('div', { class: 'row find-row' }, input, h('button', { class: 'btn primary', type: 'button', disabled: this.busy, onclick: send }, i18nText("ui.send_f6f4688ff2")), h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.load() }, i18nText("ui.refresh_0e91610117"))));
  }

  private report(m: ChatView): void {
    if (!m.from) return;
    const who = m.from;
    const body = h('div', { class: 'report-form' }, h('blockquote', { class: 'report-quote' }, h('b', {}, h('bdi', {}, who.name)), ' ', m.text));
    const reasons = h('div', { class: 'report-reasons', role: 'radiogroup', 'aria-label': i18nText("ui.reason_f81ab834de") });
    for (const r of REPORT_REASONS) reasons.append(h('label', { class: 'report-reason' }, h('input', { type: 'radio', name: 'gang-report-reason', value: r }), i18nLabel(REASON_LABELS[r])));
    const note = h('textarea', { class: 'text', maxlength: 500, rows: 2, placeholder: i18nText("ui.anything_else_they_should_know_optiona_1ecfe6847d") }) as HTMLTextAreaElement;
    note.addEventListener('keydown', (e) => e.stopPropagation());
    const also = h('input', { type: 'checkbox' }) as HTMLInputElement;
    body.append(reasons, note, h('label', { class: 'report-block' }, also, i18nText("ui.also_block_87576e2627", { arg1: isolateName(who.name) })));
    let close = () => {};
    close = this.d.kit.modal(i18nText("ui.report_message_0a1e3c5275"), body, [
      { label: i18nText("ui.block_only_c48907164a"), onClick: () => (close(), void this.run(() => this.conn.blockPlayer(who.id), i18nText("ui.is_blocked_042f7fc41b", { arg1: isolateName(who.name) }))) },
      {
        label: i18nText("ui.send_report_a44d353113"),
        primary: true,
        onClick: () => {
          const reason = body.querySelector<HTMLInputElement>('input[name="gang-report-reason"]:checked')?.value as ReportReason | undefined;
          if (!reason) {
            this.d.kit.toast(i18nText("ui.pick_a_reason_first_5bb42bdd4f"), 'error');
            return;
          }
          close();
          void this.run(() => this.conn.reportChat(m.id, reason, note.value, also.checked), i18nText("ui.thanks_the_moderators_will_look_at_it_9a9d7d9319"));
        },
      },
    ]);
  }

}

import { chatText, generatedName, labelText } from './i18n';
import { messageText as i18nMessage } from './i18n';
import { labelText as i18nLabel, displayData as localizedData } from './i18n';
import { t as i18nText } from './i18n';
/**
 * The Grove screen. It renders a GroveSnapshot from a GroveSource, so the
 * same screen shows the offline bot Grove or a real Grove on a server.
 * The Grove Lodge (donated troops) and raid history are village state.
 */
import { t } from './i18n';
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
import { presetChatRow } from './ageScreen';

export interface GroveUiDeps {
  kit: UiKit;
  source: GroveSource;
  troopThumb(type: string): string | null;
  onGroveAttack(target: number): void;
}

type Tab = 'chat' | 'requests' | 'members' | 'raid';

/** How the offline (bot) Alliance is labelled on every surface (project honesty rule). */
export const COMPUTER_CLAN = 'Training Alliance (computer clan)';

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
      const keepFocus = document.activeElement?.matches?.(".grove input.text") ?? false;
      clear(body);
      if (snap.loading) {
        body.append(h('p', { class: 'muted' }, i18nText("ui.finding_your_alliance_6017149444")));
        return;
      }
      if (snap.error) body.append(h('div', { class: 'note error-note' }, i18nText("ui.can_t_reach_the_alliance_right_now_d021034fab", { arg1: snap.error })));
      if (!snap.joined) {
        this.joinScreen(body, snap, () => draw(true));
        return;
      }
      body.append(
        h(
          'div',
          { class: 'grove-head' },
          h('span', { class: 'grove-badge', style: `background:${snap.color}` }, icon(icons.leaf)),
          h(
            'div',
            {},
            h('b', {}, h('bdi', {}, snap.kind === 'local' ? generatedName(snap.name, 'grove') : snap.name)),
            // Honesty (re-audit design item 5): the offline Alliance is computer players, and says so everywhere.
            snap.kind === 'local' ? h('div', { class: 'chip bot-label' }, i18nLabel(COMPUTER_CLAN)) : null,
            h('div', { class: 'muted small' }, i18nText("ui.your_alliance_level_xp_4f21dec979", { arg1: snap.members.length, arg2: snap.kind === 'online' ? `/${snap.maxMembers}` : '', arg3: snap.kind === 'local' ? i18nText("ui.computer_members_f9bec49553") : i18nLabel('members'), arg4: snap.level, arg5: formatNumber(snap.xp), arg6: snap.kind === 'online' ? i18nText("ui.online_3103617e69") : '' })),
          ),
        ),
      );
      const tabs: [Tab, string][] = [
        ['chat', 'Chat'],
        ['requests', `${i18nLabel('Warriors')}${snap.requests.length ? ` (${snap.requests.length})` : ''}`],
        ['members', 'Members'],
        ['raid', 'Alliance War'],
      ];
      body.append(
        h(
          'div',
          { class: 'shop-tabs' },
          ...tabs.map(([id, label]) => {
            const b = h('button', { type: 'button', class: id === this.tab ? 'on' : '' }, i18nLabel(label));
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
    this.d.kit.modal(this.src.kind === 'local' ? i18nText("ui.training_alliance_8fa2ca9844") : i18nText("ui.alliance_afe3c1947d"), body, [], 'wide', () => {
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
      else if (r.message || !quietOk) this.d.kit.toast(r.message ?? i18nLabel('Done!'), 'success');
      return r.ok;
    } finally {
      this.busy = false;
      redraw();
    }
  }

  private joinScreen(body: HTMLElement, snap: GroveSnapshot, redraw: () => void): void {
    body.append(
      h('p', {}, i18nText("ui.alliances_are_friendly_bands_of_ninja__f25426fa54")),
      h('p', { class: 'muted small' }, i18nText("ui.chat_is_always_filtered_to_keep_it_fri_11f5598411")),
    );
    if (snap.kind === 'local') {
      body.append(
        h('p', { class: 'note-info' }, h('b', {}, `${i18nLabel(COMPUTER_CLAN)}. `), i18nText("ui.offline_your_alliance_is_made_of_compu_476fde349b")),
      );
      const btn = h('button', { class: 'btn primary', type: 'button' }, i18nText("ui.join_a_training_alliance_ca8622a2af"));
      btn.addEventListener('click', () => void this.run(() => this.src.join(), redraw));
      body.append(h('div', { class: 'actions' }, btn));
      return;
    }
    // Online: real Groves to browse, or found a new one.
    const search = h('input', { class: 'text', type: 'search', dir: 'auto', placeholder: i18nText("ui.search_alliances_a696ac16e8") }) as HTMLInputElement;
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.src.search(search.value);
    });
    body.append(h('div', { class: 'chat-input-row' }, search, h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.src.search(search.value) }, i18nText("ui.search_49c266baaa"))));
    if (!snap.listings.length) body.append(h('p', { class: 'muted' }, i18nText("ui.no_alliances_with_free_places_right_no_f7210c42d6")));
    for (const g of snap.listings) {
      const join = h('button', { class: 'btn primary', type: 'button', disabled: this.busy }, i18nText("ui.join_fd30fe681b"));
      join.addEventListener('click', () => void this.run(() => this.src.join(g.id), redraw, false));
      body.append(
        h(
          'div',
          { class: 'log-row' },
          h('div', { class: 'row' }, h('span', { class: 'grove-badge', style: `background:${g.color}` }, icon(icons.leaf)), h('div', {}, h('b', {}, h('bdi', {}, g.name)), h('div', { class: 'muted small' }, i18nText("ui.members_about_honor_0eaa46edd3", { arg1: g.members, arg2: g.maxMembers, arg3: formatNumber(g.averageTrophies) })))),
          join,
        ),
      );
    }
    const name = h('input', { class: 'text', type: 'text', dir: 'auto', spellcheck: 'false', placeholder: i18nText("ui.alliance_name_3c8e74cc80") }) as HTMLInputElement;
    name.addEventListener('keydown', (e) => e.stopPropagation());
    const create = h('button', { class: 'btn sky', type: 'button', disabled: this.busy }, i18nText("ui.found_alliance_78d2ee177b"));
    create.addEventListener('click', () => {
      // Any script works (names.ts); the server applies the same rules.
      const checked = checkName(name.value);
      if (checked.error) return this.d.kit.toast(NAME_ERROR_TEXT[checked.error], 'error');
      name.value = checked.name;
      void this.run(() => this.src.create(checked.name), redraw, false);
    });
    body.append(h('h3', {}, i18nText("ui.found_your_own_alliance_06e56fc063")), h('div', { class: 'chat-input-row' }, name, create));
  }

  private chatTab(body: HTMLElement, snap: GroveSnapshot, keep: string, keepFocus: boolean, redraw: () => void): void {
    const list = h('div', { class: 'chat-list' });
    for (const m of snap.chat.slice(-50)) {
      const owned = chatText(m, snap.kind === 'local' && !m.mine);
      const text = snap.kind === 'local' && m.kind !== 'chat' ? owned.replaceAll(snap.name, () => generatedName(snap.name, 'grove')) : owned;
      // Report or block another player's message (Apple 1.2); never on your own, system lines or bots.
      const more = snap.moderation && m.fromId && !m.mine ? h('button', { class: 'chat-more', type: 'button', title: i18nText("ui.report_or_block_82eba729f4"), 'aria-label': i18nText("ui.report_or_block_b1e0527c7b", { arg1: m.who }) }, '⋯') : null;
      more?.addEventListener('click', () => this.moderate({ playerId: m.fromId, name: m.who, messageId: m.id }, m.text, false, redraw));
      list.append(
        h(
          'div',
          { class: `chat-msg ${m.mine ? 'mine' : ''} ${m.kind}` },
          m.who ? h('bdi', { class: 'chat-who' }, m.mine ? labelText('You') : m.who, snap.kind === 'local' && !m.mine ? h('span', { class: 'bot-tag' }, labelText(' (computer)')) : null, more) : null,
          h('span', { class: 'chat-text', dir: 'auto', style: 'unicode-bidi:plaintext' }, text),
          h('span', { class: 'chat-time' }, i18nText("ui.ago_a5925a6467", { arg1: formatDuration(Math.max(0, this.c.now() - m.at)) })),
        ),
      );
    }
    if (!snap.chat.length) list.append(h('p', { class: 'muted' }, i18nText("ui.no_messages_yet_say_hello_1e22279963")));
    const input = h('input', { class: 'text', type: 'text', dir: 'auto', /* 160 code points, as filterText (a UTF-16 maxlength cut emoji and other scripts short) */ oninput: (e: Event) => { const el = e.target as HTMLInputElement; const cps = Array.from(el.value); if (cps.length > 160) el.value = cps.slice(0, 160).join(''); }, placeholder: i18nText("ui.say_something_nice_5ec7fcffa6"), value: keep }) as HTMLInputElement;
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
    // Under 13 in a real Alliance (re-audit): ready-made messages only (the server refuses free text).
    if (snap.moderation && this.c.state.profile.ageBand === 'under13') {
      body.append(
        list,
        presetChatRow((text) => {
          void ensureCommunityRules(this.d.kit).then((ok) => {
            if (ok) void this.run(() => this.src.send(text), redraw);
          });
        }, this.busy),
      );
    } else body.append(list, h('div', { class: 'chat-input-row' }, input, h('button', { class: 'btn primary', type: 'button', onclick: () => void send(), disabled: this.busy }, i18nText("ui.send_f6f4688ff2"))));
    window.setTimeout(() => {
      list.scrollTop = list.scrollHeight;
      if (keepFocus) input.focus();
    }, 0);
  }

  private requestsTab(body: HTMLElement, snap: GroveSnapshot, redraw: () => void): void {
    const s = this.c.state;
    const gd = localizedData(this.c.data);
    const now = this.c.now();
    const cap = reinforcementCapacity(s, gd);
    const used = reinforcementHousing(s, gd);
    const rein = h('div', { class: 'army-row' });
    for (const [t, n] of Object.entries(s.grove.reinforcements)) {
      if (n <= 0) continue;
      const th = this.d.troopThumb(t);
      rein.append(h('span', { class: 'army-chip' }, th ? h('img', { src: th, alt: '' }) : null, i18nText("ui.message_fb705db4f9", { arg1: gd.troops[t]?.name ?? t, arg2: n })));
    }
    const can = snap.ask;
    const ask = h('button', { class: 'btn sky', type: 'button', disabled: !can.ok || this.busy }, i18nText("ui.ask_for_warriors_fa3ec9e608"));
    ask.addEventListener('click', () => void this.run(() => this.src.ask(), redraw));
    body.append(
      h('h3', {}, i18nText("ui.your_alliance_lodge_952e290dc6")),
      cap ? h('div', { class: 'progress-row' }, h('div', { class: 'progress' }, h('i', { style: `width:${(used / cap) * 100}%` })), h('span', {}, i18nText("ui.donated_warriors_21810510fc", { arg1: used, arg2: cap }))) : h('p', { class: 'muted' }, i18nText("ui.build_an_alliance_lodge_clan_keep_2_to_d518f8d1de")),
      rein,
      h('div', { class: 'actions' }, ask, !can.ok ? h('span', { class: 'note' }, can.readyAt ? i18nText("ui.ask_again_in_d02863aa33", { arg1: formatDuration(can.readyAt - now) }) : i18nMessage(can.message)) : ''),
      h('p', { class: 'muted small' }, snap.kind === 'online' ? i18nText("ui.donated_warriors_join_your_next_battle_f31196668c") : i18nText("ui.donated_warriors_join_your_next_battle_df2bb113f5")),
      h('h3', {}, i18nText("ui.clanmates_asking_for_warriors_4089a77f00")),
    );
    if (!snap.requests.length) body.append(h('p', { class: 'muted' }, i18nText("ui.no_requests_right_now_0f1c0deae3")));
    for (const r of snap.requests) {
      const row = h('div', { class: 'log-row' }, h('div', {}, h('b', {}, h('bdi', {}, r.name)), h('div', { class: 'progress-row' }, h('div', { class: 'progress' }, h('i', { style: `width:${(r.filled / r.size) * 100}%` })), h('span', { class: 'small' }, `${r.filled}/${r.size}`))));
      const btns = h('div', { class: 'row' });
      for (const [t, n] of Object.entries(s.army)) {
        if (n <= 0) continue;
        const th = this.d.troopThumb(t);
        const b = h('button', { class: 'btn ghost donate-btn', type: 'button', title: i18nText("ui.donate_b7e819f72b", { arg1: gd.troops[t]?.name }), disabled: this.busy }, th ? h('img', { src: th, alt: '' }) : null, `×${n}`);
        b.addEventListener('click', () => void this.run(() => this.src.donate(r.id, t), redraw));
        btns.append(b);
      }
      if (!btns.childElementCount) btns.append(h('span', { class: 'muted small' }, i18nText("ui.train_warriors_to_donate_bbdc43a025")));
      row.append(btns);
      body.append(row);
    }
  }

  private membersTab(body: HTMLElement, snap: GroveSnapshot, redraw: () => void): void {
    snap.members.forEach((r, i) => {
      const more = snap.moderation && !r.you ? h('button', { class: 'chat-more', type: 'button', title: i18nText("ui.report_or_block_82eba729f4"), 'aria-label': i18nText("ui.report_or_block_b1e0527c7b", { arg1: r.name }) }, '⋯') : null;
      more?.addEventListener('click', () => this.moderate({ playerId: r.id, name: r.name }, null, r.blocked, redraw));
      body.append(
        h(
          'div',
          { class: `log-row${r.you ? ' current' : ''}` },
          h('div', {}, h('b', {}, i18nText("ui.message_59480bd082", { arg1: i + 1, arg2: isolateName(r.you ? labelText('You') : r.name) })), h('div', { class: 'muted small' }, i18nText("ui.clan_keep_03dd7825e4", { arg1: snap.kind === 'local' && !r.you ? i18nText("ui.computer_player_f44cdb976a") : '', arg2: labelText(r.role), arg3: r.hall }))),
          h('div', { class: 'row' }, r.blocked ? h('span', { class: 'chip blocked' }, i18nText("ui.blocked_18f2a0947f")) : null, h('span', { class: `dot ${r.online ? 'on' : ''}` }), h('span', { class: 'chip' }, icon(icons.leaf), String(r.trophies)), more),
        ),
      );
    });
    if (snap.canLeave) {
      const leave = h('button', { class: 'btn danger', type: 'button', disabled: this.busy }, i18nText("ui.leave_alliance_ed18efd046"));
      leave.addEventListener('click', async () => {
        const ok = await this.d.kit.confirm(i18nText("ui.leave_this_alliance_2d77bf086d"), i18nText("ui.you_can_join_another_alliance_straight_b9956f5eb7"), i18nText("ui.leave_fc6e4a408d"), true);
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
    body.append(h('p', { class: 'muted small' }, quote ? i18nText("ui.moderators_see_the_message_exactly_as__ca99ff4fef") : i18nText("ui.tell_the_moderators_what_did_0abde97331", { arg1: target.name })));
    const reasons = h('div', { class: 'report-reasons', role: 'radiogroup', 'aria-label': i18nText("ui.reason_f81ab834de") });
    for (const r of REPORT_REASONS) reasons.append(h('label', { class: 'report-reason' }, h('input', { type: 'radio', name: 'report-reason', value: r }), i18nLabel(REASON_LABELS[r])));
    const note = h('textarea', { class: 'text', maxlength: 500, rows: 2, placeholder: i18nText("ui.anything_else_they_should_know_optiona_1ecfe6847d") }) as HTMLTextAreaElement;
    note.addEventListener('keydown', (e) => e.stopPropagation());
    const also = h('input', { type: 'checkbox' }) as HTMLInputElement;
    body.append(reasons, note);
    if (!blocked) body.append(h('label', { class: 'report-block' }, also, i18nText("ui.also_block_87576e2627", { arg1: target.name })));
    const close = this.d.kit.modal(
      quote ? i18nText("ui.report_message_0a1e3c5275") : i18nText("ui.report_e70c48c496", { arg1: target.name }),
      body,
      [
        blocked
          ? { label: i18nText("ui.unblock_712da63171"), onClick: () => (close(), void this.run(() => this.src.unblock(target.playerId), redraw, false)) }
          : { label: i18nText("ui.block_only_c48907164a"), onClick: () => (close(), void this.run(() => this.src.block(target.playerId), redraw, false)) },
        {
          label: i18nText("ui.send_report_a44d353113"),
          primary: true,
          onClick: () => {
            const reason = body.querySelector<HTMLInputElement>('input[name="report-reason"]:checked')?.value as ReportReason | undefined;
            if (!reason) {
              this.d.kit.toast(i18nText("ui.pick_a_reason_first_5bb42bdd4f"), 'error');
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
    const gd = localizedData(this.c.data);
    const now = this.c.now();
    const p = snap.raid;
    const hall = hallLevel(s, gd);
    if (p.phase !== 'live') {
      body.append(h('p', {}, i18nText("ui.the_next_alliance_war_starts_in_and_la_db68a4f545", { arg1: formatDuration(p.nextStart - now), arg2: gd.social.groveRaid.durationHours / 24, arg3: gd.social.groveRaid.attacksPerMember })));
      if (snap.kind === 'online') body.append(h('p', { class: 'muted small' }, i18nText("ui.your_alliance_is_matched_with_a_real_a_05e7916bdc")));
      const chest = (o: 'win' | 'draw' | 'loss') => {
        const { xp, ...c } = groveRaidChest(o, hall, gd);
        void xp;
        return rewardChips(c);
      };
      body.append(h('h3', {}, i18nText("ui.reward_chest_64aca0d893")), h('p', { class: 'muted small' }, i18nText("ui.sized_for_your_clan_keep_level_69566e8c77", { arg1: hall })), h('div', {}, h('div', { class: 'row' }, h('b', {}, i18nText("ui.win_c622058960")), chest('win')), h('div', { class: 'row' }, h('b', {}, i18nText("ui.draw_9f0ab7e3c0")), chest('draw')), h('div', { class: 'row' }, h('b', {}, i18nText("ui.loss_23d7ef7cf8")), chest('loss'))));
      const last = s.grove.raidHistory[s.grove.raidHistory.length - 1];
      if (last) body.append(h('h3', {}, i18nText("ui.last_alliance_war_15c1c01df2")), h('p', {}, i18nText("ui.stars_reward_d99d00075f", { arg1: last.outcome === 'win' ? i18nText("ui.victory_2e9b5a0c4e") : last.outcome === 'draw' ? i18nText("ui.draw_61517c08b3") : i18nText("ui.defeat_2be4cda831"), arg2: last.ours, arg3: last.theirs }), rewardChips(last.reward)));
      return;
    }
    if (!p.enemyName) {
      body.append(h('p', { class: 'muted' }, i18nText("ui.looking_for_an_enemy_alliance_80082c4e08")));
      return;
    }
    const left = p.attacksLeft;
    body.append(
      h('div', { class: 'raid-score' }, h('div', {}, h('b', {}, i18nText("ui.us_d07eb35432")), h('span', { class: 'big' }, i18nText("ui.message_00055f19bd", { arg1: p.ours }))), h('div', { class: 'muted' }, i18nText("ui.vs_f130559f0e")), h('div', {}, h('b', {}, h('bdi', {}, snap.kind === 'local' ? generatedName(p.enemyName, 'grove') : p.enemyName)), snap.kind === 'local' ? h('div', { class: 'muted small' }, i18nText("ui.computer_clan_8f8bccdc83")) : null, h('span', { class: 'big' }, i18nText("ui.message_00055f19bd", { arg1: p.theirs })))),
      h('p', { class: 'muted small' }, p.eligible ? t('raid.endsAttacks', { n: left, time: formatDuration(p.end - now) }) : i18nText("ui.ends_in_you_joined_during_this_raid_so_6fb775721b", { arg1: formatDuration(p.end - now) })),
      h('h3', {}, i18nText("ui.enemy_bases_f719775a69")),
    );
    for (const b of p.bases) {
      const starEl = h('span', { class: 'stars-mini' });
      for (let k = 0; k < 3; k++) starEl.append(h('span', { class: k < b.stars ? '' : 'off' }, '★'));
      const atk = h('button', { class: 'btn danger', type: 'button', disabled: left <= 0 || b.stars >= 3 }, i18nText("ui.attack_4cd548f3cc"));
      atk.addEventListener('click', () => {
        this.d.kit.closeAllModals();
        this.d.onGroveAttack(b.index);
      });
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, i18nText("ui.message_59480bd082", { arg1: b.index + 1, arg2: isolateName(b.name) })), h('div', { class: 'row' }, h('span', { class: 'muted small' }, i18nText("ui.clan_keep_2cf84349d4", { arg1: b.hall })), starEl)), atk));
    }
  }
}

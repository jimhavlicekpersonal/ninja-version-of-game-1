import { generateGrove, groveLevel, isOnline, reinforcementCapacity, reinforcementHousing, canRequest } from '../sim/social/grove';
import { attacksLeft, enemyGrove, groveRaidChest, raidPhase, raidScore } from '../sim/social/groveRaid';
import { hallLevel } from '../sim/village';
import { clear, h, icon } from './dom';
import type { UiKit } from './economyUi';
import { rewardChips } from './economyUi';
import { formatDuration, formatNumber } from './format';
import { icons } from './icons';

export interface GroveUiDeps {
  kit: UiKit;
  troopThumb(type: string): string | null;
  onGroveAttack(target: number): void;
}

type Tab = 'chat' | 'requests' | 'members' | 'raid';

export class GroveUi {
  private tab: Tab = 'chat';
  constructor(private readonly d: GroveUiDeps) {}

  private get c() {
    return this.d.kit.c;
  }

  open(tab?: Tab): void {
    if (tab) this.tab = tab;
    const body = h('div', { class: 'grove' });
    let lastSig = '';
    const draw = (force = false) => {
      const s = this.c.state;
      const sig = JSON.stringify([s.grove.joined, s.grove.chat.length, s.grove.requests.map((r) => r.donated), s.army, s.grove.reinforcements, s.grove.raid?.attacks.length, this.tab, Math.floor(this.c.now() / 30000)]);
      if (!force && sig === lastSig) return;
      lastSig = sig;
      const keepInput = body.querySelector<HTMLInputElement>('input.text')?.value ?? '';
      clear(body);
      if (!s.grove.joined) {
        this.joinScreen(body, () => draw(true));
        return;
      }
      const grove = generateGrove(s.grove.seed, this.c.data);
      const lvl = groveLevel(s.grove.xp, this.c.data);
      body.append(
        h('div', { class: 'grove-head' }, h('span', { class: 'grove-badge', style: `background:${grove.color}` }, icon(icons.leaf)), h('div', {}, h('b', {}, grove.name), h('div', { class: 'muted small' }, `${grove.members.length + 1} members · your Grove level ${lvl} (${formatNumber(s.grove.xp)} XP)`))),
      );
      const tabs: [Tab, string][] = [['chat', 'Chat'], ['requests', `Troops${s.grove.requests.length ? ` (${s.grove.requests.length})` : ''}`], ['members', 'Members'], ['raid', 'Grove Raid']];
      body.append(
        h('div', { class: 'shop-tabs' }, ...tabs.map(([id, label]) => {
          const b = h('button', { type: 'button', class: id === this.tab ? 'on' : '' }, label);
          b.addEventListener('click', () => {
            this.tab = id;
            draw(true);
          });
          return b;
        })),
      );
      if (this.tab === 'chat') this.chatTab(body, grove.members.map((m) => m.name), keepInput, () => draw(true));
      else if (this.tab === 'requests') this.requestsTab(body, grove.members.map((m) => m.name), () => draw(true));
      else if (this.tab === 'members') this.membersTab(body);
      else this.raidTab(body);
    };
    draw(true);
    const timer = window.setInterval(() => draw(), 2000);
    const unsub = this.c.subscribe(() => draw());
    this.d.kit.modal('Grove', body, [], 'wide', () => {
      window.clearInterval(timer);
      unsub();
    });
  }

  private joinScreen(body: HTMLElement, redraw: () => void): void {
    body.append(
      h('p', {}, 'Groves are friendly bands of kingdoms. Members chat, share troops and team up for the weekly Grove Raid.'),
      h('p', { class: 'muted small' }, 'Chat is always filtered to keep it friendly.'),
    );
    const btn = h('button', { class: 'btn primary', type: 'button' }, 'Find a Grove and join');
    btn.addEventListener('click', () => {
      const r = this.c.dispatch({ type: 'joinGrove' });
      if (!r.ok) this.d.kit.toast(r.message, 'error');
      redraw();
    });
    body.append(h('div', { class: 'actions' }, btn));
  }

  private chatTab(body: HTMLElement, names: string[], keep: string, redraw: () => void): void {
    const s = this.c.state;
    const list = h('div', { class: 'chat-list' });
    for (const m of s.grove.chat.slice(-50)) {
      const mine = m.from === -1;
      const who = m.from === -1 ? 'You' : m.from === -2 ? '' : names[m.from] ?? 'Friend';
      list.append(
        h(
          'div',
          { class: `chat-msg ${mine ? 'mine' : ''} ${m.kind}` },
          who ? h('span', { class: 'chat-who' }, who) : null,
          h('span', { class: 'chat-text' }, m.text),
          h('span', { class: 'chat-time' }, `${formatDuration(Math.max(0, this.c.now() - m.at))} ago`),
        ),
      );
    }
    const input = h('input', { class: 'text', type: 'text', maxlength: 160, placeholder: 'Say something nice…', value: keep }) as HTMLInputElement;
    const send = () => {
      const r = this.c.dispatch({ type: 'chat', text: input.value });
      if (!r.ok) this.d.kit.toast(r.message, 'error');
      else input.value = '';
      redraw();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') send();
    });
    body.append(list, h('div', { class: 'chat-input-row' }, input, h('button', { class: 'btn primary', type: 'button', onclick: send }, 'Send')));
    window.setTimeout(() => (list.scrollTop = list.scrollHeight), 0);
  }

  private requestsTab(body: HTMLElement, names: string[], redraw: () => void): void {
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
    const can = canRequest(s, now, gd);
    const ask = h('button', { class: 'btn sky', type: 'button', disabled: !can.ok }, 'Ask for troops');
    ask.addEventListener('click', () => {
      const r = this.c.dispatch({ type: 'requestTroops' });
      this.d.kit.toast(r.ok ? 'Request sent! Friends will send troops soon.' : r.message, r.ok ? 'success' : 'error');
      redraw();
    });
    body.append(
      h('h3', {}, 'Your Grove Lodge'),
      cap ? h('div', { class: 'progress-row' }, h('div', { class: 'progress' }, h('i', { style: `width:${(used / cap) * 100}%` })), h('span', {}, `${used}/${cap} donated troops`)) : h('p', { class: 'muted' }, 'Build a Grove Lodge (Elder Toadstool 2) to receive troops from friends.'),
      rein,
      h('div', { class: 'actions' }, ask, !can.ok ? h('span', { class: 'note' }, can.readyAt ? `Ask again in ${formatDuration(can.readyAt - now)}` : can.message) : ''),
      h('p', { class: 'muted small' }, 'Donated troops join your next battle and are used before your own. Every troop you donate earns Grove XP, and friends send troops back to fill your Lodge.'),
      h('h3', {}, 'Friends asking for troops'),
    );
    if (!s.grove.requests.length) body.append(h('p', { class: 'muted' }, 'No requests right now.'));
    for (const r of s.grove.requests) {
      const row = h('div', { class: 'log-row' }, h('div', {}, h('b', {}, names[r.member] ?? 'Friend'), h('div', { class: 'progress-row' }, h('div', { class: 'progress' }, h('i', { style: `width:${(r.donated / r.size) * 100}%` })), h('span', { class: 'small' }, `${r.donated}/${r.size}`))));
      const btns = h('div', { class: 'row' });
      for (const [t, n] of Object.entries(s.army)) {
        if (n <= 0) continue;
        const th = this.d.troopThumb(t);
        const b = h('button', { class: 'btn ghost donate-btn', type: 'button', title: `Donate ${gd.troops[t]?.name}` }, th ? h('img', { src: th, alt: '' }) : null, `×${n}`);
        b.addEventListener('click', () => {
          const res = this.c.dispatch({ type: 'donate', requestId: r.id, troop: t, count: 1 });
          if (!res.ok) this.d.kit.toast(res.message, 'error');
          redraw();
        });
        btns.append(b);
      }
      if (!btns.childElementCount) btns.append(h('span', { class: 'muted small' }, 'Train troops to donate.'));
      row.append(btns);
      body.append(row);
    }
  }

  private membersTab(body: HTMLElement): void {
    const s = this.c.state;
    const grove = generateGrove(s.grove.seed, this.c.data);
    const hl = hallLevel(s, this.c.data);
    const now = this.c.now();
    const rows = grove.members.map((m) => ({ name: m.name, role: m.role, hall: Math.max(1, Math.min(6, hl + m.hallOffset)), trophies: Math.max(0, s.trophies + m.trophyOffset), online: isOnline(m, now) }));
    rows.push({ name: 'You', role: 'Member', hall: hl, trophies: s.trophies, online: true });
    rows.sort((a, b) => b.trophies - a.trophies);
    rows.forEach((r, i) => {
      body.append(
        h(
          'div',
          { class: `log-row${r.name === 'You' ? ' current' : ''}` },
          h('div', {}, h('b', {}, `${i + 1}. ${r.name}`), h('div', { class: 'muted small' }, `${r.role} · Elder Toadstool ${r.hall}`)),
          h('div', { class: 'row' }, h('span', { class: `dot ${r.online ? 'on' : ''}` }), h('span', { class: 'chip' }, icon(icons.leaf), String(r.trophies))),
        ),
      );
    });
  }

  private raidTab(body: HTMLElement): void {
    const s = this.c.state;
    const gd = this.c.data;
    const now = this.c.now();
    const p = raidPhase(now, gd);
    const hall = hallLevel(s, gd);
    if (p.phase !== 'live') {
      body.append(h('p', {}, `The next Grove Raid starts in ${formatDuration(p.nextStart - now)} and lasts 2 days. Every member gets ${gd.social.groveRaid.attacksPerMember} attacks; the best stars on each enemy base add up, and the Grove with more stars wins.`));
      const chest = (o: 'win' | 'draw' | 'loss') => {
        const { xp, ...c } = groveRaidChest(o, hall, gd);
        void xp;
        return rewardChips(c);
      };
      body.append(h('h3', {}, 'Reward chest'), h('p', { class: 'muted small' }, `Sized for your Elder Toadstool level ${hall}.`), h('div', {}, h('div', { class: 'row' }, h('b', {}, 'Win '), chest('win')), h('div', { class: 'row' }, h('b', {}, 'Draw '), chest('draw')), h('div', { class: 'row' }, h('b', {}, 'Loss '), chest('loss'))));
      const last = s.grove.raidHistory[s.grove.raidHistory.length - 1];
      if (last) body.append(h('h3', {}, 'Last Grove Raid'), h('p', {}, `${last.outcome === 'win' ? 'Victory' : last.outcome === 'draw' ? 'Draw' : 'Defeat'} · ${last.ours} – ${last.theirs} stars. Reward: `, rewardChips(last.reward)));
      return;
    }
    const enemy = enemyGrove(s.grove.seed, p.week, hall, gd);
    const score = raidScore(s, p.week, now, hall, gd);
    const left = attacksLeft(s, p.week, gd);
    body.append(
      h('div', { class: 'raid-score' }, h('div', {}, h('b', {}, 'Us'), h('span', { class: 'big' }, `★ ${score.ours}`)), h('div', { class: 'muted' }, 'vs'), h('div', {}, h('b', {}, enemy.name), h('span', { class: 'big' }, `★ ${score.theirs}`))),
      h('p', { class: 'muted small' }, `Ends in ${formatDuration(p.end - now)} · You have ${left} attack${left === 1 ? '' : 's'} left.`),
      h('h3', {}, 'Enemy bases'),
    );
    enemy.bases.forEach((b, i) => {
      const stars = score.enemyBaseStars[i];
      const starEl = h('span', { class: 'stars-mini' });
      for (let k = 0; k < 3; k++) starEl.append(h('span', { class: k < stars ? '' : 'off' }, '★'));
      const atk = h('button', { class: 'btn danger', type: 'button', disabled: left <= 0 || stars >= 3 }, 'Attack');
      atk.addEventListener('click', () => {
        this.d.kit.closeAllModals();
        this.d.onGroveAttack(i);
      });
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, `${i + 1}. ${b.name}`), h('div', { class: 'row' }, h('span', { class: 'muted small' }, `Elder Toadstool ${b.hallLevel}`), starEl)), atk));
    });
  }
}

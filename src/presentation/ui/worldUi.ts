/**
 * Shadow Clans screens: the rivals board (Attack), and the World panel with
 * the map, the AI clans, the player's faction, tournaments and rank.
 *
 * Reads village state and pure rules from gameplay/sim/world; changes state
 * only through controller commands. Every AI village, clan or squad is
 * labelled as AI; real players are labelled as players.
 */
import { totalLoot } from '../../gameplay/sim/battle/basegen';
import { lossTrophies, winTrophies } from '../../gameplay/sim/ranks';
import { dayIndex } from '../../gameplay/sim/pass';
import type { Cost } from '../../gameplay/sim/types';
import { hallLevel } from '../../gameplay/sim/village';
import { hallTitle, pvpStatus, shadowSeason, shadowSeasonEndsAt, shadowTier } from '../../gameplay/sim/world/competition';
import { currentWar, factionMissions, factionRank, supportSquad } from '../../gameplay/sim/world/factions';
import type { RivalCandidate } from '../../gameplay/sim/world/opponents';
import { candidateMatchup, playerOffense, strengthMatchup } from '../../gameplay/sim/world/opponents';
import { clanPower } from '../../gameplay/sim/world/power';
import { settlementKind, settlementStrength, territoryCounts, tributeQuote } from '../../gameplay/sim/world/territory';
import { draftProblem, draftStep, suggestedDraft, tournamentAt, tournamentBases, tournamentLevels, totalScore } from '../../gameplay/sim/world/tournament';
import { clanDef, clanPowerRating, hallAndBias } from '../../gameplay/sim/world/villagegen';
import { clear, h, icon } from './dom';
import type { UiKit } from './economyUi';
import { rewardChips } from './economyUi';
import { formatDuration, formatNumber } from './format';
import { icons } from './icons';

/** Extra facts a server can add (real players per faction, the player's region). */
export interface WorldOnlineInfo {
  region: string | null;
  /** Real players per faction, the human leader (and their id) and the war target the leader chose. */
  factions: Record<string, { humans: number; leader: string | null; leaderId?: string | null; target?: string | null }>;
  /** A finished Shadow Rank season whose reward can be collected. */
  lastSeason: { season: number; rating: number } | null;
  /** This player's server id (to know whether they lead their faction). */
  meId: string | null;
}

/** An Alliance on the online board. */
export interface AllianceRow {
  rank: number;
  name: string;
  members: number;
  points: number;
  wins: number;
  territory: number;
}

export interface WorldUiDeps {
  kit: UiKit;
  /** Scout a world map settlement (the app opens the battle). */
  onSettlement(id: string): void;
  /** Fight a tournament fortress with a drafted army. */
  onTournament(index: number, army: Record<string, number>): void;
  troopThumb(type: string): string | null;
  /** Online extras, or null when playing offline. */
  onlineInfo(): Promise<WorldOnlineInfo | null>;
  /** A human faction leader picks this week's war target (online). */
  onFactionTarget(target: string): Promise<boolean>;
  /** Alliances ranked by war results and territory (online), or null. */
  allianceBoard(): Promise<{ weeks: number; alliances: AllianceRow[]; mine: { rank: number; points: number } | null } | null>;
}

type Tab = 'map' | 'clans' | 'faction' | 'tournament' | 'rank';

const keepOf = (strength: number) => Math.floor(Math.max(0, strength)) + 1;

export class WorldUi {
  private tab: Tab = 'map';
  private draft: Record<string, number> = {};
  private online: WorldOnlineInfo | null = null;

  constructor(private readonly d: WorldUiDeps) {}

  private get c() {
    return this.d.kit.c;
  }

  // ---------------------------------------------------------------- rivals board

  /**
   * Up to three candidates from the kept scout seed. Real players (online)
   * come first; AI clan villages fill the rest. Picking one opens the scout
   * view; a new board costs the Next fee.
   */
  openRivals(board: RivalCandidate[], opts: { fee: number; canPay: boolean; humansOnline: boolean; onPick(c: RivalCandidate): void; onNew(): void }): void {
    const gd = this.c.data;
    const s = this.c.state;
    const body = h('div', { class: 'rivals' });
    const humans = board.filter((c) => c.source === 'human').length;
    body.append(
      h(
        'p',
        { class: 'muted small' },
        humans
          ? `${humans} real player${humans > 1 ? 's' : ''} and ${board.length - humans} AI clan village${board.length - humans === 1 ? '' : 's'}. AI villages are generated; they are never presented as people.`
          : opts.humansOnline
            ? 'No real player fits your strength right now, so every rival here is an AI clan village.'
            : 'Every rival here is an AI clan village (generated, offline). Real players appear when you play online from Clan Keep 3.',
      ),
    );
    let close = () => {};
    for (const cand of board) {
      const b = cand.base;
      const def = cand.clan ? clanDef(gd, cand.clan) : null;
      const loot = totalLoot(b);
      const m = playerOffense(s, gd) > 0 ? candidateMatchup(s, b, gd) : { label: 'Train warriors' };
      const kindTag = cand.kind === 'player' ? 'Real player' : cand.kind === 'first' ? 'Training raid' : cand.kind === 'challenge' ? 'Challenge (optional)' : cand.kind === 'rival' ? 'Rival clan' : 'Matched rival';
      const pick = h('button', { class: 'btn primary', type: 'button' }, 'Scout');
      pick.addEventListener('click', () => {
        close();
        opts.onPick(cand);
      });
      const card = h(
        'div',
        { class: `rival-card${cand.source === 'human' ? ' human' : ''}`, style: def ? `--clan:${def.color}` : '' },
        h(
          'div',
          { class: 'rival-main' },
          h('div', { class: 'row' }, h('span', { class: `tag ${cand.source === 'human' ? 'tag-human' : 'tag-ai'}` }, cand.source === 'human' ? 'PLAYER' : 'AI'), h('span', { class: 'chip' }, kindTag), h('span', { class: `chip match-${m.label.replace(' ', '-').toLowerCase()}` }, m.label)),
          h('b', {}, b.name),
          h('div', { class: 'muted small' }, `${cand.label} · Clan Keep ${b.hallLevel} (${hallTitle(b.hallLevel, gd).title})${b.layoutVariant !== undefined ? ` · layout ${b.layoutVariant + 1} of ${gd.clans.generator.variants}` : ''}`),
          def ? h('div', { class: 'small' }, `${def.style} · ${def.defense}`) : null,
          h(
            'div',
            { class: 'row small' },
            rewardChips(loot),
            b.trophies !== undefined && cand.kind !== 'first' ? h('span', { class: 'chip' }, icon(icons.leaf), `+${winTrophies(s.trophies, b.trophies, gd)} / −${lossTrophies(s.trophies, b.trophies, gd)}`) : null,
          ),
        ),
        pick,
      );
      body.append(card);
    }
    const buttons = board[0]?.kind === 'first' ? [] : [{ label: `New rivals (${formatNumber(opts.fee)} Coins)`, onClick: () => { close(); opts.onNew(); } }];
    close = this.d.kit.modal('Choose a rival', body, opts.canPay ? buttons : [], 'wide');
  }

  // ---------------------------------------------------------------- the World panel

  open(tab?: Tab): void {
    if (tab) this.tab = tab;
    const body = h('div', { class: 'world' });
    const draw = () => {
      clear(body);
      const tabs: [Tab, string][] = [
        ['map', 'Map'],
        ['clans', 'Clans'],
        ['faction', 'Faction'],
        ['tournament', 'Tournament'],
        ['rank', 'Rank'],
      ];
      body.append(
        h(
          'div',
          { class: 'shop-tabs' },
          ...tabs.map(([id, label]) => {
            const b = h('button', { type: 'button', class: id === this.tab ? 'on' : '' }, label);
            b.addEventListener('click', () => {
              this.tab = id;
              draw();
            });
            return b;
          }),
        ),
      );
      if (this.tab === 'map') this.mapTab(body, draw);
      else if (this.tab === 'clans') this.clansTab(body);
      else if (this.tab === 'faction') this.factionTab(body, draw);
      else if (this.tab === 'tournament') this.tournamentTab(body, draw);
      else this.rankTab(body, draw);
    };
    draw();
    const unsub = this.c.subscribe(() => draw());
    void this.d.onlineInfo().then((info) => {
      this.online = info;
      draw();
    });
    this.d.kit.modal('Shadow Clans', body, [], 'wide', () => unsub());
  }

  private run(cmd: Parameters<typeof this.c.dispatch>[0], ok?: string): boolean {
    const r = this.c.dispatch(cmd);
    if (!r.ok) this.d.kit.toast(r.message, 'error');
    else if (ok) this.d.kit.toast(ok, 'success');
    return r.ok;
  }

  private mapTab(body: HTMLElement, redraw: () => void): void {
    const gd = this.c.data;
    const s = this.c.state;
    const now = this.c.now();
    const hall = hallLevel(s, gd);
    const counts = territoryCounts(s.world);
    const q = tributeQuote(s, dayIndex(now, gd), hall, gd);
    body.append(
      h('p', { class: 'muted small' }, `Every province starts in the hands of an AI clan. Win with ${gd.world.conquestStars}★ to take a settlement. Settlement battles pay loot but never Honor. Clans may take their land back later.${this.online?.region ? ` Your region: ${this.online.region}.` : ''}`),
      h(
        'div',
        { class: 'log-row current' },
        h('div', {}, h('b', {}, `Your territory: ${counts.player ?? 0}`), h('div', { class: 'muted small' }, q.shrines ? `${q.shrines} Shrine${q.shrines > 1 ? 's pay' : ' pays'} tribute once a day.` : 'Hold a Shrine to collect daily tribute.')),
        q.shrines
          ? h('button', { class: 'btn gold', type: 'button', disabled: !q.ready, onclick: () => { if (this.run({ type: 'claimTribute' }, 'Tribute collected.')) redraw(); } }, q.ready ? 'Collect ' : 'Collected today', q.ready ? rewardChips(q.amount) : '')
          : null,
      ),
    );
    // Difficulty is judged against the army the player would bring now; with no army there is nothing to judge.
    const armed = playerOffense(s, gd) > 0;
    for (const p of gd.world.provinces) {
      const def = clanDef(gd, p.clan);
      const list = h('div', { class: 'province-list' });
      for (const st of s.world.settlements.filter((x) => x.province === p.id)) {
        const kind = settlementKind(gd, st.kind);
        const scout = h('button', { class: 'btn sky', type: 'button', onclick: () => { this.d.kit.closeAllModals(); this.d.onSettlement(st.id); } }, 'Scout');
        if (st.heldBy) {
          // Shared territory: another real player in the region holds it.
          list.append(
            h(
              'div',
              { class: 'settlement held' },
              h('div', {}, h('b', {}, st.name), h('div', { class: 'muted small' }, `${kind.name}${kind.tribute ? ' (tribute)' : ''} · held by ${st.heldBy.name}`)),
              h('div', { class: 'row' }, h('span', { class: 'tag tag-human' }, 'PLAYER'), scout),
            ),
          );
          continue;
        }
        const mine = st.owner === 'player';
        const owner = mine ? null : clanDef(gd, st.owner);
        const strength = mine ? 0 : settlementStrength(st, s.world, hall, gd);
        const label = mine ? null : armed ? strengthMatchup(s, st.owner, strength, gd).label : 'Train warriors';
        list.append(
          h(
            'div',
            { class: `settlement${mine ? ' mine' : ''}`, style: owner ? `--clan:${owner.color}` : '' },
            h('div', {}, h('b', {}, st.name), h('div', { class: 'muted small' }, `${kind.name}${kind.tribute ? ' (tribute)' : ''} · ${mine ? `yours for ${formatDuration(now - st.since)}` : `${owner!.name} (AI) · Keep ${keepOf(strength)}`}`)),
            mine ? h('span', { class: 'chip good' }, 'Yours') : h('div', { class: 'row' }, h('span', { class: `chip match-${label!.replace(' ', '-').toLowerCase()}` }, label!), scout),
          ),
        );
      }
      body.append(h('div', { class: 'province', style: `--clan:${def.color}` }, h('h3', {}, p.name, h('span', { class: 'muted small' }, ` · ${p.terrain} · home of ${def.name}`)), list));
    }
    if (s.world.news.length) {
      body.append(h('h3', {}, 'World news'));
      for (const n of [...s.world.news].reverse().slice(0, 10)) body.append(h('div', { class: 'small news' }, h('span', { class: 'muted' }, `${formatDuration(Math.max(0, now - n.at))} ago · `), n.text));
    }
  }

  private clansTab(body: HTMLElement): void {
    const gd = this.c.data;
    const s = this.c.state;
    const now = this.c.now();
    const counts = territoryCounts(s.world);
    body.append(h('p', { class: 'muted small' }, 'The great clans are computer-controlled. They grow while you play, rebuild after you beat them, and some swear revenge. They never grow far beyond your own Clan Keep.'));
    for (const def of gd.clans.clans) {
      const c = s.world.clans[def.id];
      const { hall } = hallAndBias(c.strength, gd);
      const revengeIn = c.retaliateAt ? c.retaliateAt - now : 0;
      body.append(
        h(
          'div',
          { class: 'clan-row', style: `--clan:${def.color}` },
          h(
            'div',
            {},
            h('b', {}, def.name, h('span', { class: 'tag tag-ai' }, 'AI')),
            h('div', { class: 'muted small' }, `${def.difficulty} · ${def.style} · ${def.defense}`),
            h('div', { class: 'small' }, `“${def.motto}”`),
            h(
              'div',
              { class: 'row small' },
              h('span', { class: 'chip' }, `Keep ${hall}`),
              h('span', { class: 'chip' }, `Power ${formatNumber(clanPowerRating(def.id, c.strength, gd))}`),
              h('span', { class: 'chip' }, `Treasury ${formatNumber(c.resources.acorns)} Coins · ${formatNumber(c.resources.dew)} Provisions`),
              h('span', { class: `chip${c.status === 'rebuilding' ? ' good' : ''}` }, c.status === 'rebuilding' ? `Rebuilding ${formatDuration(Math.max(0, c.rebuildUntil - now))}` : c.status === 'expanding' ? 'Expanding' : 'Steady'),
              h('span', { class: 'chip' }, `${counts[def.id] ?? 0} settlements`),
              c.defeats ? h('span', { class: 'chip' }, `Beaten ${c.defeats}×`) : null,
              c.retaliateAt ? h('span', { class: 'chip short' }, revengeIn > 0 ? `Revenge raid in ~${formatDuration(revengeIn)}` : 'Revenge raid due') : null,
            ),
          ),
        ),
      );
    }
  }

  private factionTab(body: HTMLElement, redraw: () => void): void {
    const gd = this.c.data;
    const s = this.c.state;
    const now = this.c.now();
    const hall = hallLevel(s, gd);
    const f = s.world.faction;
    const humans = (id: string) => this.online?.factions[id];
    if (!f.id) {
      body.append(
        h('p', {}, 'Pledge your clan to one of the great clans. They give daily missions, send a support squad as your rank grows, and fight a weekly war against their rival that your victories can tip.'),
        h('p', { class: 'muted small' }, 'Factions are led by the computer. Their orders come from the clan command, not from people. Rewards are fixed and never sold.'),
      );
      for (const def of gd.clans.clans) {
        const info = humans(def.id);
        const join = h('button', { class: 'btn primary', type: 'button', onclick: () => { if (this.run({ type: 'joinFaction', clan: def.id }, `You serve ${def.name}.`)) redraw(); } }, 'Pledge');
        body.append(
          h(
            'div',
            { class: 'clan-row', style: `--clan:${def.color}` },
            h('div', {}, h('b', {}, def.name, h('span', { class: 'tag tag-ai' }, 'AI-led')), h('div', { class: 'muted small' }, `${def.style} · rival: ${clanDef(gd, def.rival).name}`), info ? h('div', { class: 'small' }, `${info.humans} real player${info.humans === 1 ? '' : 's'} serve here${info.leader ? ` · led by ${info.leader} (player)` : ''}`) : null),
            join,
          ),
        );
      }
      return;
    }
    const def = clanDef(gd, f.id);
    const rank = factionRank(f.reputation, gd);
    const info = humans(f.id);
    body.append(
      h(
        'div',
        { class: 'clan-row current', style: `--clan:${def.color}` },
        h('div', {}, h('b', {}, def.name, h('span', { class: 'tag tag-ai' }, info?.leader ? `led by ${info.leader} (player)` : 'AI-led')), h('div', { class: 'small' }, `Rank ${rank.name} · ${formatNumber(f.reputation)} reputation${rank.next ? ` · ${rank.next.reputation - f.reputation} to ${rank.next.name}` : ''}`), info ? h('div', { class: 'muted small' }, `${info.humans} real players in this faction`) : null),
      ),
      h('h3', {}, "Today's orders"),
    );
    for (const m of factionMissions(s, hall, gd)) {
      const claim = h('button', { class: 'btn gold', type: 'button', disabled: !m.done || m.claimed, onclick: () => { if (this.run({ type: 'claimFactionMission', id: m.def.id }, 'Mission complete.')) redraw(); } }, m.claimed ? 'Done' : 'Claim');
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, m.text), h('div', { class: 'muted small' }, `${formatNumber(m.progress)} / ${formatNumber(m.target)} · +${m.def.reputation} reputation`)), h('div', { class: 'row' }, rewardChips(m.reward), claim)));
    }
    const squad = supportSquad(s, gd);
    const sent = f.supportDay === dayIndex(now, gd);
    body.append(
      h('h3', {}, 'Support squad'),
      h(
        'div',
        { class: 'log-row' },
        h('div', {}, h('div', { class: 'small' }, rank.supportHousing ? `${def.name} sends ${rank.supportHousing} housing of warriors a day (warriors your Dojo has unlocked). They join your next raid.` : `Reach ${gd.world.factions.ranks[1].name} to receive a daily support squad.`), Object.keys(squad).length ? h('div', { class: 'muted small' }, Object.entries(squad).map(([t, n]) => `${n}× ${gd.troops[t].name}`).join(', ')) : null),
        h('button', { class: 'btn sky', type: 'button', disabled: sent || !rank.supportHousing, onclick: () => { if (this.run({ type: 'claimSupport' }, 'The support squad has arrived.')) redraw(); } }, sent ? 'Arrived today' : 'Call squad'),
      ),
    );
    const war = currentWar(s, now, gd);
    if (war) {
      const chosen = info?.target ? `${info.leader ?? 'The leader'} (player) chose this target.` : 'The clan command (AI) chose this target.';
      body.append(
        h('h3', {}, `War with ${clanDef(gd, war.rival).name}`),
        h('div', { class: 'log-row' }, h('div', {}, h('b', {}, `${war.ours} – ${war.theirs}`), h('div', { class: 'muted small' }, `Ends in ${formatDuration(war.endsAt - now)}. Your part: ${war.contribution} points. Take settlements (more for the enemy's) and win raids to add to it. ${chosen}`))),
      );
      // A human leader decides the faction's strategy: this week's war target.
      if (this.online && info?.leaderId && info.leaderId === this.online.meId) {
        const pick = h('select', { class: 'text', 'aria-label': 'War target' }) as HTMLSelectElement;
        for (const c of gd.clans.clans) if (c.id !== f.id) pick.append(h('option', { value: c.id, selected: c.id === war.rival }, c.name));
        const set = h('button', { class: 'btn primary', type: 'button' }, 'Set war target');
        set.addEventListener('click', async () => {
          const ok = await this.d.onFactionTarget(pick.value);
          this.d.kit.toast(ok ? 'War target set for this week.' : 'Could not set the war target.', ok ? 'success' : 'error');
          if (ok) this.online = await this.d.onlineInfo();
          redraw();
        });
        body.append(h('p', { class: 'small' }, 'You lead this faction: choose whom it fights this week.'), h('div', { class: 'chat-input-row' }, pick, set));
      }
    }
    for (const w of f.warHistory.filter((x) => !x.claimed)) {
      const reward = gd.world.factions.war.rewards[w.outcome];
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, `War ${w.outcome === 'win' ? 'won' : w.outcome === 'draw' ? 'drawn' : 'lost'} against ${clanDef(gd, w.rival).name}`), h('div', { class: 'muted small' }, `${w.ours} – ${w.theirs} · +${reward.reputation} reputation`)), h('button', { class: 'btn gold', type: 'button', onclick: () => { if (this.run({ type: 'claimFactionWar', week: w.week }, 'War reward collected.')) redraw(); } }, 'Collect')));
    }
    const leave = h('button', { class: 'btn ghost', type: 'button' }, 'Leave faction');
    leave.addEventListener('click', async () => {
      const ok = await this.d.kit.confirm('Leave faction?', `You keep your reputation, but you must wait ${gd.world.factions.switchCooldownHours} hours before pledging to another clan.`, 'Leave', true, 'Stay');
      if (ok && this.run({ type: 'leaveFaction' })) redraw();
    });
    body.append(h('div', { class: 'actions' }, leave));
  }

  private tournamentTab(body: HTMLElement, redraw: () => void): void {
    const gd = this.c.data;
    const s = this.c.state;
    const now = this.c.now();
    const t = gd.competition.tournament;
    const win = tournamentAt(now, gd);
    const best = s.world.tournament.id === win.id ? s.world.tournament.best : [];
    const claimed = s.world.tournament.id === win.id ? s.world.tournament.claimed : [];
    body.append(
      h('p', {}, `${t.name}: every player fights the same ${t.bases} fortresses with warriors at level ${t.troopLevel} and ${t.housing} housing. Only your army and your tactics matter.`),
      h('p', { class: 'muted small' }, 'Practice battles: no warriors are spent and nothing is lost. Score per fortress = stars × 100 + destruction %; your best attempt counts. Rewards pay once per tournament.'),
      h('div', { class: 'log-row current' }, h('b', {}, win.live ? `Live · ends in ${formatDuration(win.endsAt - now)}` : `Next tournament in ${formatDuration(win.nextStartsAt - now)}`), h('span', { class: 'chip' }, `Your score ${totalScore(best)}`)),
    );
    const th = h('div', { class: 'row' });
    t.thresholds.forEach((x, i) => th.append(h('span', { class: `chip${claimed.includes(i) ? ' good' : ''}` }, `${x.score}: `, rewardChips(x.reward))));
    body.append(th);
    // Draft
    body.append(h('h3', {}, 'Your draft'));
    const levels = tournamentLevels(gd);
    const used = Object.entries(this.draft).reduce((a, [k, n]) => a + gd.troops[k].housing * n, 0);
    const grid = h('div', { class: 'draft' });
    for (const [id, def] of Object.entries(gd.troops)) {
      const n = this.draft[id] ?? 0;
      const step = draftStep(id, gd);
      const room = Math.floor((t.housing - used) / def.housing);
      const thumb = this.d.troopThumb(id);
      const minus = h('button', { class: 'btn ghost', type: 'button', disabled: n <= 0, 'aria-label': `Fewer ${def.name}`, onclick: () => { this.draft[id] = Math.max(0, n - step); redraw(); } }, `−${step > 1 ? step : ''}`);
      const plus = h('button', { class: 'btn ghost', type: 'button', disabled: room <= 0, 'aria-label': `More ${def.name}`, onclick: () => { this.draft[id] = n + Math.min(step, room); redraw(); } }, `+${step > 1 ? step : ''}`);
      grid.append(h('div', { class: 'draft-row' }, thumb ? h('img', { src: thumb, alt: '' }) : null, h('div', {}, h('b', {}, def.name), h('div', { class: 'muted small' }, `Lv ${levels[id]} · ${def.housing} housing`)), minus, h('b', { class: 'draft-n' }, String(n)), plus));
    }
    body.append(
      grid,
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'small' }, `Housing ${used} / ${t.housing}`),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { this.draft = suggestedDraft(gd); redraw(); } }, 'Suggested army'),
        h('button', { class: 'btn ghost', type: 'button', disabled: used === 0, onclick: () => { this.draft = {}; redraw(); } }, 'Clear'),
      ),
    );
    const problem = draftProblem(this.draft, gd);
    const bases = tournamentBases(win.id, gd);
    bases.forEach((b, i) => {
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, b.name), h('div', { class: 'muted small' }, `${b.practice ?? ''} · best ${best[i] ?? 0}`)), h('button', { class: 'btn primary', type: 'button', disabled: !win.live || Boolean(problem), title: problem ?? '', onclick: () => { this.d.kit.closeAllModals(); this.d.onTournament(i, { ...this.draft }); } }, 'Fight')));
    });
    if (problem && used > 0) body.append(h('p', { class: 'note' }, problem));
  }

  private rankTab(body: HTMLElement, redraw: () => void): void {
    const gd = this.c.data;
    const s = this.c.state;
    const now = this.c.now();
    const hall = hallLevel(s, gd);
    const rank = s.world.rank;
    const status = pvpStatus(hall, gd);
    const title = hallTitle(hall, gd);
    body.append(
      h('div', { class: 'log-row current' }, h('div', {}, h('b', {}, `Clan Power ${formatNumber(clanPower(s, gd))}`), h('div', { class: 'muted small' }, `Clan Keep ${hall}: ${title.title}. Clan Power measures how developed your village and warriors are.`))),
      h('h3', {}, 'Shadow Rank'),
    );
    if (rank) {
      const tier = shadowTier(rank.rating, gd);
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, `${rank.rating} · ${tier.name}`), h('div', { class: 'muted small' }, `Defense rating ${rank.defense} · ${rank.games} battles · season ends in ${formatDuration(shadowSeasonEndsAt(shadowSeason(now, gd), gd) - now)}`))));
    } else {
      body.append(h('p', {}, 'Unranked.'));
    }
    body.append(h('p', { class: 'muted small' }, 'Shadow Rank measures skill against real players only (online). Battles against AI clans never change it, so nobody can climb it by farming the computer. Each four-week season pulls ratings halfway back to the start; your village keeps all its progress.'));
    const last = this.online?.lastSeason;
    if (last && !s.world.rankSeasonsClaimed.includes(last.season)) {
      body.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, `Season ${last.season + 1} finished at ${last.rating}`), h('div', { class: 'muted small' }, shadowTier(last.rating, gd).name)), h('button', { class: 'btn gold', type: 'button', onclick: () => { if (this.run({ type: 'claimRankSeason', season: last.season, rating: last.rating }, 'Season reward collected.')) redraw(); } }, 'Collect ', rewardChips(shadowTier(last.rating, gd).reward as Cost))));
    }
    if (this.online) {
      const board = h('div', {}, h('p', { class: 'muted small' }, 'Loading the Alliance board…'));
      body.append(h('h3', {}, 'Alliance board'), board);
      void this.d.allianceBoard().then((b) => {
        clear(board);
        if (!b || !b.alliances.length) {
          board.append(h('p', { class: 'muted small' }, 'No Alliance has scored yet.'));
          return;
        }
        board.append(h('p', { class: 'muted small' }, `Last ${b.weeks} Alliance Wars: wins against Alliances and AI clans, draws, and settlements the members hold.${b.mine ? ` Yours: #${b.mine.rank}, ${b.mine.points} points.` : ''}`));
        for (const a of b.alliances.slice(0, 10)) board.append(h('div', { class: 'log-row' }, h('div', {}, h('b', {}, `#${a.rank} ${a.name}`), h('div', { class: 'muted small' }, `${a.members} members · ${a.wins} wins · ${a.territory} settlements`)), h('span', { class: 'chip' }, `${a.points} pts`)));
      });
    }
    body.append(h('h3', {}, 'Real-player battles'));
    if (status === 'locked') body.append(h('p', { class: 'small' }, `Protected: until Clan Keep ${gd.competition.pvp.minHall} you only meet AI clans, and no real player can attack you.`));
    else if (status === 'standard') body.append(h('p', { class: 'small' }, 'On: when you play online, real players of similar strength can appear among your rivals and attack your village while you are away. Shields and loot protection apply.'));
    else {
      const on = s.world.pvpOptIn;
      body.append(
        h('p', { class: 'small' }, `Optional at Clan Keep ${hall}. From Clan Keep ${gd.competition.pvp.standardHall} real-player battles are standard.`),
        h('button', { class: `btn ${on ? 'ghost' : 'primary'}`, type: 'button', onclick: () => { if (this.run({ type: 'setPvpOptIn', on: !on }, on ? 'Real-player battles off.' : 'Real-player battles on.')) redraw(); } }, on ? 'Turn off real-player battles' : 'Turn on real-player battles'),
      );
    }
  }
}

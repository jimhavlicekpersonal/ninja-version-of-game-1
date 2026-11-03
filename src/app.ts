import type Phaser from 'phaser';
import { BattleSession } from './gameplay/control/battleSession';
import type { GameController } from './gameplay/control/controller';
import type { GroveSource, RaidBattle } from './backend/social/groveSource';
import type { Connection } from './backend/net/connection';
import type { BattleSceneInit } from './presentation/render/BattleScene';
import type { BaseLayout, BattleRecord, BattleSetup } from './gameplay/sim/battle/types';
import { troopLevels } from './gameplay/sim/research';
import { mixSeed } from './gameplay/sim/rng';
import { battleArmy, hallLevel, scoutFee } from './gameplay/sim/village';
import { nextTrialTier, trialBase, trialInfo, trialReward } from './gameplay/sim/trials';
import { aiCandidates, mergeCandidates, type RivalCandidate } from './gameplay/sim/world/opponents';
import { pvpEnabled } from './gameplay/sim/world/competition';
import { settlementBase } from './gameplay/sim/world/territory';
import { tournamentAt, tournamentBases, tournamentLevels } from './gameplay/sim/world/tournament';
import { clanDef } from './gameplay/sim/world/villagegen';
import type { Analytics } from './backend/analytics/events';
import { BattleHud } from './presentation/ui/battleHud';
import { sound } from './presentation/audio/sound';
import type { Hud } from './presentation/ui/hud';

export interface AppDeps {
  game: Phaser.Game;
  controller: GameController;
  hud: Hud;
  hudRoot: HTMLElement;
  battleRoot: HTMLElement;
  renderScale: number;
  troopThumb(type: string): string | null;
  /** Online play: real opponents and real Grove Raids when connected. */
  connection: Connection;
  groveSource: GroveSource;
  analytics: Analytics;
}

/** Leave this much of a ticket's lifetime for the 3-minute battle itself. */
const TICKET_MARGIN_MS = 5 * 60_000;

/** Switches between the village and battles (scouting, live attacks, replays). */
export class App {
  private battleHud: BattleHud | null = null;
  private session: BattleSession | null = null;

  constructor(private readonly d: AppDeps) {}

  get inBattle(): boolean {
    return this.session !== null;
  }

  private ticket: string | null = null;
  /** The online opponent behind the current scout seed, kept so Home + Attack shows the same base. */
  private onlineMatch: { seed: number; ticket: string; base: BaseLayout; expiresAt: number; bot: boolean } | null = null;

  /** Real players offered for the current scout seed, kept so Home + Attack shows the same board. */
  private humanBoard: { seed: number; list: RivalCandidate[]; at: number } | null = null;

  /**
   * Look for opponents: the rivals board with up to three candidates. `paid` =
   * a new board for the Next fee. Online (protocol 4+, PvP unlocked), the
   * server adds real players by the population-transition rules; AI clan
   * villages fill the rest. Every card says AI or player.
   */
  async scout(paid = false): Promise<void> {
    const c = this.d.controller;
    const r = c.scout(paid);
    if (!r.ok) {
      if (this.battleHud) this.battleHud.toast(r.message);
      else this.d.hud.toast(r.message, 'error');
      return;
    }
    if (this.battleHud) this.home();
    this.ticket = null;
    const conn = this.d.connection;
    const gd = c.data;
    const ai = aiCandidates(r.seed, c.state, gd);
    const pvp = pvpEnabled(hallLevel(c.state, gd), c.state.world.pvpOptIn, gd) && c.state.world.firstRaidDone;
    const online = conn.online && Boolean(conn.port);
    if (online && !conn.supports('candidates') && c.state.world.firstRaidDone) {
      // An older server (protocol 3) owns Honor and picks one opponent itself, as before
      // (the tutorial outpost stays local so the first raid is always winnable).
      await this.legacyOnlineScout(r.seed);
      return;
    }
    let humans: RivalCandidate[] = [];
    let searched = false;
    if (online && pvp) {
      const kept = this.humanBoard && this.humanBoard.seed === r.seed && Date.now() - this.humanBoard.at < 10 * 60_000 ? this.humanBoard.list : null;
      try {
        humans = kept ?? (await conn.candidates());
        searched = true;
        this.humanBoard = { seed: r.seed, list: humans, at: Date.now() };
      } catch (e) {
        console.warn('Online candidates failed, showing AI rivals', e);
      }
    }
    const board = mergeCandidates(ai, humans, gd);
    this.d.analytics.log('opponent_search', { ok: board.length > 0, humans: humans.length, ai: board.length - humans.length, online, searched, paid });
    this.d.hud.world.openRivals(board, {
      fee: scoutFee(c.state, gd),
      canPay: c.state.resources.acorns >= scoutFee(c.state, gd),
      humansOnline: searched,
      onPick: (cand) => void this.attackCandidate(cand, r.seed),
      onNew: () => void this.scout(true),
    });
  }

  /** Open the scout view for a candidate (online: get a server ticket for it first). */
  private async attackCandidate(cand: RivalCandidate, seed: number): Promise<void> {
    const c = this.d.controller;
    const conn = this.d.connection;
    const army = battleArmy(c.state);
    const levels = troopLevels(c.state, c.data);
    const battleSeed = mixSeed(seed, 0xba771e + (cand.kind === 'rival' ? 2 : cand.kind === 'challenge' ? 3 : 0));
    let base = structuredClone(cand.base);
    this.ticket = null;
    // Online, every attack (AI or player) goes through a server ticket so the
    // server can re-run it and keep Honor and Shadow Rank honest. The tutorial
    // outpost stays local.
    if (conn.online && conn.supports('candidates') && cand.kind !== 'first') {
      try {
        const m = cand.source === 'human' ? await conn.matchWith({ target: cand.token! }) : await conn.matchWith({ ai: { clan: cand.clan!, seed: cand.villageSeed!, strength: cand.strength } });
        this.ticket = m.ticket;
        base = structuredClone(m.base);
        if (m.opponent.kind === 'bot') base.practice = base.clan ? `${clanDef(c.data, base.clan).name} · AI clan village` : 'Generated rival (AI)';
      } catch (e) {
        this.d.hud.toast(cand.source === 'human' ? 'That player can no longer be attacked. Pick another rival.' : 'The server could not prepare that battle. Try again.', 'error');
        console.warn('Online match failed', e);
        return;
      }
    } else if (cand.source === 'ai' && cand.kind !== 'first') {
      base.practice = `${cand.clan ? clanDef(c.data, cand.clan).name : 'Generated rival'} · AI clan village (offline)`;
    }
    const setup: BattleSetup = { seed: battleSeed, base, army, levels };
    this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, undefined, cand.kind === 'first' ? { kind: 'first' } : undefined);
  }

  /** Protocol-3 servers: the server picks one opponent (a real player or a generated one). */
  private async legacyOnlineScout(seed: number): Promise<void> {
    const c = this.d.controller;
    const conn = this.d.connection;
    const army = battleArmy(c.state);
    const levels = troopLevels(c.state, c.data);
    try {
      const kept = this.onlineMatch && this.onlineMatch.seed === seed && Date.now() < this.onlineMatch.expiresAt - TICKET_MARGIN_MS ? this.onlineMatch : null;
      const m = kept ?? (await conn.port!.match());
      if (m) {
        this.onlineMatch = kept ?? { seed, ticket: m.ticket, base: m.base, expiresAt: m.expiresAt, bot: 'opponent' in m ? m.opponent.kind === 'bot' : false };
        this.ticket = this.onlineMatch.ticket;
        const base = structuredClone(this.onlineMatch.base);
        if (this.onlineMatch.bot) base.practice = 'Generated rival (no player fitted your rank)';
        this.open(new BattleSession({ seed: mixSeed(seed, 0xba771e), base, army, levels }, c.data, 'scout'));
        return;
      }
    } catch (e) {
      console.warn('Online match failed, using AI rivals', e);
    }
    const ai = aiCandidates(seed, c.state, c.data);
    this.d.hud.world.openRivals(ai, { fee: scoutFee(c.state, c.data), canPay: c.state.resources.acorns >= scoutFee(c.state, c.data), humansOnline: false, onPick: (cand) => void this.attackCandidate(cand, seed), onNew: () => void this.scout(true) });
  }

  /** Scout a world map settlement (frozen so the battle is rebuilt exactly). */
  settlement(id: string): void {
    const c = this.d.controller;
    if (!Object.values(battleArmy(c.state)).some((n) => n > 0)) {
      this.d.hud.toast('Train some warriors first.', 'error');
      return;
    }
    const st = c.state.world.settlements.find((x) => x.id === id);
    if (st?.heldBy) {
      void this.challengeHolder(id, st.heldBy);
      return;
    }
    const t = c.targetSettlement(id);
    if (!t.ok) {
      this.d.hud.toast(t.message, 'error');
      return;
    }
    const base = settlementBase(c.state.world.target!, c.state.world, c.data);
    base.practice = `${clanDef(c.data, base.clan!).name} · AI-held settlement · win ${c.data.world.conquestStars}★ to take it`;
    const setup: BattleSetup = { seed: mixSeed(c.state.seed, 0x3a1d + c.state.nextSeed), base, army: battleArmy(c.state), levels: troopLevels(c.state, c.data) };
    this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, undefined, { kind: 'world' });
  }

  /**
   * A settlement another real player holds in the region: a real-player
   * battle against their village (Honor, Shadow Rank, loot), and enough stars
   * take the settlement on the server.
   */
  private async challengeHolder(id: string, holder: { id: string; name: string }): Promise<void> {
    const c = this.d.controller;
    const conn = this.d.connection;
    if (!conn.online || !conn.supports('territory')) {
      this.d.hud.toast(`Held by ${holder.name} (player). Play online to challenge them.`, 'error');
      return;
    }
    try {
      const m = await conn.matchWith({ target: holder.id, settlement: id });
      this.ticket = m.ticket;
      const base = structuredClone(m.base);
      base.practice = undefined;
      const setup: BattleSetup = { seed: mixSeed(c.state.seed, 0x5e771e + c.state.nextSeed), base, army: battleArmy(c.state), levels: troopLevels(c.state, c.data) };
      this.open(new BattleSession(setup, c.data, 'scout'));
    } catch {
      this.d.hud.toast(`${holder.name} (player) cannot be attacked right now (shield, daily limit or out of your band).`, 'error');
    }
  }

  /** Fight a tournament fortress with a drafted army at standard levels (practice: nothing is spent). */
  tournament(index: number, army: Record<string, number>): void {
    const c = this.d.controller;
    const win = tournamentAt(c.now(), c.data);
    if (!win.live) {
      this.d.hud.toast('No tournament is running right now.', 'error');
      return;
    }
    const base = tournamentBases(win.id, c.data)[index];
    if (!base) return;
    const setup: BattleSetup = { seed: mixSeed(c.state.seed, 0x70a7 + index * 31 + c.state.nextSeed), base, army, levels: tournamentLevels(c.data) };
    this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, undefined, { kind: 'tournament', index });
  }

  /** Attack an enemy base in the Grove Raid (no loot or trophies). */
  async groveAttack(target: number): Promise<void> {
    const battle = await this.d.groveSource.raidBattle(target);
    if ('error' in battle) {
      this.d.hud.toast(battle.error, 'error');
      return;
    }
    this.open(new BattleSession(battle.setup, this.d.controller.data, 'scout'), undefined, battle);
  }

  /** Attack a Shadow Trial tier (practice ladder; reward on the first clear only). */
  trial(tier: number): void {
    const c = this.d.controller;
    const army = battleArmy(c.state);
    if (!Object.values(army).some((n) => n > 0)) {
      this.d.hud.toast('Train some warriors first.', 'error');
      return;
    }
    const base = trialBase(tier, c.data);
    const setup: BattleSetup = { seed: mixSeed(c.state.seed, 0x7a1a1 + tier * 7919 + c.state.nextSeed), base, army, levels: troopLevels(c.state, c.data) };
    this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, tier);
  }

  replay(record: BattleRecord): void {
    this.open(new BattleSession(record.setup, this.d.controller.data, 'replay', record), record);
  }

  home(): void {
    this.battleHud?.destroy();
    this.battleHud = null;
    this.session = null;
    const sm = this.d.game.scene;
    if (sm.isActive('battle') || sm.isPaused('battle')) sm.stop('battle');
    if (sm.isSleeping('village')) sm.wake('village');
    this.d.hudRoot.hidden = false;
    sound.music('village');
  }

  private open(session: BattleSession, replayOf?: BattleRecord, grove?: RaidBattle, trialTier?: number, extra?: { kind: 'world' } | { kind: 'tournament'; index: number } | { kind: 'first' }): void {
    const c = this.d.controller;
    this.battleHud?.destroy();
    this.session = session;
    let lastRecord: BattleRecord | null = null;
    this.battleHud = new BattleHud({
      root: this.d.battleRoot,
      session,
      myTrophies: c.state.trophies,
      replayOf: replayOf ? { kind: replayOf.kind, opponentName: replayOf.opponentName } : undefined,
      grove: grove ? { enemyName: grove.enemyName } : undefined,
      trial:
        trialTier !== undefined
          ? (() => {
              const info = trialInfo(trialTier, c.data);
              const firstClear = trialTier === nextTrialTier(c.state.trials.best);
              return { tier: trialTier, layout: info.layout.name, modifiers: info.modifiers.map((m) => m.name), reward: trialReward(trialTier, c.data), firstClear, starsToClear: c.data.trials.starsToClear };
            })()
          : undefined,
      practice: extra?.kind === 'world' ? { line: session.setup.base.practice ?? 'World map settlement', noNext: true } : extra?.kind === 'tournament' ? { line: `${c.data.competition.tournament.name} · standard levels · nothing is spent`, noNext: true, noLoot: true } : undefined,
      troopThumb: this.d.troopThumb,
      hideNext: extra?.kind === 'first',
      scoutFee: scoutFee(c.state, c.data),
      canPayFee: () => c.state.resources.acorns >= scoutFee(c.state, c.data),
      onHome: () => this.home(),
      onNext: () => this.scout(true),
      onAttack: () => {
        session.start();
        // Engagement by opponent type (health view): battles started vs finished, AI vs real players.
        if (!replayOf && !grove) this.d.analytics.log('battle_start', { human: Boolean(session.setup.base.human), clan: session.setup.base.clan ?? null, kind: extra?.kind ?? (trialTier !== undefined ? 'trial' : 'raid') });
      },
      onFinished: () => {
        if (grove) {
          const g = grove.finish(session.deployments, session.endTick);
          if (!g) return null;
          return { result: session.result(), banked: {}, trophies: 0 };
        }
        if (extra?.kind === 'world') {
          const w = c.finishWorldBattle(session.setup, session.deployments, session.endTick);
          if (!w) return null;
          lastRecord = w.record;
          const note = w.conquered ? `You took ${w.record.opponentName}! It is yours on the world map.` : `Not taken: you need ${c.data.world.conquestStars} stars to take a settlement.`;
          return { result: w.record.result, banked: w.record.result.loot, trophies: 0, note };
        }
        if (extra?.kind === 'tournament') {
          const t = c.finishTournament(extra.index, session.setup, session.deployments, session.endTick);
          if (!t) return null;
          lastRecord = t.record;
          const tid = session.setup.base.tournament?.id;
          if (tid !== undefined) void this.d.connection.reportTournament({ tournament: tid, index: extra.index, seed: session.setup.seed, army: session.setup.army, deployments: session.deployments, endTick: session.endTick });
          return { result: t.record.result, banked: t.reward, trophies: 0, note: `Score ${t.score} (best ${t.best}). Tournament total ${t.total}.` };
        }
        if (trialTier !== undefined) {
          const t = c.finishTrial(trialTier, session.setup, session.deployments, session.endTick);
          if (!t) return null;
          lastRecord = t.record;
          const note = t.firstClear
            ? `Shadow Trial ${trialTier} cleared! Trial ${trialTier + 1} is open.`
            : t.cleared
              ? 'Cleared again. The reward for this tier was already claimed.'
              : `Not cleared: you need ${c.data.trials.starsToClear} stars.`;
          return { result: t.record.result, banked: t.reward, trophies: 0, note };
        }
        const out = c.finishBattle(session.setup, session.deployments, session.endTick, session.setup.base.name);
        if (!out) return null;
        if (this.ticket) {
          // The server re-runs the battle from seed + deployments; the outbox
          // keeps the report until it gets through.
          const ticket = this.ticket;
          this.ticket = null;
          this.onlineMatch = null;
          void this.d.connection.report('attack', { ticket, seed: session.setup.seed, army: session.setup.army, levels: session.setup.levels, deployments: session.deployments, endTick: session.endTick });
        }
        lastRecord = out.record;
        const clan = out.record.setup.base.clan;
        const note = clan && out.record.result.stars >= 1 ? `${clanDef(c.data, clan).name} (AI) is rebuilding${out.revenge ? ' and swears revenge: expect their raid soon' : ''}.` : undefined;
        return { result: out.record.result, banked: out.banked, trophies: out.record.trophies ?? 0, bonus: out.record.leagueBonus, eventBonus: out.record.eventBonus, note };
      },
      onReplay: () => {
        if (lastRecord) this.replay(lastRecord);
      },
    });
    this.d.hudRoot.hidden = true;
    sound.music('battle');
    const sm = this.d.game.scene;
    if (sm.isActive('village')) sm.sleep('village');
    const hudHooks = this.battleHud.hooks();
    let lastTrack = 0;
    let trackTimer = 0;
    const ticket = this.ticket ?? undefined;
    const hooks = {
      ...hudHooks,
      deployed: () => {
        hudHooks.deployed();
        // Saved from the first deployment, so closing the app mid-raid can't erase it.
        // Throttled: the first deployment saves at once, later ones at most every 1.5 s.
        if (session.mode !== 'live' || grove || replayOf) return;
        const track = () => {
          trackTimer = 0;
          lastTrack = Date.now();
          if (session.sim.ended && !c.state.pendingBattle) return;
          c.trackBattle({ kind: extra && extra.kind !== 'first' ? extra.kind : trialTier !== undefined ? 'trial' : 'raid', tier: trialTier, index: extra?.kind === 'tournament' ? extra.index : undefined, opponentName: session.setup.base.name, setup: session.setup, deployments: session.deployments, ticket, at: c.now() });
        };
        if (!lastTrack) track();
        else if (!trackTimer) trackTimer = window.setTimeout(track, Math.max(0, 1500 - (Date.now() - lastTrack)));
      },
    };
    const init: BattleSceneInit = { session, hooks, renderScale: this.d.renderScale };
    if (sm.isActive('battle') || sm.isPaused('battle')) sm.stop('battle');
    sm.start('battle', init);
  }
}

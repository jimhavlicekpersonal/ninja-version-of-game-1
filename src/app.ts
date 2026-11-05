import type Phaser from 'phaser';
import { BattleSession } from './gameplay/control/battleSession';
import type { GameController } from './gameplay/control/controller';
import type { GroveSource, RaidBattle } from './backend/social/groveSource';
import type { Connection } from './backend/net/connection';
import type { BattleSceneInit } from './presentation/render/BattleScene';
import type { BaseLayout, BattleRecord, BattleSetup } from './gameplay/sim/battle/types';
import { opponentFor } from './gameplay/sim/matchmaking';
import { SIM_RULES } from './gameplay/sim/battle/battle';
import { mixSeed } from './gameplay/sim/rng';
import { battleArmy, battleLoadout, scoutFee } from './gameplay/sim/village';
import { nextTrialTier, trialBase, trialInfo, trialReward, trialVariant } from './gameplay/sim/trials';
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
}

/** Leave this much of a ticket's lifetime for the 3-minute battle itself. */
const TICKET_MARGIN_MS = 5 * 60_000;

/** Switches between the village and battles (scouting, live attacks, replays). */
export class App {
  private battleHud: BattleHud | null = null;
  private session: BattleSession | null = null;
  /** Saves the live battle's deployments right now (they are otherwise saved at most every 1.5 s). */
  private flushTrack: (() => void) | null = null;

  /** Call when the app is hidden or closing, so the last deployments are never lost. */
  flushBattle(): void {
    this.flushTrack?.();
  }

  constructor(private readonly d: AppDeps) {}

  get inBattle(): boolean {
    return this.session !== null;
  }

  private ticket: string | null = null;
  /**
   * The online opponent behind the current scout seed, kept so Home + Attack
   * shows the same base. `battleSeed` is the ticket's seed: the server issues
   * it and re-simulates with it (older servers send none; then the game picks one).
   */
  private onlineMatch: { seed: number; battleSeed: number; ticket: string; base: BaseLayout; expiresAt: number; bot: boolean } | null = null;

  /** Look for an opponent. `paid` = pressing Next. */
  async scout(paid = false): Promise<void> {
    const c = this.d.controller;
    // A village the server keeps raids only through the server (offline loot could not be checked).
    if (this.d.connection.serverVillage && !this.d.connection.online) {
      const msg = 'Your village is kept on the server, so attacks need a connection. Try again when you are online.';
      if (this.battleHud) this.battleHud.toast(msg);
      else this.d.hud.toast(msg, 'error');
      return;
    }
    const r = c.scout(paid);
    if (!r.ok) {
      if (this.battleHud) this.battleHud.toast(r.message);
      else this.d.hud.toast(r.message, 'error');
      return;
    }
    this.ticket = null;
    const loadout = battleLoadout(c.state, c.data);
    const conn = this.d.connection;
    // Online: the server picks the opponent (a real village, or a generated
    // one when nobody fits) with the same matchmaking rules, and has already
    // applied the loot penalty to it.
    if (conn.online && conn.port) {
      try {
        // Same scout seed as last time (Home, then Attack): show the same base
        // while its ticket is still valid, so leaving never rerolls for free.
        const kept = this.onlineMatch && this.onlineMatch.seed === r.seed && Date.now() < this.onlineMatch.expiresAt - TICKET_MARGIN_MS ? this.onlineMatch : null;
        if (!kept) await conn.ensureFreshBase();
        const m = kept ?? (await conn.port.match());
        if (m) {
          this.onlineMatch = kept ?? { seed: r.seed, battleSeed: typeof m.seed === 'number' ? m.seed >>> 0 : mixSeed(r.seed, 0xba771e), ticket: m.ticket, base: m.base, expiresAt: m.expiresAt, bot: 'opponent' in m ? m.opponent.kind === 'bot' : false };
          this.ticket = this.onlineMatch.ticket;
          const base = structuredClone(this.onlineMatch.base);
          if (this.onlineMatch.bot) base.practice = 'Generated rival (no player fitted your rank)';
          const setup: BattleSetup = { seed: this.onlineMatch.battleSeed, base, ...loadout, infiltration: true };
          this.open(new BattleSession(setup, c.data, 'scout'));
          return;
        }
      } catch (e) {
        console.warn('Online match failed, using a generated opponent', e);
      }
      if (conn.serverVillage) {
        this.d.hud.toast('Could not reach the server to find an opponent. Try again in a moment.', 'error');
        return;
      }
    }
    // Opponent strength and loot follow the player's trophies (see sim/matchmaking).
    const base = opponentFor(r.seed, c.state, c.data);
    // Offline, every rival is generated: say so instead of passing it off as a player.
    base.practice = 'Generated rival (offline)';
    const setup: BattleSetup = { seed: mixSeed(r.seed, 0xba771e), base, ...loadout, infiltration: true };
    this.open(new BattleSession(setup, c.data, 'scout'));
  }

  /** A Gang War strike (step 67): solo, or a relay strike from the Gang's damage so far. */
  async gangWarAttack(target: number, relay: boolean, enemyName: string, bot: boolean): Promise<void> {
    try {
      const battle = await this.d.connection.gangWarBattle(target, relay, enemyName, bot);
      this.open(new BattleSession(battle.setup, this.d.controller.data, 'scout'), undefined, battle);
    } catch (e) {
      this.d.hud.toast((e as Error).message, 'error');
    }
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
    const base = trialBase(tier, c.data, trialVariant(c.state.trials, tier));
    const setup: BattleSetup = { seed: mixSeed(c.state.seed, 0x7a1a1 + tier * 7919 + c.state.nextSeed), base, ...battleLoadout(c.state, c.data), infiltration: true };
    this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, tier);
  }

  /**
   * A practice battle: any army (e.g. one with a warrior you have not trained
   * yet) against a generated base at your Keep. Nothing is spent or won, and it
   * is never saved as a raid; you can still watch its replay.
   */
  practice(army: Record<string, number>): void {
    const c = this.d.controller;
    const seed = mixSeed(c.state.seed, 0x9a7c + Math.floor(c.now() / 1000));
    const base = opponentFor(seed, c.state, c.data);
    base.practice = 'Practice battle (nothing spent or won)';
    delete base.trophies;
    const loadout = battleLoadout(c.state, c.data);
    const setup: BattleSetup = { seed, base, army, levels: loadout.levels, infiltration: true };
    this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, undefined, true);
  }

  /**
   * A Friendly Duel (roadmap step 62): your army against a friend's village or
   * duel layout. Nothing is spent or won; the server re-checks it and keeps
   * the rivalry tally and the replay for both of you.
   */
  async duel(friendId: string, friendName: string, opts: { layout?: 'live' | 'duel'; challengeId?: string } = {}): Promise<void> {
    const c = this.d.controller;
    const loadout = battleLoadout(c.state, c.data);
    if (!Object.values(loadout.army).some((n) => n > 0)) {
      this.d.hud.toast('Train some warriors first: duels use your army (none are spent).', 'error');
      return;
    }
    try {
      const t = await this.d.connection.duelTicket({ friendId, ...opts });
      const base = structuredClone(t.base);
      base.practice = `Friendly duel with ${t.opponent.name} (nothing spent or won)`;
      const setup: BattleSetup = { seed: t.seed >>> 0, base, ...loadout, infiltration: true };
      this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, undefined, true, { ticket: t.ticket, friendName: t.opponent.name || friendName });
    } catch (e) {
      this.d.hud.toast((e as Error).message, 'error');
    }
  }

  replay(record: BattleRecord): void {
    this.open(new BattleSession(record.setup, this.d.controller.data, 'replay', record), record);
  }

  home(): void {
    this.flushTrack = null;
    this.battleHud?.destroy();
    this.battleHud = null;
    this.session = null;
    const sm = this.d.game.scene;
    if (sm.isActive('battle') || sm.isPaused('battle')) sm.stop('battle');
    if (sm.isSleeping('village')) sm.wake('village');
    this.d.hudRoot.hidden = false;
    sound.music('village');
  }

  private open(session: BattleSession, replayOf?: BattleRecord, grove?: RaidBattle, trialTier?: number, practice = false, duel?: { ticket: string; friendName: string }): void {
    const c = this.d.controller;
    this.battleHud?.destroy();
    this.session = session;
    let lastRecord: BattleRecord | null = null;
    this.battleHud = new BattleHud({
      root: this.d.battleRoot,
      session,
      myTrophies: c.state.trophies,
      replayOf: replayOf ? { kind: replayOf.kind, opponentName: replayOf.opponentName } : undefined,
      grove: grove ? { enemyName: grove.enemyName, ...(grove.channel === 'gangwar' ? { title: grove.setup.startDamage ? 'Gang War relay' : 'Gang War' } : {}) } : undefined,
      practice,
      trial:
        trialTier !== undefined
          ? (() => {
              const info = trialInfo(trialTier, c.data, trialVariant(c.state.trials, trialTier));
              const firstClear = trialTier === nextTrialTier(c.state.trials.best);
              return { tier: trialTier, layout: info.layout.name, modifiers: info.modifiers.map((m) => m.name), reward: trialReward(trialTier, c.data), firstClear, starsToClear: c.data.trials.starsToClear };
            })()
          : undefined,
      troopThumb: this.d.troopThumb,
      scoutFee: scoutFee(c.state, c.data),
      canPayFee: () => c.state.resources.acorns >= scoutFee(c.state, c.data),
      onHome: () => this.home(),
      onNext: () => this.scout(true),
      onAttack: () => session.start(),
      onFinished: () => {
        if (practice) {
          // Never banked: a record only for "Watch replay".
          const result = session.result();
          lastRecord = { id: 'practice', kind: 'attack', at: c.now(), opponentName: session.setup.base.name, setup: session.setup, deployments: session.deployments, endTick: session.endTick, result, rules: SIM_RULES };
          if (duel) {
            const sub = { ticket: duel.ticket, seed: session.setup.seed, army: session.setup.army, levels: session.setup.levels, reinforcements: session.setup.reinforcements, deployments: session.deployments, endTick: session.endTick, clientHash: result.hash, rules: SIM_RULES };
            void this.d.connection.reportDuel(sub).then(
              (r) => this.d.hud.toast(`Duel recorded. Against ${duel.friendName}: ${r.rivalry.wins} win${r.rivalry.wins === 1 ? '' : 's'} in ${r.rivalry.duels} duel${r.rivalry.duels === 1 ? '' : 's'}.`, 'success'),
              (e: Error) => this.d.hud.toast(`The duel could not be recorded: ${e.message}`, 'error'),
            );
            return { result, banked: {}, trophies: 0, note: `Friendly duel with ${duel.friendName}: no warriors were spent and nothing was won.` };
          }
          return { result, banked: {}, trophies: 0, note: 'Practice battle: no troops were spent and nothing was won.' };
        }
        if (grove) {
          const g = grove.finish(session.deployments, session.endTick);
          if (!g) return null;
          // Kept in the battle log, so "Watch replay" works after an Alliance War attack too.
          lastRecord = g.record;
          return { result: g.record.result, banked: {}, trophies: 0 };
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
          return { result: t.record.result, banked: t.reward, overflow: t.record.overflow, trophies: 0, note };
        }
        const ticket = this.ticket ?? undefined;
        // Online: recorded as pending; loot and honor arrive with the server's confirmation.
        const out = c.finishBattle(session.setup, session.deployments, session.endTick, session.setup.base.name, ticket);
        if (!out) return null;
        if (ticket) {
          // The server re-runs the battle from seed + deployments; the outbox
          // keeps the report until it gets through.
          this.ticket = null;
          this.onlineMatch = null;
          void this.d.connection.report('attack', { ticket, seed: session.setup.seed, army: session.setup.army, levels: session.setup.levels, reinforcements: session.setup.reinforcements, deployments: session.deployments, endTick: session.endTick, clientHash: out.record.result.hash, rules: SIM_RULES });
        }
        lastRecord = out.record;
        if (out.record.settlement === 'pending') return { result: out.record.result, banked: {}, trophies: 0, pending: true };
        return { result: out.record.result, banked: out.banked, overflow: out.record.overflow, trophies: out.record.trophies ?? 0, bonus: out.record.leagueBonus, eventBonus: out.record.eventBonus };
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
    const ticket = grove ? grove.ticket : this.ticket ?? undefined;
    const startedAt = c.now();
    const hooks = {
      ...hudHooks,
      deployed: () => {
        hudHooks.deployed();
        // Saved from the first deployment, so closing the app mid-raid (or mid-war-attack) can't erase it.
        // Throttled: the first deployment saves at once, later ones at most every 1.5 s.
        if (session.mode !== 'live' || replayOf || practice) return;
        const track = () => {
          trackTimer = 0;
          lastTrack = Date.now();
          if (session.sim.ended && !c.state.pendingBattle) return;
          const kind = grove ? 'war' : trialTier !== undefined ? 'trial' : 'raid';
          c.trackBattle({ kind, tier: trialTier, target: grove?.target, opponentName: session.setup.base.name, setup: session.setup, deployments: session.deployments, ticket, at: startedAt, rules: SIM_RULES, ...(grove?.channel ? { channel: grove.channel } : {}) });
        };
        if (!lastTrack) track();
        else if (!trackTimer) trackTimer = window.setTimeout(track, Math.max(0, 1500 - (Date.now() - lastTrack)));
        this.flushTrack = () => {
          if (!trackTimer) return;
          window.clearTimeout(trackTimer);
          track();
        };
      },
    };
    const init: BattleSceneInit = { session, hooks, renderScale: this.d.renderScale };
    if (sm.isActive('battle') || sm.isPaused('battle')) sm.stop('battle');
    sm.start('battle', init);
  }
}

import type Phaser from 'phaser';
import { BattleSession } from './game/battleSession';
import type { GameController } from './game/controller';
import type { BattleSceneInit } from './render/BattleScene';
import type { BaseLayout, BattleRecord, BattleSetup } from './sim/battle/types';
import { applyLootPenalty, opponentFor } from './sim/matchmaking';
import { troopLevels } from './sim/research';
import { mixSeed } from './sim/rng';
import { battleArmy, hallLevel, scoutFee } from './sim/village';
import { enemyGrove, raidPhase } from './sim/social/groveRaid';
import { BattleHud } from './ui/battleHud';
import type { OnlineClient } from './online/client';
import { sound } from './audio/sound';
import type { Hud } from './ui/hud';

export interface AppDeps {
  game: Phaser.Game;
  controller: GameController;
  hud: Hud;
  hudRoot: HTMLElement;
  battleRoot: HTMLElement;
  renderScale: number;
  troopThumb(type: string): string | null;
  /** Optional PvP server: real opponents instead of generated ones. */
  online?: OnlineClient | null;
}

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
  private onlineMatch: { seed: number; ticket: string; base: BaseLayout; at: number } | null = null;

  /** Look for an opponent. `paid` = pressing Next. */
  async scout(paid = false): Promise<void> {
    const c = this.d.controller;
    const r = c.scout(paid);
    if (!r.ok) {
      if (this.battleHud) this.battleHud.toast(r.message);
      else this.d.hud.toast(r.message, 'error');
      return;
    }
    this.ticket = null;
    const army = battleArmy(c.state);
    const levels = troopLevels(c.state, c.data);
    // A real player's base from the server when online; a generated one otherwise.
    if (this.d.online) {
      try {
        // Same scout seed as last time (Home, then Attack): show the same base
        // while its ticket is still fresh, so leaving never rerolls for free.
        const kept = this.onlineMatch && this.onlineMatch.seed === r.seed && c.now() - this.onlineMatch.at < 9 * 60_000 ? this.onlineMatch : null;
        const m = kept ?? (await this.d.online.match());
        if (m) {
          const base = kept ? kept.base : applyLootPenalty(m.base, hallLevel(c.state, c.data), c.data);
          this.onlineMatch = { seed: r.seed, ticket: m.ticket, base, at: kept ? kept.at : c.now() };
          this.ticket = m.ticket;
          const setup: BattleSetup = { seed: mixSeed(r.seed, 0xba771e), base: structuredClone(base), army, levels };
          this.open(new BattleSession(setup, c.data, 'scout'));
          return;
        }
      } catch (e) {
        console.warn('Online match failed, using a generated opponent', e);
      }
    }
    // Opponent strength and loot follow the player's trophies (see sim/matchmaking).
    const base = opponentFor(r.seed, c.state, c.data);
    const setup: BattleSetup = { seed: mixSeed(r.seed, 0xba771e), base, army, levels };
    this.open(new BattleSession(setup, c.data, 'scout'));
  }

  /** Attack an enemy base in the Grove Raid (no loot or trophies). */
  groveAttack(target: number): void {
    const c = this.d.controller;
    const p = raidPhase(c.now(), c.data);
    if (p.phase !== 'live') return;
    const enemy = enemyGrove(c.state.grove.seed, p.week, hallLevel(c.state, c.data), c.data);
    const base = enemy.bases[target];
    if (!base) return;
    const done = c.state.grove.raid?.week === p.week ? c.state.grove.raid.attacks.length : 0;
    const setup: BattleSetup = { seed: mixSeed(c.state.grove.seed, p.week * 1000 + target + done * 97 + 1), base, army: battleArmy(c.state), levels: troopLevels(c.state, c.data) };
    this.open(new BattleSession(setup, c.data, 'scout'), undefined, { target, enemyName: enemy.name });
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

  private open(session: BattleSession, replayOf?: BattleRecord, grove?: { target: number; enemyName: string }): void {
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
      troopThumb: this.d.troopThumb,
      scoutFee: scoutFee(c.state, c.data),
      canPayFee: () => c.state.resources.acorns >= scoutFee(c.state, c.data),
      onHome: () => this.home(),
      onNext: () => this.scout(true),
      onAttack: () => session.start(),
      onFinished: () => {
        if (grove) {
          const g = c.finishGroveBattle(grove.target, session.setup, session.deployments, session.endTick, session.setup.base.name);
          if (!g) return null;
          return { result: session.result(), banked: {}, trophies: 0 };
        }
        const out = c.finishBattle(session.setup, session.deployments, session.endTick, session.setup.base.name);
        if (!out) return null;
        if (this.d.online && this.ticket) {
          const ticket = this.ticket;
          this.ticket = null;
          this.onlineMatch = null;
          const online = this.d.online;
          void online
            .submitAttack({ ticket, seed: session.setup.seed, army: session.setup.army, levels: session.setup.levels, deployments: session.deployments, endTick: session.endTick })
            .then(() => online.me())
            .then((me) => c.dispatch({ type: 'syncRank', trophies: me.trophies, shieldUntil: me.shieldUntil }))
            .catch((e) => console.warn('Could not report the attack to the server', e));
        }
        lastRecord = out.record;
        return { result: out.record.result, banked: out.banked, trophies: out.record.trophies ?? 0, bonus: out.record.leagueBonus };
      },
      onReplay: () => {
        if (lastRecord) this.replay(lastRecord);
      },
    });
    this.d.hudRoot.hidden = true;
    sound.music('battle');
    const sm = this.d.game.scene;
    if (sm.isActive('village')) sm.sleep('village');
    const init: BattleSceneInit = { session, hooks: this.battleHud.hooks(), renderScale: this.d.renderScale };
    if (sm.isActive('battle') || sm.isPaused('battle')) sm.stop('battle');
    sm.start('battle', init);
  }
}

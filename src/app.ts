import type Phaser from 'phaser';
import { BattleSession } from './game/battleSession';
import type { GameController } from './game/controller';
import type { BattleSceneInit } from './render/BattleScene';
import { generateOpponent } from './sim/battle/basegen';
import type { BattleRecord, BattleSetup } from './sim/battle/types';
import { mixSeed } from './sim/rng';
import { hallLevel, scoutFee } from './sim/village';
import { BattleHud } from './ui/battleHud';
import type { Hud } from './ui/hud';

export interface AppDeps {
  game: Phaser.Game;
  controller: GameController;
  hud: Hud;
  hudRoot: HTMLElement;
  battleRoot: HTMLElement;
  renderScale: number;
  troopThumb(type: string): string | null;
}

/** Switches between the village and battles (scouting, live attacks, replays). */
export class App {
  private battleHud: BattleHud | null = null;
  private session: BattleSession | null = null;

  constructor(private readonly d: AppDeps) {}

  get inBattle(): boolean {
    return this.session !== null;
  }

  /** Look for an opponent. `paid` = pressing Next. */
  scout(paid = false): void {
    const c = this.d.controller;
    const r = c.scout(paid);
    if (!r.ok) {
      if (this.battleHud) this.battleHud.toast(r.message);
      else this.d.hud.toast(r.message, 'error');
      return;
    }
    const base = generateOpponent(r.seed, hallLevel(c.state, c.data), c.data);
    const setup: BattleSetup = { seed: mixSeed(r.seed, 0xba771e), base, army: { ...c.state.army } };
    this.open(new BattleSession(setup, c.data, 'scout'));
  }

  replay(record: BattleRecord): void {
    this.open(new BattleSession(record.setup, this.d.controller.data, 'replay', record));
  }

  home(): void {
    this.battleHud?.destroy();
    this.battleHud = null;
    this.session = null;
    const sm = this.d.game.scene;
    if (sm.isActive('battle') || sm.isPaused('battle')) sm.stop('battle');
    if (sm.isSleeping('village')) sm.wake('village');
    this.d.hudRoot.hidden = false;
  }

  private open(session: BattleSession): void {
    const c = this.d.controller;
    this.battleHud?.destroy();
    this.session = session;
    let lastRecord: BattleRecord | null = null;
    this.battleHud = new BattleHud({
      root: this.d.battleRoot,
      session,
      troopThumb: this.d.troopThumb,
      scoutFee: scoutFee(c.state, c.data),
      canPayFee: () => c.state.resources.acorns >= scoutFee(c.state, c.data),
      onHome: () => this.home(),
      onNext: () => this.scout(true),
      onAttack: () => session.start(),
      onFinished: () => {
        const out = c.finishBattle(session.setup, session.deployments, session.endTick, session.setup.base.name);
        if (!out) return null;
        lastRecord = out.record;
        return { result: out.record.result, banked: out.banked };
      },
      onReplay: () => {
        if (lastRecord) this.replay(lastRecord);
      },
    });
    this.d.hudRoot.hidden = true;
    const sm = this.d.game.scene;
    if (sm.isActive('village')) sm.sleep('village');
    const init: BattleSceneInit = { session, hooks: this.battleHud.hooks(), renderScale: this.d.renderScale };
    if (sm.isActive('battle') || sm.isPaused('battle')) sm.stop('battle');
    sm.start('battle', init);
  }
}

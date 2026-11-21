import { displayData as localizedData, listText as i18nList, t as i18nText } from './presentation/ui/i18n';
import { rivalById, rivalFor, rivalOutpostName } from './gameplay/sim/rivals';
import { isolateName } from './gameplay/sim/social/names';
import type Phaser from 'phaser';
import { BattleSession } from './gameplay/control/battleSession';
import type { GameController } from './gameplay/control/controller';
import type { GroveSource, RaidBattle } from './backend/social/groveSource';
import type { Connection } from './backend/net/connection';
import type { BattleSceneInit } from './presentation/render/BattleScene';
import type { BaseLayout, BattleRecord, BattleResult, BattleSetup } from './gameplay/sim/battle/types';
import { opponentFor } from './gameplay/sim/matchmaking';
import { SIM_RULES } from './gameplay/sim/battle/battle';
import { mixSeed } from './gameplay/sim/rng';
import { battleArmy, battleLoadout, bountyBattleSeed, lastAttackArmy, rematchBattleSeed, scoutFee, trialBattleSeed } from './gameplay/sim/village';
import { attemptTier, canTryAlternate, trialBase, trialInfo, trialReward, trialRewardsThrough, trialVariant } from './gameplay/sim/trials';
import { drillArmy, drillLevels } from './gameplay/sim/drill';
import { hallLevel } from './gameplay/sim/keep';
import { rematchBase, rematchStatus } from './gameplay/sim/rematch';
import { hasAttacked, shieldAfterAttack } from './gameplay/sim/shield';
import { totalLoot } from './gameplay/sim/battle/basegen';
import { villageToBase } from './gameplay/sim/defense';
import { testDefense } from './gameplay/sim/defenseTest';
import { capacity } from './gameplay/sim/resources';
import { armyDiversity, contractById, contractMultiplier, diversityPartOf, diversityShare, trainableRoles } from './gameplay/sim/carry';
import { BattleHud } from './presentation/ui/battleHud';
import { progressLines, snapProgress } from './presentation/ui/resultProgress';
import { sound } from './presentation/audio/sound';
import type { Hud } from './presentation/ui/hud';

interface AppDeps {
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
      // Audit R01: say what still works offline (building, training, research, collecting,
      // Shadow Trials and practice battles are queued for the server or need nothing from it).
      const msg = i18nText("ui.raids_on_other_players_need_a_connecti_25c0da7a9e");
      if (this.battleHud) this.battleHud.toast(msg);
      else this.d.hud.toast(msg, 'error');
      return;
    }
    // Beast Mode SAV-05: the server counts a started raid whose report has not arrived as a loss at the next match, so
    // no match is asked for while an attack report is still waiting here (a won raid on a poor connection was forfeited).
    const conn0 = this.d.connection;
    if (conn0.online && conn0.port && conn0.outbox().some((i) => i.kind === 'attack')) {
      await conn0.sendReportsBeforeMatch();
      if (conn0.outbox().some((i) => i.kind === 'attack')) {
        const msg = i18nText('raid.reportPending');
        if (this.battleHud) this.battleHud.toast(msg);
        else this.d.hud.toast(msg, 'info');
        return;
      }
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
        if (!kept) {
          // Ledger audit A1: a started raid whose report has not arrived counts as a loss at the next match.
          await conn.sendReportsBeforeMatch();
          await conn.ensureFreshBase();
        }
        const m = kept ?? (await conn.port.match());
        if (m) {
          this.onlineMatch = kept ?? { seed: r.seed, battleSeed: typeof m.seed === 'number' ? m.seed >>> 0 : mixSeed(r.seed, 0xba771e), ticket: m.ticket, base: m.base, expiresAt: m.expiresAt, bot: 'opponent' in m ? m.opponent.kind === 'bot' : false };
          this.ticket = this.onlineMatch.ticket;
          const base = structuredClone(this.onlineMatch.base);
          if (this.onlineMatch.bot) {
            // Report section 5 step 8: a computer rival clan's outpost (no player fitted your rank).
            const clan = rivalById(base.rival, c.data);
            base.practice = clan ? `${clan.name} outpost (computer rival)` : 'Generated rival (no player fitted your rank)';
          }
          const setup: BattleSetup = { seed: this.onlineMatch.battleSeed, base, ...loadout, infiltration: true };
          this.open(new BattleSession(setup, c.data, 'scout'));
          return;
        }
      } catch (e) {
        console.warn(i18nText("ui.online_match_failed_using_a_generated__31f6c1a8d1"), e);
      }
      if (conn.serverVillage) {
        this.d.hud.toast(i18nText("ui.could_not_reach_the_server_to_find_an__28c78674fa"), 'error');
        return;
      }
    }
    // Opponent strength and loot follow the player's trophies (see sim/matchmaking).
    const base = opponentFor(r.seed, c.state, c.data);
    // Offline, every rival is generated: say so instead of passing it off as a player. Report section 5 step 8:
    // generated bases are the outposts of named computer rival clans.
    const clan = rivalFor(r.seed, c.data);
    if (clan) {
      base.rival = clan.id;
      base.name = rivalOutpostName(clan, r.seed, c.data);
    }
    base.practice = clan ? `${clan.name} outpost (computer rival, offline)` : 'Generated rival (offline)';
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
      this.d.hud.toast(i18nText("ui.train_some_warriors_first_38d2ad4cb0"), 'error');
      return;
    }
    const base = trialBase(tier, c.data, trialVariant(c.state.trials, tier));
    const setup: BattleSetup = { seed: trialBattleSeed(c.state.seed, c.state.nextSeed, tier), base, ...battleLoadout(c.state, c.data), infiltration: true };
    this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, tier);
  }

  /**
   * A goal event's bounty fortress (sim/goalEvents.ts): a generated base, labelled as such; settled with
   * `bountyEnd` (ladder rewards, paid once each; no loot, no honor). Same pattern as a Shadow Trial.
   */
  bounty(eventKey: string, base: BaseLayout): void {
    const c = this.d.controller;
    if (!Object.values(battleArmy(c.state)).some((n) => n > 0)) {
      this.d.hud.toast(i18nText("ui.train_some_warriors_first_38d2ad4cb0"), 'error');
      return;
    }
    const b: BaseLayout = { ...base };
    delete b.trophies;
    const setup: BattleSetup = { seed: bountyBattleSeed(c.state.seed, c.state.nextSeed), base: b, ...battleLoadout(c.state, c.data), infiltration: true };
    this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, undefined, false, undefined, { kind: 'bounty', eventKey, title: i18nText("ui.generated_ladder_rewards_no_loot_or_ho_2a269c63a6", { arg1: base.practice ?? 'Bounty fortress' }) });
  }

  /** Settle the score with a simulated raider (sim/rematch.ts): its own base, once; settled with `rematchEnd`. */
  rematch(defenseId: string): void {
    const c = this.d.controller;
    const ok = rematchStatus(c.state, defenseId, c.now(), c.data);
    if (!ok.ok) {
      this.d.hud.toast(ok.message, 'error');
      return;
    }
    if (!Object.values(battleArmy(c.state)).some((n) => n > 0)) {
      this.d.hud.toast(i18nText("ui.train_some_warriors_first_38d2ad4cb0"), 'error');
      return;
    }
    const base = rematchBase(ok.record, c.data);
    if (!base) return;
    delete base.trophies;
    const setup: BattleSetup = { seed: rematchBattleSeed(c.state.seed, c.state.nextSeed), base, ...battleLoadout(c.state, c.data), infiltration: true };
    this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, undefined, false, undefined, { kind: 'rematch', defenseId, title: i18nText("ui.settle_the_score_simulated_raider_no_h_87da3498b9") });
  }

  /**
   * P3-07: the daily drill (sim/drill.ts): the next Trial fortress with a full camp of the village's own warriors,
   * labelled practice, nothing spent; settled with `drillEnd`, which pays once per local day.
   */
  drill(): void {
    const c = this.d.controller;
    const army = drillArmy(c.state, c.data);
    if (!Object.keys(army).length) {
      this.d.hud.toast(i18nText("ui.train_some_warriors_first_38d2ad4cb0"), 'error');
      return;
    }
    const tier = attemptTier(c.state.trials, hallLevel(c.state, c.data), c.data);
    const base: BaseLayout = { ...trialBase(tier, c.data, trialVariant(c.state.trials, tier)), practice: i18nText('drill.title') };
    const hero = battleLoadout(c.state, c.data).hero;
    const setup: BattleSetup = { seed: mixSeed(c.state.seed, 0xd2111 + c.state.nextSeed), base, army, levels: drillLevels(army, c.state), infiltration: true, ...(hero ? { hero } : {}) };
    this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, undefined, false, undefined, { kind: 'drill', title: i18nText('drill.title') });
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
   * P6-04: "Test my defenses": the simulated raider against the village as it is now, played as a replay. Device
   * only: no loot, no honor, no shield change, never stored; labelled as a test by a simulated raider.
   */
  testDefenses(): void {
    const c = this.d.controller;
    const record = testDefense(c.state, c.now(), mixSeed(c.state.seed, 0x7e57 + Math.floor(c.now() / 1000)), c.data);
    record.opponentName = i18nText('defense.testName', { name: record.opponentName });
    // Review M3: the replay header and tag say practice (nothing is taken), never "loot taken".
    this.open(new BattleSession(record.setup, c.data, 'replay', record), record, undefined, undefined, false, undefined, undefined, true);
  }

  /**
   * P6-04: from a defense in the log, practice with that raider's army against the village as it is now (labelled
   * practice; nothing spent or won). Moving a tower becomes an experiment with a result.
   */
  practiceAgainst(r: BattleRecord): void {
    const c = this.d.controller;
    const base = villageToBase(c.state, c.now(), c.data, i18nText('defense.yourVillage'));
    base.practice = 'Practice battle (nothing spent or won)';
    const setup: BattleSetup = { seed: mixSeed(c.state.seed, 0x5eed + Math.floor(c.now() / 1000)), base, army: { ...r.setup.army }, levels: { ...r.setup.levels }, ...(r.setup.hero ? { hero: { ...r.setup.hero } } : {}), ...(r.setup.reinforcements ? { reinforcements: structuredClone(r.setup.reinforcements) } : {}), infiltration: true };
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
      this.d.hud.toast(i18nText("ui.train_some_warriors_first_duels_use_yo_0415eb538a"), 'error');
      return;
    }
    try {
      const t = await this.d.connection.duelTicket({ friendId, ...opts });
      const base = structuredClone(t.base);
      base.practice = `Friendly duel with ${isolateName(t.opponent.name)} (nothing spent or won)`;
      const setup: BattleSetup = { seed: t.seed >>> 0, base, ...loadout, infiltration: true };
      this.open(new BattleSession(setup, c.data, 'scout'), undefined, undefined, undefined, true, { ticket: t.ticket, friendName: t.opponent.name || friendName });
    } catch (e) {
      this.d.hud.toast((e as Error).message, 'error');
    }
  }

  replay(record: BattleRecord): void {
    this.open(new BattleSession(record.setup, this.d.controller.data, 'replay', record), record);
  }

  /**
   * P6-07 (UIS-01): the result screen's next step. After a raid: Next while an army is still standing, and "Refill in
   * one tap" (the Army panel's command) when the last raid's army can be queued. After a Trial: the next tier when it
   * was cleared, or "Try a different fortress" when it failed and a switch is left. Existing labels only.
   */
  private nextActions(r: BattleResult, k: { trialTier?: number; practice: boolean; grove: boolean; duel: boolean; special: boolean; replay: boolean; online: boolean }): { label: string; primary?: boolean; onClick(): void }[] {
    const c = this.d.controller;
    const out: { label: string; primary?: boolean; onClick(): void }[] = [];
    if (k.practice || k.grove || k.duel || k.replay) return out;
    if (k.trialTier !== undefined) {
      const gd = c.data;
      const next = attemptTier(c.state.trials, hallLevel(c.state, gd), gd);
      if (r.stars >= gd.trials.starsToClear && next > k.trialTier) out.push({ label: i18nText("ui.scout_tier_8fde370df8", { arg1: next }), primary: true, onClick: () => { this.home(); this.trial(next); } });
      else if (canTryAlternate(c.state.trials, gd)) {
        out.push({
          label: i18nText("ui.try_a_different_fortress_d0b3ff0e49"),
          primary: true,
          onClick: () => {
            const res = c.dispatch({ type: 'trialAlternate' });
            this.home();
            if (res.ok) this.trial(attemptTier(c.state.trials, hallLevel(c.state, gd), gd));
            else this.d.hud.toast(res.message, 'error');
          },
        });
      }
      return out;
    }
    if (k.special) return out;
    const last = lastAttackArmy(c.state);
    if (last && Object.keys(last).length) {
      out.push({
        label: i18nText("ui.refill_in_one_tap_25afd91239"),
        onClick: () => {
          const res = c.dispatch({ type: 'trainArmy', army: last });
          this.home();
          if (!res.ok) this.d.hud.toast(res.message, 'error');
          else {
            const queued = res.events.reduce((sum, e) => sum + (e.kind === 'train_start' ? e.count ?? 1 : 0), 0);
            this.d.hud.toast(i18nText('army.queued', { n: queued }), 'success');
          }
        },
      });
    }
    if (Object.values(c.state.army).some((n) => n > 0)) out.push({ label: i18nText('battle.next'), primary: true, onClick: () => { this.home(); void this.scout(); } });
    // P6-17: with the camps empty, what needs no standing army (the drill, a Try battle) or what waits for the retrain.
    else for (const ch of this.d.hud.emptyCampChoices().slice(0, 2)) out.push({ label: ch.label, primary: ch.primary, onClick: () => { this.home(); ch.onClick(); } });
    return out;
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

  private open(
    session: BattleSession,
    replayOf?: BattleRecord,
    grove?: RaidBattle,
    trialTier?: number,
    practice = false,
    duel?: { ticket: string; friendName: string },
    special?: { kind: 'bounty'; eventKey: string; title: string } | { kind: 'rematch'; defenseId: string; title: string } | { kind: 'drill'; title: string },
    testRaid = false,
  ): void {
    const c = this.d.controller;
    this.battleHud?.destroy();
    this.session = session;
    let lastRecord: BattleRecord | null = null;
    const before = snapProgress(c.state, c.data);
    this.battleHud = new BattleHud({
      root: this.d.battleRoot,
      session,
      myTrophies: c.state.trophies,
      // The tutorial bubble hides in battle: the first raid gets a one-line coach instead (re-audit design item 3).
      coach: !replayOf && !c.state.tutorial.done,
      replayOf: replayOf ? { kind: replayOf.kind, opponentName: replayOf.opponentName, ...(testRaid ? { test: true } : {}) } : undefined,
      grove: grove ? { enemyName: grove.enemyName, ...(grove.channel === 'gangwar' ? { title: grove.setup.startDamage ? i18nText("ui.gang_war_relay_9376500e38") : i18nText("ui.gang_war_d4e65acc95") } : {}) } : undefined,
      practice,
      special: special ? { title: special.title } : undefined,
      // Declared stakes: raids only, offline or on a server that settles them (protocol 11).
      stakes: !replayOf && !grove && !duel && trialTier === undefined && !practice && !special && (!this.ticket || this.d.connection.canStakes),
      // P6-13 (UIS-07): what this army would carry, shown at scouting when it is under 100%.
      carryShare: !replayOf && !grove && !duel && trialTier === undefined && !practice && !special ? diversityShare(armyDiversity(session.setup.army, session.setup, c.data), c.data, trainableRoles(c.state, c.data)) : undefined,
      trial:
        trialTier !== undefined
          ? (() => {
              const info = trialInfo(trialTier, c.data, trialVariant(c.state.trials, trialTier));
              // P3-06: a first clear may be the catch-up tier, which pays the skipped tiers too.
              const firstClear = trialTier > c.state.trials.best;
              return { tier: trialTier, layout: info.layout.name, modifiers: info.modifiers.map((m) => m.name), reward: firstClear ? trialRewardsThrough(c.state.trials.best, trialTier, c.data) : trialReward(trialTier, c.data), firstClear, starsToClear: c.data.trials.starsToClear };
            })()
          : undefined,
      troopThumb: this.d.troopThumb,
      scoutFee: scoutFee(c.state, c.data),
      // P3-11: the loot on offer against the room left in storage (raids only).
      lootWontFit: !replayOf && !grove && !duel && trialTier === undefined && !practice && !special
        ? (base: BaseLayout) => {
            const offer = totalLoot(base);
            const cap = capacity(c.state, c.data);
            return (['acorns', 'dew'] as const).some((k) => (offer[k] ?? 0) > Math.max(0, cap[k] - c.state.resources[k]));
          }
        : undefined,
      // P3-12: a raid ends a running shield (not the village's first: sim/shield.ts).
      shieldLeftMs: !replayOf && !grove && !duel && trialTier === undefined && !practice && !special && shieldAfterAttack(c.state.shieldUntil, c.now(), hasAttacked(c.state), c.data) < c.state.shieldUntil ? c.state.shieldUntil - c.now() : undefined,
      canPayFee: () => c.state.resources.acorns >= scoutFee(c.state, c.data),
      onHome: () => this.home(),
      onNext: () => this.scout(true),
      // P6-16: the scout screen with no army leads to the Army panel.
      onTrain: () => {
        this.home();
        this.d.hud.openShortcut('army');
      },
      onAttack: async () => {
        // An online raid counts from here (re-audit): the server settles it as a loss if it is never
        // reported, and only now sends the battle seed (ledger audit A1). No seed, no battle.
        if (!grove && !duel && trialTier === undefined && !practice && this.ticket) {
          try {
            const seed = await this.d.connection.startAttack(this.ticket, session.stake);
            if (seed !== undefined) session.reseed(seed);
          } catch (e) {
            this.battleHud?.toast((e as Error).message);
            return false;
          }
        }
        session.start();
        return true;
      },
      onFinished: () => {
        const out = finish();
        // P6-07 (UIS-01): what this battle moved (raids, Trials, bounties and rematches; practice and duels move nothing).
        if (out && !practice && !grove) out.progress = progressLines(before, snapProgress(c.state, c.data), c.state, localizedData(c.data));
        return out;
      },
      nextActions: (r) => this.nextActions(r, { trialTier, practice, grove: Boolean(grove), duel: Boolean(duel), special: Boolean(special), replay: Boolean(replayOf), online: Boolean(this.ticket) }),
      onReplay: () => {
        if (lastRecord) this.replay(lastRecord);
      },
    });
    const finish = (): ReturnType<ConstructorParameters<typeof BattleHud>[0]['onFinished']> => {
      {
        if (practice) {
          // Never banked: a record only for "Watch replay".
          const result = session.result();
          lastRecord = { id: 'practice', kind: 'attack', at: c.now(), opponentName: session.setup.base.name, setup: session.setup, deployments: session.deployments, endTick: session.endTick, result, rules: SIM_RULES };
          if (duel) {
            const sub = { ticket: duel.ticket, seed: session.setup.seed, army: session.setup.army, levels: session.setup.levels, reinforcements: session.setup.reinforcements, ...(session.setup.hero ? { hero: session.setup.hero } : {}), deployments: session.deployments, endTick: session.endTick, clientHash: result.hash, rules: SIM_RULES };
            void this.d.connection.reportDuel(sub).then(
              (r) => this.d.hud.toast(i18nText("ui.duel_recorded_against_win_in_duel_ad5ab60385", { arg1: isolateName(duel.friendName), arg2: r.rivalry.wins, arg4: r.rivalry.duels }), 'success'),
              (e: Error) => this.d.hud.toast(i18nText("ui.the_duel_could_not_be_recorded_2b8c3995b6", { arg1: e.message }), 'error'),
            );
            return { result, banked: {}, trophies: 0, note: `Friendly duel with ${isolateName(duel.friendName)}: no warriors were spent and nothing was won.` };
          }
          return { result, banked: {}, trophies: 0, note: 'Practice battle: no warriors were spent and nothing was won.' };
        }
        if (grove) {
          const g = grove.finish(session.deployments, session.endTick);
          if (!g) return null;
          // Kept in the battle log, so "Watch replay" works after an Alliance War attack too.
          lastRecord = g.record;
          return { result: g.record.result, banked: {}, trophies: 0 };
        }
        if (special?.kind === 'drill') {
          const record = { at: startedAt, opponentName: session.setup.base.name, setup: session.setup, deployments: session.deployments, endTick: session.endTick };
          const r = c.dispatch({ type: 'drillEnd', record });
          if (!r.ok) {
            this.d.hud.toast(r.message, 'error');
            return null;
          }
          const e = r.events.find((x) => x.kind === 'drill_end');
          if (!e || e.kind !== 'drill_end') return null;
          lastRecord = e.record;
          return { result: e.record.result, banked: e.reward, overflow: e.overflow, trophies: 0, note: e.paid ? i18nText('drill.paid') : i18nText('drill.doneToday') };
        }
        if (special) {
          // Bounty fortress or settle-the-score: settled by the sim (rewards paid once, no loot or honor).
          const record = { at: startedAt, opponentName: session.setup.base.name, setup: session.setup, deployments: session.deployments, endTick: session.endTick };
          const r = special.kind === 'bounty' ? c.dispatch({ type: 'bountyEnd', eventKey: special.eventKey, record }) : c.dispatch({ type: 'rematchEnd', defenseId: special.defenseId, record });
          if (!r.ok) {
            this.d.hud.toast(r.message, 'error');
            return null;
          }
          const e = r.events.find((x) => x.kind === 'bounty_end' || x.kind === 'rematch_end');
          if (!e || (e.kind !== 'bounty_end' && e.kind !== 'rematch_end')) return null;
          lastRecord = e.record;
          const paid = Object.values(e.reward).some((v) => (v ?? 0) > 0);
          const note =
            e.kind === 'bounty_end'
              ? e.steps.length
                ? i18nText("ui.new_bounty_step_reached_the_reward_is__7c76ffd3be")
                : i18nText("ui.no_new_bounty_step_this_time_your_best_fad89cfb94")
              : e.won
                ? i18nText("ui.score_settled_372ee4649e")
                : i18nText("ui.the_raider_held_this_rematch_is_used_u_c9e33e0fd9");
          // P5-01: a festival's three-star step also gives its look.
          const looks = e.kind === 'bounty_end' ? (e.looks ?? []).map((id) => localizedData(c.data).cosmetics.hallSkins.find((k) => k.id === id)?.name ?? id) : [];
          const withLooks = looks.length ? `${note} ${i18nText('events.lookEarned', { name: i18nList(looks) })}` : note;
          return { result: e.record.result, banked: paid ? e.reward : {}, overflow: e.overflow, trophies: 0, note: withLooks };
        }
        if (trialTier !== undefined) {
          const t = c.finishTrial(trialTier, session.setup, session.deployments, session.endTick);
          if (!t) return null;
          lastRecord = t.record;
          const note = t.firstClear
            ? i18nText("ui.shadow_trial_cleared_trial_is_open_e3b0d0cafa", { arg1: trialTier, arg2: trialTier + 1 }) + (t.skipped ? ` ${i18nText('trials.caughtUp', { from: t.skipped[0], to: t.skipped[1] })}` : '')
            : t.cleared
              ? i18nText("ui.cleared_again_the_reward_for_this_tier_1b8920c6c4")
              : i18nText("ui.not_cleared_you_need_stars_27ca57d98e", { arg1: c.data.trials.starsToClear });
          // P5-06: a Trial milestone's look.
          const trialLooks = (t.looks ?? []).map((id) => localizedData(c.data).cosmetics.hallSkins.find((k) => k.id === id)?.name ?? id);
          const withLooks = trialLooks.length ? `${note} ${i18nText('events.lookEarned', { name: i18nList(trialLooks) })}` : note;
          // P5-07: a tier's first clear pays mastery experience.
          return { result: t.record.result, banked: t.reward, overflow: t.record.overflow, trophies: 0, note: t.record.masteryXp ? `${withLooks} ${i18nText('mastery.gained', { xp: t.record.masteryXp })}` : withLooks };
        }
        const ticket = this.ticket ?? undefined;
        // Online: recorded as pending; loot and honor arrive with the server's confirmation.
        const out = c.finishBattle(session.setup, session.deployments, session.endTick, session.setup.base.name, ticket, undefined, session.stake);
        if (!out) return null;
        if (ticket) {
          // The server re-runs the battle from seed + deployments; the outbox
          // keeps the report until it gets through.
          this.ticket = null;
          this.onlineMatch = null;
          void this.d.connection.report('attack', { ticket, seed: session.setup.seed, army: session.setup.army, levels: session.setup.levels, reinforcements: session.setup.reinforcements, ...(session.setup.hero ? { hero: session.setup.hero } : {}), deployments: session.deployments, endTick: session.endTick, clientHash: out.record.result.hash, rules: SIM_RULES });
        }
        lastRecord = out.record;
        // P2-15: the share the raid carries comes from the sim (the record's `carry`; pending: what it will settle with).
        if (out.record.settlement === 'pending') return { result: out.record.result, banked: {}, trophies: 0, pending: true, diversity: diversityShare(armyDiversity(out.record.result.used, session.setup, c.data), c.data, trainableRoles(c.state, c.data)) };
        // P5-03: the daily contract the raid met (its multiplier is taken out of the diversity share shown).
        const met = contractById(out.record.contract, c.data);
        const metMult = met ? contractMultiplier(met, out.record.result, out.record.setup, out.record.stake, c.data, trainableRoles(c.state, c.data)) : 1;
        return { result: out.record.result, banked: out.banked, overflow: out.record.overflow, trophies: out.record.trophies ?? 0, bonus: out.record.leagueBonus, eventBonus: out.record.eventBonus, stake: out.record.stake, diversity: diversityPartOf(out.record.carry, out.record.stake, out.record.result.stars, c.data, metMult), contract: met ? localizedData(c.data).raids.contracts!.list.find((x) => x.id === met.id)!.name : undefined, ...(out.record.masteryXp ? { note: i18nText('mastery.gained', { xp: out.record.masteryXp }) } : {}) };
      }
    };
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
        // A drill spends nothing, so an interrupted one is simply not counted (never tracked as a pending battle).
        if (session.mode !== 'live' || replayOf || practice || special?.kind === 'drill') return;
        const track = () => {
          trackTimer = 0;
          lastTrack = Date.now();
          if (session.sim.ended && !c.state.pendingBattle) return;
          const kind = special ? special.kind : grove ? 'war' : trialTier !== undefined ? 'trial' : 'raid';
          c.trackBattle({
            kind,
            tier: trialTier,
            target: grove?.target,
            opponentName: session.setup.base.name,
            setup: session.setup,
            deployments: session.deployments,
            ticket,
            at: startedAt,
            rules: SIM_RULES,
            ...(session.stake !== undefined ? { stake: session.stake } : {}),
            ...(grove?.channel ? { channel: grove.channel } : {}),
            ...(special?.kind === 'bounty' ? { eventKey: special.eventKey } : special?.kind === 'rematch' ? { defenseId: special.defenseId } : {}),
          });
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

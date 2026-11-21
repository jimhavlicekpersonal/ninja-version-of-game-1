/**
 * Attacks on server-owned villages (roadmap step 22, and the donation half of
 * step 23): the attacker's real troops are spent and the loot banked in the
 * same transaction as the result, the defender loses what was taken, the
 * ledger records it, and a game applying the same results keeps the same
 * economy hash.
 */
import { describe, expect, it } from 'vitest';
import { ServerError } from '../../../src/backend/net/ports';
import type { BattleRecord } from '../../../src/gameplay/sim/battle/types';
import { deserialize } from '../../../src/gameplay/sim/save';
import { mixSeed } from '../../../src/gameplay/sim/rng';
import type { GameData, VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, type Command } from '../../../src/gameplay/sim/village';
import { emulator, placeCollector, placeType } from './economyHarness';
import { baseAt, rush, world, startSeed } from './harness';
import { repoFactories } from './pg';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServerError) return e.code;
    throw e;
  }
  return 'ok';
}

/** What the game does with a server result (connection.ts dispatches the same commands). */
function applyLocal(s: VillageState, cmd: Command, at: number, data: GameData): VillageState {
  const r = applyCommand(s, cmd, at, data);
  expect(r).toMatchObject({ ok: true });
  return r.ok ? r.state : s;
}

const total = (c: Record<string, number | undefined>) => Object.values(c).reduce<number>((s, v) => s + (v ?? 0), 0);

for (const [label, makeRepo] of repoFactories) {
  describe(`attacks with server-held villages on ${label} storage`, () => {
    /** Ann trains 10 Shinobi on the server; Dot builds collectors and lets loot pile up. */
    async function scene(shared?: NonNullable<Parameters<typeof world>[0]>['shared']) {
      const w = world({ repo: await makeRepo(), shared });
      const ann = await w.player('Ann');
      const dot = await w.player('Dot');
      const annGame = emulator((await ann.startVillage()).file, w.data);
      const dotGame = emulator((await dot.startVillage()).file, w.data);
      placeType(annGame, w.data, 'burrow_barracks', w.now());
      placeType(annGame, w.data, 'army_camp', w.now());
      placeCollector(dotGame, w.data, w.now(), 'acorns');
      placeCollector(dotGame, w.data, w.now(), 'dew');
      w.advance(60_000);
      expect(annGame.do({ type: 'train', troop: 'hedgehog_roller', count: 10 }, w.now())).toMatchObject({ ok: true });
      expect((await ann.sendCommands(annGame.batch())).corrections).toBeUndefined();
      expect((await dot.sendCommands(dotGame.batch())).corrections).toBeUndefined();
      w.pastShields(); // also long enough for the training to finish and loot to pile up
      // The game scouts before it asks for an opponent (ledger audit A1/E15: a new opponent needs a new scout).
      expect(annGame.do({ type: 'scout', paid: false }, w.now())).toMatchObject({ ok: true });
      expect((await ann.sendCommands(annGame.batch())).corrections).toBeUndefined();
      return { w, ann, dot, annGame, dotGame };
    }

    it('Beast Mode GT-17: one attacker takes at most the pair\'s daily share of a server village\'s loot', async () => {
      // Share 0: nothing at all may move from Dot to Ann today; the raid still scores and spends Ann's warriors.
      const { w, ann } = await scene({ policy: { pairDailyLootShare: 0 } });
      const m = (await ann.match())!;
      expect(m.opponent).toMatchObject({ name: 'Dot', kind: 'player' });
      const seed = await startSeed(ann, m.ticket);
      const r = await ann.submitAttack({ ticket: m.ticket, seed, ...rush(10) });
      expect(r.result.destruction).toBeGreaterThan(0);
      expect(total(r.result.loot)).toBe(0);
      expect((await ann.ledger(20)).entries.filter((l) => l.reason === 'attack:loot' && l.delta > 0)).toEqual([]);
      void w;
    });

    it('spends the attacker’s server-held troops and banks the loot in one transaction; the defender loses it; both games agree', async () => {
      const { w, ann, dot, annGame, dotGame } = await scene();
      const m = (await ann.match())!;
      expect(m.opponent).toMatchObject({ name: 'Dot', kind: 'player' });
      const { army, deployments } = rush(10);
      const at = w.now();
      const seed = await startSeed(ann, m.ticket);
      const r = await ann.submitAttack({ ticket: m.ticket, seed, army, deployments });
      // The warriors who fought are gone from the server's army.
      const annAfter = deserialize((await ann.getVillage())!.file, w.data);
      expect(annAfter.army.hedgehog_roller ?? 0).toBe(10 - (r.result.used.hedgehog_roller ?? 0));
      // The loot went in, with its ledger line (from a village the server holds, so plain 'attack:loot').
      const loot = total(r.result.loot);
      expect(loot).toBeGreaterThan(0);
      const lootLines = (await ann.ledger(20)).entries.filter((l) => l.reason === 'attack:loot');
      expect(lootLines.reduce((s, l) => s + l.delta, 0)).toBeGreaterThan(0);
      // The defender's server village took the raid (losses, honor, shield, the record).
      const dotAfter = deserialize((await dot.getVillage())!.file, w.data);
      expect(dotAfter.defenseLog.map((d) => d.id)).toEqual([r.attackId]);
      // The games apply the same results the way connection.ts does, and land on the server's economy.
      annGame.state = applyLocal(annGame.state, { type: 'battleEnd', record: { at, opponentName: 'Dot', setup: { seed, base: m.base, army, levels: {}, infiltration: true }, deployments, ticket: m.ticket } }, at, w.data);
      annGame.state = applyLocal(annGame.state, { type: 'settleOnlineAttack', ticket: m.ticket, result: r.result, trophies: r.trophies, playerTrophies: r.playerTrophies }, at, w.data);
      expect((await ann.sendCommands(annGame.batch())).corrections).toBeUndefined();
      const d = (await dot.defenses(0)).defenses[0];
      const record: BattleRecord = { id: d.id, at: d.at, kind: 'defense', opponentName: d.attackerName, setup: { seed: d.seed, base: d.base, army: d.army, levels: d.levels, infiltration: true }, deployments: d.deployments, endTick: d.endTick, result: d.result, trophies: d.trophies };
      const me = await dot.me();
      dotGame.state = applyLocal(dotGame.state, { type: 'applyDefense', record, lost: d.result.loot, trophies: me.trophies, shieldUntil: me.shieldUntil }, at, w.data);
      expect((await dot.sendCommands(dotGame.batch())).corrections).toBeUndefined();
    });

    it('refuses an attack with troops the server-held village does not have, and changes nothing', async () => {
      const { ann } = await scene();
      const m = (await ann.match())!;
      const before = await ann.getVillage();
      const lines = (await ann.ledger(50)).entries.length;
      // Legal for the Keep (the camp holds 20), but only 10 were trained.
      expect(await code(ann.submitAttack({ ticket: m.ticket, seed: await startSeed(ann, m.ticket), ...rush(20) }))).toBe('bad_request');
      expect(await ann.getVillage()).toEqual(before);
      expect((await ann.ledger(50)).entries).toHaveLength(lines);
      // The ticket was not used up: the attack with the real army still goes through.
      const ok = await ann.submitAttack({ ticket: m.ticket, seed: await startSeed(ann, m.ticket), ...rush(10) });
      expect(ok.result.used.hedgehog_roller).toBeGreaterThan(0);
    });

    it('settles a started no-warrior report as a loss', async () => {
      const { w, ann } = await scene();
      await w.repo.updatePlayer(ann.id, { trophies: 500 });
      const m = await ann.match();
      const seed = await startSeed(ann, m.ticket);
      await expect(ann.submitAttack({ ticket: m.ticket, seed, army: {}, deployments: [] })).rejects.toBeTruthy();
      const after = (await w.repo.getPlayer(ann.id))!;
      expect(after.trophies).toBeLessThan(500);
      expect((await w.repo.getTicket(m.ticket))?.used).toBe(true);
    });

    it('replaces client chest entropy on server-held villages', async () => {
      const { w, ann } = await scene();
      const before = deserialize((await ann.getVillage())!.file, w.data).daily.salt ?? 0;
      const game = emulator((await ann.getVillage())!.file, w.data);
      const local = game.do({ type: 'openDailyChest', entropy: 7 }, w.now());
      expect(local.ok).toBe(true);
      // Its own device numbering, so the chest is not skipped as already applied (the scene's batches used 1-4).
      const batch = { ...game.batch(), device: 'chest-device' };
      const reply = await ann.sendCommands(batch);
      const after = deserialize((await ann.getVillage())!.file, w.data).daily.salt ?? 0;
      expect(after).not.toBe(before);
      expect(after).not.toBe(mixSeed(before, 7));
      // The chest itself drew from the old salt on both sides, so the economies agree: no correction. Before
      // 2026-11-18 this test expected one, because its batch reused numbers 1-4 and nothing was applied at all.
      expect(reply.corrections).toBeUndefined();
      // P1-16: the answer carries the salt the server rolled, so the game's next chest is the server's.
      expect(reply.results[0]).toMatchObject({ ok: true, chestSalt: after });
      // The command log keeps the entropy the server replayed, not the game's 7.
      const logged = (await w.repo.commandsOf(ann.id, 0, 10)).find((l) => l.type === 'openDailyChest');
      expect((logged?.command as { entropy?: number }).entropy).not.toBe(7);
    });

    it('gives donated troops from the donor’s server-held army (step 23)', async () => {
      const { w, ann } = await scene();
      const cat = await w.player('Cat', baseAt(3));
      const g = await cat.createGrove('Moss');
      await ann.joinGrove(g.id);
      const req = await cat.requestTroops(10);
      await ann.donate(req.id, { troop: 'hedgehog_roller', count: 2, level: 1 });
      expect(deserialize((await ann.getVillage())!.file, w.data).army.hedgehog_roller).toBe(8);
      // More than the server-held army has: refused, and the request keeps its room.
      const req2 = await w.player('Eve', baseAt(3)).then(async (eve) => {
        await eve.joinGrove(g.id);
        return eve.requestTroops(10);
      });
      expect(await code(ann.donate(req2.id, { troop: 'hedgehog_roller', count: 9, level: 1 }))).toBe('bad_request');
      expect((await cat.requests()).requests.find((r) => r.id === req2.id)!.filled).toBe(0);
    });
  });
}

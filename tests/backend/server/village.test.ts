/**
 * Server-owned villages (roadmap Phase 2): the command endpoint (step 20) on
 * every storage adapter. A small emulator plays the game's part: it applies
 * each command locally (as the game does), queues it, and sends the batch
 * with its own economy hash.
 */
import { describe, expect, it } from 'vitest';
import { ServerError } from '../../../src/backend/net/ports';
import { economyHash, withEconomy } from '../../../src/gameplay/sim/serverEconomy';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { HOUR, baseAt, world } from './harness';
import { collectors, emulator, placeCollector } from './economyHarness';
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

for (const [label, makeRepo] of repoFactories) {
  describe(`server-owned village on ${label} storage`, () => {
    const W = async () => world({ repo: await makeRepo() });

    it('starts a village on the server once, and replays commands to the same economy as the game', async () => {
      const w = await W();
      const ann = await w.player('Ann');
      expect(await ann.getVillage()).toBeNull();
      const v = await ann.startVillage();
      expect(await ann.startVillage()).toEqual(v); // safe to repeat
      expect(await ann.getVillage()).toEqual(v);
      expect(v).toMatchObject({ revision: 2, seq: 0 });
      const game = emulator(v.file, w.data);
      expect(economyHash(game.state)).toBe(v.stateHash);
      placeCollector(game, w.data, w.now(), 'acorns');
      placeCollector(game, w.data, w.now(), 'dew');
      w.advance(6 * HOUR);
      for (const b of collectors(game.state, w.data)) expect(game.do({ type: 'collect', id: b.id }, w.now())).toMatchObject({ ok: true });
      w.advance(60_000);
      const upgraded = game.state.buildings.find((b) => game.do({ type: 'upgrade', id: b.id }, w.now()).ok);
      expect(upgraded).toBeTruthy();
      const batch = game.batch();
      const r = await ann.sendCommands(batch);
      expect(r.corrections).toBeUndefined(); // same simulation, same times: same economy
      expect(r.stateHash).toBe(economyHash(game.state));
      expect(r.ackSeq).toBe(batch.commands.length);
      expect(r.results.every((x) => x.ok)).toBe(true);
      // A retried batch (the answer was lost) changes nothing.
      const again = await ann.sendCommands(batch);
      expect(again).toMatchObject({ ackSeq: r.ackSeq, revision: r.revision, results: [] });
      // Every resource change is in the ledger, newest first, with the balance after it.
      const led = (await ann.ledger(50)).entries;
      expect(led.some((l) => l.reason === 'command:collect' && l.delta > 0)).toBe(true);
      expect(led.some((l) => l.reason === 'command:upgrade' && l.delta < 0)).toBe(true);
      expect(led.at(-1)!.reason).toBe('start');
    });

    it('refuses server-only commands and battles over the cap, and corrects a game whose clock ran ahead', async () => {
      const w = await W();
      const ann = await w.player('Ann');
      const game = emulator((await ann.startVillage()).file, w.data);
      // Results only the server makes are never accepted from the game.
      game.raw({ type: 'syncRank', trophies: 9999 }, w.now());
      game.raw({ type: 'claimRaidChest', week: 1, outcome: 'win', ours: 3, theirs: 0 }, w.now());
      const refused = await ann.sendCommands(game.batch());
      expect(refused.results.map((x) => x.error)).toEqual(['NOT_ALLOWED', 'NOT_ALLOWED']);
      expect(refused.corrections).toBeUndefined(); // nothing changed on either side
      // At most three battle replays per batch.
      const bogus = { at: w.now(), opponentName: 'x', setup: { seed: 1, base: baseAt(1), army: { hedgehog_roller: 999 } }, deployments: [] };
      for (let i = 0; i < 4; i++) game.raw({ type: 'abandonBattle', record: bogus }, w.now());
      expect((await ann.sendCommands(game.batch())).results.map((x) => x.error ?? 'ok')).toEqual(['ok', 'ok', 'ok', 'TOO_MANY_BATTLES']);
      // A command dated 10 hours ahead counts at the server's time: the game collected more than it really could.
      placeCollector(game, w.data, w.now(), 'acorns');
      expect((await ann.sendCommands(game.batch())).corrections).toBeUndefined();
      w.advance(6 * HOUR);
      const [farm] = collectors(game.state, w.data);
      game.do({ type: 'collect', id: farm.id }, w.now() + 10 * HOUR);
      const r = await ann.sendCommands(game.batch());
      expect(r.results).toEqual([{ seq: 8, ok: true }]);
      expect(r.corrections).toBeTruthy();
      // The game emptied its collector "10 hours from now"; the server emptied it now.
      const accrue = (bs: VillageState['buildings']) => bs.find((b) => b.id === farm.id)!.collector!.accrueFrom;
      expect(accrue(game.state.buildings)).toBe(w.now() + 10 * HOUR);
      expect(accrue(r.corrections!.economy.buildings)).toBe(w.now());
      // The game puts the server's economy in place; then the two agree again.
      game.state = withEconomy(game.state, r.corrections!.economy);
      expect(economyHash(game.state)).toBe(r.stateHash);
    });

    it('takes the raid base from the village it holds, never from an upload', async () => {
      const w = await W();
      const ann = await w.player('Ann');
      await ann.startVillage();
      const before = (await w.repo.getPlayer(ann.id))!;
      expect(before.base).toBeTruthy();
      await ann.uploadBase({ base: baseAt(3) });
      expect((await w.repo.getPlayer(ann.id))!.hallLevel).toBe(before.hallLevel);
      expect((await w.repo.getPlayer(ann.id))!.base!.buildings.length).toBe(before.base!.buildings.length);
    });

    it('needs a village on the server and a well-formed batch', async () => {
      const w = await W();
      const ann = await w.player('Ann');
      expect(await code(ann.sendCommands({ stateHash: 'x', commands: [] }))).toBe('no_village');
      await ann.startVillage();
      expect(await code(ann.sendCommands({ stateHash: 'x', commands: 'nope' as never }))).toBe('bad_request');
      expect(await code(ann.sendCommands({ stateHash: 'x', commands: [{ seq: 0, t: 1, command: { type: 'collect', id: 'b1' } }] }))).toBe('bad_request');
      expect(await code(ann.sendCommands({ stateHash: 'x', commands: Array.from({ length: 201 }, (_, i) => ({ seq: i + 1, t: 1, command: { type: 'collect' as const, id: 'b1' } })) }))).toBe('bad_request');
    });
  });
}

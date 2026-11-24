/**
 * Security fixes 2026-11-24, SECR-03: duel reports follow the same limits as every other battle report. A refused
 * duel report did not count against its ticket (no `burnAfterFailures`), so one ticket could be re-simulated for
 * ever; and a server-held village's warriors were not checked before re-simulating (`requireArmyOnServer`).
 */
import { describe, expect, it } from 'vitest';
import { MAX_TICKET_FAILURES } from '../../../server/core/pvp';
import { InlineResimulator } from '../../../server/resim/resim';
import { ServerError } from '../../../src/backend/net/ports';
import { baseAt, rush, world } from './harness';
import { repoFactories } from './pg';

async function refusal(p: Promise<unknown>): Promise<ServerError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServerError) return e;
    throw e;
  }
  throw new Error('expected a refusal');
}
const keyOf = (e: ServerError) => e.parts?.[0]?.key;

for (const [label, makeRepo] of repoFactories) {
  describe(`SECR-03 duel reports on ${label} storage`, () => {
    const scene = async () => {
      let runs = 0;
      const inner = new InlineResimulator();
      const counting = { run: async (...args: Parameters<InlineResimulator['run']>) => { runs++; return inner.run(...args); } };
      const w = world({ repo: await makeRepo(), shared: { resim: counting as never } });
      const ann = await w.player('Ann Swift', baseAt(3, 3, 400));
      const bo = await w.player('Bo Quietstep', baseAt(3, 5, 400));
      await ann.sendFriendRequest({ playerId: bo.id });
      await bo.sendFriendRequest({ playerId: ann.id });
      return { w, ann, bo, runs: () => runs };
    };

    it(`a ticket takes no more reports after ${MAX_TICKET_FAILURES} refused ones`, { timeout: 30_000 }, async () => {
      const { ann, bo, runs } = await scene();
      const t = await ann.duelTicket({ friendId: bo.id });
      const { army } = rush(20);
      // A malformed deployment: refused by `resimulate` (400 army.bad), which must count against the ticket.
      const bad = { ticket: t.ticket, seed: t.seed, army, deployments: [null] } as never;
      for (let i = 0; i < MAX_TICKET_FAILURES; i++) expect((await refusal(ann.reportDuel(bad))).status).toBeLessThan(500);
      const after = runs();
      const last = await refusal(ann.reportDuel(bad));
      expect(last.status).toBe(409);
      expect(keyOf(last)).toMatch(/battle\.already_reported$/);
      // Not re-simulated again.
      expect(runs()).toBe(after);
      expect(runs()).toBeLessThanOrEqual(MAX_TICKET_FAILURES);
    });

    it('a server-held village reporting warriors it lacks is refused before re-simulating', { timeout: 30_000 }, async () => {
      const { ann, bo, runs } = await scene();
      await ann.startVillage(); // a server-held village with no warriors
      const t = await ann.duelTicket({ friendId: bo.id });
      const { army, deployments } = rush(20);
      const e = await refusal(ann.reportDuel({ ticket: t.ticket, seed: t.seed, army, deployments }));
      expect(e.status).toBe(400);
      expect(keyOf(e)).toMatch(/pvp\.fewer_troops$/);
      expect(runs()).toBe(0);
    });
  });
}

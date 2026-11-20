// @vitest-environment happy-dom
/**
 * P6-18: the Codex page of rules a player could not read: numbers from data, counter pairs only for live buildings and
 * only those confirmed in battle (data/codex.json), never a planned building.
 */
import { describe, expect, it } from 'vitest';
import codex from '../../../src/gameplay/data/codex.json';
import { BUILDINGS } from '../../../src/gameplay/sim/progression';
import { openCodex } from '../../../src/presentation/ui/codexUi';
import { buildHud } from './harness';

describe('the Codex rules page (P6-18)', () => {
  it('reads its numbers from data and states only confirmed, live counters', async () => {
    const { hud, controller } = await buildHud();
    openCodex({ c: controller, warriorIcon: () => null, modal: (...a) => (hud as unknown as { modal: (...x: unknown[]) => () => void }).modal(...a) });
    (document.querySelector('[data-id="codex-rules-toggle"]') as HTMLButtonElement).click();
    const page = document.querySelector('[data-id="codex-rules"]')!;
    const d = controller.data;
    expect(page.textContent).toContain(`last ${d.battle.temper!.offers.recentRaids} raids`);
    expect(page.textContent).toContain(`${d.raids.exhaustion!.windowHours} hours`);
    for (const [type, troops] of Object.entries(codex.confirmedCounters)) {
      expect(BUILDINGS.find((b) => b.id === type)?.live).toBe(true);
      for (const t of troops) expect(page.textContent).toContain(d.troops[t].name);
    }
    for (const b of BUILDINGS.filter((x) => !x.live)) expect(page.textContent).not.toContain(b.name);
    for (const clan of d.names.rivalClans ?? []) expect(page.textContent).toContain(clan.name);
  });
});

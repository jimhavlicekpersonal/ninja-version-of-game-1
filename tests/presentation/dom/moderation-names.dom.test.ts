// @vitest-environment happy-dom
/**
 * UX-N2: player names in the Alliance moderation surfaces are isolated (FSI … PDI, or <bdi>), as Friends and Gangs
 * already do, so a right-to-left name cannot reorder the sentence around it ("Report or block אבג", "Also block אבג",
 * the report dialog's title and prompt).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GroveSnapshot } from '../../../src/backend/social/groveSource';
import type { GroveUi } from '../../../src/presentation/ui/groveUi';
import { buildHud } from './harness';

const NAME = 'אבג';
const ISOLATED = `⁨${NAME}⁩`;

async function openAlliance(tab: 'chat' | 'members') {
  const { hud } = await buildHud();
  const deps = (hud as unknown as { deps: { groveSource: { snapshot(): GroveSnapshot } } }).deps;
  const local = deps.groveSource.snapshot.bind(deps.groveSource);
  deps.groveSource.snapshot = () => {
    const s = local();
    return {
      ...s,
      kind: 'online',
      joined: true,
      moderation: true,
      members: [{ id: 'p-rtl', name: NAME, role: 'Member', hall: 3, trophies: 120, online: true, you: false, blocked: false }],
      chat: [{ id: 'm1', who: NAME, fromId: 'p-rtl', mine: false, text: 'hello', at: 0, kind: 'chat' }],
    };
  };
  const grove = await (hud as unknown as { grove(): Promise<GroveUi | null> }).grove();
  grove!.open(tab);
  return hud;
}

const reportDialog = () => [...document.querySelectorAll<HTMLElement>('.modal-backdrop')].find((b) => b.querySelector('.report-form'))!;

describe('Alliance moderation isolates names (UX-N2)', () => {
  it('member row: the ⋯ label, the report title, its prompt and "also block"', async () => {
    await openAlliance('members');
    const more = document.querySelector<HTMLButtonElement>('.chat-more')!;
    expect(more.getAttribute('aria-label')).toContain(ISOLATED);
    more.click();
    const dlg = reportDialog();
    expect(dlg.querySelector('.modal-head h2')!.textContent).toContain(ISOLATED);
    expect(dlg.querySelector('.report-form p')!.textContent).toContain(ISOLATED);
    expect(dlg.querySelector('.report-block')!.textContent).toContain(ISOLATED);
  });

  it('chat message: the ⋯ label, and the quoted author in <bdi>', async () => {
    await openAlliance('chat');
    const more = document.querySelector<HTMLButtonElement>('.chat-more')!;
    expect(more.getAttribute('aria-label')).toContain(ISOLATED);
    more.click();
    const dlg = reportDialog();
    expect(dlg.querySelector('.report-quote bdi')?.textContent).toBe(NAME);
    expect(dlg.querySelector('.report-block')!.textContent).toContain(ISOLATED);
  });

  it('the battle log\'s "Settle the score" title isolates the raider\'s name', () => {
    const src = readFileSync('src/presentation/ui/hud.ts', 'utf8');
    expect(src).toContain('"ui.attack_s_own_base_a_simulated_raider_n_0be62cf5a4", { arg1: isolateName(r.opponentName) }');
  });
});

/**
 * Growth batch 2026-11-14 (retention audit G10, G13, G14, G16): small panels shared by the HUD.
 *
 * - `inviteSection` (Friends): the fixed friend-invite reward, counts of friends who joined (never
 *   their names), Collect, and "Did a friend invite you?" for a new account. No share prompt here:
 *   the friend code's own Share button is hidden for under-13 players (friendsUi.ts).
 * - `openShareReplay` (battle log): the player chooses to share one replay; it says what is shared,
 *   offers "Show my name" only to adults, and gives a link and a code. Nothing is shared unasked.
 * - `sharedReplayCard` (`?replay=<code>`): what a shared replay is before it plays, with the
 *   opponent's kind always labelled (a generated base says so).
 * - `bannerTier` (Alliance): a cosmetic banner by Alliance level. It changes no number.
 * - `calendarRows` (Events): every event window of the next 4 weeks and where the schedule came from.
 */
import type { ReferralView, ShareReplayRequest, ShareReplayResponse, SharedReplayView } from '../../backend/net/protocol';
import { SHARED_REPLAY_DAYS } from '../../backend/net/protocol';
import type { BattleRecord } from '../../gameplay/sim/battle/types';
import { eventsBetween, type EventWindow } from '../../gameplay/sim/events';
import type { GameData } from '../../gameplay/sim/types';
import { isolateName } from '../../gameplay/sim/social/names';
import { clear, h, isSubmitEnter } from './dom';
import { fmtPercent, messageText, t } from './i18n';
import type { UiKit } from './uiKit';

/** What the composition root gives these panels (main.ts: `GrowthClient` plus the link base). */
export interface GrowthDeps {
  readonly canRefer: boolean;
  readonly canShareReplays: boolean;
  referrals(): Promise<ReferralView>;
  enterCode(code: string): Promise<ReferralView>;
  claim(): Promise<ReferralView>;
  share(req: ShareReplayRequest): Promise<ShareReplayResponse>;
  /** The web link that opens a shared replay (null: codes only). */
  replayLink(code: string): string | null;
}

const errText = (e: unknown) => messageText(e instanceof Error ? e.message : String(e), true);

/** Friends → Invite friends (no share prompt of its own). */
export function inviteSection(kit: UiKit, g: GrowthDeps): HTMLElement {
  const box = h('div', { class: 'invite' });
  if (!g.canRefer) return box;
  let view: ReferralView | null = null;
  let busy = false;
  const draw = () => {
    clear(box);
    box.append(h('h3', {}, t('growth.invite.title')));
    if (!view) {
      box.append(h('p', { class: 'muted small' }, '…'));
      return;
    }
    const v = view;
    box.append(
      h('p', { class: 'small' }, t('growth.invite.rule', { keep: v.keep })),
      h('div', { class: 'row' }, h('span', { class: 'chip good' }, t('growth.invite.reward', { jade: v.rewardJade })), h('span', { class: 'muted small' }, t('growth.invite.cap', { cap: v.monthlyCap }))),
      h('p', { class: 'muted small' }, t('growth.invite.counts', { waiting: v.recruits.waiting, ready: v.recruits.qualified, rewarded: v.recruits.rewarded })),
    );
    if (v.invitedBy) box.append(h('p', { class: 'small' }, t(v.invitedBy.rewarded ? 'growth.invite.mine.rewarded' : v.invitedBy.qualified ? 'growth.invite.mine.ready' : 'growth.invite.mine.waiting', { keep: v.keep })));
    if (v.needsServerVillage) box.append(h('p', { class: 'muted small' }, t('growth.invite.needsServer')));
    const collect = h('button', { class: 'btn primary', type: 'button', disabled: busy || v.claimable === 0 }, t('growth.invite.collect'));
    collect.addEventListener('click', () =>
      void run(async () => {
        const r = await g.claim();
        kit.toast(r.granted ? t('growth.invite.collected', { jade: r.granted }) : t('growth.invite.nothing'), r.granted ? 'success' : 'info');
        return r;
      }),
    );
    box.append(h('div', { class: 'actions' }, collect));
    if (v.canEnterCode) {
      const input = h('input', { class: 'text', type: 'text', dir: 'ltr', autocomplete: 'off', placeholder: t('growth.invite.enterPlaceholder'), 'aria-label': t('growth.invite.enterPlaceholder') }) as HTMLInputElement;
      const use = () =>
        void run(async () => {
          const r = await g.enterCode(input.value.trim());
          kit.toast(t('growth.invite.linked'), 'success');
          return r;
        });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (isSubmitEnter(e)) use();
      });
      box.append(h('h3', {}, t('growth.invite.enterTitle')), h('p', { class: 'muted small' }, t('growth.invite.enterHint', { days: v.windowDays })), h('div', { class: 'row find-row' }, input, h('button', { class: 'btn ghost', type: 'button', disabled: busy, onclick: use }, t('growth.invite.enter'))));
    }
  };
  const run = async (fn: () => Promise<ReferralView>) => {
    if (busy) return;
    busy = true;
    try {
      view = await fn();
    } catch (e) {
      kit.toast(errText(e), 'error');
    } finally {
      busy = false;
      draw();
    }
  };
  draw();
  void g.referrals().then(
    (v) => ((view = v), draw()),
    () => box.replaceChildren(),
  );
  return box;
}

/** Whether a battle record can be offered for sharing (a replay this build shows, of a real fight). */
export function shareable(r: BattleRecord, canReplay: boolean): boolean {
  return canReplay && r.rules !== undefined && r.settlement !== 'rejected';
}

/** Battle log → Share: the confirm step, then the link. `adult`: may show their name. */
export function openShareReplay(kit: UiKit, g: GrowthDeps, r: BattleRecord, adult: boolean): void {
  const body = h('div', { class: 'share-replay' });
  const nameBox = h('input', { type: 'checkbox' }) as HTMLInputElement;
  body.append(h('p', { class: 'small' }, t('growth.share.explain', { days: SHARED_REPLAY_DAYS })));
  if (adult) body.append(h('label', { class: 'row' }, nameBox, h('span', {}, t('growth.share.showName'))));
  else body.append(h('p', { class: 'muted small' }, t('growth.share.minor')));
  // Honesty: anything the game generated says so (the server also labels marked bases itself).
  const opponent = r.setup.base.practice ? 'practice' : r.kind === 'defense' ? (r.simulated ? 'generated' : 'player') : r.setup.base.rival || !r.ticket ? 'generated' : 'player';
  let close = () => undefined as void;
  const make = h('button', { class: 'btn primary', type: 'button' }, t('growth.share.confirm'));
  make.addEventListener('click', () => {
    make.disabled = true;
    void g
      .share({ setup: r.setup, deployments: r.deployments, ...(r.endTick !== undefined ? { endTick: r.endTick } : {}), rules: r.rules!, opponent, showName: adult && nameBox.checked })
      .then((res) => {
        close();
        showLink(kit, g, res.code);
      })
      .catch((e) => {
        make.disabled = false;
        kit.toast(errText(e), 'error');
      });
  });
  body.append(h('div', { class: 'actions' }, make));
  close = kit.modal(t('growth.share.title'), body, [], 'normal');
}

function showLink(kit: UiKit, g: GrowthDeps, code: string): void {
  const link = g.replayLink(code);
  const text = link ?? code;
  const copy = () => void navigator.clipboard?.writeText(text).then(() => kit.toast(t('growth.share.done'), 'success'), () => kit.toast(text, 'info'));
  const nav = navigator as Navigator & { share?: (d: { title: string; url?: string; text?: string }) => Promise<void> };
  const body = h('div', {}, h('p', {}, t('growth.share.code', { code })), link ? h('p', { class: 'muted small', dir: 'ltr' }, link) : null);
  const actions = h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: copy }, t('growth.share.copy')));
  if (link && nav.share) actions.append(h('button', { class: 'btn primary', type: 'button', onclick: () => void nav.share!({ title: t('growth.share.title'), url: link }).catch(() => undefined) }, t('growth.share.title')));
  body.append(actions);
  kit.modal(t('growth.share.done'), body, [], 'normal');
}

/** `?replay=<code>`: what the shared replay is, before it plays. */
export function sharedReplayCard(v: SharedReplayView, onWatch: (() => void) | null): HTMLElement {
  const against = t(v.opponent === 'generated' ? 'growth.viewer.generated' : v.opponent === 'practice' ? 'growth.viewer.practice' : 'growth.viewer.player');
  const by = v.sharerName ? t('growth.viewer.by', { name: isolateName(v.sharerName) }) : t('growth.viewer.anon');
  const card = h(
    'div',
    { class: 'shared-replay' },
    h('p', {}, by),
    h('p', { class: 'small' }, against),
    h('p', { class: 'small' }, t('growth.viewer.result', { stars: v.result.stars, pct: fmtPercent(v.result.destruction) })),
  );
  if (!onWatch) card.append(h('p', { class: 'muted small' }, t('growth.viewer.older')));
  return card;
}

export type BannerTier = 'plain' | 'bronze' | 'silver' | 'gold';
/** Alliance levels where the banner changes (presentation only: no game number depends on it). */
export const BANNER_LEVELS: readonly [BannerTier, number][] = [
  ['plain', 1],
  ['bronze', 3],
  ['silver', 6],
  ['gold', 10],
];

export function bannerTier(level: number): { tier: BannerTier; next: number | null } {
  let tier: BannerTier = 'plain';
  let next: number | null = null;
  for (const [name, at] of BANNER_LEVELS) {
    if (level >= at) tier = name;
    else if (next === null) next = at;
  }
  return { tier, next };
}

/** Alliance → banner line. */
export function bannerLine(level: number): HTMLElement {
  const b = bannerTier(level);
  return h(
    'div',
    { class: `alliance-banner banner-${b.tier}` },
    h('span', { class: 'banner-flag', 'aria-hidden': 'true' }),
    h('b', {}, t(`alliance.banner.${b.tier}`)),
    h('span', { class: 'muted small' }, [b.next !== null ? t('alliance.banner.next', { level: b.next }) : '', t('alliance.banner.note')].filter(Boolean).join(' ')),
  );
}

/** Every event window starting in the next 28 days (the Events calendar). */
export function calendarWindows(now: number, data: GameData): EventWindow[] {
  return eventsBetween(now, now + 28 * 86_400_000, data).filter((e) => e.start > now);
}

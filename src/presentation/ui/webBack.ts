/**
 * Beast Mode 2026-11-21 UX-03 (earlier I-3, "PWA back"): Back in a browser tab or an installed web app unloaded the
 * game, mid-raid too (warriors not yet sent went home). One guard history entry catches Back: it closes the top
 * dialog or sheet, leaves a battle through its own End battle confirm, else asks "Leave Kagemura?" like the Android
 * app; the guard is re-armed after each Back. One entry only, never one per dialog.
 */
export interface WebBackHooks {
  inBattle(): boolean;
  battleBack(): void;
  /** Close the top dialog or sheet; false when nothing was open. */
  closeTop(): boolean;
  /** The "Leave Kagemura?" confirm. */
  confirmLeave(): Promise<boolean>;
  save(): Promise<unknown>;
}

const GUARD = { tk: 'guard' };

export function installWebBack(win: Pick<Window, 'history' | 'addEventListener' | 'removeEventListener'>, hooks: WebBackHooks): () => void {
  const isGuard = (s: unknown) => (s as { tk?: string } | null)?.tk === 'guard';
  if (!isGuard(win.history.state)) win.history.pushState(GUARD, '');
  let leaving = false;
  const arm = () => win.history.pushState(GUARD, '');
  const onPop = (e: PopStateEvent) => {
    if (leaving || isGuard(e.state)) return;
    if (hooks.inBattle()) {
      arm();
      hooks.battleBack();
      return;
    }
    if (hooks.closeTop()) {
      arm();
      return;
    }
    arm();
    void hooks.confirmLeave().then((leave) => {
      if (!leave) return;
      leaving = true;
      void hooks.save().finally(() => win.history.go(-2));
    });
  };
  win.addEventListener('popstate', onPop as EventListener);
  return () => win.removeEventListener('popstate', onPop as EventListener);
}

/**
 * What the HUD lends its panels (economy, army, daily, friends, age screen). In its own file so a panel
 * that economyUi.ts imports (ageScreen.ts) can name it without a cycle (quality 22).
 */
import type { GameController } from '../../gameplay/control/controller';
import type { AgeBand } from '../../gameplay/sim/age';

export interface UiKit {
  c: GameController;
  modal(title: string, body: HTMLElement, buttons?: ({ label: string; primary?: boolean; danger?: boolean; onClick: () => void } | null | false | undefined)[], size?: 'normal' | 'wide', onClose?: () => void): () => void;
  /** A plain message, or an element (the purchase confirm carries links). */
  confirm(title: string, message: string | HTMLElement, confirmLabel: string, danger?: boolean, cancelLabel?: string): Promise<boolean>;
  toast(text: string, kind?: 'info' | 'error' | 'success'): void;
  closeAllModals(): void;
  /** The age band from the store's signal, else the neutral screen (the HUD's `askAge`). */
  askAge?(why: string): Promise<AgeBand | null>;
  /** The Clan Keep wearing a look, as a data URL (only the Store's Looks use it). */
  skinThumb?(skin: string): string | null;
}

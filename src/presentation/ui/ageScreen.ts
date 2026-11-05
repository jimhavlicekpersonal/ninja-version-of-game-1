/**
 * The age screen (re-audit: minors online, purchase age question). Neutral by
 * design (FTC COPPA guidance on age screens): it asks for a year of birth
 * from a list with nothing chosen, a month only when the year alone cannot
 * tell, never hints which answer unlocks what, and its buttons look the same.
 * Only the resulting band (sim/age.ts) is kept, never the year.
 *
 * Under-13 chat uses fixed phrases (PRESET_CHAT); `presetChatRow` draws them.
 */
import { ageBandFromBirth, birthYearNeedsMonth, type AgeBand } from '../../gameplay/sim/age';
import { PRESET_CHAT } from '../../backend/net/protocol';
import { h } from './dom';
import type { UiKit } from './economyUi';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Ask for a year (and month) of birth; resolves with the band, or null when
 * the player closes the screen without answering. `why` is one neutral line
 * saying what the answer is for.
 */
export function askAgeBand(kit: Pick<UiKit, 'modal' | 'c'>, why: string): Promise<AgeBand | null> {
  // Today's year and month from the game's clock (the sandbox may move it).
  const now = new Date(kit.c.now());
  const today = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  return new Promise((resolve) => {
    let done = false;
    const year = h('select', { class: 'text', 'aria-label': 'Year of birth', required: true }, h('option', { value: '', disabled: true, selected: true }, 'Year')) as HTMLSelectElement;
    for (let y = today.year; y >= today.year - 100; y--) year.append(h('option', { value: String(y) }, String(y)));
    const month = h('select', { class: 'text', 'aria-label': 'Month of birth' }, h('option', { value: '', disabled: true, selected: true }, 'Month')) as HTMLSelectElement;
    MONTHS.forEach((m, i) => month.append(h('option', { value: String(i + 1) }, m)));
    const monthRow = h('label', { class: 'age-field', hidden: true }, 'Month of birth', month);
    const error = h('p', { class: 'note', role: 'status', 'aria-live': 'polite' });
    const update = () => {
      monthRow.hidden = !(year.value && birthYearNeedsMonth(Number(year.value), today));
      error.textContent = '';
    };
    year.addEventListener('change', update);
    month.addEventListener('change', update);
    const body = h(
      'div',
      { class: 'age-screen' },
      h('p', {}, why),
      h('label', { class: 'age-field' }, 'Year of birth', year),
      monthRow,
      error,
      h('p', { class: 'muted small' }, 'We keep only an age group on this device and our server, never your date of birth. Please answer honestly: our support team can correct a mistake.'),
    );
    const finish = (band: AgeBand | null) => {
      done = true;
      close();
      resolve(band);
    };
    const close = kit.modal(
      'Your age',
      body,
      [
        { label: 'Not now', onClick: () => finish(null) },
        {
          label: 'Continue',
          onClick: () => {
            if (!year.value) {
              error.textContent = 'Choose your year of birth.';
              return;
            }
            const needsMonth = birthYearNeedsMonth(Number(year.value), today);
            if (needsMonth && !month.value) {
              error.textContent = 'Choose your month of birth.';
              return;
            }
            finish(ageBandFromBirth(Number(year.value), needsMonth ? Number(month.value) : null, today));
          },
        },
      ],
      'normal',
      () => {
        if (!done) resolve(null);
      },
    );
  });
}

/** Chat for players under 13: the fixed phrases as buttons (the server refuses anything else). */
export function presetChatRow(send: (text: string) => void, disabled = false): HTMLElement {
  return h(
    'div',
    { class: 'preset-chat' },
    h('p', { class: 'muted small' }, 'Chat with ready-made messages:'),
    h('div', { class: 'preset-chat-buttons' }, ...PRESET_CHAT.map((t) => h('button', { class: 'btn ghost small', type: 'button', disabled, onclick: () => send(t) }, t))),
  );
}

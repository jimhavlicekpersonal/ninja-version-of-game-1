import { labelText as i18nLabel } from './i18n';
import { t as i18nText } from './i18n';
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
import type { UiKit } from './uiKit';

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
    const year = h('select', { class: 'text', 'aria-label': i18nText("ui.year_of_birth_9af6743ac8"), required: true }, h('option', { value: '', disabled: true, selected: true }, i18nText("ui.year_89f6832560"))) as HTMLSelectElement;
    for (let y = today.year; y >= today.year - 100; y--) year.append(h('option', { value: String(y) }, String(y)));
    const month = h('select', { class: 'text', 'aria-label': i18nText("ui.month_of_birth_58031c0612") }, h('option', { value: '', disabled: true, selected: true }, i18nText("ui.month_310ca503ef"))) as HTMLSelectElement;
    MONTHS.forEach((m, i) => month.append(h('option', { value: String(i + 1) }, i18nLabel(m))));
    const monthRow = h('label', { class: 'age-field', hidden: true }, i18nText("ui.month_of_birth_58031c0612"), month);
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
      h('p', {}, i18nLabel(why)),
      h('label', { class: 'age-field' }, i18nText("ui.year_of_birth_9af6743ac8"), year),
      monthRow,
      error,
      h('p', { class: 'muted small' }, i18nText("ui.we_keep_only_an_age_group_on_this_devi_f95aafec8d")),
    );
    const finish = (band: AgeBand | null) => {
      done = true;
      close();
      resolve(band);
    };
    const close = kit.modal(
      i18nText("ui.your_age_f74dd4ea4e"),
      body,
      [
        { label: i18nText("ui.not_now_a0e63d7c71"), onClick: () => finish(null) },
        {
          label: i18nText("ui.continue_31fbef1625"),
          onClick: () => {
            if (!year.value) {
              error.textContent = i18nText("ui.choose_your_year_of_birth_f04bad1012");
              return;
            }
            const needsMonth = birthYearNeedsMonth(Number(year.value), today);
            if (needsMonth && !month.value) {
              error.textContent = i18nText("ui.choose_your_month_of_birth_49968f8158");
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
    h('p', { class: 'muted small' }, i18nText("ui.chat_with_ready_made_messages_f9e2440c3e")),
    h('div', { class: 'preset-chat-buttons' }, ...PRESET_CHAT.map((t) => h('button', { class: 'btn ghost small', type: 'button', disabled, onclick: () => send(t) }, i18nLabel(t)))),
  );
}

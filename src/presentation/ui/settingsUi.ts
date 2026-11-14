/**
 * Settings (split out of hud.ts, quality 17; loaded on first open, quality 31): sound, notifications,
 * language, graphics, privacy and help, account, save transfer, the sandbox tools and starting over.
 * The online-play section stays in the HUD (its pill and the Honor panel share it) and comes in
 * through the host.
 */
import { messageText as i18nMessage, dateText as i18nDate } from './i18n';
import { displayData as localizedData, labelText as i18nLabel } from './i18n';
import { t as i18nText } from './i18n';
import { automaticLanguage, language, languageCoverage, languagePreference, languages, READY_COVERAGE, setLanguagePreference, useLanguage, t } from './i18n';
import { Capacitor } from '@capacitor/core';
import type { GameController, VillageBackup } from '../../gameplay/control/controller';
import { decodeExportCode, deserialize, encodeExportCode, serialize } from '../../gameplay/sim/save';
import type { EconomyUi } from './economyUi';
import { sound } from '../audio/sound';
import type { UiBus } from './bus';
import type { UiKit } from './uiKit';
import type { HudDeps } from './hudDeps';
import { clear, h } from './dom';
import { formatDuration } from './format';
import { getQualityChoice, quality, setQualityChoice, type QualityChoice } from '../render/quality';
import { uiArt } from './feedback';
import { statsExplainer } from './statsText';

/** What Settings reads and calls on the HUD. */
export interface SettingsHost {
  readonly c: GameController;
  readonly deps: HudDeps;
  readonly bus: UiBus;
  readonly econ: EconomyUi;
  showFps: boolean;
  readonly fpsEl: HTMLElement;
  modal: UiKit['modal'];
  confirm: UiKit['confirm'];
  toast: UiKit['toast'];
  closeAllModals(): void;
  refresh(): void;
  onlineSection(): HTMLElement;
  serverAddressBlock(): HTMLElement;
  backupTitle(b: VillageBackup): string;
  restoreVillage(key: string): Promise<void> | void;
}

export class SettingsUi {
  constructor(private readonly host: SettingsHost) {}
  private get c() { return this.host.c; }
  private get deps() { return this.host.deps; }
  private get bus() { return this.host.bus; }
  private get econ() { return this.host.econ; }
  private get showFps() { return this.host.showFps; }
  private set showFps(v: boolean) { this.host.showFps = v; }
  private get fpsEl() { return this.host.fpsEl; }
  private modal(...a: Parameters<UiKit['modal']>) { return this.host.modal(...a); }
  private confirm(...a: Parameters<UiKit['confirm']>) { return this.host.confirm(...a); }
  private toast(...a: Parameters<UiKit['toast']>) { this.host.toast(...a); }
  private closeAllModals() { this.host.closeAllModals(); }
  private refresh() { this.host.refresh(); }
  private onlineSection() { return this.host.onlineSection(); }
  private serverAddressBlock() { return this.host.serverAddressBlock(); }
  private backupTitle(b: VillageBackup) { return this.host.backupTitle(b); }
  private restoreVillage(key: string) { return this.host.restoreVillage(key); }

  open(online = false): void {
    const body = h('div', { class: 'settings' });
    const net = this.onlineSection();
    if (online) body.append(net);

    // Sound
    const sfxToggle = h('input', { type: 'checkbox', checked: sound.settings.sfx }) as HTMLInputElement;
    sfxToggle.addEventListener('change', () => sound.setSfx(sfxToggle.checked));
    const musicToggle = h('input', { type: 'checkbox', checked: sound.settings.music }) as HTMLInputElement;
    musicToggle.addEventListener('change', () => sound.setMusic(musicToggle.checked));
    const hs = uiArt.hapticsSetting;
    const hapticToggle = hs ? (h('input', { type: 'checkbox', checked: hs.get() }) as HTMLInputElement) : null;
    hapticToggle?.addEventListener('change', () => {
      hs!.set(hapticToggle.checked);
      if (hapticToggle.checked) uiArt.haptic('selection');
    });
    body.append(
      h('h3', {}, i18nText("ui.sound_46124e0236")),
      h('label', { class: 'toggle' }, sfxToggle, i18nText("ui.sound_effects_8ccb83f059")),
      h('label', { class: 'toggle' }, musicToggle, i18nText("ui.music_93359f51a4")),
    );
    if (hapticToggle) body.append(h('label', { class: 'toggle' }, hapticToggle, i18nText("ui.vibration_on_phones_that_support_it_3461bfb1b5")));

    // Notifications
    const prefs = this.deps.prefs;
    const breakToggle = h('input', { type: 'checkbox', checked: prefs.get('sessionReminder') }) as HTMLInputElement;
    breakToggle.addEventListener('change', () => prefs.set('sessionReminder', breakToggle.checked));
    const remindToggle = h('input', { type: 'checkbox', checked: prefs.get('reminders') }) as HTMLInputElement;
    const nd = localizedData(this.c.data).notifications;
    const typeBox = h('div', { class: 'notify-types' });
    const typeToggles: HTMLInputElement[] = [];
    for (const t of nd.types) {
      const tg = h('input', { type: 'checkbox', checked: this.deps.notifyPrefs.get(t.id, t.default), disabled: !prefs.get('reminders') }) as HTMLInputElement;
      tg.addEventListener('change', () => {
        this.deps.notifyPrefs.set(t.id, tg.checked);
        this.deps.onNotificationsChanged?.();
      });
      typeToggles.push(tg);
      typeBox.append(h('label', { class: 'toggle sub' }, tg, ` ${t.label}`));
    }
    const pad = (n: number) => `${String(n).padStart(2, '0')}:00`;
    typeBox.append(h('p', { class: 'muted small' }, i18nText("ui.at_most_a_day_and_none_between_and_the_8042e6ba31", { arg1: nd.maxPerDay, arg2: pad(nd.quietHours.start), arg3: pad(nd.quietHours.end) })));
    remindToggle.addEventListener('change', () => {
      prefs.set('reminders', remindToggle.checked);
      for (const tg of typeToggles) tg.disabled = !remindToggle.checked;
      if (remindToggle.checked) void this.deps.onRemindersEnabled();
      else this.deps.onNotificationsChanged?.();
    });
    body.append(
      h('h3', {}, i18nText("ui.notifications_and_healthy_play_a7de3df350")),
      h('label', { class: 'toggle' }, remindToggle, i18nText("ui.send_me_notifications_off_until_you_tu_aeadb5e927")),
      typeBox,
      h('label', { class: 'toggle' }, breakToggle, i18nText("ui.suggest_a_break_after_an_hour_of_play_7a4f7f2842")),
      h('p', { class: 'muted small' }, i18nMessage(this.deps.reminderNote)),
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { this.closeAllModals(); this.deps.onReplayTutorial(); } }, i18nText("ui.replay_the_tutorial_fd4b665fc3"))),
    );

    // Graphics
    body.append(this.languageRow());
    body.append(h('h3', {}, i18nText("ui.graphics_a874fca87c")), this.qualityRow());

    // Privacy and help (crash reports are a privacy choice, so they sit here)
    body.append(this.privacySection());
    const prefsCrash = this.deps.crashReports;
    if (prefsCrash) {
      // Opt-in (off until switched on): matches the privacy policy and store declarations (worldwide audit GLOBAL-019).
      const crashToggle = h('input', { type: 'checkbox', checked: prefs.get('crashReports') }) as HTMLInputElement;
      crashToggle.addEventListener('change', () => prefs.set('crashReports', crashToggle.checked));
      body.append(
        h('label', { class: 'toggle' }, crashToggle, i18nText("ui.send_crash_reports_off_until_you_turn__1d05349b9a")),
        h('p', { class: 'muted small' }, i18nText("ui.when_the_game_hits_an_error_it_sends_t_3635ae942b")),
      );
    }

    // Play statistics (report section 5 step 5): opt-in, adults only, a random id instead of the account.
    const stats = this.deps.stats;
    if (stats && (stats.available || stats.on)) {
      const statsToggle = h('input', { type: 'checkbox', checked: stats.on }) as HTMLInputElement;
      statsToggle.addEventListener('change', () => void stats.set(statsToggle.checked));
      body.append(
        h('label', { class: 'toggle' }, statsToggle, i18nText("ui.share_play_statistics_off_until_you_tu_5b3ea7662c")),
        h('p', { class: 'muted small' }, statsExplainer()),
      );
      if (this.deps.statsTzNote) body.append(h('p', { class: 'muted small' }, t('stats.tzNote')));
    }

    // Account: online play, age group and spending
    body.append(h('h3', { class: 'settings-group' }, i18nText("ui.account_7e1b0d5641")));
    if (!online) body.append(net);
    body.append(this.econ.spendSection());

    // Advanced
    const adv = h('div', { class: 'settings-advanced' });
    body.append(h('h3', { class: 'settings-group' }, i18nText("ui.advanced_9f088dbebd")), adv);

    // Save transfer
    const codeBox = h('textarea', { class: 'code', rows: 4, spellcheck: 'false', autocapitalize: 'off', placeholder: i18nText("ui.paste_a_save_code_here_to_load_a_villa_214add2875") }) as HTMLTextAreaElement;
    adv.append(
      h('h4', {}, i18nText("ui.move_your_village_save_code_1bdb9c0a9e")),
      h('p', { class: 'muted' }, this.deps.store.persistent ? i18nText("ui.your_village_saves_automatically_on_th_ac56785b87") : i18nText("ui.this_browser_mode_cannot_save_your_vil_6256737850")),
      codeBox,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => this.exportSave(codeBox) }, i18nText("ui.copy_save_code_3ac3ad4d9c")),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => this.importSave(codeBox.value) }, i18nText("ui.load_from_code_c70a0d2a2e")),
      ),
    );

    // Villages kept after a save could not be read.
    const earlier = h('div', {});
    adv.append(earlier);
    void this.c.backups().then((list) => {
      if (!list.length) return;
      earlier.append(
        h('h4', {}, i18nText("ui.earlier_villages_7e0bb77734")),
        h('p', { class: 'muted small' }, i18nText("ui.kept_when_a_save_could_not_be_read_res_6e9e245885")),
        ...list.map((b) => h('div', { class: 'log-row' }, h('div', {}, h('b', {}, this.backupTitle(b)), h('div', { class: 'muted small' }, i18nDate(b.savedAt))), h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.restoreVillage(b.key) }, i18nText("ui.restore_a76e13b983")))),
      );
    });

    adv.append(this.serverAddressBlock());

    // Testing tools: only in the sandbox, which has its own village and never goes online.
    const offsetText = () => (this.deps.debugTime.offsetMs() ? i18nText("ui.sandbox_clock_is_ahead_of_real_time_c3954a0322", { arg1: formatDuration(this.deps.debugTime.offsetMs()) }) : i18nText("ui.sandbox_clock_matches_real_time_10a57b19e8"));
    const offsetEl = h('p', { class: 'muted' }, offsetText());
    const events = h('div', { class: 'events' }, i18nText("ui.loading_ba3bbbe10d"));
    if (this.deps.sandbox) {
      adv.append(
        h('h4', {}, i18nText("ui.testing_tools_sandbox_a72e2ec1a9")),
        h('p', { class: 'muted' }, i18nText("ui.this_is_the_testing_sandbox_a_separate_9299f41fbf")),
        offsetEl,
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { this.deps.debugTime.skip(3_600_000); offsetEl.textContent = offsetText(); this.c.tick(); this.refresh(); } }, i18nText("ui.1_hour_dcc1d1ff10")),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => this.simulateAway(8) }, i18nText("ui.simulate_8_hours_away_c4b7e8050b")),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => this.dropShield() }, i18nText("ui.remove_shield_9d4fbf6deb")),
        ),
        h('p', { class: 'muted small' }, i18nText("ui.new_villages_start_with_a_24_hour_shie_dd66dd89b6")),
      );
    } else {
      adv.append(
        h('h4', {}, i18nText("ui.testing_tools_15681283cf")),
        h('p', { class: 'muted small' }, i18nText("ui.time_skips_and_test_purchases_live_in__32232028f9")),
        h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { location.search = '?sandbox'; } }, i18nText("ui.open_the_testing_sandbox_d2d1de97c8"))),
      );
    }

    const fpsToggle = h('input', { type: 'checkbox', checked: this.showFps }) as HTMLInputElement;
    fpsToggle.addEventListener('change', () => {
      this.showFps = fpsToggle.checked;
      this.fpsEl.hidden = !this.showFps;
      try {
        localStorage.setItem('tk.showFps', this.showFps ? '1' : '0');
      } catch {
        /* ignore */
      }
    });
    adv.append(h('label', { class: 'toggle' }, fpsToggle, i18nText("ui.show_frame_rate_fps_04c07d4b90")));
    adv.append(h('details', {}, h('summary', {}, i18nText("ui.analytics_events_this_device_4fe12a5b11")), events));
    void this.deps.analytics.recent(60).then((list) => {
      clear(events);
      if (!list.length) events.append(i18nText("ui.no_events_yet_80c652c4ee"));
      for (const e of list) {
        events.append(h('div', { class: 'event' }, h('b', {}, e.name), ` ${i18nDate(e.at, {timeStyle: 'short'})} `, h('code', {}, JSON.stringify(e.props))));
      }
    });

    // Reset
    adv.append(
      h('h4', {}, i18nText("ui.start_over_5eed7e9fc8")),
      h('div', { class: 'actions' }, h('button', { class: 'btn danger', type: 'button', onclick: () => this.resetVillage() }, i18nText("ui.start_a_new_village_a8dfe0c14d"))),
    );
    body.append(h('p', { class: 'muted small' }, i18nText("ui.kagemura_ninja_clans_built_647b18e769", { arg1: this.deps.build.version, arg2: this.deps.build.builtAt })));
    this.modal(i18nText("ui.settings_74a883a037"), body, [], 'wide');
  }

  /**
   * Settings → Privacy and help (worldwide audit GLOBAL-015, R06): the privacy policy, support, community rules and
   * account deletion. Each address comes from the build (VITE_PRIVACY_URL, VITE_SUPPORT_URL, VITE_COMMUNITY_URL,
   * VITE_SUPPORT_EMAIL), else the pages shipped with the game in public/, which work without a connection. On the
   * web they open in a new tab. Inside the iOS/Android app a shipped page is not on the open web (a system browser
   * could not load it), so it opens in a frame inside the game instead; a configured public address opens outside.
   */
  /** Settings → Display → Graphics (audit R03): Auto / Smooth on older phones (low) / Sharp (high); applies after a restart. */
  private qualityRow(): HTMLElement {
    const now = quality();
    const select = h(
      'select',
      { class: 'text', 'aria-label': i18nText("ui.graphics_quality_da5eb63952") },
      ...(
        [
          ['auto', i18nText('ui.automatic_now_9549772afc', {arg1: i18nLabel(now.profile === 'low' ? 'Lighter' : 'Sharp')})],
          ['low', 'Lighter: for older or low-memory phones, saves battery'],
          ['high', 'Sharp: full detail'],
        ] as [QualityChoice, string][]
      ).map(([v, label]) => h('option', { value: v, ...(getQualityChoice() === v ? { selected: true } : {}) }, i18nLabel(label))),
    ) as HTMLSelectElement;
    const note = h('p', { class: 'muted small' }, i18nText('common.graphics', {profile: i18nLabel(now.profile === 'low' ? 'Lighter' : 'Sharp')}));
    select.addEventListener('change', () => {
      if (setQualityChoice(select.value as QualityChoice)) {
        note.textContent = i18nText("ui.restart_the_game_to_apply_the_new_grap_406b117ecf");
        const restart = h('button', { class: 'btn ghost', type: 'button', onclick: () => location.reload() }, i18nText("ui.restart_now_09af1002ab"));
        note.append(' ', restart);
      }
    });
    return h('div', {}, h('label', { class: 'toggle' }, i18nText("ui.graphics_8a3477b096"), select), note);
  }

  private privacySection(): HTMLElement {
    const env = import.meta.env as Record<string, string | undefined>;
    const native = Capacitor.isNativePlatform();
    const link = (label: string, configured: string | undefined, shipped: string) => {
      const url = configured?.trim() || (language().code !== 'en' ? shipped.replace('./', `./${language().code}/`) : shipped);
      if (native && !/^https?:/i.test(url)) {
        return h('button', { class: 'btn ghost', type: 'button', onclick: () => this.modal(label, h('iframe', { class: 'legal-frame', src: url, title: label }), [], 'wide') }, i18nLabel(label));
      }
      return h('a', { class: 'btn ghost', href: url, target: '_blank', rel: 'noopener' }, i18nLabel(label));
    };
    const email = env.VITE_SUPPORT_EMAIL?.trim();
    const serverUrl = this.deps.connection.url;
    const section = h(
      'div',
      { class: 'privacy-links' },
      h('h3', {}, i18nText("ui.privacy_and_help_f79c2d44d4")),
      h(
        'div',
        { class: 'actions' },
        link(i18nText("ui.privacy_policy_ba445cff38"), env.VITE_PRIVACY_URL, './privacy.html'),
        link(i18nText("ui.support_be91940b79"), env.VITE_SUPPORT_URL, './support.html'),
        link(i18nText("ui.community_rules_1b43c15f41"), env.VITE_COMMUNITY_URL, './community.html'),
        link(i18nText("ui.terms_of_service_e69e061448"), env.VITE_TERMS_URL, './terms.html'),
        ...(email ? [h('a', { class: 'btn ghost', href: `mailto:${email}?subject=${encodeURIComponent(i18nText("ui.kagemura_support_af3c907500"))}` }, i18nText("ui.email_df85f7ae02", { arg1: email }))] : []),
      ),
      serverUrl
        ? h('p', { class: 'muted small' }, i18nText("ui.delete_your_online_account_settings_on_954d6fa1b3"), h('a', { href: `${serverUrl}/account/delete?lang=${language().code}`, target: '_blank', rel: 'noopener' }, i18nText("ui.account_deletion_page_be14847793")), t('text.period'))
        : this.deps.connection.storedAccounts().length
          ? h('p', { class: 'muted small' }, i18nText("ui.online_play_is_off_on_this_device_but__93e0d7c565"))
          : h('p', { class: 'muted small' }, i18nText("ui.there_is_no_online_account_on_this_dev_9a43b7dd10")),
    );
    return section;
  }

  private exportSave(box: HTMLTextAreaElement): void {
    void this.c.save();
    const code = encodeExportCode(serialize(this.c.state, this.c.now()));
    box.value = code;
    box.select();
    this.deps.analytics.log('save_export', { length: code.length });
    const done = () => this.toast(i18nText("ui.save_code_copied_paste_it_on_your_othe_ead6bb7099"), 'success');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(done, () => this.toast(i18nText("ui.select_the_code_and_copy_it_3d218c0533"), 'info'));
    } else {
      try {
        document.execCommand('copy');
        done();
      } catch {
        this.toast(i18nText("ui.select_the_code_and_copy_it_3d218c0533"), 'info');
      }
    }
  }

  private async importSave(code: string): Promise<void> {
    if (!code.trim()) {
      this.toast(i18nText("ui.paste_a_save_code_first_6aab75d022"), 'info');
      return;
    }
    let village;
    try {
      village = deserialize(decodeExportCode(code), localizedData(this.c.data));
    } catch (e) {
      this.toast(i18nMessage((e as Error).message, true), 'error');
      return;
    }
    const ok = await this.confirm(i18nText("ui.load_this_village_efcca56459"), i18nText("ui.it_will_replace_the_village_on_this_de_52ab8857c9"), i18nText("ui.replace_village_89575e2f95"), true);
    if (!ok) return;
    await this.c.replace(village);
    this.deps.analytics.log('save_import', {});
    this.closeAllModals();
    this.bus.emit('select', null);
    this.toast(i18nText("ui.village_loaded_251aab2ab8"), 'success');
  }

  private async simulateAway(hours: number): Promise<void> {
    await this.c.save();
    this.deps.debugTime.skip(hours * 3_600_000);
    location.reload();
  }

  private async dropShield(): Promise<void> {
    await this.c.replace({ ...this.c.state, shieldUntil: this.c.now() });
    this.toast(i18nText("ui.shield_removed_raiders_can_now_find_yo_95e6f0db8e"), 'info');
  }

  private async resetVillage(): Promise<void> {
    const ok = await this.confirm(i18nText("ui.start_a_new_village_11b2d89b3e"), i18nText("ui.your_current_village_on_this_device_wi_65983b7caa"), i18nText("ui.delete_and_start_over_cf0f7ab70c"), true);
    if (!ok) return;
    await this.c.reset();
    this.closeAllModals();
    this.bus.emit('select', null);
    this.toast(i18nText("ui.a_fresh_village_awaits_08f7b7c683"), 'success');
  }

  /**
   * Report section 5 step 9: the language, a device preference (never in the save). "Automatic" follows the
   * device. Only languages whose interface is mostly translated are offered; the rest arrive with the
   * translation sessions (locales/CLAUDE.md). A change reloads after saving, so nothing is lost.
   */
  private languageRow(): HTMLElement {
    const wrap = h('div', { class: 'language-row' });
    const select = h('select', { 'aria-label': t('settings.language') }) as HTMLSelectElement;
    const pref = languagePreference();
    select.append(h('option', { value: 'auto' }, t('settings.languageAuto', { name: language().native })));
    void (async () => {
      for (const l of languages()) {
        if ((await languageCoverage(l.code)) < READY_COVERAGE) continue;
        const o = h('option', { value: l.code, lang: l.code }, l.native) as HTMLOptionElement;
        if (pref === l.code) o.selected = true;
        select.append(o);
      }
    })();
    select.addEventListener('change', () => {
      const pref = select.value === 'auto' ? null : select.value;
      select.disabled = true;
      void useLanguage(pref ?? automaticLanguage()).then(() => {
        setLanguagePreference(pref);
        return this.c.persist().catch(() => false).finally(() => location.reload());
      }, () => { select.disabled = false; select.value = languagePreference() ?? 'auto'; this.toast(t('boot.languageError'), 'error'); });
    });
    wrap.append(h('h3', {}, t('settings.language')), select, h('p', { class: 'muted small' }, t('settings.languageNote')));
    return wrap;
  }

}

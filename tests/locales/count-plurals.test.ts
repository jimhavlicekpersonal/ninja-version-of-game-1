/**
 * N24-UX-4 (2026-11-25): counted messages are ICU plurals in English and in every language, so "1 day", Russian
 * 1/3/5 and Arabic forms read correctly. A count that arrives as canonical English text ("1,200") picks its branch
 * and prints its number, in English too.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import en from '../../locales/en/messages.json';
import enUi from '../../locales/en/ui.json';
import ru from '../../locales/compiled/ru.json';
import ar from '../../locales/compiled/ar.json';
import { installCatalog, translate } from '../../locales/runtime';
import { targets } from '../../tools/i18n/lib.mjs';

/** The counted messages converted in this pass (the three that take a name or label stayed plain). */
const COUNTED = [
  'server.a_gang_has_at_most_members_fe38da026e', 'server.a_gang_war_needs_members_628069dbc9', 'server.at_most_commands_at_a_time_1e34002da3',
  'server.attack_attacks_each_relay_strikes_star_60fc3391e6', 'server.keep_messages_under_characters_b4020cbccf', 'server.more_days_ae16f6d2fb',
  'server.you_have_friends_the_most_you_can_have_f99b240684', 'sim.next_costs_coins_f379e3f0a4', 'sim.only_buildings_stood_between_you_and_3_533807376a',
  'ui.days_d7f711040e', 'ui.locked_points_when_done_724af3f655', 'ui.members_about_honor_0eaa46edd3', 'ui.members_gang_rating_35d8073dcb',
  'ui.not_cleared_you_need_stars_27ca57d98e', 'ui.of_classes_unlocked_a_class_unlocks_wh_856ddcc6ae', 'ui.stars_reward_d99d00075f',
  'ui.the_next_alliance_war_starts_in_and_la_db68a4f545', 'ui.tier_more_points_c5379e2fd6', 'ui.walls_b7e7ff287f', 'ui.warrior_codex_all_classes_03eb859e9c',
  'ui.warriors_at_a_time_29a1f7a91f', 'srv.gang.max_members', 'srv.war.size', 'srv.chat.too_long', 'srv.friend.you_full',
];
const COUNTED_UI = ['codex.rivalsRule', 'codex.exhaustionRule', 'review.fit', 'seal.progress', 'stake.recentHits'];
const NAMED = ['ui.find_my_friends_974b86f5f1', 'ui.none_of_your_friends_play_kagemura_yet_266d500cbf', 'ui.replay_attacks_loot_taken_cfa170965c'];

describe('counted messages are plurals (N24-UX-4)', () => {
  it('in English, and in every language worksheet', () => {
    const E = en as Record<string, string>;
    const U = enUi as Record<string, string>;
    for (const k of COUNTED) expect(E[k], k).toMatch(/, plural,/);
    for (const k of COUNTED_UI) expect(U[k], k).toMatch(/, plural,/);
    for (const k of NAMED) expect(E[k], k).not.toMatch(/plural/);
    for (const { code } of targets()) {
      if (code === 'en') continue;
      const m = JSON.parse(readFileSync(`locales/${code}/messages.json`, 'utf8')) as Record<string, { text: string }>;
      const u = JSON.parse(readFileSync(`locales/${code}/ui.json`, 'utf8')) as Record<string, { text: string }>;
      for (const k of COUNTED) expect(m[k]?.text, `${code} ${k}`).toMatch(/, plural,/);
      for (const k of COUNTED_UI) expect(u[k]?.text, `${code} ${k}`).toMatch(/, plural,/);
    }
  });

  it('reads one and many in English, and a count sent as English text', () => {
    expect(translate('ui.days_d7f711040e', { arg1: 1 }, 'en')).toBe('1 day');
    expect(translate('ui.days_d7f711040e', { arg1: 3 }, 'en')).toBe('3 days');
    expect(translate('sim.next_costs_coins_f379e3f0a4', { arg1: '1,200' }, 'en')).toBe('Next costs 1,200 coins.');
    expect(translate('sim.next_costs_coins_f379e3f0a4', { arg1: '1' }, 'en')).toBe('Next costs 1 coin.');
    expect(translate('srv.war.size', { min: 5, max: 10 }, 'en')).toBe('A Gang War needs 5-10 members.');
  });

  it('uses the language\'s own categories (Russian one/few/many, Arabic)', () => {
    installCatalog('ru', ru);
    installCatalog('ar', ar);
    const ruDays = [1, 3, 5].map((n) => translate('ui.days_d7f711040e', { arg1: n }, 'ru'));
    expect(new Set(ruDays).size).toBe(3);
    const arDays = [1, 2, 3, 11].map((n) => translate('ui.days_d7f711040e', { arg1: n }, 'ar'));
    expect(new Set(arDays).size).toBe(4);
    for (const s of [...ruDays, ...arDays]) expect(s).not.toMatch(/[{}#]|NaN/);
  });
});

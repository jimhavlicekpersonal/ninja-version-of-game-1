# Text and numbers for the v5 report that depend on results. Writes econ10.json.
import json, os
L = './'
J = lambda f: json.load(open(L + f))
R = J('results10.json'); A = {k: R['R10'][str(k)] for k in (9, 12, 15)}; B = {k: R['R9'][str(k)] for k in (9, 12, 15)}
ODO = {k: J(f'odo_k{k}.result.json') for k in (9, 12, 15)}; ORA = {k: J(f'oracle10_k{k}.result.json') for k in (9, 12, 15)}
ODO15a = J('odo_k15_first.result.json') if os.path.exists(L + 'odo_k15_first.result.json') else None
CB = J('csum_cp_al.json'); CA = J('csum_cp_p5.json'); CF = J('csum_cp_p5_-.json'); T = J('tune10.json'); S10 = J('sens10_R10_k12.json'); S9 = J('sens10_R9x_k12.json')
def camp(f):
    r = J(f); return {'k9': r['reached'].get('9'), 'k12': r['reached'].get('12'), 'k15': r['reached'].get('15'), 'share': 100 * r['totals']['stolen'] / r['totals']['looted'], 'rew': r['totals']['defenseRewards'] / 1e6, 'looted': r['totals']['looted'] / 1e6,
                      'jade': r.get('end', {}).get('moonstones'), 'builders': r.get('end', {}).get('builders'), 'days': r['days'], 'own12': next((x['stars'] for x in r['byKeep'] if x['keep'] == 12), None)}
TODAY12 = sum(next(x['stars'] for x in J(f)['byKeep'] if x['keep'] == 12) for f in ('cq_regular_b_cp_al.json', 'cq_regular_b_cp_al_r1.json', 'cq_regular_b_cp_al_r2.json')) / 3
two = camp('camp_rusher_base.json'); p6 = camp('cq_rusher_b_cp_p6.json'); p7 = camp('cq_regular_b_cp_p7.json'); p8r = camp('cq_regular_b_cp_p8.json'); p8f = camp('cq_fortress3_b_cp_p8.json')
c1r = camp('cq_regular_b_cp_p5c1.json'); c1f3 = camp('cq_fortress3_b_cp_p5c1.json'); c1f1 = camp('cq_fortress1_b_cp_p5c1.json')
en0 = camp('cq_regular_b_cp_al_entry_norules.json'); en5 = camp('cq_regular_b_cp_p5_entry_norules.json')
br = camp('cq_regular_b_cp_p5_r0_-.json'); be = camp('cq_regular_b_cp_p5_r0_entry.json'); bru = camp('cq_rusher_b_cp_p5_r0_-.json'); bf3 = camp('cq_fortress3_b_cp_p5_r0_-.json')
cas0 = camp('cq_casual_b_cp_al.json'); cas1 = camp('cq_casual_b_cp_p5_r0_-.json')
m = lambda d, p, k: d[p][k][0]
NAME = {'mixed': "the bots' mix", 'heal': 'healers + guardians', 'air': 'all flyers', 'siege': 'siege', 'infil': 'infiltrators + saboteurs', 'sabo': 'saboteurs + blades', 'shadow': 'shadow strike', 'beast': 'beasts', 'line': 'ranged line', 'swarm': 'blade swarm',
        'tankline': 'tank line', 'shadow_pure': 'all shadow', 'allround': 'all-rounder'}
n = lambda a: NAME.get(a, a)
tr = lambda d, key, f='{:.0f}': ' / '.join(f.format(d[k][key]) for k in (9, 12, 15))
airo = lambda x: round((x['air_by_temper']['none'] + x['air_by_temper']['blast']) / 2)
dv = {k: ODO[k]['v1'] - A[k]['value'] for k in ODO}
ROLE_ARMY = {'shadow_siege': 'shadows + guardians + siege', 'guard_shadow': 'guardians + shadows', 'guard_beast': 'guardians + beasts', 'mystic_mass': 'massed mystics', 'infil_shadow': 'infiltrators + shadows', 'beast_shadow': 'beasts + shadows', 'guard_wall': 'all guardians'}
STRONG = {}
for k in ODO:
    c = max(ODO[k]['cands'], key=lambda x: x['avg']); cap = max(A[k]['caps'], key=A[k]['caps'].get)
    STRONG[k] = (', '.join(f'{r} {int(sh * 100)}%' for r, sh in c['roles'].items()), c['avg']) if c['avg'] >= A[k]['caps'][cap] else (ROLE_ARMY.get(cap, cap), A[k]['caps'][cap])
mid = [k for k in T if k not in ('9', '12', '15')]
E = {}
E['summary_fixed'] = (f"<b>What got fixed.</b> Flyers now have two tunings that slow them instead of one that kills them: against Watch / Reach / the rest they score {A[12]['air_by_temper']['watch']} / {A[12]['air_by_temper']['reach']} / {airo(A[12])} at Keep 12 "
    f"(were {B[12]['air_by_temper']['watch']} / {B[12]['air_by_temper']['reach']} / {airo(B[12])}). The gap between the best and worst army closed at all three Keeps ({tr(B, 'show_gap')} to {tr(A, 'show_gap')} points at Keeps 9 / 12 / 15). "
    f"Layouts are within {max(A[k]['layout_gap'] for k in A):.0f} points everywhere (were up to {max(B[k]['layout_gap'] for k in B):.0f}). Against Walled Keep, siege now scores at or above its own average at Keeps 12 and 15. "
    f"The player who builds no defences is no longer the fastest: Keep 15 on day {m(CF, 'rusher_b', 'k15'):.0f}, against {m(CF, 'regular_b', 'k15'):.0f} for a regular player and {m(CF, 'fortress3_b', 'k15'):.0f} for a medium defender.")
E['summary_not'] = (f"<b>What did not.</b> Infiltrators still flip on a 10% change in strength, and five attempts to smooth that failed. Healers with guardians are the weakest army at all three Keeps. "
    f"The search still finds armies stronger than anything in the tuned set: {STRONG[9][0]} averages {STRONG[9][1]:.0f} at Keep 9 and {STRONG[15][0]} {STRONG[15][1]:.0f} at Keep 15, where the best standard army averages {A[9]['show_best_avg']:.0f} and {A[15]['show_best_avg']:.0f}. "
    f"The new breach rule made siege a strong partner and I did not get it back under control. Rules 10 is also hard on a careless raider: {br['own12']:.1f} stars a raid at Keep 12 with a random entry, where today's game gives {TODAY12:.1f}. "
    "The seven in-between Keeps have one or two tuning rounds each and no independent check. Four of my own earlier readings were wrong; section 1.")
air_ok = max(A[k]['air_share'] for k in A) <= 0.34
STR = STRONG
E['strong'] = {str(k): list(v) for k, v in STRONG.items()}; E['dv'] = {str(k): v for k, v in dv.items()}; E['v_all'] = {str(k): ODO[k]['v1'] for k in ODO}
E['items'] = [
    ['1. Flyers best on half of all bases', 'Reach now sharpens Sky Bows too; Watch\'s boost cut by a third; flyers re-tuned.',
     f"Against Watch / Reach / the other two: {' ; '.join(f'Keep {k}: ' + str(A[k]['air_by_temper']['watch']) + ' / ' + str(A[k]['air_by_temper']['reach']) + ' / ' + str(airo(A[k])) for k in (9, 12, 15))}. Best answer on {tr(A, 'air_share', '{:.0%}')} of bases (Rules 9 on the same fresh bases: {tr(B, 'air_share', '{:.0%}')}).",
     'Partly fixed: the hard counter is gone, but flyers are still the best answer on a third of bases at Keeps 9 and 12.'],
    ['2. Beasts + shadows hole', 'That army is now a ceiling in the tuner. Searched all three Keeps, then let the defender respond to what the search found.',
     f"Beasts + shadows now averages {A[12]['caps'].get('beast_shadow', 0):.0f} at Keep 12 (best standard army {A[12]['show_best_avg']:.0f}). But the search found others: strongest {STRONG[9][1]:.0f} / {STRONG[12][1]:.0f} / {STRONG[15][1]:.0f} at Keeps 9 / 12 / 15. With every found army allowed, the game's value rises {dv[9]:.1f} / {dv[12]:.1f} / {dv[15]:.1f} points.",
     'That hole is closed. Not fixed at Keeps 9 and 15: new ones opened.'],
    ['3. Keep 9 army gap', 'Tuned against tuned bases with new bases every round; search-found armies held down, not pulled up; stronger Mist Weaver veil; Bomb Carrier stops dying on walls.',
     f"Gap {B[9]['show_gap']:.0f} → {A[9]['show_gap']:.0f}. Weakest: {n(A[9]['show_worst'])} {A[9]['show_worst_avg']:.0f} (was {n(B[9]['show_worst'])} {B[9]['show_worst_avg']:.0f}).", 'Fixed' if A[9]['show_gap'] <= 15 else 'Partly fixed: healers + guardians hold it open.'],
    ['4. Siege has no job', 'Walls have 4× health. Every siege warrior breaches: 4 to 5× damage to walls, and the walls around the one it breaks fall too.',
     f"Siege against Walled Keep (its own average): {' ; '.join(f'Keep {k}: ' + format(B[k]['siege_walled'], '.0f') + ' (' + format(B[k]['siege_avg'], '.0f') + ') → ' + format(A[k]['siege_walled'], '.0f') + ' (' + format(A[k]['siege_avg'], '.0f') + ')' for k in (9, 12, 15))}.",
     'Fixed' if all(A[k]['siege_walled'] >= A[k]['siege_avg'] - 3 for k in A) else 'Fixed at ' + ' and '.join(str(k) for k in A if A[k]['siege_walled'] >= A[k]['siege_avg'] - 3) + '; not at ' + ' or '.join(str(k) for k in A if A[k]['siege_walled'] < A[k]['siege_avg'] - 3)],
    ['5. Rushing is fastest', 'Garrison crew: two defence builds at a time need no Village Artisan. Model player now hires artisans like a real one.',
     f"Keep 15, day, today → Rules 10: no defences {m(CB, 'rusher_b', 'k15'):.0f} → {m(CF, 'rusher_b', 'k15'):.0f}; regular {m(CB, 'regular_b', 'k15'):.0f} → {m(CF, 'regular_b', 'k15'):.0f}; medium defender {m(CB, 'fortress3_b', 'k15'):.0f} → {m(CF, 'fortress3_b', 'k15'):.0f}; full defender {m(CB, 'fortress1_b', 'k15'):.0f} → {m(CF, 'fortress1_b', 'k15'):.0f}.",
     'Fixed for normal play. Heavy defence still costs time.'],
    ['6. Store, prices, revenue', 'Re-ran the campaign suite under Rules 10 with three runs per player, a competent raider, and the full battle rules.', f"Regular player reaches Keep 15 on day {m(CF, 'regular_b', 'k15'):.0f} (today {m(CB, 'regular_b', 'k15'):.0f}). Time, not loot, is what the store can sell; section 6.", 'Re-run. Revenue cannot be forecast from a model.'],
    ['7. Keep 15 layouts', 'Handicap table re-fitted against tuned bases.', f"Gap {B[15]['layout_gap']:.0f} → {A[15]['layout_gap']:.0f}.", 'Fixed' if A[15]['layout_gap'] <= 10 else 'Partly fixed'],
    ['8. Stealth and infiltrator cliffs', 'Re-measured with four times the raids; five smoothing attempts on infiltrators.', f"Shadows: no cliff ({S10['armies']['shadow']['jump']}; v4\'s reading was noise). Infiltrators: {S10['armies']['infil']['jump']} points per 10%.", 'Shadows were never broken. Infiltrators not fixed.'],
    ['9. Keeps 6, 7, 8, 10, 11, 13, 14', 'Same tuner, against tuned bases.', f"Keeps 7, 10 and 13 (two rounds): gap {' / '.join(format(T[k]['gap_first'], '.0f') for k in ('7', '10', '13'))} at the start, {' / '.join(format(T[k]['gap_est'], '.0f') for k in ('7', '10', '13'))} on the tuner\'s estimate. Keeps 6, 8, 11 and 14 had one round and were not re-measured.", 'Partly fixed: one or two rounds, no independent check.'],
    ['10. Reward size, loot by stars on attack, honor', 'Reward share cut to 0.15. Loot by stars tried on the player\'s own raids. Honor tracked week by week.',
     f"Rewards are {m(CA, 'regular_b', 'rewards'):.0f}M of {m(CA, 'regular_b', 'looted'):.0f}M raided for the regular player. Attack-side rule needs raid loot scaled 1.7× to hold pace. Honor stays between 2,700 and 5,300 for every player type.", 'Reward fixed. Honor fine. Attack-side rule not adopted.']]
E['time_bound'] = (f"Under today's rules the model player has {m(CB, 'rusher_b', 'stolen_share'):.0f}% of everything it raids taken back and still reaches Keep 15 on day {m(CB, 'rusher_b', 'k15'):.0f}. "
    f"I raised what a three-star raid can take by half and made the stars table steeper: the undefended player lost {p6['share']:.0f}% and reached Keep 15 on day {p6['k15']:.0f}. No change. "
    f"A player who picks the best of six entries gets there on day {en0['k15']:.0f} instead of {J('cq_regular_b_cp_al.json')['reached']['15']:.0f}; matchmaking hands a better raider harder bases and absorbs the rest. "
    f"What moves the date is builders: the same player with two Village Artisans takes {two['k15']:.0f} days and with four takes {m(CB, 'rusher_b', 'k15'):.0f}. All the defences together cost 247 builder-days; the Keep itself costs 36. "
    "So at today's income, loot protection alone was never going to make a defender faster, and v4's \"defence pays back in 8 days\" was true in Coins and beside the point. The real price of defence is builder time. "
    "Loot only starts to count when raids pay less, which is what the full Rules 10 does to a careless raider (section 6).")
E['scorecard_note'] = ('Both rule sets are scored on the same 48 bases per Keep, none of them used in tuning. The four probe armies and the five search-found armies are left out of the gap rows and reported in their own row. '
    f"Rules 10 is a little harder overall. The bots' mix has the best average at Keep 15 ({A[15]['avg']['mixed']:.0f}) but is the best answer on only 3 of 24 base types there: it is the safe pick, not the right one.")
E['search_note'] = ("v4 scored a search army against the defender's mix as it stood. That mix sits on four or five bases, so some army always beats it by 15 points; it was the wrong test. The table lets the defender respond and re-solves the game. "
    + (f"At Keep 15 the first search found shadows + guardians + siege averaging {max(c['avg'] for c in ODO15a['cands']):.0f}. I put it in the tuner as a ceiling and ran two more rounds; it still averages {A[15]['caps'].get('shadow_siege', 0):.0f}. "
       "The tuner cannot pull it down without pulling down the standard shadow, siege and guardian armies with it, because the strength is in the combination: siege now opens the walls and shadows walk through. " if ODO15a else '')
    + 'The lever I did not get to is the breach itself (radius, or wall health).')
E['keeps_note'] = ('Keeps 9, 12 and 15 are confirmed on fresh bases in section 2. For the other seven the "gap now" is the tuner\'s own filtered estimate after one or two rounds, taken before its last step; treat it as a direction, not a result. '
    'Keeps 6, 8, 11 and 14 had a single round. Each round is about three minutes on two cores, so finishing them is cheap.')
E['crew'] = (f"Two defence or trap builds at a time are done by the garrison and need no Village Artisan. Before this, every defence upgrade was builder time taken from everything else, which is why the player who built none was fastest. "
    f"With the crew the regular player reaches Keep 15 on day {m(CA, 'regular_b', 'k15'):.0f} against {m(CA, 'rusher_b', 'k15'):.0f} for the player with no defences, loses {m(CA, 'regular_b', 'stars12'):.1f} stars a raid at Keep 12 instead of 3, "
    f"and has {m(CA, 'regular_b', 'stolen_share'):.0f}% of its loot raided away instead of {m(CA, 'rusher_b', 'stolen_share'):.0f}%. Skipping defences no longer buys anything. "
    f"Under the full Rules 10, where a careless raider earns less and loot gets tight, the order flips: no defences day {m(CF, 'rusher_b', 'k15'):.0f}, regular {m(CF, 'regular_b', 'k15'):.0f}, medium defender {m(CF, 'fortress3_b', 'k15'):.0f}. "
    f"The figures in this paragraph are the crew and raid rules alone, on today's battle rules, to show what the crew itself does. Building heavily still costs time, by choice: day {m(CA, 'fortress3_b', 'k15'):.0f} for the player who waits for every defence to be within three levels of its cap, day {m(CA, 'fortress1_b', 'k15'):.0f} within one level. "
    f"With a crew of one instead of two those three players finish on days {c1r['k15']:.0f}, {c1f3['k15']:.0f} and {c1f1['k15']:.0f}, and the regular player's loss goes back up to {c1r['share']:.0f}%.")
E['rejected'] = [
    ['Raise the stakes: a three-star raid takes 1.5× as much, steeper stars table', f"Undefended player loses {p6['share']:.0f}% of its loot (was {m(CA, 'rusher_b', 'stolen_share'):.0f}%) and reaches Keep 15 on day {p6['k15']:.0f} (was {m(CA, 'rusher_b', 'k15'):.0f}).", 'No effect on pace. Dropped.'],
    ['Loot by stars on the player\'s own raids', f"Regular player's Keep 15 moves from day {m(CA, 'regular_b', 'k15'):.0f} to {p7['k15']:.0f}. With all raid loot scaled 1.7× to compensate: day {p8r['k15']:.0f}, but the medium defender came out at {p8f['k15']:.0f} (was {m(CA, 'fortress3_b', 'k15'):.0f}).",
     'Needs a loot rescale and showed nothing the model can measure. Left out. Worth a playtest, because it pays skill.'],
    ['Garrison crew of one', f"Regular day {c1r['k15']:.0f}, medium defender {c1f3['k15']:.0f}, full defender {c1f1['k15']:.0f}.", 'Works as the free tier if the second slot is sold.']]
E['store'] = [
    f"<b>Time is the product.</b> The third and fourth Village Artisan cut Keep 15 from day {two['k15']:.0f} to day {m(CB, 'rusher_b', 'k15'):.0f}. The model buys both with Jade it starts with or earns (500 to start; the huts cost 250 and 500) and ends with about {J('cq_regular_b_cp_al.json')['end']['moonstones']:.0f} left, short of the 1,000 for the fifth. "
    "So the first two huts will rarely be paid for. The fifth is the real purchase, and the Artisan's Bundle ($4.99, 650 Jade) does not cover it.",
    f"<b>Coin top-ups are weak value, before and after.</b> A player who loses {m(CB, 'regular_b', 'stolen_share'):.0f}% of its loot is not slowed by it, so buying Coins buys almost nothing. Under Rules 10 the regular player keeps more ({m(CA, 'regular_b', 'stolen_share'):.0f}% lost), which makes top-ups worth less still.",
    "<b>The Season Scroll is priced far below everything else that sells time.</b> Its +20% build speed over a 30-day season with four artisans working is up to 24 artisan-days. At the skip price (180 Jade for a day) that is about 4,300 Jade, roughly $60 of Jade, for $4.99. "
    "Either the Scroll is the intended anchor and skips are a trap for the impatient, or skips are priced about ten times too high to be used.",
    f"<b>What Rules 10 changes.</b> The garrison crew takes defence work off the artisans, so a player needs fewer of them; selling the second garrison slot replaces that. Defence rewards are a new source of Coins: {m(CA, 'regular_b', 'rewards'):.0f}M for the regular player and {m(CA, 'fortress1_b', 'rewards'):.0f}M for the full defender over a campaign, against roughly {m(CA, 'regular_b', 'looted'):.0f}M raided. At a share of 0.15 that is too small to move pace.",
    f"<b>Pace under the full rules.</b> The regular player reaches Keep 15 on day {m(CF, 'regular_b', 'k15'):.0f} with a random entry and on day {(be['k15'] or be['days']):.0f}{'' if be['k15'] else ' or later'} picking the best entry "
    f"(today: {m(CB, 'regular_b', 'k15'):.0f} and {en0['k15']:.0f}). The one-visit-a-day player reaches Keep 9 on day {cas1['k9'] or 0:.0f} and Keep 12 on day {(cas1['k12'] or cas1['days']):.0f}{'' if cas1['k12'] else ' or later'} (today {cas0['k9'] or 0:.0f} and {(cas0['k12'] or cas0['days']):.0f}{'' if cas0['k12'] else ' or later'}). "
    "I cannot forecast revenue from this. The model does not want things, get bored or quit."]
E['open'] = [
    ['Infiltrators', f"{S10['armies']['infil']['jump']} points for a 10% change in strength. Five fixes tried, none worked. It needs a different kit, not different numbers."],
    ['Healers + guardians', f"Weakest showcase army at Keeps 9 / 12 / 15: {A[9]['avg']['heal']:.0f} / {A[12]['avg']['heal']:.0f} / {A[15]['avg']['heal']:.0f}. Support warriors add too little at a 30% share; raising their strength only makes a massed army of them too strong."],
    ['Shadow mixes at Keeps 9 and 15', f"{STRONG[9][0]} averages {STRONG[9][1]:.0f} at Keep 9; {STRONG[15][0]} {STRONG[15][1]:.0f} at Keep 15. Best standard army: {A[9]['show_best_avg']:.0f} and {A[15]['show_best_avg']:.0f}. First lever to try: a smaller breach."],
    ['Difficulty', f"Tuned for a raider who picks a good entry. A random entry now averages {br['own12']:.1f} stars at Keep 12 (today {TODAY12:.1f}); the best of six, {be['own12']:.1f}. If that is too hard, raise every warrior's strength: the overall multiplier is 0.8 and each 0.1 is worth 8 to 10 points."],
    ['Siege at Keep 9', f"Against Walled Keep: {A[9]['siege_walled']:.0f} (its average {A[9]['siege_avg']:.0f})."],
    ['Keeps 6, 7, 8, 10, 11, 13, 14', 'One or two tuning rounds, the tuner\'s own estimate only, not searched.'],
    ['Heavy defenders', f"Day {m(CF, 'fortress1_b', 'k15'):.0f} to Keep 15 against {m(CF, 'regular_b', 'k15'):.0f} for a regular player. If full defence should cost less, give the garrison a third slot or shorten defence build times."],
    ['Formation, wave order, smoke', 'Still worth about 14 points on top of entry choice, still not in the tuning, still no squad screen.'],
    ['Loot by stars on attack', 'Pays skill, needs raid loot scaled about 1.7×. Not adopted; playtest it.'],
    ['Garrison crew', 'Needs a screen, a name and a decision on whether the second slot is sold.'],
    ['Revenue and people', 'No forecast is possible from a model, and nobody has played any of this.']]
json.dump(E, open(L + 'econ10.json', 'w'), indent=1)
for it in E['items']: print(it[0], '|', it[3])

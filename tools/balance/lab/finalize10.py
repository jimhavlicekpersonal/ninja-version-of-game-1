# Collect everything the v5 report needs.
import json, os, collections, importlib.util, csv, glob
L = './'
s = importlib.util.spec_from_file_location('c9', L + 'collect9.py'); c9 = importlib.util.module_from_spec(s); s.loader.exec_module(c9)
SHOW = ['mixed', 'swarm', 'line', 'tankline', 'air', 'shadow', 'shadow_pure', 'beast', 'siege', 'infil', 'sabo', 'heal', 'allround']
CAPS = ['guard_wall', 'mystic_mass', 'infil_shadow', 'guard_beast', 'guard_shadow', 'beast_shadow', 'shadow_siege']
ONLY = json.load(open('./armies21.json'))
def summ(path, keep, only=ONLY):
    o = c9.summary(path, keep, only); a = o['avg']
    sh = {x: a[x] for x in SHOW if x in a}; cp = {x: a[x] for x in CAPS if x in a}
    o.update(show_gap=round(max(sh.values()) - min(sh.values()), 1), show_best=max(sh, key=sh.get), show_best_avg=max(sh.values()), show_worst=min(sh, key=sh.get), show_worst_avg=min(sh.values()),
             show_mean=round(sum(sh.values()) / len(sh), 1), show_sd=round((sum((v - sum(sh.values()) / len(sh)) ** 2 for v in sh.values()) / len(sh)) ** 0.5, 1),
             cap_best=max(cp, key=cp.get), cap_best_avg=max(cp.values()), within8=sum(1 for v in sh.values() if abs(v - sum(sh.values()) / len(sh)) <= 8))
    return o
R = {'R9': {}, 'R10': {}}
for k in (9, 12, 15):
    R['R9'][str(k)] = summ(f'{L}s_R9f_k{k}.out.json', k)
    R['R10'][str(k)] = summ(f'{L}s_R10f_k{k}.out.json', k)
    full = c9.summary(f'{L}s_R10f_k{k}.out.json', k); R['R10'][str(k)]['beast_shadow'] = full['avg'].get('beast_shadow'); R['R10'][str(k)]['full_value'] = full['value']
    cp = {x: full['avg'][x] for x in CAPS if x in full['avg']}; R['R10'][str(k)]['cap_best'] = max(cp, key=cp.get); R['R10'][str(k)]['cap_best_avg'] = max(cp.values()); R['R10'][str(k)]['caps'] = cp
R['R9old12'] = summ(L + 's_R9_k12.out.json', 12); R['R10old12'] = summ(L + 's_R10_k12.out.json', 12)
json.dump(R, open(L + 'results10.json', 'w'))
keys = ('value', 'show_gap', 'show_best', 'show_best_avg', 'show_worst', 'show_worst_avg', 'show_sd', 'within8', 'cap_best', 'cap_best_avg', 'mixed_rank', 'air_share', 'air_by_temper', 'best_share', 'best_share_army', 'viable', 'scout', 'eff_armies', 'eff_bases', 'layout_gap', 'any_mean', 'best_mean', 'stars_best', 'siege_walled', 'siege_avg')
for t in ('R9', 'R10'):
    for k, x in R[t].items(): print(t, k, {a: x[a] for a in keys})
# tuner state per Keep
S = json.load(open(L + 'S10.json')); T = {}
for k, st in S.items():
    lg = st['log']; f, l = lg[0], lg[-1]
    def gap(d): v = [d[a] for a in SHOW if a in d]; return round(max(v) - min(v), 1)
    est = l['est']; sh = {a: est[a] for a in SHOW if a in est}
    T[k] = {'rounds': len(lg), 'gap_first': gap(f['avg']), 'gap_est': gap(est), 'mean': l['mean'], 'any': l['any'], 'low': min(sh, key=sh.get), 'low_v': min(sh.values()), 'high': max(sh, key=sh.get), 'high_v': max(sh.values()),
            'cap_max': max(est[a] for a in CAPS if a in est), 'lay_first': round(max(f['layouts'].values()) - min(f['layouts'].values()), 1), 'lay_last': round(sum(max(x['layouts'].values()) - min(x['layouts'].values()) for x in lg[-2:]) / len(lg[-2:]), 1),
            'tempers': l['tempers'], 'n': len(sh)}
    print('K' + k, T[k])
json.dump(T, open(L + 'tune10.json', 'w'))

# Per-Keep tuning against the full base set (6 layouts x 4 tunings), best of six entries, fresh base seeds every round,
# a filtered error estimate across rounds, coordinated (ridge) steps, and a per-layout bot-base handicap.
# Usage: python3 tune5.py keep rounds rules_in.json state.json [target]
import json, subprocess, sys, collections, os, math
import numpy as np
keep, rounds, rules, spath = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
TARGET = float(sys.argv[5]) if len(sys.argv) > 5 else 66.0
SENS, ALPHA, GAIN = 85.0, 0.6, 0.8
CAP_ONLY = {'guard_wall', 'mystic_mass', 'infil_shadow', 'guard_beast', 'guard_shadow', 'beast_shadow', 'shadow_siege'}   # probes and search-found armies: held down, never pulled up
R = json.load(open(rules)); ST = json.load(open(spath)) if os.path.exists(spath) else {}
st = ST.get(str(keep)) or {'mult': dict(R['troopPatchByKeep'][str(keep)]), 'bias': dict(R['layoutBiasByKeep'][str(keep)]), 'est': {}, 'round': 0, 'log': []}
mult, bias, est = st['mult'], st['bias'], st['est']
T = json.load(open('../../../src/gameplay/data/troops.json'))
src = open('mkcfg.py').read(); armies = eval('[' + src.split("armies = [")[1].split("\n]\n")[0] + ']')
armies = [a for a in armies if a['id'] not in ('air_tank', 'sky_shadow', 'beast_line')] + json.load(open('extra_armies.json'))
layouts = ['kunai_ring','walled_keep','mortar_core','twin_gates','open_court','random']
TEMP = {'none':None,'reach':{'acorn_cannon':{'reach':10},'wasp_nest':{'reach':10}},'blast':{'acorn_cannon':{'blast':10}},'watch':{'acorn_cannon':{'watch':10},'wasp_nest':{'watch':10}}}
tag = f'tk{keep}'
for _ in range(rounds):
    r = st['round']
    cfg = {'keeps':[keep],'seeds':1,'seedBase':10 + 4 * r,'plans':1,'armies':armies,'bases':[{'id':f'{l}|{t}','layout':l,'temper':TEMP[t],'levelBias':bias[l],'seedOffset':ti} for l in layouts for ti, t in enumerate(TEMP)],
           'patch':R['patch'], 'buildingPatch':R.get('buildingPatch',{}), 'troopPatch':{'all':R['troopPatch']['all']},
           'troopPatchByKeep':{str(keep):mult}, 'planner':'search','shapes':['cluster'],'orders':['tanks'],'smokes':['none']}
    json.dump(cfg, open(f'{tag}.json','w'))
    subprocess.run(['./run.sh',f'{tag}.json',f'{tag}.out.json'], check=True, capture_output=True)
    rows = json.load(open(f'{tag}.out.json')); meta = json.load(open(f'{tag}.out.json.meta'))
    cell = collections.defaultdict(list)
    for x in rows: cell[(x['army'], x['base'])].append(x['d'])
    best = collections.defaultdict(list); lay = collections.defaultdict(list); tem = collections.defaultdict(list); anyv = []
    for (a, b), v in cell.items(): best[a].append(max(v)); lay[b.split('|')[0]].append(max(v)); tem[b.split('|')[1]].append(max(v)); anyv.append(sum(v)/len(v))
    avg = {a: sum(v)/len(v) for a, v in best.items()}; lavg = {l: sum(v)/len(v) for l, v in lay.items()}; tavg = {t: sum(v)/len(v) for t, v in tem.items()}
    # filtered estimate of each army's average at the current multipliers
    for a, v in avg.items(): est[a] = v if a not in est else ALPHA * v + (1 - ALPHA) * est[a]
    core = {a: v for a, v in est.items() if a not in CAP_ONLY}
    rec = {'round': r, 'mean': round(sum(avg.values())/len(avg), 1), 'any': round(sum(anyv)/len(anyv), 1), 'spread_raw': round(max(avg[a] for a in core) - min(avg[a] for a in core), 1),
           'spread_est': round(max(core.values()) - min(core.values()), 1), 'avg': {a: round(v, 1) for a, v in avg.items()}, 'est': {a: round(v, 1) for a, v in est.items()},
           'layouts': {l: round(v, 1) for l, v in lavg.items()}, 'tempers': {t: round(v, 1) for t, v in tavg.items()}}
    st['log'].append(rec)
    top = sorted(core.items(), key=lambda t: -t[1])
    print(f"K{keep} r{r}: mean {rec['mean']} any {rec['any']} | gap raw {rec['spread_raw']} est {rec['spread_est']} | top {top[0][0]} {top[0][1]:.0f}, {top[1][0]} {top[1][1]:.0f} | low {top[-1][0]} {top[-1][1]:.0f}, {top[-2][0]} {top[-2][1]:.0f} | caps max {max(est[a] for a in CAP_ONLY if a in est):.0f} | lay {' '.join(f'{l[:4]} {v:.0f}' for l, v in lavg.items())} | tun {' '.join(f'{t} {v:.0f}' for t, v in tavg.items())}", flush=True)
    names = sorted({t for a in avg for t in meta[f'{keep}|{a}']}); idx = {t: i for i, t in enumerate(names)}
    A = []; e = []; w = []; ids = []
    for a in avg:
        v = est[a]
        comp = meta[f'{keep}|{a}']; tot = sum(T[t]['housing'] * n for t, n in comp.items())
        rowv = np.zeros(len(names))
        for t, n in comp.items(): rowv[idx[t]] = T[t]['housing'] * n / tot
        ids.append((a, rowv))
        if a in CAP_ONLY and v <= TARGET: continue
        A.append(rowv * SENS); e.append(TARGET - v); w.append(1.0 + max(0.0, v - TARGET) / 8.0)
    A = np.array(A); e = np.array(e); sw = np.sqrt(np.array(w))[:, None]
    d = np.linalg.solve((A * sw).T @ (A * sw) + 12.0 ** 2 * np.eye(len(names)), (A * sw).T @ (e * sw[:, 0]))
    step = np.clip(GAIN * d, -0.2, 0.2)
    for t in names: mult[t] = round(max(0.2, min(5.0, mult.get(t, 1.0) * math.exp(step[idx[t]]))), 3)
    for a, rowv in ids: est[a] = est[a] + SENS * float(rowv @ step)      # carry the estimate forward to the new multipliers
    m = sum(lavg.values()) / len(lavg); lest = st.setdefault('lest', {})
    for l in layouts:
        dev = lavg[l] - m; lest[l] = dev if l not in lest else 0.5 * dev + 0.5 * lest[l]
        stepb = 0.4 * lest[l] / 66.0; bias[l] = round(max(0.1, min(0.9, bias[l] + stepb)), 3); lest[l] -= stepb * 66.0
    st['round'] = r + 1
    ST = json.load(open(spath)) if os.path.exists(spath) else {}; ST[str(keep)] = st; json.dump(ST, open(spath, 'w'))
print('done')

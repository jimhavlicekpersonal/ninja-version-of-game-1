# Automatic tune <-> search loop (plan step A2/A3). Per round: fight every army against the full base set on bases
# not used before; keep a filtered estimate; search random armies against the defender's best mix and let the
# defender respond; add any found army more than MARGIN above the target as a ceiling; then step.
# Objective ("role frontier"): no army above the target, and for every role the best army that leans on it at the target.
# Usage: python3 tune6.py keep rounds rules_in.json state.json [target]
import json, subprocess, sys, collections, os, math, random, importlib.util
import numpy as np
s_ = importlib.util.spec_from_file_location('an', './analyze.py'); an = importlib.util.module_from_spec(s_); s_.loader.exec_module(an)
keep, rounds, rules, spath = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
TARGET = float(sys.argv[5]) if len(sys.argv) > 5 else 66.0
SENS, ALPHA, GAIN, MARGIN, NCAND = 85.0, 0.6, 0.7, 4.0, int(os.environ.get('NCAND', '40'))
REPO = os.environ.get('SIMREPO', '../../..')
R = json.load(open(rules)); ST = json.load(open(spath)) if os.path.exists(spath) else {}
st = ST.get(str(keep)) or {'mult': dict(R['troopPatchByKeep'][str(keep)]), 'bias': dict(R['layoutBiasByKeep'][str(keep)]), 'est': {}, 'round': 0, 'log': [], 'found': [], 'lest': {}}
mult, bias, est = st['mult'], st['bias'], st['est']
T = json.load(open(REPO + '/src/gameplay/data/troops.json'))
ROLE = {(w.get('liveTroop') or w['id']): w['role'] for w in json.load(open(REPO + '/src/gameplay/data/roster.json'))['warriors']}
ROLES = ['blade','thrower','guardian','saboteur','infiltrator','sky','mystic','siege','beast','shadow']
src = open('mkcfg.py').read(); base_armies = eval('[' + src.split("armies = [")[1].split("\n]\n")[0] + ']')
base_armies = [a for a in base_armies if a['id'] not in ('air_tank', 'sky_shadow', 'beast_line')] + json.load(open('extra_armies.json'))
layouts = ['kunai_ring','walled_keep','mortar_core','twin_gates','open_court','random']
TEMP = {'none':None,'reach':{'acorn_cannon':{'reach':10},'wasp_nest':{'reach':10}},'blast':{'acorn_cannon':{'blast':10}},'watch':{'acorn_cannon':{'watch':10},'wasp_nest':{'watch':10}}}
tag = f'lk{keep}'
def run(armies, bases, r, name):
    cfg = {'keeps':[keep],'seeds':1,'seedBase':300 + 4 * r,'plans':1,'armies':armies,'bases':bases,'patch':R['patch'],'buildingPatch':R.get('buildingPatch',{}),'troopPatch':{'all':R['troopPatch']['all']},
           'troopPatchByKeep':{str(keep):mult},'planner':'search','shapes':['cluster'],'orders':['tanks'],'smokes':['none']}
    json.dump(cfg, open(f'{name}.json','w')); subprocess.run(['./run.sh',f'{name}.json',f'{name}.out.json'], check=True, capture_output=True)
    cell = collections.defaultdict(list)
    for x in json.load(open(f'{name}.out.json')): cell[(x['army'], x['base'])].append(x['d'])
    return {k: max(v) for k, v in cell.items()}, json.load(open(f'{name}.out.json.meta'))
def shares(comp):
    tot = sum(T[t]['housing'] * n for t, n in comp.items()); sh = collections.defaultdict(float)
    for t, n in comp.items(): sh[ROLE.get(t, '?')] += T[t]['housing'] * n / tot
    return sh
for _ in range(rounds):
    r = st['round']; armies = base_armies + st['found']
    allb = [{'id':f'{l}|{t}','layout':l,'temper':TEMP[t],'levelBias':bias[l],'seedOffset':ti} for l in layouts for ti, t in enumerate(TEMP)]
    best, meta = run(armies, allb, r, tag)
    ids = [a['id'] for a in armies if f"{keep}|{a['id']}" in meta]; bids = [b['id'] for b in allb]
    S = np.array([[best[(a, b)] for b in bids] for a in ids]); avg = {a: float(S[i].mean()) for i, a in enumerate(ids)}
    lavg = {l: float(np.mean([S[:, j].mean() for j, b in enumerate(bids) if b.startswith(l + '|')])) for l in layouts}
    for a, v in avg.items(): est[a] = v if a not in est else ALPHA * v + (1 - ALPHA) * est[a]
    # search against the defender's best mix, then let the defender respond
    v0, p, q = an.solve(S); support = [(j, q[j]) for j in range(len(bids)) if q[j] > 0.04]; tw = sum(w for _, w in support)
    rng = random.Random(1000 * keep + r); cands = []
    for i in range(NCAND):
        pick = rng.sample(ROLES, rng.choice([2,3,3,4,4,5])); w = [rng.gammavariate(1.0, 1.0) + 0.05 for _ in pick]; t = sum(w)
        cands.append({'id': f'c{r}_{i}', 'roles': {x: round(y / t, 2) for x, y in zip(pick, w)}})
    cb, cmeta = run(cands, [allb[j] for j, _ in support], r, tag + 's')
    score = {c['id']: sum(w / tw * cb[(c['id'], bids[j])] for j, w in support) for c in cands if (c['id'], bids[support[0][0]]) in cb}
    top = sorted(score, key=score.get, reverse=True)[:3]; topc = [c for c in cands if c['id'] in top]
    fb, fmeta = run(topc, allb, r, tag + 'f'); added = []; v1 = v0
    if topc:
        extra = np.array([[fb[(c['id'], b)] for b in bids] for c in topc]); v1, _, _ = an.solve(np.vstack([S, extra]))
        for i, c in enumerate(topc):
            a = float(extra[i].mean())
            near = any(sum(abs(c['roles'].get(x, 0) - o['roles'].get(x, 0)) for x in ROLES) < 0.5 for o in st['found'] if 'roles' in o)
            if a > TARGET + MARGIN and not near and len(added) < 2:
                nm = f"f{keep}_{len(st['found'])}"; st['found'].append({'id': nm, 'roles': c['roles']}); est[nm] = a; meta[f'{keep}|{nm}'] = fmeta[f"{keep}|{c['id']}"]; added.append((nm, round(a)))
        best_found = max(float(extra[i].mean()) for i in range(len(topc)))
    else: best_found = 0
    # role frontier
    front = {}
    for role in ROLES:
        c = [(est[a], a) for a in est if f'{keep}|{a}' in meta and shares(meta[f'{keep}|{a}'])[role] >= 0.3]
        if c: front[role] = max(c)
    topa = max(est, key=est.get)
    rec = {'round': r, 'mean': round(float(S.mean()), 1), 'value': round(float(v0), 1), 'value_with_search': round(float(v1), 1), 'best_found': round(best_found, 1), 'added': added, 'top': [topa, round(est[topa], 1)],
           'front': {k: [v[1], round(v[0], 1)] for k, v in front.items()}, 'layouts': {l: round(v, 1) for l, v in lavg.items()}, 'n_found': len(st['found'])}
    st['log'].append(rec)
    fv = [v[0] for v in front.values()]
    print(f"K{keep} r{r}: mean {rec['mean']} | top {topa} {est[topa]:.0f} | role bests {min(fv):.0f}-{max(fv):.0f} (low: {min(front, key=lambda k: front[k][0])}) | search best {best_found:.0f}, value {v0:.1f}->{v1:.1f} | added {added} | lay gap {max(lavg.values()) - min(lavg.values()):.0f}", flush=True)
    names = sorted({t for a in est if f'{keep}|{a}' in meta for t in meta[f'{keep}|{a}']}); idx = {t: i for i, t in enumerate(names)}
    rowsA = {}
    for a in est:
        if f'{keep}|{a}' not in meta: continue
        comp = meta[f'{keep}|{a}']; tot = sum(T[t]['housing'] * n for t, n in comp.items()); rowv = np.zeros(len(names))
        for t, n in comp.items(): rowv[idx[t]] = T[t]['housing'] * n / tot
        rowsA[a] = rowv
    A = []; e = []; w = []
    for a, rowv in rowsA.items():
        if est[a] > TARGET: A.append(rowv * SENS); e.append(TARGET - est[a]); w.append(1.0 + (est[a] - TARGET) / 6.0)
    for role, (v, a) in front.items():
        if v < TARGET: A.append(rowsA[a] * SENS); e.append(TARGET - v); w.append(1.0)
    if A:
        A = np.array(A); e = np.array(e); sw = np.sqrt(np.array(w))[:, None]
        d = np.linalg.solve((A * sw).T @ (A * sw) + 12.0 ** 2 * np.eye(len(names)), (A * sw).T @ (e * sw[:, 0])); step = np.clip(GAIN * d, -0.2, 0.2)
        for t in names: mult[t] = round(max(0.2, min(5.0, mult.get(t, 1.0) * math.exp(step[idx[t]]))), 3)
        for a, rowv in rowsA.items(): est[a] = est[a] + SENS * float(rowv @ step)
    m = sum(lavg.values()) / len(lavg); lest = st.setdefault('lest', {})
    for l in layouts:
        dev = lavg[l] - m; lest[l] = dev if l not in lest else 0.5 * dev + 0.5 * lest[l]
        sb = 0.4 * lest[l] / 66.0; bias[l] = round(max(0.1, min(0.9, bias[l] + sb)), 3); lest[l] -= sb * 66.0
    st['round'] = r + 1; st['meta'] = {k: v for k, v in meta.items()}
    ST = json.load(open(spath)) if os.path.exists(spath) else {}; ST[str(keep)] = st; json.dump(ST, open(spath, 'w'))
print('done')

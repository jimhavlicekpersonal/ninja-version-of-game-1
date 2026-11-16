# Adversarial search under Rules 9 (best-entry payoff). Usage: python3 oracle10.py out.json rules.json keep n seed
import json, sys, subprocess, random, collections, importlib.util
import numpy as np
s=importlib.util.spec_from_file_location('an','./analyze.py'); an=importlib.util.module_from_spec(s); s.loader.exec_module(an)
out, rulesf, keep, ncand, seed = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
rows, _ = an.load(out); armies, bases, N, S = an.matrices(rows, keep)
v, p, q = an.solve(S)
support = [(bases[j], q[j]) for j in range(len(bases)) if q[j] > 0.04]
tot = sum(w for _, w in support); support = [(b, w / tot) for b, w in support]
R = json.load(open(rulesf)); LB = dict(R.get('layoutBias', {})); LB.update(R.get('layoutBiasByKeep', {}).get(str(keep), {}))
T = {'none':None,'reach':{'acorn_cannon':{'reach':10},'wasp_nest':{'reach':10}},'blast':{'acorn_cannon':{'blast':10}},'watch':{'acorn_cannon':{'watch':10},'wasp_nest':{'watch':10}}}
rng = random.Random(seed); roles = ['blade','thrower','guardian','saboteur','infiltrator','sky','mystic','siege','beast','shadow']
cands = []
for i in range(ncand):
    pick = rng.sample(roles, rng.choice([2,3,3,4,4,5])); w = [rng.gammavariate(1.0, 1.0) + 0.05 for _ in pick]; t = sum(w)
    cands.append({'id': f'c{i}', 'roles': {r: round(x / t, 2) for r, x in zip(pick, w)}})
cfg = {'keeps':[keep],'seeds':2,'plans':1,'armies':cands,
       'seedBase':200,'bases':[dict({'id':b,'layout':b.split('|')[0],'temper':T[b.split('|')[1]],'seedOffset':list(T).index(b.split('|')[1])}, **({'levelBias':LB[b.split('|')[0]]} if b.split('|')[0] in LB else {})) for b,_ in support],
       'patch':R['patch'],'troopPatch':R['troopPatch'],'buildingPatch':R.get('buildingPatch',{}),'troopPatchByKeep':R.get('troopPatchByKeep'),'planner':'search','shapes':['cluster'],'orders':['tanks'],'smokes':['none']}
json.dump(cfg, open('oracle10.json','w'))
subprocess.run(['./run.sh','oracle10.json','oracle10.out.json'], check=True, capture_output=True)
cell = collections.defaultdict(list)
for x in json.load(open('oracle10.out.json')): cell[(x['army'], x['base'], x['seed'])].append(x['d'])
d = collections.defaultdict(lambda: collections.defaultdict(list))
for (a, b, sd), vals in cell.items(): d[a][b].append(max(vals))
score = {a: sum(w * np.mean(d[a][b]) for b, w in support) for a in d}
best = sorted(score.items(), key=lambda t: -t[1])[:6]
print(f'equilibrium value {v:.1f}; defender support {[(b, round(w,2)) for b,w in support]}')
print(f'{len(score)} random armies: best {best[0][1]:.1f}, median {np.median(list(score.values())):.1f}; above value+3: {sum(1 for s_ in score.values() if s_ > v + 3)}; above value+6: {sum(1 for s_ in score.values() if s_ > v + 6)}')
for a, sc in best: print(f'  {sc:.1f}', next(c['roles'] for c in cands if c['id'] == a))
json.dump({'value': float(v), 'n': len(score), 'median': float(np.median(list(score.values()))), 'above3': sum(1 for s_ in score.values() if s_ > v + 3), 'best': [(float(sc), next(c['roles'] for c in cands if c['id'] == a)) for a, sc in best]}, open(f'oracle10_k{keep}.result.json','w'))

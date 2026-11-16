# Double-oracle step: give the attacker the best armies the search found, on every base, and re-solve the game.
# Usage: python3 oracle_do.py scorecard.out.json rules.json keep
import json, sys, subprocess, collections, importlib.util
import numpy as np
s=importlib.util.spec_from_file_location('an','./analyze.py'); an=importlib.util.module_from_spec(s); s.loader.exec_module(an)
out, rulesf, keep = sys.argv[1], sys.argv[2], int(sys.argv[3])
ONLY = json.load(open('./armies21.json'))
rows, _ = an.load(out)
armies, bases, N, S = an.matrices(rows, keep); v0, p0, q0 = an.solve(S)
res = json.load(open(f'oracle10_k{keep}.result.json')); cands = [{'id': f'x{i}', 'roles': r} for i, (sc, r) in enumerate(res['best'][:5])]
R = json.load(open(rulesf)); LB = dict(R.get('layoutBias', {})); LB.update(R.get('layoutBiasByKeep', {}).get(str(keep), {}))
T = {'none':None,'reach':{'acorn_cannon':{'reach':10},'wasp_nest':{'reach':10}},'blast':{'acorn_cannon':{'blast':10}},'watch':{'acorn_cannon':{'watch':10},'wasp_nest':{'watch':10}}}
cfg = {'keeps':[keep],'seeds':2,'seedBase':200,'plans':1,'armies':cands,
       'bases':[dict({'id':b,'layout':b.split('|')[0],'temper':T[b.split('|')[1]],'seedOffset':list(T).index(b.split('|')[1])}, **({'levelBias':LB[b.split('|')[0]]} if b.split('|')[0] in LB else {})) for b in bases],
       'patch':R['patch'],'troopPatch':R['troopPatch'],'buildingPatch':R.get('buildingPatch',{}),'troopPatchByKeep':R.get('troopPatchByKeep'),'planner':'search','shapes':['cluster'],'orders':['tanks'],'smokes':['none']}
import os
if not os.environ.get('REUSE'):
    json.dump(cfg, open(f'odo{keep}.json','w')); subprocess.run(['./run.sh',f'odo{keep}.json',f'odo{keep}.out.json'], check=True, capture_output=True)
cell = collections.defaultdict(list)
for x in json.load(open(f'odo{keep}.out.json')): cell[(x['army'], x['base'], x['seed'])].append(x['d'])
d = collections.defaultdict(lambda: collections.defaultdict(list))
for (a, b, sd), vals in cell.items(): d[a][b].append(max(vals))
extra = np.array([[np.mean(d[c['id']][b]) for b in bases] for c in cands])
S2 = np.vstack([S, extra]); v1, p1, q1 = an.solve(S2)
names = armies + [c['id'] for c in cands]
print(f'K{keep}: value {v0:.1f} -> {v1:.1f} with the five best search armies added (+{v1 - v0:.1f})')
for i, c in enumerate(cands): print(f"   {c['roles']}: vs old mix {res['best'][i][0]:.0f}, average over all bases {extra[i].mean():.0f}, weight in new attacker mix {p1[len(armies) + i]:.2f}")
print('   new defender mix', {bases[j]: round(float(q1[j]), 2) for j in range(len(bases)) if q1[j] > 0.04})
json.dump({'v0': float(v0), 'v1': float(v1), 'cands': [{'roles': c['roles'], 'vs_old': res['best'][i][0], 'avg': float(extra[i].mean()), 'weight': float(p1[len(armies) + i])} for i, c in enumerate(cands)],
           'show_mean': float(np.mean([S[armies.index(a)].mean() for a in ['mixed','swarm','line','tankline','air','shadow','shadow_pure','beast','siege','infil','sabo','heal','allround']]))}, open(f'odo_k{keep}.result.json','w'))

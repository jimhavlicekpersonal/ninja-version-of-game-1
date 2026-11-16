# Cliffs, measured with enough raids to see them. Usage: python3 sens10.py rules.json keep tag seeds [armies...]
import json, subprocess, sys, collections
R = json.load(open(sys.argv[1])); keep = int(sys.argv[2]); tag = sys.argv[3]; seeds = int(sys.argv[4]); want = sys.argv[5:]
import os
OV = json.loads(os.environ.get('OVER', '{}')); R['patch'] = dict(R['patch'], **OV.get('patch', {})); R['troopPatch'] = dict(R['troopPatch'], **OV.get('troopPatch', {}))
LB = dict(R.get('layoutBias', {})); LB.update(R.get('layoutBiasByKeep', {}).get(str(keep), {}))
ALL = {'air':{'sky':1}, 'shadow':{'shadow':.8,'guardian':.2}, 'infil':{'infiltrator':.7,'saboteur':.3}, 'swarm':{'blade':.8,'guardian':.2}, 'line':{'thrower':.65,'guardian':.35}}
armies = [{'id':a,'roles':ALL[a]} for a in (want or ALL)]
layouts = ['kunai_ring','walled_keep','mortar_core','twin_gates','open_court','random']
mults = [0.8, 0.9, 1.0, 1.1, 1.2, 1.35]; res = {}; se = {}
for m in mults:
    tp = dict(R['troopPatch']); a0 = tp.get('all', {'hp':1,'dmg':1}); tp['all'] = {'hp':a0['hp']*m,'dmg':a0['dmg']*m}
    cfg = {'keeps':[keep],'seeds':seeds,'plans':1,'armies':armies,'bases':[dict({'id':f'{l}|none','layout':l,'temper':None}, **({'levelBias':LB[l]} if l in LB else {})) for l in layouts],
           'patch':R['patch'],'troopPatch':tp,'buildingPatch':R.get('buildingPatch',{}),'troopPatchByKeep':R.get('troopPatchByKeep'),'planner':'search','shapes':['cluster'],'orders':['tanks'],'smokes':['none']}
    json.dump(cfg, open('sens10.json','w')); subprocess.run(['./run.sh','sens10.json','sens10.out.json'], check=True, capture_output=True)
    cell = collections.defaultdict(list)
    for x in json.load(open('sens10.out.json')): cell[(x['army'], x['base'], x['seed'])].append(x['d'])
    d = collections.defaultdict(list)
    for (a, b, s), v in cell.items(): d[a].append(max(v))
    res[m] = {a: sum(v)/len(v) for a, v in d.items()}
    se[m] = {a: (sum((x - res[m][a]) ** 2 for x in v) / len(v)) ** 0.5 / len(v) ** 0.5 for a, v in d.items()}
out = {}
for a in [x['id'] for x in armies]:
    vals = [res[m][a] for m in mults]; steps = [y - x for x, y in zip(vals, vals[1:])]
    out[a] = {'vals': [round(v) for v in vals], 'jump': round(max(abs(s) for s in steps)), 'se': round(sum(se[m][a] for m in mults) / len(mults), 1)}
    print(f'{tag} {a:8}', ' '.join(f'{v:5.0f}' for v in vals), '| biggest step', out[a]['jump'], '| ±', out[a]['se'])
json.dump({'mults': mults, 'armies': out, 'seeds': seeds}, open(f'sens10_{tag}_k{keep}.json', 'w'))

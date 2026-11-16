# Structural experiment panel. Usage: python3 xp.py keep variants.json [seeds]
import json, subprocess, collections, sys
keep = int(sys.argv[1]); V = json.load(open(sys.argv[2])); seeds = int(sys.argv[3]) if len(sys.argv) > 3 else 1
import os
R9 = json.load(open(os.environ.get('RULES','R9.json')))
armies = json.loads(os.environ['ARMIES']) if os.environ.get('ARMIES') else [{'id':'air','roles':{'sky':1}},{'id':'swarm','roles':{'blade':.8,'guardian':.2}},{'id':'line','roles':{'thrower':.65,'guardian':.35}},{'id':'siege','roles':{'siege':.5,'blade':.3,'guardian':.2}},
          {'id':'infil','roles':{'infiltrator':.7,'saboteur':.3}},{'id':'shadow','roles':{'shadow':.8,'guardian':.2}},{'id':'mixed'},{'id':'heal','roles':{'mystic':.3,'guardian':.4,'blade':.3}},{'id':'beast','roles':{'beast':.7,'guardian':.3}}]
T = {'none':None,'reach':{'acorn_cannon':{'reach':10},'wasp_nest':{'reach':10}},'blast':{'acorn_cannon':{'blast':10}},'watch':{'acorn_cannon':{'watch':10},'wasp_nest':{'watch':10}}}
LB = R9['layoutBiasByKeep'][str(keep)]; lays = ['kunai_ring','walled_keep','mortar_core','twin_gates','open_court','random']
for name, over in V.items():
    patch = dict(R9['patch']); patch.update(over.get('patch', {}))
    cfg = {'keeps':[keep],'seeds':seeds,'plans':1,'armies':armies,'bases':[{'id':f'{l}|{t}','layout':l,'temper':T[t],'levelBias':LB[l]} for l in lays for t in T],
           'patch':patch,'buildingPatch':dict(R9.get('buildingPatch',{}), **over.get('buildingPatch',{})),'troopPatch':dict(R9['troopPatch'], **over.get('troopPatch',{})),'troopPatchByKeep':R9['troopPatchByKeep'],
           'planner':'search','shapes':['cluster'],'orders':['tanks'],'smokes':['none']}
    json.dump(cfg, open('xp.json','w')); subprocess.run(['./run.sh','xp.json','xp.out.json'], check=True, capture_output=True)
    cell = collections.defaultdict(list)
    for x in json.load(open('xp.out.json')): cell[(x['army'], x['base'], x['seed'])].append(x['d'])
    bt = collections.defaultdict(list); bl = collections.defaultdict(list)
    for (a, b, s), v in cell.items(): bt[(a, b.split('|')[1])].append(max(v)); bl[(a, b.split('|')[0])].append(max(v))
    m = lambda xs: sum(xs) / len(xs)
    print(f'== {name}')
    for a in [x['id'] for x in armies]:
        print(f'  {a:7}', ' '.join(f'{t} {m(bt[(a, t)]):3.0f}' for t in T), '| all %3.0f |' % m([y for t in T for y in bt[(a, t)]]), ' '.join(f'{l[:5]} {m(bl[(a, l)]):3.0f}' for l in lays), flush=True)

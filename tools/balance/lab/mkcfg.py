# Build a lab config. Usage: python3 mkcfg.py out.json keeps seeds plans [patch.json]
import json, sys
out, keeps, seeds, plans = sys.argv[1], [int(k) for k in sys.argv[2].split(',')], int(sys.argv[3]), int(sys.argv[4])
patch = json.load(open(sys.argv[5])) if len(sys.argv) > 5 else {}
armies = [
 {'id':'mixed'},
 {'id':'swarm','roles':{'blade':.8,'guardian':.2}},
 {'id':'line','roles':{'thrower':.65,'guardian':.35}},
 {'id':'tankline','roles':{'guardian':.4,'thrower':.4,'mystic':.2}},
 {'id':'air','roles':{'sky':1}},
 {'id':'air_tank','roles':{'sky':.7,'guardian':.3}},
 {'id':'shadow','roles':{'shadow':.8,'guardian':.2}},
 {'id':'shadow_pure','roles':{'shadow':1}},
 {'id':'beast','roles':{'beast':.8,'guardian':.2}},
 {'id':'siege','roles':{'siege':.4,'blade':.4,'guardian':.2}},
 {'id':'infil','roles':{'infiltrator':.7,'saboteur':.3}},
 {'id':'sabo','roles':{'saboteur':.4,'blade':.4,'guardian':.2}},
 {'id':'heal','roles':{'mystic':.3,'guardian':.4,'blade':.3}},
 {'id':'allround','roles':{'blade':.25,'thrower':.25,'guardian':.2,'shadow':.15,'sky':.15}},
 {'id':'beast_line','roles':{'beast':.5,'thrower':.5}},
 {'id':'sky_shadow','roles':{'sky':.5,'shadow':.5}},
]
T = {'none':None,
     'reach':{'acorn_cannon':{'reach':10},'wasp_nest':{'reach':10}},
     'blast':{'acorn_cannon':{'blast':10}},
     'watch':{'acorn_cannon':{'watch':10},'wasp_nest':{'watch':10}}}
import os
if os.environ.get('BLENDS'):
    T.update({'reach+blast':{'acorn_cannon':{'reach':5,'blast':5},'wasp_nest':{'reach':5}},
              'reach+watch':{'acorn_cannon':{'reach':5,'watch':5},'wasp_nest':{'reach':5,'watch':5}},
              'blast+watch':{'acorn_cannon':{'blast':5,'watch':5},'wasp_nest':{'watch':5}}})
layouts = ['kunai_ring','walled_keep','mortar_core','twin_gates','open_court','random']
LB = dict(patch.get('layoutBias', {})); LB.update(patch.get('layoutBiasByKeep', {}).get(str(keeps[0]), {}))
import os as _o
FRESH = _o.environ.get('FRESH')
bases = [dict({'id':f'{l}|{t}','layout':l,'temper':T[t]}, **({'levelBias':LB[l]} if l in LB else {}), **({'seedOffset':ti} if FRESH else {})) for l in layouts for ti, t in enumerate(T)]
if os.path.exists('extra_armies.json') and not os.environ.get('NOEXTRA'): armies = armies + json.load(open('extra_armies.json'))
if os.environ.get('EXTRA'): armies = armies + json.load(open(os.environ['EXTRA']))
import os as _os
cfg = {'keeps':keeps,'seeds':seeds,'seedBase':int(_os.environ.get('SEEDBASE','200' if _os.environ.get('FRESH') else '0')),'plans':plans,'armies':patch.get('armies',armies),'bases':patch.get('bases',bases),
       'patch':patch.get('patch',{}),'troopPatch':patch.get('troopPatch',{}),'classes':patch.get('classes','size'),'formation':patch.get('formation'),'buildingPatch':patch.get('buildingPatch',{}),'troopPatchByKeep':patch.get('troopPatchByKeep')}
if os.environ.get('SEARCH'): cfg.update({'planner':'search','shapes':['cluster'],'orders':['tanks'],'smokes':['none']})
json.dump(cfg, open(out,'w'))

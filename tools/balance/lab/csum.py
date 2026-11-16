# Mean over replicates. Usage: python3 csum.py <patch tag> policies...
import json, sys, glob, statistics
tag = sys.argv[1]; out = {}
for pol in sys.argv[2:]:
    import os
    SUF = os.environ.get('SUF', '')
    fs = sorted(glob.glob(f'./cq_{pol}_{tag}_r[0-9]{SUF}.json')) if SUF else sorted(glob.glob(f'./cq_{pol}_{tag}.json') + glob.glob(f'./cq_{pol}_{tag}_r[0-9].json'))
    rs = [json.load(open(f)) for f in fs]
    if not rs: continue
    def m(f):
        xs = [f(r) for r in rs]; xs = [x for x in xs if x is not None]
        return (round(statistics.mean(xs), 1), round(min(xs), 1), round(max(xs), 1), len(xs)) if xs else None
    def bk(k, key): return m(lambda r: next((x.get(key) for x in r['byKeep'] if x['keep'] == k), None))
    out[pol] = {'n': len(rs), 'k12': m(lambda r: r['reached'].get('12')), 'k15': m(lambda r: r['reached'].get('15')), 'k9': m(lambda r: r['reached'].get('9')),
                'stolen_share': m(lambda r: 100 * r['totals']['stolen'] / r['totals']['looted']), 'rewards': m(lambda r: r['totals']['defenseRewards'] / 1e6), 'looted': m(lambda r: r['totals']['looted'] / 1e6),
                'honor': m(lambda r: r.get('end', {}).get('trophies')), 'stars12': bk(12, 'defStars'), 'stolen12': bk(12, 'stolen'), 'stars14': bk(14, 'defStars'), 'stolen14': bk(14, 'stolen'), 'held12': bk(12, 'held'),
                'own12': bk(12, 'stars'), 'loot12': bk(12, 'loot')}
    o = out[pol]
    print(f"{tag} {pol:12} n={o['n']} | K12 day {o['k12'][0]} ({o['k12'][1]}–{o['k12'][2]}) | K15 day {o['k15'][0] if o['k15'] else None} ({o['k15'][1] if o['k15'] else ''}–{o['k15'][2] if o['k15'] else ''}; {o['k15'][3] if o['k15'] else 0} reached) | stolen {o['stolen_share'][0]}% | K12 def {o['stars12'][0]}★ lost {o['stolen12'][0]/1e6:.2f}M | K14 {o['stars14'][0]}★ {o['stolen14'][0]/1e6:.2f}M | rewards {o['rewards'][0]}M | honor {o['honor'][0] if o['honor'] else None}")
import os
json.dump(out, open(f"./csum_{tag}{os.environ.get('SUF', '')}.json", 'w'))

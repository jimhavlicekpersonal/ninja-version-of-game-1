import json,importlib.util,sys
L='./'
s=importlib.util.spec_from_file_location('c9',L+'collect9.py'); c9=importlib.util.module_from_spec(s); s.loader.exec_module(c9)
SHOW=['mixed','swarm','line','tankline','air','shadow','shadow_pure','beast','siege','infil','sabo','heal','allround']
out={}
for k in map(int,sys.argv[1:]):
    for nm,f in (('R10',f'{L}s_R10f_k{k}.out.json'),('R12',f'{L}s_R12f_k{k}.out.json')):
        o=c9.summary(f,k); a=o['avg']; sh={x:a[x] for x in SHOW}; m=sum(sh.values())/len(sh)
        oth={x:v for x,v in a.items() if x not in SHOW and x not in ('air_tank','sky_shadow','beast_line','guard_wall')}
        r=dict(value=o['value'], gap=round(max(sh.values())-min(sh.values()),1), best=[max(sh,key=sh.get),round(max(sh.values()))], worst=[min(sh,key=sh.get),round(min(sh.values()))], within8=sum(1 for v in sh.values() if abs(v-m)<=8),
               found_top=[max(oth,key=oth.get),round(max(oth.values()))], air=o['air_share'], lay=o['layout_gap'], scout=o['scout'], effA=o['eff_armies'], effB=o['eff_bases'], mean=o['best_mean'], siege=[round(o['siege_walled']),round(o['siege_avg'])], stars=o['stars_best'])
        try:
            od=json.load(open(f"{L}odo_k{k}_{'r10' if nm=='R10' else 'r12'}.result.json")); r['rise']=round(od['v1']-od['v0'],1); r['search_top']=round(max(c['avg'] for c in od['cands']))
        except Exception: pass
        out[f'{nm}_{k}']=r; print(k,nm,r)
json.dump(out,open(L+'results12.json','w'))

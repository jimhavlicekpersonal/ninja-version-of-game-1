import json,importlib.util,sys
L='./'
s=importlib.util.spec_from_file_location('c9',L+'collect9.py'); c9=importlib.util.module_from_spec(s); s.loader.exec_module(c9)
ONLY=json.load(open('./armies21.json'))
SHOW=['mixed','swarm','line','tankline','air','shadow','shadow_pure','beast','siege','infil','sabo','heal','allround']
for f in sys.argv[2:]:
    k=int(sys.argv[1]); o=c9.summary(L+f,k,ONLY); a=o['avg']; sh={x:a[x] for x in SHOW}
    print(f,{kk:o[kk] for kk in ('value','mixed_rank','air_share','air_by_temper','viable','scout','eff_armies','eff_bases','layout_gap','any_mean','best_mean','stars_best','siege_walled','siege_avg')})
    print('   showcase gap %.1f'%(max(sh.values())-min(sh.values())), {kk:round(v) for kk,v in sorted(sh.items(), key=lambda t:-t[1])}, '| others', {kk:round(v) for kk,v in a.items() if kk not in SHOW})
    print('   layouts', o['layouts'])

import json,sys
for f in sys.argv[1:]:
    try: r=json.load(open(f))
    except Exception as e: print(f,'missing'); continue
    rr=r['reached']; e=r.get('end',{})
    print(f.replace('cq_','').replace('.json',''),'| Keep 6/9/12/15 day',rr.get('6'),rr.get('9'),rr.get('12'),rr.get('15'),'| days',r['days'],'| looted %.0fM stolen %.0fM (%.0f%%) rewards %.0fM'%(r['totals']['looted']/1e6,r['totals']['stolen']/1e6,100*r['totals']['stolen']/max(1,r['totals']['looted']),r['totals']['defenseRewards']/1e6),'| builders',e.get('builders'),'honor',e.get('trophies'),'jade',e.get('moonstones'))
    if '-v' in sys.argv: 
        for x in r['byKeep']:
            if x['keep'] in (6,9,12,14): print('    K%d: own raids %.2f★ loot %.2fM | defences n=%d %.2f★ held %.0f%% stolen %.2fM reward %.2fM'%(x['keep'],x['stars'],x['loot']/1e6,x['defenses'],x.get('defStars',-1),100*x['held'],x['stolen']/1e6,x.get('defReward',0)/1e6))

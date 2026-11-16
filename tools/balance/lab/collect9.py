# Summarise a best-entry scorecard run. Usage: python3 collect9.py out.json keep  -> prints JSON
import json, sys, collections, importlib.util
import numpy as np
s = importlib.util.spec_from_file_location('an', './analyze.py'); an = importlib.util.module_from_spec(s); s.loader.exec_module(an)
def summary(path, keep, only=None):
    rows, _ = an.load(path)
    if only: rows = [r for r in rows if r['army'] in only]
    armies, bases, N, S = an.matrices(rows, keep)
    v, p, q = an.solve(S)
    avg = S.mean(axis=1); order = np.argsort(-avg)
    best = collections.Counter()
    for j in range(len(bases)):
        col = S[:, j]
        for i in range(len(armies)):
            if col[i] >= col.max() - 2: best[armies[i]] += 1
    cell = collections.defaultdict(list)
    for r in rows:
        if r['keep'] == keep: cell[(r['army'], r['base'], r['seed'])].append((r['d'], r['s']))
    bestp = [max(x) for x in cell.values()]; anyp = [y for x in cell.values() for y in x]
    st = lambda xs: [round(sum(1 for d, s_ in xs if s_ == k) / len(xs) * 100) for k in range(4)]
    layouts = sorted({b.split('|')[0] for b in bases}); tempers = sorted({b.split('|')[1] for b in bases})
    lay = {l: float(S[:, [j for j, b in enumerate(bases) if b.startswith(l + '|')]].mean()) for l in layouts}
    mi = armies.index('mixed')
    core = [i for i, a in enumerate(armies) if a not in ('air_tank', 'sky_shadow', 'beast_line')]
    core2 = [i for i in core if armies[i] != 'guard_wall']
    extra = dict(spread_core=round(float(avg[core2].max() - avg[core2].min()), 1), worst_core=armies[core2[int(np.argmin(avg[core2]))]], worst_core_avg=round(float(avg[core2].min()), 1),
                 best_core=armies[core2[int(np.argmax(avg[core2]))]], air_share=round(best['air'] / len(bases), 2),
                 air_by_temper={t: round(float(S[armies.index('air'), [j for j, b in enumerate(bases) if b.endswith('|' + t)]].mean())) for t in tempers},
                 second_share=sorted(((v / len(bases), a) for a, v in best.items()), reverse=True)[1])
    out = dict(keep=keep, value=round(float(v), 1), eff_armies=round(an.eff(p), 1), eff_bases=round(an.eff(q), 1),
               best=armies[order[0]], best_avg=round(float(avg[order[0]]), 1), second=armies[order[1]], second_avg=round(float(avg[order[1]]), 1),
               mixed_avg=round(float(avg[mi]), 1), mixed_rank=int(list(order).index(mi)) + 1, mixed_lead=round(float(avg[mi] - np.delete(avg, mi).max()), 1),
               spread=round(float(avg[core].max() - avg[core].min()), 1), worst=armies[core[int(np.argmin(avg[core]))]], worst_avg=round(float(avg[core].min()), 1),
               best_share=round(max(best.values()) / len(bases), 2), best_share_army=max(best, key=best.get), viable=sum(1 for a in armies if best[a]),
               scout=round(float(S.max(axis=0).mean() - avg.max()), 1), any_mean=round(float(N.mean()), 1), best_mean=round(float(S.mean()), 1),
               stars_any=st(anyp), stars_best=st(bestp), layouts={l: round(x, 1) for l, x in lay.items()}, layout_gap=round(max(lay.values()) - min(lay.values()), 1),
               siege_walled=round(float(S[armies.index('siege'), [j for j, b in enumerate(bases) if b.startswith('walled_keep|')]].mean()), 1), siege_avg=round(float(avg[armies.index('siege')]), 1),
               avg={a: round(float(avg[i]), 1) for i, a in enumerate(armies)},
               eq_armies={armies[i]: round(float(p[i]), 2) for i in range(len(armies)) if p[i] > 0.02}, eq_bases={bases[j]: round(float(q[j]), 2) for j in range(len(bases)) if q[j] > 0.02},
               tempers_used=sorted({b.split('|')[1] for j, b in enumerate(bases) if q[j] > 0.02}), layouts_used=sorted({b.split('|')[0] for j, b in enumerate(bases) if q[j] > 0.02}))
    out.update(extra)
    return out
if __name__ == '__main__':
    o = summary(sys.argv[1], int(sys.argv[2])); print(json.dumps(o))

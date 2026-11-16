# Scorecard from a lab output. Usage: python3 analyze.py out.json [--brief] [--skilled]
import json, sys, math, collections
import numpy as np
from scipy.optimize import linprog

def load(path):
    rows = json.load(open(path))
    keeps = sorted({r['keep'] for r in rows})
    return rows, keeps

def matrices(rows, keep):
    cell = collections.defaultdict(lambda: collections.defaultdict(list))  # (army, base) -> seed -> [d per plan]
    for r in rows:
        if r['keep'] == keep: cell[(r['army'], r['base'])][r['seed']].append(r['d'])
    armies = sorted({a for a, _ in cell}); bases = sorted({b for _, b in cell})
    naive = np.array([[np.mean([np.mean(v) for v in cell[(a, b)].values()]) for b in bases] for a in armies])
    skilled = np.array([[np.mean([np.max(v) for v in cell[(a, b)].values()]) for b in bases] for a in armies])
    return armies, bases, naive, skilled

def solve(M):
    """Zero-sum game: row player (attacker) maximises. Returns value, row mix, column mix."""
    m, n = M.shape
    c = np.zeros(m + 1); c[-1] = -1
    A = np.hstack([-M.T, np.ones((n, 1))]); b = np.zeros(n)
    Ae = np.ones((1, m + 1)); Ae[0, -1] = 0
    r = linprog(c, A_ub=A, b_ub=b, A_eq=Ae, b_eq=[1], bounds=[(0, 1)] * m + [(None, None)], method='highs')
    p = r.x[:m]; v = r.x[-1]
    c2 = np.zeros(n + 1); c2[-1] = 1
    A2 = np.hstack([M, -np.ones((m, 1))])
    Ae2 = np.ones((1, n + 1)); Ae2[0, -1] = 0
    r2 = linprog(c2, A_ub=A2, b_ub=np.zeros(m), A_eq=Ae2, b_eq=[1], bounds=[(0, 1)] * n + [(None, None)], method='highs')
    return v, p, r2.x[:n]

def eff(p):
    p = np.array(p); p = p[p > 1e-9]
    return float(np.exp(-(p * np.log(p)).sum()))

def scorecard(path, keep, brief=False):
    rows, _ = load(path)
    armies, bases, N, S = matrices(rows, keep)
    NAIVE = N
    import os
    if os.environ.get('SKILLED'): N = S
    v, p, q = solve(N)
    out = {}
    out['keep'] = keep
    out['value'] = v                                   # equilibrium destruction
    out['eff_armies'] = eff(p)                          # effective number of armies in the attacker's equilibrium
    out['eff_bases'] = eff(q)
    # how the population would look if defenders are spread evenly (bots): which army is best on average, by how much
    avg = N.mean(axis=1); order = np.argsort(-avg)
    out['best_avg'] = (armies[order[0]], float(avg[order[0]]), armies[order[1]], float(avg[order[1]]))
    out['spread_avg'] = float(avg.max() - np.median(avg))
    # scouting value against an even population of bases: pick army after seeing the base vs one army for all
    out['scout_value'] = float(N.max(axis=0).mean() - avg.max())
    # share of bases on which each army is the best answer (within 2 points)
    best = collections.Counter()
    for j in range(len(bases)):
        col = N[:, j]; top = col.max()
        for i in range(len(armies)):
            if col[i] >= top - 2: best[armies[i]] += 1
    out['best_share'] = {a: best[a] / len(bases) for a in armies}
    out['viable'] = sum(1 for a in armies if best[a] > 0)
    out['dead'] = [a for i, a in enumerate(armies) if N[i].max() < 50]
    # skill: best of the plans tried against the average plan
    out['skill_gap'] = float((S - NAIVE).mean()); out['naive_mean'] = float(NAIVE.mean()); out['skilled_mean'] = float(S.mean())
    # temper effect: mean destruction by temper for each army
    tempers = sorted({b.split('|')[1] for b in bases})
    by_t = {t: N[:, [j for j, b in enumerate(bases) if b.endswith('|' + t)]].mean(axis=1) for t in tempers}
    out['temper_swing'] = {a: {t: round(float(by_t[t][i] - by_t['none'][i]), 1) for t in tempers if t != 'none'} for i, a in enumerate(armies)} if 'none' in by_t else {}
    out['eq_armies'] = {armies[i]: round(float(p[i]), 2) for i in range(len(armies)) if p[i] > 0.01}
    out['eq_bases'] = {bases[j]: round(float(q[j]), 2) for j in range(len(bases)) if q[j] > 0.01}
    out['avg_by_army'] = {a: round(float(avg[i]), 1) for i, a in enumerate(armies)}
    if not brief:
        print(f"Keep {keep}: value {v:.1f} | effective armies {out['eff_armies']:.2f} | effective bases {out['eff_bases']:.2f} | viable {out['viable']}/{len(armies)} | dead {out['dead']}")
        print(f"  best on average: {out['best_avg'][0]} {out['best_avg'][1]:.1f}, then {out['best_avg'][2]} {out['best_avg'][3]:.1f}; best minus median {out['spread_avg']:.1f}")
        print(f"  scouting value {out['scout_value']:.1f} | skill gap (best of plans minus mean) {out['skill_gap']:.1f}")
        print('  attacker equilibrium:', out['eq_armies']); print('  defender equilibrium:', out['eq_bases'])
        print('  avg destruction by army:', out['avg_by_army'])
        print('  best-answer share:', {a: round(s, 2) for a, s in out['best_share'].items() if s})
        print('  temper swing vs untempered:', out['temper_swing'])
        # temper x family table averaged
    return out

if __name__ == '__main__':
    rows, keeps = load(sys.argv[1])
    for k in keeps: scorecard(sys.argv[1], k)

def table(path, keep):
    rows, _ = load(path); armies, bases, N, S = matrices(rows, keep)
    import os
    if os.environ.get('SKILLED'): N = S
    tempers = []
    for b in bases:
        t = b.split('|')[1]
        if t not in tempers: tempers.append(t)
    layouts = sorted({b.split('|')[0] for b in bases})
    print(f'{"army":14}' + ''.join(f'{t:>8}' for t in tempers) + '   | ' + ''.join(f'{l[:7]:>8}' for l in layouts))
    for i, a in enumerate(armies):
        bt = [N[i, [j for j, b in enumerate(bases) if b.endswith('|' + t)]].mean() for t in tempers]
        bl = [N[i, [j for j, b in enumerate(bases) if b.startswith(l + '|')]].mean() for l in layouts]
        print(f'{a:14}' + ''.join(f'{x:8.0f}' for x in bt) + '   | ' + ''.join(f'{x:8.0f}' for x in bl))
    print(f'{"BEST":14}' + ''.join(f'{N[:, [j for j, b in enumerate(bases) if b.endswith("|" + t)]].mean(axis=1).max():8.0f}' for t in tempers))

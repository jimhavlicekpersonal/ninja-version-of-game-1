# Build a full rules file from the base patch and the tuner state. Usage: python3 mkrules.py R10a.json S10.json out.json
import json, sys
r = json.load(open(sys.argv[1])); S = json.load(open(sys.argv[2]))
for k, st in S.items(): r['troopPatchByKeep'][k] = st['mult']; r['layoutBiasByKeep'][k] = st['bias']
json.dump(r, open(sys.argv[3], 'w')); print('tuned Keeps', sorted(S, key=int))

#!/bin/bash
# scoreL.sh <keep>: fresh-base scorecard, search and defender response for the loop's current state
cd "$(dirname "$0")"; k=$1
python3 -I mkrules.py R10f.json S11.json R11.json > /dev/null
python3 -I -c "
import json; S=json.load(open('S11.json'))['$k']; json.dump(S['found'], open('extraL_$k.json','w')); print('K$k rounds', S['round'], 'found', len(S['found']))" >> scoreL.log
EXTRA=extraL_$k.json FRESH=1 SEARCH=1 python3 -I mkcfg.py s_R11f_k$k.json $k 2 1 R11.json && ./run.sh s_R11f_k$k.json s_R11f_k$k.out.json >> scoreL.log 2>&1
python3 oracle10.py s_R11f_k$k.out.json R11.json $k 60 $((50+k)) >> scoreL.log 2>&1
python3 oracle_do.py s_R11f_k$k.out.json R11.json $k >> scoreL.log 2>&1
cp oracle10_k$k.result.json oracle10_k${k}_r11.result.json; cp odo_k$k.result.json odo_k${k}_r11.result.json
echo "scored $k $(date +%T)" >> scoreL.log

#!/bin/bash
# scoreL.sh <keep>: fresh-base scorecard, search and defender response for the loop's current state
cd "$(dirname "$0")"; k=$1
python3 -I mkrules.py R12a.json S12.json R12.json > /dev/null
python3 -I -c "
import json; S=json.load(open('S12.json'))['$k']; json.dump(S['found'], open('extraM_$k.json','w')); print('K$k rounds', S['round'], 'found', len(S['found']))" >> scoreM.log
EXTRA=extraM_$k.json FRESH=1 SEARCH=1 python3 -I mkcfg.py s_R12f_k$k.json $k 2 1 R12.json && ./run.sh s_R12f_k$k.json s_R12f_k$k.out.json >> scoreM.log 2>&1
python3 oracle10.py s_R12f_k$k.out.json R12.json $k 40 $((70+k)) >> scoreM.log 2>&1
python3 oracle_do.py s_R12f_k$k.out.json R12.json $k >> scoreM.log 2>&1
cp oracle10_k$k.result.json oracle10_k${k}_r12.result.json; cp odo_k$k.result.json odo_k${k}_r12.result.json
echo "scored $k $(date +%T)" >> scoreM.log

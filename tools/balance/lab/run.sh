#!/bin/bash
# run.sh <config.json> <out.json>  -- two shards in parallel, merged
cfg=$1; out=$2
N="node --experimental-transform-types --import ./register.mjs --disable-warning=ExperimentalWarning ./lab.ts"
$N $cfg ${out}.0 0 2 & $N $cfg ${out}.1 1 2 & wait
python3 -I -c "
import json,sys
a=json.load(open('${out}.0'))+json.load(open('${out}.1')); json.dump(a,open('${out}','w')); print(len(a),'battles')"
rm -f ${out}.0 ${out}.1

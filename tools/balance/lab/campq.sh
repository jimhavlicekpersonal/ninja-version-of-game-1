#!/bin/bash
# campq.sh <tag> then pairs "<campaign> <patch>" from stdin; one campaign at a time
cd "$(dirname "$0")"
N="node --experimental-transform-types --import ./register.mjs --disable-warning=ExperimentalWarning"
while read c p rep pilot rules; do [ -z "$c" ] && continue; REP=${rep:-} PILOT=${pilot/-/} $N camp.ts $c $p cq_${c}_$(basename $p .json)${rep:+_r$rep}${pilot:+_$pilot}.json ${rules:-} >> campq.log 2>&1; done
echo "queue $1 done $(date +%T)" >> campq.log

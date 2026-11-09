#!/bin/sh
# Runs every policy; each writes scratch/policy_sim/<policy>_<cadence>.out/.json. 4 at a time.
cd "$(dirname "$0")/../.."
{
  for p in raider defender rusher turtle sandbagger hoarder raid_max no_research; do echo "$p regular 120 12"; done
  for p in raider rusher turtle sandbagger; do echo "$p casual 90 15"; done
} | xargs -P 4 -L 1 sh -c 'node scratch/run.mjs scratch/policy_sim/run_policy.ts $0 $1 $2 $3 > scratch/policy_sim/log_$0_$1.txt 2>&1; echo "done $0 $1 $(date +%T)"'

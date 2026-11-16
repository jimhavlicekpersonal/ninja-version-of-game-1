#!/bin/sh
# usage: run.sh <session> <file.js>   (or stdin)
S="$1"; shift
if [ -n "$1" ]; then curl -s --max-time 590 -X POST "http://127.0.0.1:5311/run?s=$S" --data-binary @"$1"; else curl -s --max-time 590 -X POST "http://127.0.0.1:5311/run?s=$S" --data-binary @-; fi

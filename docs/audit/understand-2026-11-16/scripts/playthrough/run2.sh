#!/bin/sh
# usage: run2.sh <session>  (stdin JS, prelude prepended)
S="$1"
( cat "$(dirname "$0")/pre.js"; cat ) | curl -s --max-time 590 -X POST "http://127.0.0.1:5311/run?s=$S" --data-binary @-

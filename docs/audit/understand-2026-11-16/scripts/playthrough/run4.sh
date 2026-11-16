#!/bin/sh
S="$1"
( cat "$(dirname "$0")/pre.js" "$(dirname "$0")/pre2.js" "$(dirname "$0")/raid.js"; cat ) | curl -s --max-time 590 -X POST "http://127.0.0.1:5311/run?s=$S" --data-binary @-

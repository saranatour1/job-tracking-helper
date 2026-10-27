#!/bin/sh
# usage: evidence.sh new <feature-id>          prints a fresh evidence dir
#        evidence.sh users <dir> <label>       saves the users table, prints its row count
# Evidence lives in .verify-evidence/ (gitignored) and survives cleanup.
set -eu
root=$(git rev-parse --show-toplevel)

case "${1:-}" in
  new)
    [ $# -eq 2 ] || { echo "usage: $0 new <feature-id>" >&2; exit 1; }
    dir="$root/.verify-evidence/$(date -u +%Y%m%dT%H%M%SZ)-$2"
    mkdir -p "$dir"
    echo "$dir"
    ;;
  users)
    [ $# -eq 3 ] || { echo "usage: $0 users <dir> <label>" >&2; exit 1; }
    out="$2/users-$3.jsonl"
    (cd "$root" && pnpm exec convex data users --limit 10000 --format jsonLines) > "$out"
    wc -l < "$out" | tr -d ' '
    ;;
  *)
    echo "usage: $0 new <feature-id> | users <dir> <label>" >&2
    exit 1
    ;;
esac

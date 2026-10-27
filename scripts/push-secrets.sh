#!/bin/sh
# Copies the OAuth secrets named in .env.1password from 1Password to the Convex
# deployment. `op run` resolves every reference first and stops if any is missing,
# then each value goes over a pipe into `convex env set`, so it never touches
# disk, the screen, shell history or process arguments.
set -eu
cd "$(dirname "$0")/.."

names=$(sed -n 's/^\([A-Z_][A-Z0-9_]*\)=op:.*/\1/p' .env.1password)

# shellcheck disable=SC2016 # $n expands inside the op-run shell, where the secrets are.
exec op run --env-file=.env.1password -- sh -c '
  for n in "$@"; do
    printf "%s" "$(printenv "$n")" | pnpm exec convex env set "$n"
  done
' sh $names

#!/bin/sh
set -eu

vault="${OP_VAULT:-Private}"
names="AUTH_GOOGLE_CLIENT_ID AUTH_GOOGLE_CLIENT_SECRET AUTH_GITHUB_CLIENT_ID AUTH_GITHUB_CLIENT_SECRET"
for n in $names; do
  export "$n=op://$vault/job-tracking-helper/$n"
done

exec op run -- sh -c '
  for n in "$@"; do
    printf "%s" "$(printenv "$n")" | pnpm exec convex env set "$n"
  done
' sh $names

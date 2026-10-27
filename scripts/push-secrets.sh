#!/bin/sh
# Copies the Google and GitHub OAuth secrets from 1Password to the Convex
# deployment. They live as fields of the "job-tracking-helper" item in your
# Private vault; set OP_VAULT to use another vault. `op run` resolves every
# reference first and stops if any is missing, then each value goes over a pipe
# into `convex env set`, so it never touches disk, the screen, shell history or
# process arguments.
set -eu

vault="${OP_VAULT:-Private}"
names="AUTH_GOOGLE_CLIENT_ID AUTH_GOOGLE_CLIENT_SECRET AUTH_GITHUB_CLIENT_ID AUTH_GITHUB_CLIENT_SECRET"
for n in $names; do
  export "$n=op://$vault/job-tracking-helper/$n"
done

# shellcheck disable=SC2016 # $n expands inside the op-run shell, where the secrets are.
exec op run -- sh -c '
  for n in "$@"; do
    printf "%s" "$(printenv "$n")" | pnpm exec convex env set "$n"
  done
' sh $names

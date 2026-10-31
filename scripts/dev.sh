#!/bin/sh
# Convex rejects a push while the Google or GitHub client vars are unset, so dev
# fills each missing one with "disabled". Those buttons fail until real keys are
# pushed with `vp run secrets:push`.
set -eu

oauth_vars="AUTH_GOOGLE_CLIENT_ID AUTH_GOOGLE_CLIENT_SECRET AUTH_GITHUB_CLIENT_ID AUTH_GITHUB_CLIENT_SECRET"

if grep -qs '^CONVEX_DEPLOYMENT=' .env.local; then
  existing=$(pnpm exec convex env list | cut -d= -f1)
  missing=""
  for n in $oauth_vars; do
    printf '%s\n' "$existing" | grep -qx "$n" || missing="$missing$n=disabled
"
  done
  if [ -n "$missing" ]; then
    printf '%s' "$missing" | pnpm exec convex env set --from-file /dev/stdin
  fi
fi

# strictPort: a second server would rewrite routeTree.gen.ts against the first, and every
# write reloads the page. Fail here instead of quietly moving to the next port.
exec pnpm exec convex dev --start 'vp dev --port 3000 --strictPort'

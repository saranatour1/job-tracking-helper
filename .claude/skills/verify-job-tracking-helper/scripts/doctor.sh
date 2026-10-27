#!/bin/sh
# Read-only check: is the dev instance on localhost:3000 worth driving?
# Prints one ok/FAIL line per check and exits 1 if any check fails.
# Never prints env values, only names.
set -u
cd "$(git rev-parse --show-toplevel)"
fail=0
ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; fail=1; }

pid=$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null | head -1)
if [ -n "$pid" ]; then
  ok "port 3000 owned by pid $pid (parent $(ps -o ppid= -p "$pid" | tr -d ' '))"
else
  bad "nothing listens on port 3000; launch first"
fi

if curl -fsS --max-time 10 http://localhost:3000/ | grep -q "<title>Job Tracking Helper</title>"; then
  ok "localhost:3000 serves Job Tracking Helper"
else
  bad "localhost:3000 does not serve the app"
fi

deployment=$(sed -n 's/^CONVEX_DEPLOYMENT=\([^ #]*\).*/\1/p' .env.local 2>/dev/null)
if [ -n "$deployment" ]; then
  ok "linked to Convex deployment $deployment"
else
  bad ".env.local has no CONVEX_DEPLOYMENT; the user must run vp run dev once to log in and link"
fi

names=$(pnpm exec convex env list 2>/dev/null | cut -d= -f1)
for n in SITE_URL AUTH_PRIVATE_KEY AUTH_JWKS; do
  if printf '%s\n' "$names" | grep -qx "$n"; then ok "env $n is set"; else bad "env $n is missing"; fi
done

if pnpm exec convex function-spec 2>/dev/null | grep -q '"auth.js:signInAnonymously"'; then
  ok "deployment serves auth:signInAnonymously"
else
  bad "deployment lacks the auth functions; wait for 'Convex functions ready!'"
fi

exit $fail

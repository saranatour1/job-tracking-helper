#!/bin/sh
# Runs scripts/push-secrets.sh with a fake `op` and `pnpm`, so it never touches
# 1Password or the Convex deployment.
set -eu

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
mkdir "$dir/bin"
cat > "$dir/bin/op" <<'EOF'
#!/bin/sh
# Fake `op run -- cmd...`: resolves each op://<vault>/job-tracking-helper/<NAME>
# env var to a value with quotes and a dollar sign, and records the reference.
[ "$1 $2" = "run --" ] || { echo "unexpected op call: $*" >&2; exit 1; }
for n in $(env | sed -n 's/^\([A-Z_][A-Z0-9_]*\)=op:.*/\1/p'); do
  printenv "$n" >> "$REFS"
  export "$n=$n-va\"l \$ue"
done
shift 2
exec "$@"
EOF
cat > "$dir/bin/pnpm" <<'EOF'
#!/bin/sh
[ "$1 $2 $3 $4" = "exec convex env set" ] || { echo "unexpected pnpm call: $*" >&2; exit 1; }
{ printf '%s=[' "$5"; cat; printf ']\n'; } >> "$PUSHED"
EOF
chmod +x "$dir/bin/op" "$dir/bin/pnpm"
unset OP_VAULT
export PUSHED="$dir/pushed.txt" REFS="$dir/refs.txt" PATH="$dir/bin:$PATH"

sh "$(dirname "$0")/push-secrets.sh" > "$dir/out.txt" 2>&1

if grep -q 'va"l' "$dir/out.txt"; then
  echo "FAIL: a secret was printed" >&2
  exit 1
fi
for n in AUTH_GOOGLE_CLIENT_ID AUTH_GOOGLE_CLIENT_SECRET AUTH_GITHUB_CLIENT_ID AUTH_GITHUB_CLIENT_SECRET; do
  printf '%s=[%s-va"l $ue]\n' "$n" "$n"
done | diff - "$dir/pushed.txt" || { echo "FAIL: pushed values differ" >&2; exit 1; }
for n in AUTH_GOOGLE_CLIENT_ID AUTH_GOOGLE_CLIENT_SECRET AUTH_GITHUB_CLIENT_ID AUTH_GITHUB_CLIENT_SECRET; do
  echo "op://Private/job-tracking-helper/$n"
done | sort > "$dir/want-refs.txt"
sort "$REFS" | diff "$dir/want-refs.txt" - || { echo "FAIL: wrong 1Password references" >&2; exit 1; }
echo "ok: all four secrets pushed over stdin, exact bytes, nothing printed"

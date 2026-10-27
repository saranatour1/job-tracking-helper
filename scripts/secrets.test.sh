#!/bin/sh
# Drives scripts/secrets.sh against a throwaway keychain and a fake pnpm, so it
# never touches your real keychain or Convex deployment.
set -eu

dir=$(mktemp -d)
trap 'security delete-keychain "$dir/test.keychain-db" 2>/dev/null; rm -rf "$dir"' EXIT
mkdir "$dir/bin"
cat > "$dir/bin/pnpm" <<'EOF'
#!/bin/sh
[ "$1 $2 $3 $4" = "exec convex env set" ] || { echo "unexpected pnpm call: $*" >&2; exit 1; }
printf '%s=%s\n' "$5" "$(cat)" >> "$PUSHED"
EOF
chmod +x "$dir/bin/pnpm"
export SECRETS_KEYCHAIN="$dir/test.keychain-db" PUSHED="$dir/pushed.txt" PATH="$dir/bin:$PATH"

cat > "$dir/run.exp" <<'EOF'
set timeout 20
set script [lindex $argv 0]
proc pw {} { expect -re {(?i)password.*:}; send "throwaway-pw\r" }
spawn $script init
pw; pw; expect eof
spawn $script set AUTH_GITHUB_CLIENT_SECRET
pw; expect "AUTH_GITHUB_CLIENT_SECRET: "; send {gh\sec"ret $x}; send "\r"; expect eof
spawn $script set AUTH_GOOGLE_CLIENT_ID
pw; expect "AUTH_GOOGLE_CLIENT_ID: "; send "google-id-123\r"; expect eof
spawn $script push
pw; expect eof
EOF
expect "$dir/run.exp" "$(dirname "$0")/secrets.sh" > "$dir/out.txt" 2>&1

if grep -q 'gh\\sec\|google-id-123' "$dir/out.txt"; then
  echo "FAIL: a secret was echoed to the terminal" >&2
  exit 1
fi
printf 'AUTH_GOOGLE_CLIENT_ID=google-id-123\nAUTH_GITHUB_CLIENT_SECRET=gh\\sec"ret $x\n' |
  diff - "$dir/pushed.txt" || { echo "FAIL: pushed values differ" >&2; exit 1; }
echo "ok: secrets stored, pushed over stdin, never echoed"

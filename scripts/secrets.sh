#!/bin/sh
# Keeps this project's secrets in its own macOS keychain, locked by one password,
# and pushes them to the Convex deployment over stdin so they never touch disk,
# shell history or process arguments.
set -eu

KEYCHAIN="${SECRETS_KEYCHAIN:-job-tracking-helper.keychain-db}"
SERVICE=job-tracking-helper
NAMES="AUTH_GOOGLE_CLIENT_ID AUTH_GOOGLE_CLIENT_SECRET AUTH_GITHUB_CLIENT_ID AUTH_GITHUB_CLIENT_SECRET"

usage() {
  echo "usage: $0 init | set NAME | list | push" >&2
  echo "names: $NAMES" >&2
  exit 1
}

known() {
  for n in $NAMES; do [ "$n" = "$1" ] && return 0; done
  echo "unknown secret: $1" >&2
  usage
}

read_secret() {
  security find-generic-password -s "$SERVICE" -a "$1" -w "$KEYCHAIN" 2>/dev/null
}

case "${1:-}" in
  init)
    security create-keychain "$KEYCHAIN"
    security set-keychain-settings -l -u -t 900 "$KEYCHAIN"
    echo "Created $KEYCHAIN. It locks on sleep and after 15 idle minutes."
    ;;
  set)
    [ $# -eq 2 ] || usage
    known "$2"
    security unlock-keychain "$KEYCHAIN"
    stty -echo
    trap 'stty echo' EXIT
    printf "%s: " "$2" >&2
    IFS= read -r value
    stty echo
    echo >&2
    [ -n "$value" ] || { echo "empty value, nothing stored" >&2; exit 1; }
    # security -i reads the command from stdin, so the value stays out of argv.
    escaped=$(printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf 'add-generic-password -U -s %s -a %s -w "%s" %s\n' \
      "$SERVICE" "$2" "$escaped" "$KEYCHAIN" | security -i
    echo "Stored $2."
    ;;
  list)
    security unlock-keychain "$KEYCHAIN"
    for n in $NAMES; do
      if read_secret "$n" >/dev/null; then echo "set      $n"; else echo "missing  $n"; fi
    done
    ;;
  push)
    security unlock-keychain "$KEYCHAIN"
    for n in $NAMES; do
      if read_secret "$n" >/dev/null; then
        read_secret "$n" | npx convex env set "$n"
      else
        echo "skipped $n: not in the keychain (run: $0 set $n)" >&2
      fi
    done
    ;;
  *) usage ;;
esac

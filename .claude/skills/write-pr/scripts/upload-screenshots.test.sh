#!/bin/sh
# Runs upload-screenshots.sh against a throwaway repo and a local bare remote,
# so it never pushes to GitHub.
set -eu
script="$(cd "$(dirname "$0")" && pwd)/upload-screenshots.sh"
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT

git init -q --bare "$dir/remote.git"
git init -q "$dir/work"
cd "$dir/work"
git commit -q --allow-empty -m init
git checkout -q -b feature
echo untouched > tracked.txt
printf 'png-one' > "$dir/one.png"
printf 'png-two' > "$dir/two.png"
export PR_ASSETS_REMOTE="$dir/remote.git" PR_ASSETS_REPO=owner/repo

sh "$script" 7 "$dir/one.png" > "$dir/links.txt"
sh "$script" 8 "$dir/two.png" >> "$dir/links.txt"

printf '%s\n' \
  '![one.png](https://github.com/owner/repo/blob/pr-assets/7/one.png?raw=true)' \
  '![two.png](https://github.com/owner/repo/blob/pr-assets/8/two.png?raw=true)' |
  diff - "$dir/links.txt" || { echo "FAIL: wrong links" >&2; exit 1; }

files=$(git --git-dir="$dir/remote.git" ls-tree -r --name-only pr-assets | tr '\n' ' ')
[ "$files" = "7/one.png 8/two.png " ] || { echo "FAIL: pr-assets holds: $files" >&2; exit 1; }
[ "$(git --git-dir="$dir/remote.git" show pr-assets:8/two.png)" = png-two ] || { echo "FAIL: bad bytes" >&2; exit 1; }
[ "$(git branch --show-current)" = feature ] && [ "$(cat tracked.txt)" = untouched ] &&
  [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "FAIL: working tree changed" >&2; exit 1; }
echo "ok: screenshots land on pr-assets, earlier ones kept, working tree untouched"

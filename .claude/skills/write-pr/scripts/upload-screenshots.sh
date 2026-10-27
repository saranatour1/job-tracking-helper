#!/bin/sh
# usage: upload-screenshots.sh <pr-number> <file>...
# Commits the files to <pr-number>/ on the pr-assets branch without touching the
# working tree or the current branch, pushes it, and prints a Markdown image link
# for each file.
set -eu
[ $# -ge 2 ] || { echo "usage: $0 <pr-number> <file>..." >&2; exit 1; }
pr=$1
shift
remote="${PR_ASSETS_REMOTE:-origin}"
repo="${PR_ASSETS_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
branch=pr-assets

parent=$(git ls-remote "$remote" "refs/heads/$branch" | cut -f1)
[ -z "$parent" ] || git fetch -q "$remote" "$branch"

GIT_INDEX_FILE="$(mktemp -d)/index"
export GIT_INDEX_FILE
trap 'rm -rf "$(dirname "$GIT_INDEX_FILE")"' EXIT
if [ -n "$parent" ]; then git read-tree "$parent"; else git read-tree --empty; fi

for f in "$@"; do
  git update-index --add --cacheinfo "100644,$(git hash-object -w "$f"),$pr/$(basename "$f")"
done
commit=$(git commit-tree "$(git write-tree)" ${parent:+-p "$parent"} -m "chore: add screenshots for #$pr")
git push -q "$remote" "$commit:refs/heads/$branch"

for f in "$@"; do
  name=$(basename "$f")
  echo "![$name](https://github.com/$repo/blob/$branch/$pr/$name?raw=true)"
done

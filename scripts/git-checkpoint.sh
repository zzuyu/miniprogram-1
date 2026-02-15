#!/usr/bin/env bash
set -euo pipefail

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  echo "Usage: scripts/git-checkpoint.sh \"your commit message\""
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -m "$MSG"
else
  echo "No changes to commit."
  exit 0
fi

BRANCH="$(git branch --show-current)"
if [[ -z "$BRANCH" ]]; then
  echo "Could not detect current branch."
  exit 1
fi

git push origin "$BRANCH"
echo "Checkpoint pushed to origin/$BRANCH"

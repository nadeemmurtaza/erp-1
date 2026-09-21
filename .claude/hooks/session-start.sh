#!/bin/bash
#
# SessionStart hook — hands every agent session the repository index.
#
# Two jobs, both cheap:
#
#   1. Print the orientation brief. Its stdout becomes part of the session's
#      context, so an agent knows the index exists and which page answers which
#      question before it starts grepping a 140k-line repository.
#   2. Make sure git is using .githooks/, so commits made in this session keep
#      docs/index/ in step. A cloud session may never run `pnpm install`, which
#      is the other place that happens — without this, the index would silently
#      stop updating in exactly the sessions that change the most code.
#
# Runs synchronously and does no network I/O or dependency installation, so it
# costs a few milliseconds and cannot leave the session waiting.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" || exit 0

# Keep the index self-updating for commits made from this session.
if command -v node >/dev/null 2>&1 && [ -f scripts/install-git-hooks.mjs ]; then
  node scripts/install-git-hooks.mjs >/dev/null 2>&1 || true
fi

BRIEF="docs/index/SESSION-BRIEF.md"

if [ ! -f "$BRIEF" ]; then
  cat <<'MISSING'
The repository index (docs/index/) has not been generated in this checkout.
Run `pnpm index` (or `node scripts/build-index.mjs`) to build it — it takes
under a second and makes finding code a lookup instead of a search.
MISSING
  exit 0
fi

cat "$BRIEF"

# A stale index is worse than a missing one, because it is trusted. Say so
# rather than letting an agent act on a map of a repository that has moved.
if command -v node >/dev/null 2>&1 && [ -f scripts/build-index.mjs ]; then
  if ! node scripts/build-index.mjs --check >/dev/null 2>&1; then
    cat <<'STALE'

> [!WARNING]
> The committed index is STALE for the current working tree — treat its file
> lists and line numbers as approximate, and run `pnpm index` to refresh it.
STALE
  fi
fi

exit 0

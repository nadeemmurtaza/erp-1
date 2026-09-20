#!/bin/bash
#
# GENERATED from scripts/lib/model-routing.mjs by scripts/build-index.mjs.
# DO NOT EDIT: run \`pnpm index\`. Change the policy, not this file.
#
# UserPromptSubmit hook. Its stdout is added to the session's context, which is
# the most a hook can do here: Claude Code does not let a hook set the model or
# the effort level, so this ADVISES and says so. Work delegated to a subagent
# is where selection is genuinely automatic — see .claude/agents/ and
# docs/index/cross/model-routing.md.
#
# It is deliberately quiet. It fires only for the three categories where
# choosing wrong is expensive — access control, migrations and architecture —
# because a hook that comments on every prompt is a hook people delete.

set -uo pipefail

# UserPromptSubmit delivers a JSON OBJECT on stdin, not the bare prompt. Reading
# it raw matches the envelope's own field names — `permission_mode` alone makes
# every prompt look like security work — so the prompt has to be extracted
# first. Caught exactly that way: "merge to main" tripped the security rule.
RAW=$(cat 2>/dev/null)
[ -z "${RAW:-}" ] && exit 0

if command -v node >/dev/null 2>&1; then
  PROMPT=$(printf '%s' "$RAW" | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  try { process.stdout.write(String(JSON.parse(d).prompt ?? "")); }
  catch { process.stdout.write(d); }
});' 2>/dev/null)
else
  # No node: fall back to the raw text, but strip the envelope keys that would
  # otherwise fire the rules on their own.
  PROMPT=$(printf '%s' "$RAW" | sed -E 's/"(permission_mode|transcript_path|session_id|hook_event_name|cwd)"[^,]*//g')
fi

PROMPT=$(printf '%s' "${PROMPT:-}" | tr '\n' ' ')
[ -z "${PROMPT:-}" ] && exit 0

HITS=""

if printf '%s' "$PROMPT" | grep -qiE 'permission|auth|token|secret|isolation|payment|refund|credential|vulnerab|injection|csrf|xss'; then
  HITS="$HITS  · Access control, isolation and money → \`opus\` at \`max\` effort (the \`security\` subagent)
"
fi
if printf '%s' "$PROMPT" | grep -qiE 'migration|prisma|schema|column|database table|db schema'; then
  HITS="$HITS  · Database schema and migrations → \`opus\` at \`high\` effort (the \`schema\` subagent)
"
fi
if printf '%s' "$PROMPT" | grep -qiE 'architect|module boundar|module pack|extension point|decisions\.md|new module|new sector|coupling'; then
  HITS="$HITS  · Architecture and irreversible decisions → \`opus\` at \`xhigh\` effort (the \`architect\` subagent)
"
fi

if [ -n "$HITS" ]; then
  echo "> Model routing, advisory. A hook cannot switch the model — delegate to the"
  echo "> named subagent (which pins both), or set it yourself with /model and /effort."
  echo ""
  printf '%s' "$HITS"
  echo "  · Full table: docs/index/cross/model-routing.md"
fi

exit 0

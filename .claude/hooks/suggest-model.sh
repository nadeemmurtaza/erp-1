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
# It is deliberately quiet, and precision beats recall: it fires only for the
# three categories where choosing wrong is expensive — access control,
# migrations and architecture. Broad words such as `token` or `schema` count
# only alongside a corroborating word, because a bare `token` matched "save
# tokens" and a bare `auth` matches "author". Missing a real prompt costs a
# suggestion; crying wolf costs the hook.

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

MATCH=0
if printf '%s' "$PROMPT" | grep -qiE 'permission|@requirepermission|authenticat|authoriz|isolation|refund|credential|vulnerab|sql injection|csrf|xss|rbac|pbac'; then MATCH=1; fi
  if printf '%s' "$PROMPT" | grep -qiE 'token' && printf '%s' "$PROMPT" | grep -qiE 'auth|jwt|bearer|access|refresh|api|secret|revoke|expiry'; then MATCH=1; fi
  if printf '%s' "$PROMPT" | grep -qiE 'secret' && printf '%s' "$PROMPT" | grep -qiE 'env|key|store|rotate|leak|manage'; then MATCH=1; fi
  if printf '%s' "$PROMPT" | grep -qiE 'payment' && printf '%s' "$PROMPT" | grep -qiE 'gateway|provider|capture|charge|method|approve'; then MATCH=1; fi
  if printf '%s' "$PROMPT" | grep -qiE 'role' && printf '%s' "$PROMPT" | grep -qiE 'grant|permission|assign|admin|staff'; then MATCH=1; fi
if [ "$MATCH" = "1" ]; then
  HITS="$HITS  · Access control, isolation and money → \`opus\` at \`max\` effort (the \`security\` subagent)
"
fi

MATCH=0
if printf '%s' "$PROMPT" | grep -qiE 'migration|prisma|\.prisma|db:deploy|forward-only'; then MATCH=1; fi
  if printf '%s' "$PROMPT" | grep -qiE 'schema' && printf '%s' "$PROMPT" | grep -qiE 'prisma|database|db|migration|column|table'; then MATCH=1; fi
  if printf '%s' "$PROMPT" | grep -qiE 'column' && printf '%s' "$PROMPT" | grep -qiE 'add|drop|rename|nullable|index|table|migration'; then MATCH=1; fi
  if printf '%s' "$PROMPT" | grep -qiE 'table' && printf '%s' "$PROMPT" | grep -qiE 'create|drop|database|column|index|migration'; then MATCH=1; fi
if [ "$MATCH" = "1" ]; then
  HITS="$HITS  · Database schema and migrations → \`opus\` at \`high\` effort (the \`schema\` subagent)
"
fi

MATCH=0
if printf '%s' "$PROMPT" | grep -qiE 'module boundar|module pack|extension point|decisions\.md|known_module_coupling|new sector|three axes|domain event'; then MATCH=1; fi
  if printf '%s' "$PROMPT" | grep -qiE 'architect' && printf '%s' "$PROMPT" | grep -qiE 'decision|boundar|design|module|pack|layer'; then MATCH=1; fi
  if printf '%s' "$PROMPT" | grep -qiE 'coupling' && printf '%s' "$PROMPT" | grep -qiE 'module|cross|import|boundar'; then MATCH=1; fi
  if printf '%s' "$PROMPT" | grep -qiE 'new module' && printf '%s' "$PROMPT" | grep -qiE 'add|create|register|pack'; then MATCH=1; fi
if [ "$MATCH" = "1" ]; then
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

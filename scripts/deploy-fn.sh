#!/usr/bin/env bash
# deploy-fn.sh - deploy one or more Supabase Edge Functions for Co-Exist,
# reading the org PAT INTERNALLY so the secret never lands in a Bash command
# string / transcript JSONL. Same shape and rationale as the canonical
# ecodiaos backend/scripts/pgq.sh helper.
#
# Why --no-verify-jwt: this project issues ES256 asymmetric JWTs which the
# Supabase API gateway does not verify correctly, so every function does its own
# auth via a GoTrue /auth/v1/user call. See supabase/deploy-functions.sh.
#
# Usage: scripts/deploy-fn.sh <function-name> [<function-name> ...]
set -uo pipefail

PROJECT_REF="${COEXIST_PROJECT_REF:-tjutlbzekfouwsiaplbr}"
CRED="$HOME/PRIVATE/ecodia-creds/supabase.env"

if [ "$#" -eq 0 ]; then
  echo "deploy-fn.sh: name at least one function" >&2
  exit 2
fi

TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' "$CRED" 2>/dev/null | cut -d= -f2-)"
if [ -z "$TOKEN" ]; then
  echo "deploy-fn.sh: SUPABASE_ACCESS_TOKEN unreadable at $CRED" >&2
  exit 3
fi
export SUPABASE_ACCESS_TOKEN="$TOKEN"

RC=0
for fn in "$@"; do
  echo "=== deploying $fn ==="
  if ! npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt 2>&1 | tail -5; then
    RC=1
  fi
done

unset SUPABASE_ACCESS_TOKEN
exit "$RC"

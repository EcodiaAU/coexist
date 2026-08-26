#!/usr/bin/env bash
# deploy-fn.sh - deploy one or more Supabase Edge Functions for Co-Exist,
# reading the org PAT INTERNALLY so the secret never lands in a Bash command
# string / transcript JSONL. Same shape and rationale as the canonical
# ecodiaos backend/scripts/pgq.sh helper.
#
# VERIFY_JWT (rewritten 2026-08-26): this script used to pass --no-verify-jwt
# UNCONDITIONALLY. That was a landmine. supabase/config.toml pins 20 functions
# to verify_jwt = true, so a blanket flag asked the CLI to strip gateway auth
# from every one of them, which is the exact inverse of the 2026-08-26T02:27Z
# regression that flipped stripe-webhook to true and 401'd live Stripe at the
# gateway before its body ran.
#
# Rather than depend on whether the CLI flag or config.toml wins (that
# precedence has moved between CLI versions, and the installed 2.105.0 predates
# the pinned 2.115.0), this script reads the declared value out of config.toml
# and makes the flag AGREE with it: --no-verify-jwt only for functions declared
# false, no flag at all for functions declared true. Under either precedence
# the deployed value is the declared one. A function absent from config.toml is
# refused rather than guessed.
#
# Usage: scripts/deploy-fn.sh <function-name> [<function-name> ...]
set -uo pipefail

# Symlink-safe resolution of our own directory: invoking this via a symlink
# must still find the canonical supabase/config.toml, not the link's parent.
HERE="$(cd "$(dirname "$(readlink "$0" || echo "$0")")" && pwd)"

PROJECT_REF="${COEXIST_PROJECT_REF:-tjutlbzekfouwsiaplbr}"
CRED="$HOME/PRIVATE/ecodia-creds/supabase.env"
CONFIG="$(cd "$HERE/.." && pwd)/supabase/config.toml"

if [ "$#" -eq 0 ]; then
  echo "deploy-fn.sh: name at least one function" >&2
  exit 2
fi

if [ ! -f "$CONFIG" ]; then
  echo "deploy-fn.sh: no config.toml at $CONFIG - refusing to guess verify_jwt" >&2
  exit 4
fi

# Read the declared verify_jwt for one slug. Prints "true"/"false", or nothing.
declared_verify_jwt() {
  awk -v want="[functions.$1]" '
    $0 == want { inblock = 1; next }
    /^\[/      { inblock = 0 }
    inblock && /^[[:space:]]*verify_jwt[[:space:]]*=/ {
      if ($0 ~ /true/)  { print "true";  exit }
      if ($0 ~ /false/) { print "false"; exit }
    }
  ' "$CONFIG"
}

# Refuse the whole batch before deploying any of it, so a typo cannot leave a
# half-deployed set behind.
for fn in "$@"; do
  if [ -z "$(declared_verify_jwt "$fn")" ]; then
    echo "deploy-fn.sh: '$fn' has no [functions.$fn] verify_jwt in config.toml." >&2
    echo "              Declare it there first; this script will not guess." >&2
    exit 5
  fi
done

TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' "$CRED" 2>/dev/null | cut -d= -f2-)"
if [ -z "$TOKEN" ]; then
  echo "deploy-fn.sh: SUPABASE_ACCESS_TOKEN unreadable at $CRED" >&2
  exit 3
fi
export SUPABASE_ACCESS_TOKEN="$TOKEN"

RC=0
for fn in "$@"; do
  VJ="$(declared_verify_jwt "$fn")"
  echo "=== deploying $fn (config.toml verify_jwt = $VJ) ==="
  if [ "$VJ" = "false" ]; then
    npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt 2>&1 | tail -5 || RC=1
  else
    npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF" 2>&1 | tail -5 || RC=1
  fi
done

unset SUPABASE_ACCESS_TOKEN

echo
echo "Deploy finished. VERIFY the gateway config actually landed - a correct"
echo "deployed BODY with a wrong verify_jwt IS the 2026-08-26 Stripe outage:"
echo "  scripts/verify-fn-config.py $*"
exit "$RC"

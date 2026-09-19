#!/usr/bin/env bash
#
# ship-web-ota.sh - push a web-layer (JS/HTML/CSS) update to installed Co-Exist
# apps over the air via Capgo, WITHOUT a store submission.
#
#   scripts/ship-web-ota.sh              # bump patch of WEB_BUNDLE_VERSION, build, upload
#   SKIP_BUMP=1 scripts/ship-web-ota.sh  # ship the current WEB_BUNDLE_VERSION as-is
#   CHANNEL=beta scripts/ship-web-ota.sh # upload to a non-production channel
#
# What it does:
#   1. bumps the patch number in src/lib/web-bundle-version.ts (the Capgo bundle id)
#   2. CAPACITOR_BUILD=true npm run build  (vite build -> dist/)
#   3. uploads dist/ to the Capgo channel with that version
#   4. commits the version bump so the repo matches what devices run
#
# Devices on the channel background-download the new bundle on next launch or
# resume, and apply it the next time the app goes to background (or on next
# launch). If the new bundle fails to boot (App.tsx notifyAppReady not called
# within appReadyTimeout) the plugin rolls the device back automatically.
#
# ONLY web-layer changes. NEVER OTA native changes: new/updated Capacitor
# plugins, entitlements, Info.plist/AndroidManifest changes, icons, splash -
# those need a native store build (build:ios / build:android + the ship recipe).
#
# Auth: CAPGO_APIKEY in the environment, or the Ecodia creds file
# /Users/ecodia/PRIVATE/ecodia-creds/capgo.env (dev machine only).
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$APP_ROOT/src/lib/web-bundle-version.ts"
CHANNEL="${CHANNEL:-production}"
APP_ID="org.coexistaus.app"

if [ -z "${CAPGO_APIKEY:-}" ] && [ -f /Users/ecodia/PRIVATE/ecodia-creds/capgo.env ]; then
  # shellcheck disable=SC1091
  set -a; source /Users/ecodia/PRIVATE/ecodia-creds/capgo.env; set +a
fi
[ -n "${CAPGO_APIKEY:-}" ] || { echo "FATAL: CAPGO_APIKEY not set" >&2; exit 1; }

CURRENT=$(sed -n "s/.*WEB_BUNDLE_VERSION = '\([0-9.]*\)'.*/\1/p" "$VERSION_FILE")
[ -n "$CURRENT" ] || { echo "FATAL: could not read WEB_BUNDLE_VERSION from $VERSION_FILE" >&2; exit 1; }

if [ -z "${SKIP_BUMP:-}" ]; then
  IFS=. read -r MAJ MIN PAT <<<"$CURRENT"
  VERSION="$MAJ.$MIN.$((PAT + 1))"
  sed -i '' "s/WEB_BUNDLE_VERSION = '$CURRENT'/WEB_BUNDLE_VERSION = '$VERSION'/" "$VERSION_FILE"
  echo "==> web bundle version: $CURRENT -> $VERSION"
else
  VERSION="$CURRENT"
  echo "==> shipping current web bundle version $VERSION (SKIP_BUMP)"
fi

# NATIVE FLOOR GUARD. Capgo refuses to serve a bundle whose version is <= the
# device's live native version (error disable_auto_update_under_native, "Cannot
# revert under native version") - the push uploads fine but reaches ZERO devices,
# a silent dead push. This bit us on 2026-08-19: web lane sat at 2.2.5 while
# native store builds marched to iOS 2.2.9 / Android 2.2.8, so every OTA was
# dead. WEB_BUNDLE_VERSION must exceed the highest native version. The repo's
# native versions are the ceiling of what can be live, so fail closed against
# them here (no ASC/Play creds needed).
IOS_NATIVE=$(sed -n 's/.*MARKETING_VERSION = \([0-9.]*\);.*/\1/p' \
  "$APP_ROOT/ios/App/App.xcodeproj/project.pbxproj" 2>/dev/null | sort -V | tail -1)
AND_NATIVE=$(sed -n 's/.*versionName "\([0-9.]*\)".*/\1/p' \
  "$APP_ROOT/android/app/build.gradle" 2>/dev/null | sort -V | tail -1)
NATIVE_MAX=$(printf '%s\n%s\n' "${IOS_NATIVE:-0.0.0}" "${AND_NATIVE:-0.0.0}" | sort -V | tail -1)
HIGHEST=$(printf '%s\n%s\n' "$VERSION" "$NATIVE_MAX" | sort -V | tail -1)
if [ "$VERSION" = "$NATIVE_MAX" ] || [ "$HIGHEST" != "$VERSION" ]; then
  echo "FATAL: web bundle $VERSION is not greater than highest native $NATIVE_MAX (iOS ${IOS_NATIVE:-?} / Android ${AND_NATIVE:-?})." >&2
  echo "       Capgo would block this as a dead push (disable_auto_update_under_native)." >&2
  echo "       Set WEB_BUNDLE_VERSION above $NATIVE_MAX in src/lib/web-bundle-version.ts and retry." >&2
  exit 1
fi
echo "==> native floor OK: web $VERSION > native $NATIVE_MAX (iOS ${IOS_NATIVE:-?} / Android ${AND_NATIVE:-?})"

# CHANNEL FLOOR GUARD. The native floor above is NOT enough, and on 2026-09-14
# that gap nearly shipped a dead bundle. This script auto-bumps off the VERSION
# FILE, but the file drifts below the live channel whenever a bundle is shipped
# without its bump commit landing in the repo. That day the file read 2.3.13
# while production served 2.3.16, so a default run would have uploaded 2.3.14:
# above every native version, so the native guard passed it, accepted by the
# upload, and served to NOBODY because the channel already had something newer.
# A dead push looks exactly like a successful one from the CLI output, which is
# why this has to be a hard gate rather than a warning.
# The read RETRIES. A single transient makes this guard degrade to a warning and
# ship unguarded on a run that looks completely normal: observed 2026-09-17, one
# read returned an empty parse while three reads a minute later all returned the
# live version. One flaky HTTP call must not be able to silently disable the only
# check standing between us and a dead push.
# CAPGO_CHANNEL_API_BASE exists so the FAILURE path is testable without editing
# this file: point it at an unroutable host and the read cannot succeed.
CAPGO_CHANNEL_API_BASE="${CAPGO_CHANNEL_API_BASE:-https://api.capgo.app}"
# Deliberately NOT a pipeline. Under `set -euo pipefail` a failed curl inside a
# pipeline aborts the whole script at the assignment, so the retry, the
# diagnostic and the override below were all dead code on a network failure: the
# script exited 7 with no explanation. Split into two guarded steps so a failed
# read RETURNS EMPTY and the logic below gets to run.
read_channel_version() {
  local raw=""
  raw=$(curl -s --max-time 20 "$CAPGO_CHANNEL_API_BASE/channel?app_id=$APP_ID" \
    -H "authorization: $CAPGO_APIKEY" -H "Content-Type: application/json" 2>/dev/null) || raw=""
  [ -n "$raw" ] || return 0
  printf '%s' "$raw" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
rows = d if isinstance(d,list) else [d]
for c in rows:
    if c.get('name') == '$CHANNEL':
        v = c.get('version')
        print(v.get('name') if isinstance(v,dict) else (v or ''))
        break
" 2>/dev/null || return 0
}
CHANNEL_LIVE=""
for attempt in 1 2 3; do
  CHANNEL_LIVE=$(read_channel_version)
  [ -n "${CHANNEL_LIVE:-}" ] && break
  [ "$attempt" -lt 3 ] && { echo "==> channel read attempt $attempt returned nothing, retrying" >&2; sleep 2; }
done
if [ -n "${CHANNEL_LIVE:-}" ]; then
  CH_HIGHEST=$(printf '%s\n%s\n' "$VERSION" "$CHANNEL_LIVE" | sort -V | tail -1)
  if [ "$VERSION" = "$CHANNEL_LIVE" ] || [ "$CH_HIGHEST" != "$VERSION" ]; then
    echo "FATAL: web bundle $VERSION is not greater than what channel '$CHANNEL' already serves ($CHANNEL_LIVE)." >&2
    echo "       The upload would succeed and reach ZERO devices (silent dead push)." >&2
    echo "       The version file has drifted below the channel. Set WEB_BUNDLE_VERSION above $CHANNEL_LIVE and retry." >&2
    exit 1
  fi
  echo "==> channel floor OK: web $VERSION > channel '$CHANNEL' live $CHANNEL_LIVE"
else
  # FAIL CLOSED. This used to warn and ship on, which meant the guard was absent
  # exactly when the network was flaky and told you so in a line easy to miss in
  # several hundred lines of vite output. An unreadable channel is an UNKNOWN
  # floor, and shipping against an unknown floor is the dead push this guard
  # exists to prevent.
  echo "FATAL: could not read live '$CHANNEL' channel version after 3 attempts." >&2
  echo "       The channel floor is UNKNOWN, so this upload could be a silent dead push." >&2
  echo "       Check connectivity and CAPGO_APIKEY, then retry." >&2
  echo "       Deliberately shipping without the check: ALLOW_UNGUARDED_CHANNEL=1 $0" >&2
  if [ -n "${ALLOW_UNGUARDED_CHANNEL:-}" ]; then
    echo "==> ALLOW_UNGUARDED_CHANNEL set: proceeding WITHOUT the channel floor check" >&2
  else
    exit 1
  fi
fi

# Sentry source-map upload for the OTA bundle. The native app has no server.url,
# so it serves THIS bundled dist locally - its JS crash stacks (e.g. COEXIST-N
# "Maximum update depth" in the admin bundle) only resolve to real file/line if
# this build uploads hidden source maps. vite.config gates the @sentry/vite-plugin
# on SENTRY_AUTH_TOKEN; map it from the write-scoped token in the creds file so an
# OTA ship symbolicates the native surface, not just the Vercel web build.
if [ -z "${SENTRY_AUTH_TOKEN:-}" ] && [ -f /Users/ecodia/PRIVATE/ecodia-creds/sentry.env ]; then
  # shellcheck disable=SC1091
  set -a; source /Users/ecodia/PRIVATE/ecodia-creds/sentry.env; set +a
  export SENTRY_AUTH_TOKEN="$SENTRY_WRITE_TOKEN"
fi
if [ -n "${SENTRY_AUTH_TOKEN:-}" ]; then
  echo "==> Sentry token present: OTA bundle will upload hidden source maps"
else
  echo "==> WARN: no Sentry token - OTA bundle ships WITHOUT source maps (JS crash stacks stay minified)"
fi

echo "==> building web bundle (CAPACITOR_BUILD=true npm run build)"
(cd "$APP_ROOT" && CAPACITOR_BUILD=true npm run build)

# ARTIFACT GATE. Checks the dist we are about to upload, not the build's exit
# code. On 2026-09-18 bundle 2.3.35 was built in a git worktree with no
# .env.production (gitignored, so a worktree never has it): vite exited 0, left
# the Supabase placeholders literal in index.html, and every device that took the
# bundle crashed on open with "supabaseUrl is required". vite.config.ts now
# refuses that build too; this gate is the second layer, and it also covers a
# dist built by some other route and re-uploaded by hand (the documented 502
# recovery re-runs `capgo bundle upload` on an existing dist: run THIS block's
# two greps first when you do).
# Production OTA must be built against the production Supabase project.
EXPECT_SUPABASE_HOST="${EXPECT_SUPABASE_HOST:-tjutlbzekfouwsiaplbr.supabase.co}"
LEAKED=$(grep -rlF '%VITE_' "$APP_ROOT/dist" 2>/dev/null || true)
if [ -n "$LEAKED" ]; then
  echo "FATAL: dist carries unreplaced %VITE_ placeholders (the env was missing at build):" >&2
  echo "$LEAKED" >&2
  echo "       Uploading this would crash every device on open. Copy .env.production in and rebuild." >&2
  exit 1
fi
if ! grep -qF "$EXPECT_SUPABASE_HOST" "$APP_ROOT/dist/index.html"; then
  echo "FATAL: dist/index.html does not carry the Supabase URL ($EXPECT_SUPABASE_HOST)." >&2
  echo "       The build did not see VITE_SUPABASE_URL for this project. Refusing to upload." >&2
  exit 1
fi
echo "==> artifact gate OK: no %VITE_ placeholder in dist, Supabase host $EXPECT_SUPABASE_HOST present"

echo "==> uploading to Capgo channel '$CHANNEL' as $VERSION"
(cd "$APP_ROOT" && npx @capgo/cli@latest bundle upload "$APP_ID" \
  --path dist --channel "$CHANNEL" --bundle "$VERSION" --apikey "$CAPGO_APIKEY")

if [ -z "${SKIP_BUMP:-}" ]; then
  (cd "$APP_ROOT" && git add "$VERSION_FILE" \
    && git commit -m "ota: web bundle $VERSION to $CHANNEL" --quiet) \
    || echo "WARN: version bump commit failed - commit $VERSION_FILE manually"
fi

echo "==> done. Devices on '$CHANNEL' pick up $VERSION on next launch/resume."

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

echo "==> building web bundle (CAPACITOR_BUILD=true npm run build)"
(cd "$APP_ROOT" && CAPACITOR_BUILD=true npm run build)

echo "==> uploading to Capgo channel '$CHANNEL' as $VERSION"
(cd "$APP_ROOT" && npx @capgo/cli@latest bundle upload "$APP_ID" \
  --path dist --channel "$CHANNEL" --bundle "$VERSION" --apikey "$CAPGO_APIKEY")

if [ -z "${SKIP_BUMP:-}" ]; then
  (cd "$APP_ROOT" && git add "$VERSION_FILE" \
    && git commit -m "ota: web bundle $VERSION to $CHANNEL" --quiet) \
    || echo "WARN: version bump commit failed - commit $VERSION_FILE manually"
fi

echo "==> done. Devices on '$CHANNEL' pick up $VERSION on next launch/resume."

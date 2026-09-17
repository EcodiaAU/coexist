#!/usr/bin/env bash
#
# check-native-floor.sh - refuse to prepare a native build whose version sits at or
# below the live Capgo channel, because that silently kills OTA for every device
# that installs it.
#
# THE FAILURE THIS PREVENTS. Capgo refuses to serve a bundle whose version is <= the
# device's NATIVE version (disable_auto_update_under_native, "Cannot revert under
# native version"). The upload succeeds and reaches ZERO devices: a dead push that
# looks identical to a successful one in the CLI output. It happened on 2026-08-19,
# when the web lane sat at 2.2.5 while store builds marched to iOS 2.2.9 / Android
# 2.2.8 and every OTA was dead.
#
# ship-web-ota.sh already fails closed on this from the OTA side, against both the
# repo native versions and the live channel. Nothing guarded the STORE side, so a
# store build cut at a normal-looking next version (2.3.1, say, while the channel
# runs 2.3.22) would break OTA for its installers with no error anywhere. This is
# that missing half. Written 2026-09-15; the 2026-08-28 iOS release got it right by
# hand ("cut above the Capgo bundle so the OTA cannot undo it"), and hand-rightness
# does not survive an eleven-week away window.
#
# AFTER a store build ships, bump WEB_BUNDLE_VERSION above the new native and cut a
# fresh OTA: the store build resets the floor for everyone who installs it.
#
# Presence checks use the :+SET form rather than :- because the latter substitutes
# the real value, and one `set -x` away that is a credential in a log.
#
# Bypass for a local sync you will never ship:  NATIVE_FLOOR_OK=1
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="org.coexistaus.app"
[ -n "${CHANNEL:+SET}" ] || CHANNEL="production"

if [ -n "${NATIVE_FLOOR_OK:+SET}" ]; then
  echo "==> native floor check BYPASSED (NATIVE_FLOOR_OK set). Do not ship this build."
  exit 0
fi

CREDS_FILE="/Users/ecodia/PRIVATE/ecodia-creds/capgo.env"
if [ -z "${CAPGO_APIKEY:+SET}" ] && [ -f "$CREDS_FILE" ]; then
  # shellcheck disable=SC1091
  set -a; . "$CREDS_FILE"; set +a
fi

IOS_NATIVE=$(sed -n 's/.*MARKETING_VERSION = \([0-9.]*\);.*/\1/p' \
  "$APP_ROOT/ios/App/App.xcodeproj/project.pbxproj" 2>/dev/null | sort -V | tail -1)
AND_NATIVE=$(sed -n 's/.*versionName "\([0-9.]*\)".*/\1/p' \
  "$APP_ROOT/android/app/build.gradle" 2>/dev/null | sort -V | tail -1)
NATIVE_MIN=$(printf '%s\n%s\n' "${IOS_NATIVE:-99.9.9}" "${AND_NATIVE:-99.9.9}" | sort -V | head -1)

if [ -z "${CAPGO_APIKEY:+SET}" ]; then
  echo "FATAL: no Capgo API key, so the live channel version cannot be read." >&2
  echo "       Refusing to pass a floor check that measured nothing. A skipped check" >&2
  echo "       and a passed check must never look the same." >&2
  exit 1
fi

CHANNEL_LIVE=$(curl -s --max-time 20 "https://api.capgo.app/channel?app_id=$APP_ID" \
  -H "authorization: $CAPGO_APIKEY" -H "Content-Type: application/json" 2>/dev/null \
  | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
for c in (d if isinstance(d,list) else [d]):
    if c.get('name') == '$CHANNEL':
        v = c.get('version'); print(v.get('name') if isinstance(v,dict) else (v or '')); break
" 2>/dev/null)

if [ -z "${CHANNEL_LIVE:+SET}" ]; then
  echo "FATAL: could not read the live '$CHANNEL' channel version from Capgo." >&2
  echo "       Refusing rather than warning: an unreadable channel is exactly when a" >&2
  echo "       dead push slips through." >&2
  exit 1
fi

LOWEST=$(printf '%s\n%s\n' "$NATIVE_MIN" "$CHANNEL_LIVE" | sort -V | head -1)
if [ "$NATIVE_MIN" = "$CHANNEL_LIVE" ] || [ "$LOWEST" != "$CHANNEL_LIVE" ]; then
  echo "FATAL: native version $NATIVE_MIN (iOS ${IOS_NATIVE:-?} / Android ${AND_NATIVE:-?}) is not" >&2
  echo "       above the live Capgo '$CHANNEL' channel ($CHANNEL_LIVE)." >&2
  echo "       Shipping this build would stop OTA for every device that installs it," >&2
  echo "       silently: Capgo answers disable_auto_update_under_native and the push" >&2
  echo "       still reports success." >&2
  echo "       Set BOTH native versions above $CHANNEL_LIVE. After the store build" >&2
  echo "       ships, bump WEB_BUNDLE_VERSION above the new native and cut a fresh OTA." >&2
  echo "       Local sync you will never ship: NATIVE_FLOOR_OK=1" >&2
  exit 1
fi

echo "==> native floor OK: native $NATIVE_MIN > live '$CHANNEL' channel $CHANNEL_LIVE"

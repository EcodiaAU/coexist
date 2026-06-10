#!/bin/bash
# Co-Exist iOS 1.8.24 build 61 full ship pipeline.
# Runs on SY094 via sy094-ssh.py. Streams output live.
# Pipeline:
#   1. git fetch + hard reset to origin/main
#   2. npm run build (web)
#   3. npx cap sync ios
#   4. xcodebuild Debug + install on iPhone 17 sim
#   5. xcodebuild Release archive + altool upload to ASC
set -uo pipefail

if [ -z "${MAC_PASS:-}" ]; then
  echo "MAC_PASS env required" >&2
  exit 1
fi

export PATH=/Users/user276189/opt/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH

TEAM_ID=86PUY7393S
KEY_ID=6U5835AAQY
ISSUER_ID=4b45186b-49e4-4a25-8a63-afd28cf12d3f
KEY_PATH="$HOME/private_keys/AuthKey_${KEY_ID}.p8"
ARCHIVE=/tmp/coexist-1.8.24-b61.xcarchive
EXPORT=/tmp/coexist-1.8.24-b61-export
SIM_ID=0DC6D0B3-5CDA-4496-AE09-5A59B742F261
SIM_BUILD_DIR=/tmp/coexist-sim-b61

cd ~/projects/coexist

echo "=== unlock login keychain ==="
security unlock-keychain -p "$MAC_PASS" ~/Library/Keychains/login.keychain-db
security set-keychain-settings -lut 3600 ~/Library/Keychains/login.keychain-db

echo "=== git fetch + reset to origin/main ==="
git fetch origin main
git reset --hard origin/main
git --no-pager log -1 --oneline

echo "=== npm run build (web) ==="
npm run build 2>&1 | tail -8

echo "=== npx cap sync ios ==="
npx cap sync ios 2>&1 | tail -10

cd ~/projects/coexist/ios/App

echo "=== xcodebuild Debug for iPhone 17 sim ==="
rm -rf "$SIM_BUILD_DIR"
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$SIM_ID" \
  -derivedDataPath "$SIM_BUILD_DIR" \
  build 2>&1 | tail -10

APP_PATH=$(find "$SIM_BUILD_DIR/Build/Products/Debug-iphonesimulator" -name "App.app" -type d | head -1)
if [ -z "$APP_PATH" ]; then
  echo "DEBUG BUILD FAILED - no App.app found" >&2
else
  echo "=== sim: boot + install + launch ==="
  xcrun simctl boot "$SIM_ID" 2>&1 | tail -3 || echo "(already booted)"
  xcrun simctl uninstall "$SIM_ID" org.coexistaus.app 2>&1 | tail -3 || true
  xcrun simctl install "$SIM_ID" "$APP_PATH"
  xcrun simctl launch "$SIM_ID" org.coexistaus.app
  echo "=== sim build installed and launched ==="
fi

echo "=== xcodebuild Release archive ==="
rm -rf "$ARCHIVE" "$EXPORT"
security unlock-keychain -p "$MAC_PASS" ~/Library/Keychains/login.keychain-db

xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$KEY_ID" \
  -authenticationKeyIssuerID "$ISSUER_ID" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  archive 2>&1 | tail -15

if [ ! -f "$ARCHIVE/Info.plist" ]; then
  echo "ARCHIVE FAILED - no Info.plist at $ARCHIVE" >&2
  exit 2
fi

echo "=== xcodebuild -exportArchive ==="
security unlock-keychain -p "$MAC_PASS" ~/Library/Keychains/login.keychain-db
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT" \
  -exportOptionsPlist ~/projects/coexist/ios/App/ExportOptions.plist \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$KEY_ID" \
  -authenticationKeyIssuerID "$ISSUER_ID" 2>&1 | tail -10

ls -la "$EXPORT/" 2>&1 | head -10

if [ ! -f "$EXPORT/App.ipa" ]; then
  echo "EXPORT FAILED - no App.ipa at $EXPORT" >&2
  exit 3
fi

echo "=== altool upload-app ==="
xcrun altool --upload-app \
  --type ios \
  --file "$EXPORT/App.ipa" \
  --apiKey "$KEY_ID" \
  --apiIssuer "$ISSUER_ID" 2>&1 | tail -20

echo "=== DONE: build 61 sim installed + ASC upload submitted ==="

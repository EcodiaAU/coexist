#!/bin/bash
# Archive + export + upload Co-Exist iOS 1.8.23 (build 55) to ASC.
# Runs on SY094. Expects MAC_PASS env var (= login keychain password = MacInCloud pass).
set -euo pipefail

if [ -z "${MAC_PASS:-}" ]; then
  echo "MAC_PASS env required" >&2
  exit 1
fi

export PATH=/Users/user276189/opt/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH

TEAM_ID=86PUY7393S
KEY_ID=6U5835AAQY
ISSUER_ID=4b45186b-49e4-4a25-8a63-afd28cf12d3f
KEY_PATH="$HOME/private_keys/AuthKey_${KEY_ID}.p8"
ARCHIVE=/tmp/coexist-1.8.23.xcarchive
EXPORT=/tmp/coexist-1.8.23-export

echo "=== unlock login keychain (1h TTL) ==="
security unlock-keychain -p "$MAC_PASS" ~/Library/Keychains/login.keychain-db
security set-keychain-settings -lut 3600 ~/Library/Keychains/login.keychain-db

cd ~/projects/coexist/ios/App
rm -rf "$ARCHIVE" "$EXPORT"

echo "=== xcodebuild archive (Release) ==="
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
# Re-unlock in case the archive took long.
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

ls -la "$EXPORT/"

if [ ! -f "$EXPORT/App.ipa" ]; then
  echo "EXPORT FAILED - no App.ipa at $EXPORT" >&2
  exit 3
fi

echo "=== altool upload-app ==="
xcrun altool --upload-app \
  --type ios \
  --file "$EXPORT/App.ipa" \
  --apiKey "$KEY_ID" \
  --apiIssuer "$ISSUER_ID" 2>&1

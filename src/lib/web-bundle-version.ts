// The version of the WEB bundle (JS/HTML/CSS layer) currently in this build.
//
// This is the Capgo OTA version stamp: scripts/ship-web-ota.sh bumps the patch
// number here, rebuilds the web bundle (dist/), and uploads it to the Capgo
// `production` channel with the same version. Installed apps pick it up over
// the air on next launch/resume without a store submission.
//
// It is deliberately separate from the NATIVE app version (MARKETING_VERSION /
// CFBundleShortVersionString / versionName) - those only change on store builds.
//
// CRITICAL FLOOR: this version MUST be greater than the highest LIVE native
// store version, or Capgo blocks the OTA with disable_auto_update_under_native
// ("Cannot revert under native version") and the push is a silent dead push.
// As of 2026-08-19 live native is iOS 2.2.9 / Android 2.2.8, so the OTA lane
// jumped 2.2.5 -> 2.2.10 to clear that floor. When cutting a new store build,
// bump this above the new native version too.
export const WEB_BUNDLE_VERSION = '2.3.6'

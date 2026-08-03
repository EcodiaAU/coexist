// The version of the WEB bundle (JS/HTML/CSS layer) currently in this build.
//
// This is the Capgo OTA version stamp: scripts/ship-web-ota.sh bumps the patch
// number here, rebuilds the web bundle (dist/), and uploads it to the Capgo
// `production` channel with the same version. Installed apps pick it up over
// the air on next launch/resume without a store submission.
//
// It is deliberately separate from the NATIVE app version (MARKETING_VERSION /
// CFBundleShortVersionString / versionName) - those only change on store builds.
export const WEB_BUNDLE_VERSION = '2.2.4'

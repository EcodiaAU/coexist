# Co-Exist - Native Build Workflow

## Prerequisites

- **Node.js** 20+ and npm
- **Android Studio** (Windows/Mac/Linux) - for Android builds
- **Xcode** 15+ (macOS only, or via MacInCloud) - for iOS builds

## Quick Commands

```bash
# Build web + sync to both platforms
npm run build && npm run cap:sync

# Build + sync Android only
npm run build:android

# Build + sync iOS only
npm run build:ios

# Open in native IDE
npx cap open android
npx cap open ios
```

## Android Build (Windows / Android Studio)

### First-time setup

1. Install [Android Studio](https://developer.android.com/studio)
2. In Android Studio SDK Manager, install:
   - Android SDK Platform 34 (Android 14)
   - Android SDK Build-Tools 34
   - Android Emulator
   - A system image (e.g. Pixel 7 API 34)
3. Replace `android/app/google-services.json` with the real file from [Firebase Console](https://console.firebase.google.com) (required for push notifications)

### Build & Run

```bash
# 1. Build web assets and sync to Android
npm run build:android

# 2. Open in Android Studio
npx cap open android

# 3. In Android Studio:
#    - Wait for Gradle sync to complete
#    - Select a device/emulator
#    - Click Run (green play button) or Shift+F10
```

### Signed release APK/AAB

1. In Android Studio: **Build > Generate Signed Bundle / APK**
2. Create or select a keystore (keep this safe - you need it for every update)
3. Choose **Android App Bundle** for Play Store upload
4. Build variant: **release**

### Key files

| File | Purpose |
|------|---------|
| `android/app/src/main/AndroidManifest.xml` | Permissions, deep links, app config |
| `android/app/google-services.json` | Firebase/FCM config (replace placeholder!) |
| `android/app/src/main/res/values/colors.xml` | Brand colors |
| `android/app/src/main/res/drawable/splash.png` | Splash screen image |
| `android/app/src/main/res/mipmap-*/` | App icons (replace with branded versions) |

## iOS Build (Xcode on macOS / MacInCloud)

### Using MacInCloud (from Windows)

1. Sign up at [MacInCloud](https://www.macincloud.com) - get a plan with Xcode
2. Upload the project via SFTP/Git
3. Open `ios/App/App.xcworkspace` in Xcode
4. Follow the local macOS steps below

### First-time setup (macOS)

1. Install Xcode 15+ from the App Store
2. Install CocoaPods: `sudo gem install cocoapods` (if needed)
3. Open `ios/App/App.xcworkspace` in Xcode
4. Set the development team in **Signing & Capabilities**
5. Set the bundle identifier to `org.coexistaus.app`

### Build & Run

```bash
# 1. Build web assets and sync to iOS
npm run build:ios

# 2. Open in Xcode
npx cap open ios

# 3. In Xcode:
#    - Select a simulator or connected device
#    - Click Run (Cmd+R)
```

### App Store submission

1. In Xcode: **Product > Archive**
2. In the Organizer, click **Distribute App**
3. Choose **App Store Connect** and follow the wizard
4. Upload and submit in [App Store Connect](https://appstoreconnect.apple.com)

### Entitlements (already configured)

- Push Notifications (APNs)
- Associated Domains (Universal Links for coexistaus.org)

### Key files

| File | Purpose |
|------|---------|
| `ios/App/App/Info.plist` | Permissions, URL schemes, app config |
| `ios/App/App/App.entitlements` | Push notifications, associated domains |
| `ios/App/App/Assets.xcassets/AppIcon.appiconset/` | App icons (replace with branded) |
| `ios/App/App/Assets.xcassets/Splash.imageset/` | Splash image (replace with branded) |
| `ios/App/App/Base.lproj/LaunchScreen.storyboard` | Launch screen layout |

## Before First Store Submission

- [ ] Replace placeholder `google-services.json` with real Firebase config
- [ ] Replace default Capacitor icons with Co-Exist branded icons (all sizes)
- [ ] Replace default splash screen with Co-Exist branded splash
- [ ] Set version number in `capacitor.config.ts` and native projects
- [ ] Add `GoogleService-Info.plist` to iOS for FCM (from Firebase Console)
- [ ] Configure Apple Push Notification service (APNs) key in Firebase
- [ ] Set up `.well-known/apple-app-site-association` on coexistaus.org for Universal Links
- [ ] Set up `.well-known/assetlinks.json` on coexistaus.org for Android App Links
- [ ] Test all permissions prompts on real devices
- [ ] Test deep links: `coexist://event/{id}` and `https://coexistaus.org/event/{id}`

## Live Reload (Development)

```bash
# Start dev server
npm run dev

# In another terminal - run on device with live reload
npx cap run android --livereload --external
npx cap run ios --livereload --external
```

## Capacitor Plugins (9 installed)

| Plugin | Purpose |
|--------|---------|
| @capacitor/app | App lifecycle, back button |
| @capacitor/camera | Photo capture for events/profiles |
| @capacitor/geolocation | Location for nearby events, check-in |
| @capacitor/keyboard | Keyboard management |
| @capacitor/network | Online/offline detection |
| @capacitor/preferences | Local key-value storage |
| @capacitor/push-notifications | FCM (Android) / APNs (iOS) |
| @capacitor/splash-screen | Branded launch screen |
| @capacitor/status-bar | Status bar styling |

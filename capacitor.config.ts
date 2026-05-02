import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.coexistaus.app',
  appName: 'Co-Exist',
  webDir: 'dist',

  // ---- Server ----
  server: {
    // Allow navigation to these URLs (deep links, OAuth, payments)
    allowNavigation: ['*.coexistaus.org', '*.supabase.co', '*.stripe.com'],
    androidScheme: 'https',
  },

  // ---- Plugins ----
  plugins: {
    // Push Notifications (FCM + APNs)
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // Preferences (key-value storage)
    Preferences: {},

    // Social Login (Google + Apple)
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
    },

    // Splash Screen
    // The system splash (Android 12+ Theme.SplashScreen / iOS LaunchScreen) shows
    // until the WebView is ready. After that, the React `SplashPage` component
    // handles the in-app splash → no need for the Capacitor plugin overlay.
    // Setting launchShowDuration: 0 skips the post-WebView overlay entirely.
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#fafaf8', // matches system splash + React SplashPage bg
      showSpinner: false,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_INSIDE',
      splashFullScreen: true,
      splashImmersive: true,
    },

    // Status Bar – style only, no backgroundColor (deprecated in Android 15+; edge-to-edge
    // draws transparent bars and the web layer controls appearance via CSS).
    StatusBar: {
      style: 'LIGHT',
      overlaysWebView: true,
    },

    // Keyboard – use 'none' so iOS doesn't fight our own visualViewport-based
    // keyboard avoidance (--kb-height CSS variable set by useKeyboardHeight).
    // 'body' resize is unreliable on modern iOS WKWebView.
    Keyboard: {
      resize: 'none',
      resizeOnFullScreen: true,
    },
  },

  // ---- iOS specific ----
  ios: {
    // Let the WebView extend edge-to-edge; CSS env(safe-area-inset-*) handles the rest
    contentInset: 'never',
    // Background modes for silent push
    backgroundColor: '#f8f9f5',
    scheme: 'coexist',
    // Required for ML Kit barcode scanner — do not restrict to app-bound domains
    limitsNavigationsToAppBoundDomains: false,
    // Info.plist permissions are declared in Xcode:
    // - NSCameraUsageDescription
    // - NSPhotoLibraryUsageDescription
    // - NSLocationWhenInUseUsageDescription
    // - NSCalendarsUsageDescription
    // - NSMicrophoneUsageDescription
    // - NSUserNotificationsUsageDescription
  },

  // ---- Android specific ----
  android: {
    backgroundColor: '#f8f9f5',
    allowMixedContent: false,
    // Permission declarations are in AndroidManifest.xml:
    // - android.permission.CAMERA
    // - android.permission.ACCESS_FINE_LOCATION
    // - android.permission.ACCESS_COARSE_LOCATION
    // - android.permission.RECORD_AUDIO
    // - android.permission.READ_CALENDAR
    // - android.permission.WRITE_CALENDAR
    // - android.permission.POST_NOTIFICATIONS (Android 13+)
    // - android.permission.INTERNET
    // - android.permission.RECEIVE_BOOT_COMPLETED (for scheduled notifications)
  },
};

export default config;

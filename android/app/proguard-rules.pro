# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ---------------------------------------------------------------------------
# Crash-report readability: keep source/line info and annotations so the
# mapping.txt uploaded to Play produces useful, deobfuscated stack traces.
# ---------------------------------------------------------------------------
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes JavascriptInterface
-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------------
# Capacitor bridge. Plugins and their methods are resolved reflectively at
# runtime via @CapacitorPlugin / @PluginMethod, so R8 must not strip or rename
# them or the WebView bridge breaks (classic white-screen-on-launch).
# ---------------------------------------------------------------------------
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.plugin.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.PluginMethod public <methods>;
}
-keepclassmembers class * {
    @com.getcapacitor.annotation.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin

# Cordova plugins bridged in through capacitor-cordova-android-plugins.
-keep class org.apache.cordova.** { *; }

# ---------------------------------------------------------------------------
# WebView <-> JS interface methods are invoked by name from JavaScript.
# ---------------------------------------------------------------------------
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ---------------------------------------------------------------------------
# Firebase Cloud Messaging (push notifications). Service subclasses are
# instantiated by the framework via the manifest.
# ---------------------------------------------------------------------------
-keep class * extends com.google.firebase.messaging.FirebaseMessagingService { *; }

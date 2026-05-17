import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    // #f8f9f5 - matches --color-surface-1
    private let surface = UIColor(red: 248.0/255.0, green: 249.0/255.0, blue: 245.0/255.0, alpha: 1.0)

    // Capacitor Preferences plugin reads UserDefaults.standard with this prefix
    // (default group "CapacitorStorage"). Any value we want the JS side to read
    // via Preferences.get must be stored under "CapacitorStorage.<key>".
    private let capPrefix = "CapacitorStorage."
    private func capSet(_ value: Any?, forKey key: String) {
        if let v = value {
            UserDefaults.standard.set(v, forKey: capPrefix + key)
        } else {
            UserDefaults.standard.removeObject(forKey: capPrefix + key)
        }
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Clear stale debug fields from previous launch so the debug page reflects this run only.
        capSet(nil, forKey: "apnsTokenHex")
        capSet(nil, forKey: "apnsError")
        capSet(false, forKey: "didRegisterCalled")
        capSet(false, forKey: "didFailCalled")
        capSet(false, forKey: "didSetUNCenterDelegate")
        capSet(nil, forKey: "lastTapResponseAt")
        capSet(nil, forKey: "lastTapUserInfo")
        capSet(nil, forKey: "lastTapBridgeStatus")
        capSet(nil, forKey: "unCenterDelegateClass")
        // Note: don't clear pendingPushRoute here - if app was killed and relaunched
        // via tap, the route MAY have been written before this clear (but actually
        // didFinishLaunching runs BEFORE didReceive, so we clear and the tap then
        // writes fresh). Safe either way.

        // Firebase init. Method swizzling is disabled via Info.plist
        // (FirebaseAppDelegateProxyEnabled=false) so we take manual control:
        // the OS calls didRegisterForRemoteNotificationsWithDeviceToken below,
        // we hand the token to Firebase AND post the Capacitor notification so
        // the @capacitor/push-notifications plugin fires its 'registration' JS
        // event. The plugin listens on Notification.Name
        // `.capacitorDidRegisterForRemoteNotifications` (raw value
        // "CapacitorDidRegisterForRemoteNotificationsNotification") — anything
        // else and the plugin never sees the token.
        if let plist = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: plist) {
            FirebaseApp.configure(options: options)
            capSet(true, forKey: "firebaseConfigured")
            capSet(options.gcmSenderID, forKey: "firebaseSenderId")
        } else {
            FirebaseApp.configure()
            capSet(false, forKey: "firebaseConfigured")
        }
        Messaging.messaging().delegate = self

        // Take explicit ownership of UNUserNotificationCenter delegate.
        // Capacitor's NotificationRouter normally sets itself as the delegate
        // when the bridge inits in CAPBridgeViewController.viewDidLoad, but
        // (a) at cold-launch via push tap iOS calls the delegate before the
        // bridge inits, and (b) something else (Firebase Messaging on iOS
        // 17/18+, or another lifecycle path) appears to displace it later.
        // Owning the delegate here and forwarding to Capacitor's router
        // guarantees pushNotificationActionPerformed always reaches JS.
        // Diagnostic: persisted tap-log on /admin/push-debug was empty across
        // 1.8.7(10)+(11) - plugin never received the tap callback.
        UNUserNotificationCenter.current().delegate = self
        capSet(true, forKey: "didSetUNCenterDelegate")

        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Re-claim UNUserNotificationCenter delegate every foreground transition.
        // Capacitor's NotificationRouter sets itself as delegate during bridge
        // viewDidLoad, overriding our didFinishLaunching set. Foreground transitions
        // are the right moment to re-claim - by the time iOS delivers a tap response
        // (which happens after foreground), we're guaranteed to be the delegate.
        UNUserNotificationCenter.current().delegate = self
        // Diagnostic: capture what we just overrode (logged BEFORE the re-claim by
        // peeking at the existing delegate's class name in the next line is moot
        // because we just overwrote it; instead, log AFTER for confirmation).
        if let d = UNUserNotificationCenter.current().delegate {
            capSet(String(describing: type(of: d)), forKey: "unCenterDelegateClass")
        } else {
            capSet("nil", forKey: "unCenterDelegateClass")
        }

        // Tint every layer behind the WebView so the home-indicator zone matches the app
        guard let w = window else { return }
        w.backgroundColor = surface
        if let root = w.rootViewController {
            root.view.backgroundColor = surface
            for sub in root.view.subviews {
                if String(describing: type(of: sub)).contains("WKWebView") {
                    sub.backgroundColor = surface
                    if let scroll = sub.subviews.first(where: { $0 is UIScrollView }) as? UIScrollView {
                        scroll.backgroundColor = surface
                    }
                }
            }
        }
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Push Notifications (APNs + FCM bridge)

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Persist diagnostic state under the CapacitorStorage prefix so the
        // push-debug page (which reads via Capacitor Preferences) can see it.
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        capSet(hex, forKey: "apnsTokenHex")
        capSet(true, forKey: "didRegisterCalled")
        capSet(ISO8601DateFormatter().string(from: Date()), forKey: "apnsTokenAt")

        // Forward to Firebase so it mints a corresponding FCM token.
        Messaging.messaging().apnsToken = deviceToken

        // CRITICAL: post the Capacitor-specific notification name. The
        // @capacitor/push-notifications plugin observes
        // Notification.Name.capacitorDidRegisterForRemoteNotifications and
        // notifies the JS 'registration' listener with the APNs hex token.
        // Posting any other name (e.g. "didRegisterForRemoteNotificationsWithDeviceToken")
        // means the plugin never sees the token and JS never stores it.
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        let ns = error as NSError
        let msg = "\(ns.domain) code=\(ns.code) - \(ns.localizedDescription)"
        capSet(msg, forKey: "apnsError")
        capSet(true, forKey: "didFailCalled")
        capSet(ISO8601DateFormatter().string(from: Date()), forKey: "apnsErrorAt")

        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }

    // MARK: - UNUserNotificationCenterDelegate
    //
    // We own the delegate so taps always reach Capacitor's NotificationRouter
    // regardless of who else (Firebase Messaging, plugin lifecycle) tries to
    // claim it. The router fans out to the @capacitor/push-notifications
    // plugin's PushNotificationsHandler.didReceive(response:) which fires the
    // 'pushNotificationActionPerformed' JS event - that's what use-push.ts
    // listens on for deep-link routing.

    private func capacitorNotificationRouter() -> NotificationRouter? {
        guard let vc = window?.rootViewController as? CAPBridgeViewController else { return nil }
        return vc.bridge?.notificationRouter
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if let router = capacitorNotificationRouter() {
            router.userNotificationCenter(center, willPresent: notification, withCompletionHandler: completionHandler)
        } else {
            // Bridge not ready (extremely early). Present with default options.
            completionHandler([.banner, .sound, .badge])
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        // Diagnostic: record that iOS delivered a tap response to AppDelegate.
        capSet(ISO8601DateFormatter().string(from: Date()), forKey: "lastTapResponseAt")
        capSet(response.notification.request.content.userInfo.description, forKey: "lastTapUserInfo")

        // Native-direct routing: parse the deep-link route from userInfo and write
        // to Preferences as 'pendingPushRoute'. JS reads this on mount/resume and
        // navigates - bypasses the Capacitor pushNotificationActionPerformed path
        // which has proven unreliable on this iOS/plugin version (1.8.7(7-12)
        // diagnostic: pushTapLog stays empty across foreground + background +
        // killed taps despite presentationOptions working and pushNotificationReceived
        // firing). The bypass owns the entire tap-to-navigate path.
        let userInfo = response.notification.request.content.userInfo
        if let route = userInfo["route"] as? String, route.hasPrefix("/"), !route.contains("://"), route.count < 512 {
            capSet(route, forKey: "pendingPushRoute")
            capSet(ISO8601DateFormatter().string(from: Date()), forKey: "pendingPushRouteAt")
        }

        // Also forward to Capacitor router for any other listeners (idempotent).
        if let router = capacitorNotificationRouter() {
            router.userNotificationCenter(center, didReceive: response, withCompletionHandler: completionHandler)
        } else {
            capSet("bridge-not-ready", forKey: "lastTapBridgeStatus")
            completionHandler()
        }
    }

    // MARK: - FirebaseMessagingDelegate

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        // Write under the CapacitorStorage prefix so use-push.ts can read it
        // via Preferences.get({ key: 'fcmToken' }).
        capSet(token, forKey: "fcmToken")
        NotificationCenter.default.post(
            name: Notification.Name(rawValue: "EcodiaFCMTokenReceived"),
            object: token
        )
    }
}

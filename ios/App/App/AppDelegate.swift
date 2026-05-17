import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {

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
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
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

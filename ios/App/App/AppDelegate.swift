import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {

    var window: UIWindow?

    // #f8f9f5 - matches --color-surface-1
    private let surface = UIColor(red: 248.0/255.0, green: 249.0/255.0, blue: 245.0/255.0, alpha: 1.0)

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Clear stale debug fields from previous launch so the debug page reflects this run only.
        UserDefaults.standard.removeObject(forKey: "apnsTokenHex")
        UserDefaults.standard.removeObject(forKey: "apnsError")
        UserDefaults.standard.set(false, forKey: "didRegisterCalled")
        UserDefaults.standard.set(false, forKey: "didFailCalled")

        // Firebase init. We explicitly DISABLE Firebase method swizzling on the APNs
        // delegate callbacks because @capacitor/push-notifications also swizzles them,
        // and when both run, one silently wins and the other never sees the token -
        // producing the exact "register() returns, no registration event fires"
        // symptom. By disabling swizzling here, we take manual control: the OS calls
        // our didRegisterForRemoteNotificationsWithDeviceToken below, we hand the
        // token to Firebase ourselves, and the Capacitor plugin's native delegate also
        // sees the call (because Capacitor's plugin chain is set up via the
        // ApplicationDelegateProxy, not method swizzling).
        if let plist = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: plist) {
            FirebaseApp.configure(options: options)
            UserDefaults.standard.set(true, forKey: "firebaseConfigured")
            UserDefaults.standard.set(options.gcmSenderID, forKey: "firebaseSenderId")
        } else {
            FirebaseApp.configure()
            UserDefaults.standard.set(false, forKey: "firebaseConfigured")
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
            // WKWebView is the first subview of the bridge VC's view
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

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Push Notifications (APNs + FCM bridge)

    // iOS gives us the APNs device token after registerForRemoteNotifications succeeds.
    // We forward it to FCM (so Firebase can mint a corresponding FCM token) AND post to
    // NotificationCenter so the @capacitor/push-notifications plugin's native delegate
    // picks it up and fires the 'registration' JS event with the APNs token. The FE
    // immediately stores that APNs token, then polls Preferences['fcmToken'] (set below)
    // to upsert the FCM token a few seconds later when Firebase mints it.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Persist the raw APNs token hex to UserDefaults so the debug page can read
        // it via Preferences regardless of whether the Capacitor plugin fires its
        // JS event. This is the source of truth that iOS gave us a token.
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(hex, forKey: "apnsTokenHex")
        UserDefaults.standard.set(true, forKey: "didRegisterCalled")
        UserDefaults.standard.set(ISO8601DateFormatter().string(from: Date()), forKey: "apnsTokenAt")

        Messaging.messaging().apnsToken = deviceToken
        NotificationCenter.default.post(
            name: Notification.Name(rawValue: "didRegisterForRemoteNotificationsWithDeviceToken"),
            object: deviceToken
        )
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Persist the full error so the debug page can show iOS's reason for failing
        // (e.g. "no valid 'aps-environment' entitlement string", network error, etc).
        let ns = error as NSError
        let msg = "\(ns.domain) code=\(ns.code) — \(ns.localizedDescription)"
        UserDefaults.standard.set(msg, forKey: "apnsError")
        UserDefaults.standard.set(true, forKey: "didFailCalled")
        UserDefaults.standard.set(ISO8601DateFormatter().string(from: Date()), forKey: "apnsErrorAt")

        NotificationCenter.default.post(
            name: Notification.Name(rawValue: "didFailToRegisterForRemoteNotificationsWithError"),
            object: error
        )
    }

    // MARK: - FirebaseMessagingDelegate

    // Called by Firebase whenever a fresh FCM registration token is available - on first
    // launch after apnsToken is set, after token refresh (Apple rotates these periodically),
    // and on app reinstall. We persist to UserDefaults.standard with key 'fcmToken' which is
    // the same backing store @capacitor/preferences v8 reads from by default. The FE polls
    // Preferences after 'registration' fires and upserts this FCM token to push_tokens.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        UserDefaults.standard.set(token, forKey: "fcmToken")
        NotificationCenter.default.post(
            name: Notification.Name(rawValue: "EcodiaFCMTokenReceived"),
            object: token
        )
    }
}

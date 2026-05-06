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
        // Initialise Firebase iOS SDK so FCM can mint registration tokens for this device.
        // Pipeline: APNs hands iOS a device token (didRegisterForRemoteNotifications below)
        // -> we forward via Messaging.messaging().apnsToken
        // -> FCM mints an FCM registration token
        // -> MessagingDelegate.didReceiveRegistrationToken (below) persists it to UserDefaults
        // -> the FE reads it via @capacitor/preferences and stores to push_tokens table
        // -> the send-push edge function (FCM HTTP v1) uses that FCM token in messages:send.
        FirebaseApp.configure()
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
        Messaging.messaging().apnsToken = deviceToken
        NotificationCenter.default.post(
            name: Notification.Name(rawValue: "didRegisterForRemoteNotificationsWithDeviceToken"),
            object: deviceToken
        )
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
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

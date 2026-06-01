package org.coexistaus.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Canonical Android 12+ splash flow (per the androidx.core.splashscreen
        // migration guide). Three steps in strict order:
        //
        //  1. SplashScreen.installSplashScreen(this) - installs the system
        //     splash using the activity's CURRENT theme (the launch theme,
        //     Theme.SplashScreen-based). This returns a handle we could use
        //     to keep the splash visible during async warm-up; we don't,
        //     because Capacitor handles its own splash after WebView is ready.
        //
        //  2. setTheme(R.style.AppTheme_NoActionBar) - swap to a proper
        //     AppCompat NoActionBar theme BEFORE super.onCreate(). This is
        //     the fix for the persistent black "Co-Exist" ActionBar that
        //     leaked through on Samsung One UI devices despite
        //     windowActionBar=false in the launch theme. Root cause: the
        //     launch theme parents Theme.SplashScreen (a non-AppCompat
        //     framework theme), and Samsung's AppCompat delegate read the
        //     wrong attrs during BridgeActivity.super.onCreate() decor
        //     inflation, installing a DarkActionBar anyway. Swapping to a
        //     real AppCompat NoActionBar parent here means the delegate
        //     never has a chance to install one.
        //
        //  3. EdgeToEdge.enable(this) + super.onCreate() - rest of the
        //     normal Capacitor boot.
        //
        // Origin: Tate verbatim 2026-06-01 ("stupid black banner at the top
        // of android screens saying coexist needs to GO"), Samsung leaders
        // hit it on log-impact / check-in. Prior fix attempt 2026-05-28 set
        // windowActionBar=false on the launch theme; insufficient on Samsung.
        SplashScreen.installSplashScreen(this);
        setTheme(R.style.AppTheme_NoActionBar);
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);

        // Defensive belt-and-braces: if ANY OEM skin still slipped an
        // ActionBar through, hide it. Cheap, idempotent.
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
    }
}

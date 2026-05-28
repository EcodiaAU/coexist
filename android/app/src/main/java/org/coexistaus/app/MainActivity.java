package org.coexistaus.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Enable edge-to-edge BEFORE super.onCreate so the WebView is laid out
        // behind the status + navigation bars (transparent system bars).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);

        // Defensive: AppCompat reads windowActionBar (no android: prefix) to
        // decide whether to install an ActionBar during super.onCreate, which
        // runs while the launch theme (Theme.SplashScreen) is still active.
        // The launch theme now sets windowActionBar=false, but hide any
        // ActionBar that may have slipped through during decor inflation
        // (some AppCompat versions on some OEM skins still install one).
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }

        // Deprecated setStatusBarColor / setNavigationBarColor were called
        // here historically; they are no-ops when targeting SDK 35+ and
        // Play Console flagged them as deprecated API usage. Removed - the
        // theme's android:statusBarColor=@android:color/transparent +
        // EdgeToEdge.enable(this) above already give us transparent bars.
    }
}

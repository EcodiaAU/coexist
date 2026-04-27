package org.coexistaus.app;

import android.graphics.Color;
import android.os.Build;
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

        // Android 15+ (API 35) adds a translucent scrim behind the status and
        // navigation bars by default. That scrim is what shows up as a strip
        // in the camera-notch area and breaks our full-bleed look. Disable it
        // so the bars render fully transparent over the WebView.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= 29) {
            // API 29+: opt out of the OS contrast scrim on the nav bar.
            getWindow().setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= 35) {
            // API 35+: opt out of the OS contrast scrim on the status bar too.
            getWindow().setStatusBarContrastEnforced(false);
        }
    }
}

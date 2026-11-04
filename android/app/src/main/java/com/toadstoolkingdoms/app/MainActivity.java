package com.toadstoolkingdoms.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Google Play Billing (roadmap step 36); the game uses it only in builds made with VITE_PLAY_BILLING=1.
        registerPlugin(TkBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package com.toadstoolkingdoms.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Google Play Billing (roadmap step 36); the game uses it only in builds made with VITE_PLAY_BILLING=1.
        registerPlugin(TkBillingPlugin.class);
        // Sign in with Google for account recovery (Credential Manager; same "TkAuth" name as the iPhone plugin).
        registerPlugin(TkAuthPlugin.class);
        // The store's age signal (Play Age Signals API), used to set the age band before online play (re-audit).
        registerPlugin(TkAgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

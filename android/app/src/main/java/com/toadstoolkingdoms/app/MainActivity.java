package com.toadstoolkingdoms.app;

import android.content.ComponentCallbacks2;
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

    /**
     * Low memory (device F19): tell the game, which drops painted art no scene shows
     * (window event "tkmemorywarning", main.ts). Without it the renderer process is killed instead.
     */
    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        boolean low = level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW
            || level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL
            || level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND;
        if (low && getBridge() != null) getBridge().triggerWindowJSEvent("tkmemorywarning");
    }
}

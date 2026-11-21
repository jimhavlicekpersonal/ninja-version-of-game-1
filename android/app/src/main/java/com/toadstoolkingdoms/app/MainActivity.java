package com.toadstoolkingdoms.app;

import android.content.ComponentCallbacks2;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Google Play Billing (roadmap step 36); the game uses it only in builds made with VITE_PLAY_BILLING=1.
        registerPlugin(TkBillingPlugin.class);
        // Sign in with Google for account recovery (Credential Manager; same "TkAuth" name as the iPhone plugin).
        registerPlugin(TkAuthPlugin.class);
        // The store's age signal (Play Age Signals API), used to set the age band before online play (re-audit).
        registerPlugin(TkAgePlugin.class);
        // Beast Mode OPS-03: native notes for the game (the last WebView renderer exit).
        registerPlugin(TkNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Beast Mode OPS-03 / STB-04: when Android kills or crashes the WebView renderer (an out-of-memory kill on a
        // 2 GB phone is the likely case), Capacitor returns false and the whole app dies (a crash in Play vitals).
        // Record it for the game's next start and rebuild the activity instead: the village loads again.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                SharedPreferences prefs = getSharedPreferences(TkNativePlugin.PREFS, Context.MODE_PRIVATE);
                prefs.edit()
                    .putLong("rendererGoneAt", System.currentTimeMillis())
                    .putBoolean("rendererDidCrash", detail.didCrash())
                    .putInt("rendererPriority", detail.rendererPriorityAtExit())
                    .putInt("rendererGoneCount", prefs.getInt("rendererGoneCount", 0) + 1)
                    .commit();
                recreate();
                return true;
            }
        });
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

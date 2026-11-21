package com.toadstoolkingdoms.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Beast Mode 2026-11-21 OPS-03 / STB-04: what the native side noticed while the game could not report it. Today the
 * last WebView renderer exit, written by MainActivity when Android killed or crashed the renderer and the activity
 * was rebuilt. The game reads it once at start (and it is cleared) and reports it when crash reports are allowed.
 */
@CapacitorPlugin(name = "TkNative")
public class TkNativePlugin extends Plugin {
    static final String PREFS = "tk_native";

    @PluginMethod
    public void lastRendererExit(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject out = new JSObject();
        long at = prefs.getLong("rendererGoneAt", 0);
        if (at > 0) {
            out.put("at", at);
            out.put("didCrash", prefs.getBoolean("rendererDidCrash", false));
            out.put("priority", prefs.getInt("rendererPriority", -1));
            out.put("count", prefs.getInt("rendererGoneCount", 1));
            prefs.edit().remove("rendererGoneAt").remove("rendererDidCrash").remove("rendererPriority").remove("rendererGoneCount").apply();
        }
        call.resolve(out);
    }
}

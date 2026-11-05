package com.toadstoolkingdoms.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.agesignals.AgeSignalsException;
import com.google.android.play.agesignals.AgeSignalsManager;
import com.google.android.play.agesignals.AgeSignalsManagerFactory;
import com.google.android.play.agesignals.AgeSignalsRequest;
import com.google.android.play.agesignals.AgeSignalsResult;

/**
 * The store's age signal (re-audit; Texas SB 2420 and similar laws), exposed
 * as "TkAge" like the iPhone plugin (TkAgePlugin.swift). Android: the Play Age
 * Signals API (com.google.android.play:age-signals 0.0.4, beta), which only
 * answers for users in regions where Play must share an age range, and only
 * for apps installed from Google Play.
 *
 * Answers { status: "range", lower, upper } (an inclusive range; upper absent
 * for 18 and over) or { status: "unavailable", reason }. The game turns a
 * range into its age band (sim/age.ts bandFromAgeRange: the youngest age in
 * the range decides) and only ever makes the band stricter; without a signal it
 * shows its own age screen. Never throws to the game: every failure is
 * "unavailable".
 *
 * Unverified here: no Android SDK in the authoring container. The calls were
 * compiled with javac against the real 0.0.4 classes (Capacitor and Play
 * services types stubbed); behaviour on a Play-installed build is untested.
 */
@CapacitorPlugin(name = "TkAge")
public class TkAgePlugin extends Plugin {
    @PluginMethod
    public void ageRange(PluginCall call) {
        AgeSignalsManager manager;
        try {
            manager = AgeSignalsManagerFactory.create(getContext().getApplicationContext());
        } catch (RuntimeException e) {
            unavailable(call, "no_api");
            return;
        }
        manager
            .checkAgeSignals(AgeSignalsRequest.builder().build())
            .addOnSuccessListener(result -> answer(call, result))
            .addOnFailureListener(e -> unavailable(call, e instanceof AgeSignalsException ? "error_" + ((AgeSignalsException) e).getErrorCode() : "failed"));
    }

    private void answer(PluginCall call, AgeSignalsResult result) {
        Integer lower = result == null ? null : result.ageLower();
        Integer upper = result == null ? null : result.ageUpper();
        // No range: not a region where Play shares ages, the age is unknown, or the user does not share it.
        if (lower == null && upper == null) {
            unavailable(call, "no_signal");
            return;
        }
        JSObject out = new JSObject();
        out.put("status", "range");
        out.put("lower", lower == null ? 0 : lower.intValue());
        if (upper != null) out.put("upper", upper.intValue());
        out.put("source", "play");
        call.resolve(out);
    }

    private void unavailable(PluginCall call, String reason) {
        JSObject out = new JSObject();
        out.put("status", "unavailable");
        out.put("reason", reason);
        call.resolve(out);
    }
}

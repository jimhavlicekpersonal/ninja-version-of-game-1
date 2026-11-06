package com.toadstoolkingdoms.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.app.Activity;
import com.google.android.play.agesignals.AgeSignalsAccessRequest;
import com.google.android.play.agesignals.AgeSignalsAccessResult;
import com.google.android.play.agesignals.AgeSignalsException;
import com.google.android.play.agesignals.AgeSignalsManager;
import com.google.android.play.agesignals.AgeSignalsManagerFactory;
import com.google.android.play.agesignals.AgeSignalsRequest;
import com.google.android.play.agesignals.AgeSignalsResult;
import com.google.android.play.agesignals.model.AgeSignalsStatus;
import com.google.android.play.agesignals.model.SignificantChangeStatus;

/**
 * The store's age signal (re-audit; Texas SB 2420 and similar laws), exposed
 * as "TkAge" like the iPhone plugin (TkAgePlugin.swift). Android: the Play Age
 * Signals API (com.google.android.play:age-signals 0.0.4, beta), which only
 * answers for users in regions where Play must share an age range, and only
 * for apps installed from Google Play.
 *
 * Report section 5 step 7 (compliance C01): 0.0.4 is two steps. First
 * `requestAgeSignalsAccess` with the activity, which lets Play show its sharing
 * prompt where the user chose "ask before sharing" and answers SHARED,
 * NOT_SHARED or VERIFICATION_REQUIRED (a US state where store verification is
 * the law and this user has not verified: they must do it in the Play Store
 * app). Only after SHARED does `checkAgeSignals` give a range. The plugin used
 * to skip the first step, so most regions never answered.
 *
 * Answers { status: "range", lower, upper } (an inclusive range; upper absent
 * for 18 and over; with `significantChange`: "approved" | "pending" |
 * "declined" for a supervised user's parent approval of the latest significant
 * update, and `installId`), { status: "verification_required" } or
 * { status: "unavailable", reason }. The game turns a
 * range into its age band (sim/age.ts bandFromAgeRange: the youngest age in
 * the range decides) and only ever makes the band stricter; without a signal it
 * shows its own age screen. Never throws to the game: every failure is
 * "unavailable".
 *
 * Unverified here: no Android SDK in the authoring container. The 0.0.4 class
 * and method names were read from the published AAR with javap; behaviour on a
 * Play-installed build is untested, and Play Console must grant the app API
 * access first (owner).
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
        Activity activity = getActivity();
        if (activity == null) {
            check(call, manager);
            return;
        }
        manager
            .requestAgeSignalsAccess(AgeSignalsAccessRequest.builder().setActivity(activity).build())
            .addOnSuccessListener(access -> afterAccess(call, manager, access))
            .addOnFailureListener(e -> unavailable(call, failure(e)));
    }

    private void afterAccess(PluginCall call, AgeSignalsManager manager, AgeSignalsAccessResult access) {
        Integer status = access == null ? null : access.ageSignalsStatus();
        if (status != null && status == AgeSignalsStatus.VERIFICATION_REQUIRED) {
            JSObject out = new JSObject();
            out.put("status", "verification_required");
            out.put("source", "play");
            call.resolve(out);
            return;
        }
        if (status == null || status != AgeSignalsStatus.SHARED) {
            unavailable(call, status != null && status == AgeSignalsStatus.NOT_SHARED ? "not_shared" : "no_access");
            return;
        }
        check(call, manager);
    }

    private void check(PluginCall call, AgeSignalsManager manager) {
        manager
            .checkAgeSignals(AgeSignalsRequest.builder().build())
            .addOnSuccessListener(result -> answer(call, result))
            .addOnFailureListener(e -> unavailable(call, failure(e)));
    }

    private static String failure(Exception e) {
        return e instanceof AgeSignalsException ? "error_" + ((AgeSignalsException) e).getErrorCode() : "failed";
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
        Integer change = result.significantChangeStatus();
        if (change != null) {
            if (change == SignificantChangeStatus.APPROVED) out.put("significantChange", "approved");
            else if (change == SignificantChangeStatus.PENDING) out.put("significantChange", "pending");
            else if (change == SignificantChangeStatus.DECLINED) out.put("significantChange", "declined");
        }
        if (result.installId() != null) out.put("installId", result.installId());
        call.resolve(out);
    }

    private void unavailable(PluginCall call, String reason) {
        JSObject out = new JSObject();
        out.put("status", "unavailable");
        out.put("reason", reason);
        call.resolve(out);
    }
}

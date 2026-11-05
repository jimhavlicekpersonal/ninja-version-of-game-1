package com.toadstoolkingdoms.app;

import android.app.Activity;
import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * Sign-ins the game can link to its online account (roadmap step 24, audit
 * GLOBAL-008), exposed as "TkAuth" like the iPhone plugin (TkAuthPlugin.swift).
 * The server checks what comes back.
 *
 * Android: Sign in with Google through Credential Manager
 * (androidx.credentials + com.google.android.libraries.identity.googleid).
 * The game passes the server (web) OAuth client id it was built with
 * (VITE_GOOGLE_CLIENT_ID); Google issues an ID token whose audience is that
 * id, which the server accepts when GOOGLE_CLIENT_IDS lists it. Google only
 * answers for an app whose package name and signing-certificate SHA-1 are
 * registered as an Android OAuth client in the same Google Cloud project
 * (owner step, docs/SHIPPING.md). Play Games is not offered: the Play Games
 * SDK is not in this app.
 */
@CapacitorPlugin(name = "TkAuth")
public class TkAuthPlugin extends Plugin {
    @PluginMethod
    public void signIn(PluginCall call) {
        String provider = call.getString("provider");
        if (!"google".equals(provider)) {
            call.reject("This sign-in is not available on Android.", "unavailable");
            return;
        }
        String serverClientId = call.getString("serverClientId");
        if (serverClientId == null || serverClientId.isEmpty()) {
            call.reject("Google sign-in is not set up in this build.", "unavailable");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Google sign-in needs the game in the foreground.", "failed");
            return;
        }
        // The button flow: always shows Google's account chooser, also for accounts
        // that never signed in to this app (needed to recover on a new device).
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(serverClientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager manager = CredentialManager.create(activity);
        manager.getCredentialAsync(
            activity,
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(activity),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    String type = credential.getType();
                    boolean google = credential instanceof CustomCredential
                        && (GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(type)
                            || GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_SIWG_CREDENTIAL.equals(type));
                    if (!google) {
                        call.reject("Google sign-in gave an unexpected answer.", "failed");
                        return;
                    }
                    try {
                        GoogleIdTokenCredential id = GoogleIdTokenCredential.createFrom(credential.getData());
                        JSObject out = new JSObject();
                        // Only the token goes to the server; it keeps Google's stable account id (sub), nothing else.
                        out.put("idToken", id.getIdToken());
                        call.resolve(out);
                    } catch (Exception e) {
                        call.reject("Google sign-in gave no token.", "failed");
                    }
                }

                @Override
                public void onError(GetCredentialException e) {
                    if (e instanceof GetCredentialCancellationException) {
                        call.reject("Google sign-in was cancelled.", "cancelled");
                    } else if (e instanceof NoCredentialException) {
                        call.reject("No Google account is available on this phone. Add one in the Settings app and try again.", "unavailable");
                    } else {
                        CharSequence m = e.getErrorMessage();
                        call.reject("Google sign-in did not work" + (m != null ? ": " + m : "."), "failed");
                    }
                }
            });
    }
}

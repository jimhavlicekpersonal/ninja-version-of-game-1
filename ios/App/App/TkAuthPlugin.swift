import Foundation
import Capacitor
import AuthenticationServices
import GameKit

/// Sign-ins the game can link to its online account (roadmap step 24),
/// exposed as the "TkAuth" Capacitor plugin. The server checks what comes
/// back: an Apple ID token, or Game Center's identity-verification signature.
@objc(TkAuthPlugin)
public class TkAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "TkAuthPlugin"
    public let jsName = "TkAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gameCenterFriends", returnType: CAPPluginReturnPromise),
    ]

    private var pending: CAPPluginCall?

    @objc func signIn(_ call: CAPPluginCall) {
        switch call.getString("provider") {
        case "apple":
            pending = call
            DispatchQueue.main.async {
                let request = ASAuthorizationAppleIDProvider().createRequest()
                request.requestedScopes = []
                let controller = ASAuthorizationController(authorizationRequests: [request])
                controller.delegate = self
                controller.presentationContextProvider = self
                controller.performRequests()
            }
        case "gamecenter":
            gameCenter(call)
        default:
            call.reject("Unknown sign-in provider.", "unavailable")
        }
    }

    // MARK: Sign in with Apple

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pending else { return }
        pending = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else {
            call.reject("Sign in with Apple gave no token.", "failed")
            return
        }
        // The one-time authorization code lets the server get a refresh token it can revoke when the
        // account is deleted or Apple is unlinked (App Review 5.1.1(v); server/identity/appleTokens.ts).
        var out: [String: Any] = ["idToken": token]
        if let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) {
            out["authorizationCode"] = code
        }
        call.resolve(out)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pending else { return }
        pending = nil
        call.reject("Sign in with Apple was cancelled.", "cancelled")
    }

    // MARK: Game Center friends (roadmap step 61)

    /// The player's Game Center friends (teamPlayerIDs), so the game can show
    /// which of them play Kagemura. iOS asks the player the first time
    /// (NSGKFriendListUsageDescription in Info.plist); the ids are sent to the
    /// game's server once and not stored there.
    @objc func gameCenterFriends(_ call: CAPPluginCall) {
        let local = GKLocalPlayer.local
        guard local.isAuthenticated else {
            call.reject("Sign in to Game Center first (Settings → Online play → Sign-ins).", "not_signed_in")
            return
        }
        local.loadFriendsAuthorizationStatus { status, _ in
            if status == .denied || status == .restricted {
                call.reject("Kagemura may not see your Game Center friends. You can allow it in the Settings app (Game Center → Friends List).", "denied")
                return
            }
            local.loadFriends { friends, error in
                if let error = error {
                    call.reject("Game Center did not share your friends: \(error.localizedDescription)", "failed")
                    return
                }
                call.resolve(["ids": (friends ?? []).map { $0.teamPlayerID }])
            }
        }
    }

    // MARK: Game Center

    private func gameCenter(_ call: CAPPluginCall) {
        let player = GKLocalPlayer.local
        DispatchQueue.main.async {
            player.authenticateHandler = { viewController, error in
                if let vc = viewController {
                    self.bridge?.viewController?.present(vc, animated: true)
                    return
                }
                guard player.isAuthenticated else {
                    call.reject("Game Center sign-in did not finish: \(error?.localizedDescription ?? "cancelled")", "cancelled")
                    return
                }
                player.fetchItems(forIdentityVerificationSignature: { url, signature, salt, timestamp, error in
                    guard let url = url, let signature = signature, let salt = salt, error == nil else {
                        call.reject("Game Center could not confirm who you are.", "failed")
                        return
                    }
                    call.resolve([
                        "teamPlayerId": player.teamPlayerID,
                        "bundleId": Bundle.main.bundleIdentifier ?? "",
                        "timestamp": timestamp,
                        "salt": salt.base64EncodedString(),
                        "signature": signature.base64EncodedString(),
                        "publicKeyUrl": url.absoluteString,
                    ])
                })
            }
        }
    }
}

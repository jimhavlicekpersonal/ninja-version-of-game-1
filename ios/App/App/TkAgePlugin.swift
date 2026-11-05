import Foundation
import Capacitor
#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

/// The store's age signal (re-audit; laws such as Texas SB 2420), exposed as the
/// "TkAge" Capacitor plugin like the Android one (TkAgePlugin.java). On iOS 26+
/// it asks Apple's Declared Age Range service for an age range with the game's
/// gates 13, 16 and 18. The person may decline (outside regions where sharing is
/// required); then, and on older iOS, the game shows its own neutral age screen.
///
/// Answers ["status": "range", "lower": n, "upper": m?] (no lower bound from
/// Apple means under 13, sent as 0; no upper means 18 or over) or
/// ["status": "unavailable", "reason": ...]. Never rejects: every failure is
/// "unavailable". The game only ever makes its age band stricter.
///
/// Needs the com.apple.developer.declared-age-range entitlement (App.entitlements)
/// and the Declared Age Range capability on the App ID; Xcode 26 / iOS 26 SDK to
/// compile the call (older SDKs skip it at compile time). Unverified here: no
/// Xcode in the authoring container.
@objc(TkAgePlugin)
public class TkAgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TkAgePlugin"
    public let jsName = "TkAge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ageRange", returnType: CAPPluginReturnPromise),
    ]

    @objc func ageRange(_ call: CAPPluginCall) {
        #if canImport(DeclaredAgeRange)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                guard let vc = self.bridge?.viewController else {
                    self.unavailable(call, "no_view")
                    return
                }
                do {
                    let response = try await AgeRangeService.shared.requestAgeRange(ageGates: 13, 16, 18, in: vc)
                    switch response {
                    case .sharing(let range):
                        var out: [String: Any] = ["status": "range", "lower": range.lowerBound ?? 0, "source": "apple"]
                        if let upper = range.upperBound { out["upper"] = upper }
                        call.resolve(out)
                    case .declinedSharing:
                        self.unavailable(call, "declined")
                    @unknown default:
                        self.unavailable(call, "unknown")
                    }
                } catch {
                    self.unavailable(call, "error")
                }
            }
            return
        }
        #endif
        unavailable(call, "os")
    }

    private func unavailable(_ call: CAPPluginCall, _ reason: String) {
        call.resolve(["status": "unavailable", "reason": reason])
    }
}

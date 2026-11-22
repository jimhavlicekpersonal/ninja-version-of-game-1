import Foundation
import Capacitor
import WebKit

/// Beast Mode OPS-03 (iOS half): what the native side noticed while the game could not report it, the same
/// "TkNative" plugin as Android's TkNativePlugin.java. Today the last WebKit web content process exit: WebKit
/// killed or lost the page's process (memory pressure, a crash) and Capacitor reloaded it. Recorded by
/// TkContentProcessWatch (installed by TkViewController); the game reads it once at start, it is cleared, and
/// it is reported only when crash reports are allowed (src/backend/platform/native.ts lastRendererExit).
/// iOS gives no reason or priority: didCrash is false and priority -1.
/// Unverified here: no Xcode in the authoring container.
@objc(TkNativePlugin)
public class TkNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TkNativePlugin"
    public let jsName = "TkNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "lastRendererExit", returnType: CAPPluginReturnPromise),
    ]

    static let atKey = "tk_native.rendererGoneAt"
    static let countKey = "tk_native.rendererGoneCount"

    static func noteContentProcessExit() {
        let d = UserDefaults.standard
        d.set(Date().timeIntervalSince1970 * 1000, forKey: atKey)
        d.set(d.integer(forKey: countKey) + 1, forKey: countKey)
    }

    @objc func lastRendererExit(_ call: CAPPluginCall) {
        let d = UserDefaults.standard
        let at = d.double(forKey: TkNativePlugin.atKey)
        guard at > 0 else {
            call.resolve([:])
            return
        }
        let count = max(1, d.integer(forKey: TkNativePlugin.countKey))
        d.removeObject(forKey: TkNativePlugin.atKey)
        d.removeObject(forKey: TkNativePlugin.countKey)
        call.resolve(["at": at, "didCrash": false, "priority": -1, "count": count])
    }
}

/// Sits in front of Capacitor's navigation delegate: records a web content process exit, then hands every
/// call (that one included, so Capacitor still reloads the page) to the delegate it replaced.
final class TkContentProcessWatch: NSObject, WKNavigationDelegate {
    private weak var inner: WKNavigationDelegate?

    init(inner: WKNavigationDelegate?) {
        self.inner = inner
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        TkNativePlugin.noteContentProcessExit()
        inner?.webViewWebContentProcessDidTerminate?(webView)
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (inner?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let inner = inner, inner.responds(to: aSelector) { return inner }
        return super.forwardingTarget(for: aSelector)
    }
}

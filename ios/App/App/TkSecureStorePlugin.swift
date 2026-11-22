import Foundation
import Capacitor
import Security

/// Beast Mode SEC-11: the game's sign-in tokens, kept in the Keychain instead of WebView
/// localStorage (which iCloud and computer backups include). Items use
/// kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly, so a backup restored to another
/// iPhone carries no session. Exposed as the "TkSecureStore" Capacitor plugin
/// (src/backend/platform/secureTokens.ts): getAll, set, remove.
/// Unverified here: no Xcode in the authoring container.
@objc(TkSecureStorePlugin)
public class TkSecureStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TkSecureStorePlugin"
    public let jsName = "TkSecureStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private let service = "kagemura.tokens"

    @objc func getAll(_ call: CAPPluginCall) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecMatchLimit as String: kSecMatchLimitAll,
            kSecReturnAttributes as String: true,
            kSecReturnData as String: true,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        var items: [String: String] = [:]
        if status == errSecSuccess, let rows = result as? [[String: Any]] {
            for row in rows {
                if let key = row[kSecAttrAccount as String] as? String,
                   let data = row[kSecValueData as String] as? Data,
                   let value = String(data: data, encoding: .utf8) {
                    items[key] = value
                }
            }
        } else if status != errSecItemNotFound {
            call.reject("keychain_read", String(status))
            return
        }
        call.resolve(["items": items])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value"), let data = value.data(using: .utf8) else {
            call.reject("bad_args")
            return
        }
        let match: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(match as CFDictionary)
        var add = match
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecSuccess { call.resolve() } else { call.reject("keychain_write", String(status)) }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("bad_args")
            return
        }
        let match: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        let status = SecItemDelete(match as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound { call.resolve() } else { call.reject("keychain_delete", String(status)) }
    }
}

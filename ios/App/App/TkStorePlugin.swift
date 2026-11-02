import Foundation
import Capacitor
import StoreKit

/// In-app purchases with StoreKit 2, exposed to the game as the "TkStore"
/// Capacitor plugin. The game's StoreKitPaymentProvider calls it.
@objc(TkStorePlugin)
public class TkStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TkStorePlugin"
    public let jsName = "TkStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startListening", returnType: CAPPluginReturnPromise),
    ]

    private var updatesTask: Task<Void, Never>?

    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let products = try await Product.products(for: ids)
                let list: [[String: Any]] = products.map { p in
                    ["id": p.id, "displayName": p.displayName, "displayPrice": p.displayPrice, "price": NSDecimalNumber(decimal: p.price).doubleValue]
                }
                call.resolve(["products": list])
            } catch {
                call.reject("Could not load products: \(error.localizedDescription)", "unavailable")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("Missing productId", "failed")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("This item is not available in the App Store yet.", "unavailable")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve(["transactionId": String(transaction.id), "productId": transaction.productID])
                    case .unverified(_, let error):
                        call.reject("The purchase could not be verified: \(error.localizedDescription)", "failed")
                    }
                case .userCancelled:
                    call.reject("Purchase cancelled.", "cancelled")
                case .pending:
                    call.reject("The purchase is waiting for approval.", "pending")
                @unknown default:
                    call.reject("Unknown purchase result.", "failed")
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)", "failed")
            }
        }
    }

    /// Purchases that complete later (Ask to Buy, interrupted purchases) arrive here.
    @objc func startListening(_ call: CAPPluginCall) {
        if updatesTask == nil {
            updatesTask = Task.detached { [weak self] in
                for await update in Transaction.updates {
                    guard case .verified(let transaction) = update else { continue }
                    await transaction.finish()
                    self?.notifyListeners("transaction", data: ["transactionId": String(transaction.id), "productId": transaction.productID])
                }
            }
        }
        call.resolve()
    }

    deinit {
        updatesTask?.cancel()
    }
}

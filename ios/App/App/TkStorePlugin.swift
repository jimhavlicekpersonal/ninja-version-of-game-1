import Foundation
import Capacitor
import StoreKit

/// In-app purchases with StoreKit 2, exposed to the game as the "TkStore"
/// Capacitor plugin. The game's StoreKitPaymentProvider calls it.
///
/// A transaction is finished only when the game says so (`finish`), after the
/// server has checked its signed JWS and delivered it (roadmap step 35). Until
/// then StoreKit keeps it in `Transaction.unfinished`, so a purchase paid while
/// offline, or interrupted by a crash, is delivered on the next start.
@objc(TkStorePlugin)
public class TkStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TkStorePlugin"
    public let jsName = "TkStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinished", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startListening", returnType: CAPPluginReturnPromise),
    ]

    private var updatesTask: Task<Void, Never>?

    private func describe(_ transaction: Transaction, jws: String) -> [String: Any] {
        return ["transactionId": String(transaction.id), "productId": transaction.productID, "jws": jws]
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let products = try await Product.products(for: ids)
                let list: [[String: Any]] = products.map { p in
                    ["id": p.id, "displayName": p.displayName, "displayPrice": p.displayPrice, "price": NSDecimalNumber(decimal: p.price).doubleValue, "currency": p.priceFormatStyle.currencyCode]
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
        // The server's purchase intent: ties the transaction to this player (appAccountToken).
        let token = call.getString("appAccountToken").flatMap { UUID(uuidString: $0) }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("This item is not available in the App Store yet.", "unavailable")
                    return
                }
                var options: Set<Product.PurchaseOption> = []
                if let token = token { options.insert(.appAccountToken(token)) }
                let result = try await product.purchase(options: options)
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        // Not finished here: the game finishes it once it is delivered.
                        call.resolve(self.describe(transaction, jws: verification.jwsRepresentation))
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

    /// Finish a delivered transaction (StoreKit stops offering it again).
    @objc func finish(_ call: CAPPluginCall) {
        guard let id = call.getString("transactionId"), let wanted = UInt64(id) else {
            call.reject("Missing transactionId", "failed")
            return
        }
        Task {
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, transaction.id == wanted {
                    await transaction.finish()
                }
            }
            call.resolve()
        }
    }

    /// Paid but not yet delivered (an interrupted purchase, Ask to Buy approved while the game was closed).
    @objc func unfinished(_ call: CAPPluginCall) {
        Task {
            var list: [[String: Any]] = []
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, transaction.revocationDate == nil {
                    list.append(self.describe(transaction, jws: result.jwsRepresentation))
                }
            }
            call.resolve(["transactions": list])
        }
    }

    /// Purchases that complete later (Ask to Buy, interrupted purchases) arrive here.
    @objc func startListening(_ call: CAPPluginCall) {
        if updatesTask == nil {
            updatesTask = Task.detached { [weak self] in
                for await update in Transaction.updates {
                    guard case .verified(let transaction) = update else { continue }
                    if transaction.revocationDate != nil { continue }
                    self?.notifyListeners("transaction", data: self?.describe(transaction, jws: update.jwsRepresentation) ?? [:])
                }
            }
        }
        call.resolve()
    }

    deinit {
        updatesTask?.cancel()
    }
}

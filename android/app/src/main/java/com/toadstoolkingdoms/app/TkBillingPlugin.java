package com.toadstoolkingdoms.app;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.android.billingclient.api.UnfetchedProduct;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Google Play Billing (roadmap step 36), exposed to the game as "TkBilling".
 * The game's PlayBillingPaymentProvider calls it; the game turns it on only
 * in builds made with VITE_PLAY_BILLING=1.
 *
 * Play Billing Library 9 (com.android.billingclient:billing:9.1.0; the 7.x line
 * stopped being accepted by Play on 2026-08-31 / 2026-11-01, audit GLOBAL-001):
 * - pending purchases are enabled for one-time products (required since 8);
 * - the library reconnects to the Play service on its own
 *   (enableAutoServiceReconnection, 8+); the first connection is still started here;
 * - product queries answer a QueryProductDetailsResult (8+), whose unfetched
 *   products are reported back as unavailable;
 * - purchase history (queryPurchaseHistoryAsync) no longer exists: restoring
 *   uses queryPurchasesAsync, which lists every paid, unconsumed purchase.
 *
 * Every product is a one-time consumable. The server checks the purchase
 * token with the Play Developer API and consumes it once delivered; the game
 * calls `consume` only after delivery (GameController finish), and a game with
 * no server to ask relies on it. A purchase that is paid but not yet consumed is
 * listed by `unfinished`, so it is delivered on the next start or by
 * Store, Restore purchases.
 */
@CapacitorPlugin(name = "TkBilling")
public class TkBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private PluginCall pendingPurchase;
    /** Calls waiting for the first connection (startConnection must not run twice at once). */
    private final List<Runnable> waiting = new ArrayList<>();
    private final List<PluginCall> waitingCalls = new ArrayList<>();
    private boolean connecting = false;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
    }

    /** Run once the billing service is connected (or reject the call). */
    private void connected(PluginCall call, Runnable then) {
        if (client.isReady()) {
            then.run();
            return;
        }
        synchronized (waiting) {
            waiting.add(then);
            waitingCalls.add(call);
            if (connecting) return;
            connecting = true;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                List<Runnable> runs;
                List<PluginCall> calls;
                synchronized (waiting) {
                    connecting = false;
                    runs = new ArrayList<>(waiting);
                    calls = new ArrayList<>(waitingCalls);
                    waiting.clear();
                    waitingCalls.clear();
                }
                boolean ok = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
                for (int i = 0; i < runs.size(); i++) {
                    if (ok) runs.get(i).run();
                    else calls.get(i).reject("Google Play Billing is not available: " + result.getDebugMessage(), "unavailable");
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // enableAutoServiceReconnection: the library reconnects when it is next used.
                synchronized (waiting) {
                    connecting = false;
                }
            }
        });
    }

    private static JSObject describe(Purchase p) {
        JSObject o = new JSObject();
        o.put("purchaseToken", p.getPurchaseToken());
        o.put("productId", p.getProducts().isEmpty() ? "" : p.getProducts().get(0));
        o.put("orderId", p.getOrderId());
        return o;
    }

    private static List<QueryProductDetailsParams.Product> productList(List<String> ids) {
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        for (String id : ids) {
            list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
        }
        return list;
    }

    /**
     * The store's own listing: localized name and price for each product sold
     * to this account in its country. `unavailable` lists the ids Play did not
     * return (not set up, not sold in this country, or a temporary error).
     */
    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray ids = call.getArray("ids", new JSArray());
        List<String> list;
        try {
            list = ids.toList();
        } catch (Exception e) {
            call.reject("Bad product ids", "failed");
            return;
        }
        if (list.isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("products", new JSArray());
            ret.put("unavailable", new JSArray());
            call.resolve(ret);
            return;
        }
        final List<String> wanted = list;
        connected(call, () -> client.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(productList(wanted)).build(),
            (BillingResult result, QueryProductDetailsResult found) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Could not load products: " + result.getDebugMessage(), "unavailable");
                    return;
                }
                JSArray out = new JSArray();
                JSArray missing = new JSArray();
                for (ProductDetails d : found.getProductDetailsList()) {
                    ProductDetails.OneTimePurchaseOfferDetails offer = d.getOneTimePurchaseOfferDetails();
                    if (offer == null) {
                        missing.put(d.getProductId());
                        continue;
                    }
                    JSObject o = new JSObject();
                    o.put("id", d.getProductId());
                    o.put("displayName", d.getName());
                    // Play's own localized text, with the buyer's currency and taxes as Play shows them.
                    o.put("displayPrice", offer.getFormattedPrice());
                    o.put("currencyCode", offer.getPriceCurrencyCode());
                    o.put("priceMicros", offer.getPriceAmountMicros());
                    o.put("price", offer.getPriceAmountMicros() / 1_000_000.0);
                    out.put(o);
                }
                for (UnfetchedProduct u : found.getUnfetchedProductList()) missing.put(u.getProductId());
                JSObject ret = new JSObject();
                ret.put("products", out);
                ret.put("unavailable", missing);
                call.resolve(ret);
            }));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String accountId = call.getString("accountId");
        if (productId == null) {
            call.reject("Missing productId", "failed");
            return;
        }
        if (pendingPurchase != null) {
            call.reject("Another purchase is in progress.", "failed");
            return;
        }
        connected(call, () -> client.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(productList(Collections.singletonList(productId))).build(),
            (BillingResult result, QueryProductDetailsResult found) -> {
                List<ProductDetails> details = found.getProductDetailsList();
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || details.isEmpty()) {
                    call.reject("This item is not available in Google Play here.", "unavailable");
                    return;
                }
                BillingFlowParams.Builder params = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(
                        BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details.get(0)).build()));
                // The server's purchase intent: ties the purchase to this player.
                if (accountId != null) params.setObfuscatedAccountId(accountId);
                getActivity().runOnUiThread(() -> {
                    pendingPurchase = call;
                    BillingResult launch = client.launchBillingFlow(getActivity(), params.build());
                    if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        pendingPurchase = null;
                        rejectPurchase(call, launch);
                    }
                });
            }));
    }

    private static void rejectPurchase(PluginCall call, BillingResult result) {
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("Purchase cancelled.", "cancelled");
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            // An earlier purchase of this item is paid but not delivered (consumed) yet.
            call.reject("An earlier purchase of this item is still being delivered. Use Store, Restore purchases, or restart the game.", "already_owned");
        } else if (code == BillingClient.BillingResponseCode.ITEM_UNAVAILABLE || code == BillingClient.BillingResponseCode.BILLING_UNAVAILABLE) {
            call.reject("Purchases are not available here: " + result.getDebugMessage(), "unavailable");
        } else {
            call.reject("Purchase failed: " + result.getDebugMessage(), "failed");
        }
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = pendingPurchase;
        pendingPurchase = null;
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            boolean answered = false;
            for (Purchase p : purchases) {
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    if (call != null && !answered) {
                        call.resolve(describe(p));
                        answered = true;
                    } else {
                        // Paid later (a pending payment completed): the game delivers it. Kept until
                        // the game listens, so a payment that completes during start-up is not lost
                        // (`unfinished` also lists it on the next start).
                        notifyListeners("purchase", describe(p), true);
                    }
                } else if (call != null && !answered && p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                    // Cash or another slow payment method: nothing is delivered until Play says PURCHASED.
                    call.reject("The purchase is waiting for payment.", "pending");
                    answered = true;
                }
            }
            if (call != null && !answered) call.reject("Purchase failed.", "failed");
        } else if (call != null) {
            rejectPurchase(call, result);
        }
    }

    /** Paid but not consumed yet: to deliver on start and for Store, Restore purchases. */
    @PluginMethod
    public void unfinished(PluginCall call) {
        connected(call, () -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (BillingResult result, List<Purchase> list) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    // Not "nothing to deliver": the game tries again on the next start or connection.
                    call.reject("Could not ask Google Play for purchases: " + result.getDebugMessage(), "unavailable");
                    return;
                }
                JSArray out = new JSArray();
                for (Purchase p : list) {
                    // PENDING purchases are not paid yet; they arrive through onPurchasesUpdated later.
                    if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) out.put(describe(p));
                }
                JSObject ret = new JSObject();
                ret.put("purchases", out);
                call.resolve(ret);
            }));
    }

    /**
     * Consume a delivered purchase. The game calls this only after delivery; the
     * server usually consumed it already when it checked the token, so "not owned"
     * (already consumed) counts as done.
     */
    @PluginMethod
    public void consume(PluginCall call) {
        String token = call.getString("purchaseToken");
        if (token == null) {
            call.reject("Missing purchaseToken", "failed");
            return;
        }
        connected(call, () -> client.consumeAsync(
            ConsumeParams.newBuilder().setPurchaseToken(token).build(),
            (BillingResult result, String consumedToken) -> {
                int code = result.getResponseCode();
                if (code == BillingClient.BillingResponseCode.OK || code == BillingClient.BillingResponseCode.ITEM_NOT_OWNED) call.resolve();
                else call.reject("Could not finish the purchase in Google Play: " + result.getDebugMessage(), "failed");
            }));
    }
}

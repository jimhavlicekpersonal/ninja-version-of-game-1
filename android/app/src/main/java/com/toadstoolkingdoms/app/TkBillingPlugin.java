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
import com.android.billingclient.api.QueryPurchasesParams;
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
 * Every product is a one-time consumable. The server checks the purchase
 * token with the Play Developer API and consumes it once delivered; `consume`
 * here is only for a game with no server to ask. A purchase that is paid but
 * not yet consumed is listed by `unfinished`, so it is delivered on the next
 * start.
 */
@CapacitorPlugin(name = "TkBilling")
public class TkBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private PluginCall pendingPurchase;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    /** Run once the billing service is connected (or reject the call). */
    private void connected(PluginCall call, Runnable then) {
        if (client.isReady()) {
            then.run();
            return;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) then.run();
                else call.reject("Google Play Billing is not available: " + result.getDebugMessage(), "unavailable");
            }

            @Override
            public void onBillingServiceDisconnected() {
                // The next call reconnects.
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

    private List<QueryProductDetailsParams.Product> productList(List<String> ids) {
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        for (String id : ids) {
            list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
        }
        return list;
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray ids = call.getArray("ids", new JSArray());
        List<String> list = new ArrayList<>();
        try {
            list = ids.toList();
        } catch (Exception e) {
            call.reject("Bad product ids", "failed");
            return;
        }
        final List<String> wanted = list;
        connected(call, () -> client.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(productList(wanted)).build(),
            (result, details) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Could not load products: " + result.getDebugMessage(), "unavailable");
                    return;
                }
                JSArray out = new JSArray();
                for (ProductDetails d : details) {
                    ProductDetails.OneTimePurchaseOfferDetails offer = d.getOneTimePurchaseOfferDetails();
                    JSObject o = new JSObject();
                    o.put("id", d.getProductId());
                    o.put("displayName", d.getName());
                    o.put("displayPrice", offer != null ? offer.getFormattedPrice() : "");
                    o.put("price", offer != null ? offer.getPriceAmountMicros() / 1_000_000.0 : 0);
                    out.put(o);
                }
                JSObject ret = new JSObject();
                ret.put("products", out);
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
            (result, details) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || details.isEmpty()) {
                    call.reject("This item is not available in Google Play yet.", "unavailable");
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
                        call.reject("Purchase failed: " + launch.getDebugMessage(), "failed");
                    }
                });
            }));
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
                        // Paid later (a pending payment completed): the game delivers it.
                        notifyListeners("purchase", describe(p));
                    }
                } else if (call != null && !answered && p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                    call.reject("The purchase is waiting for payment.", "pending");
                    answered = true;
                }
            }
            if (call != null && !answered) call.reject("Purchase failed.", "failed");
        } else if (call != null) {
            if (code == BillingClient.BillingResponseCode.USER_CANCELED) call.reject("Purchase cancelled.", "cancelled");
            else call.reject("Purchase failed: " + result.getDebugMessage(), "failed");
        }
    }

    /** Paid but not consumed yet: to deliver on start. */
    @PluginMethod
    public void unfinished(PluginCall call) {
        connected(call, () -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (result, list) -> {
                JSArray out = new JSArray();
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    for (Purchase p : list) {
                        if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) out.put(describe(p));
                    }
                }
                JSObject ret = new JSObject();
                ret.put("purchases", out);
                call.resolve(ret);
            }));
    }

    /** Consume a delivered purchase (the server does this itself when it checks the token). */
    @PluginMethod
    public void consume(PluginCall call) {
        String token = call.getString("purchaseToken");
        if (token == null) {
            call.reject("Missing purchaseToken", "failed");
            return;
        }
        connected(call, () -> client.consumeAsync(
            ConsumeParams.newBuilder().setPurchaseToken(token).build(),
            (result, consumedToken) -> call.resolve()));
    }
}

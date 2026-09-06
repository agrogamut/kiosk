package com.madamgy.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.razorpay.Checkout;

import org.json.JSONObject;

/**
 * Thin bridge to the native Razorpay Android checkout. The web layer calls
 * RazorpayNative.open({ key, orderId, amount, ... }); this opens the native
 * payment sheet and resolves with the razorpay_payment_id on success.
 *
 * Payment truth still comes from the server webhook (payment.captured); the
 * resolved id is only a signal that the client-side flow finished, so the
 * caller can retry POST /calls.
 *
 * Razorpay delivers its result to the Activity, not the plugin, so MainActivity
 * implements PaymentResultListener and forwards into the static hooks below.
 * Only one checkout can be in flight at a time, which matches the UX (one
 * consultation payment per screen).
 */
@CapacitorPlugin(name = "Razorpay")
public class RazorpayPlugin extends Plugin {

    private static PluginCall pendingCall;

    @PluginMethod
    public void open(PluginCall call) {
        String key = call.getString("key");
        String orderId = call.getString("orderId");
        Integer amount = call.getInt("amount");

        if (key == null || orderId == null || amount == null) {
            call.reject("key, orderId and amount are required");
            return;
        }

        try {
            JSONObject options = new JSONObject();
            options.put("key", key);
            options.put("order_id", orderId);
            options.put("amount", amount.intValue());
            options.put("currency", call.getString("currency", "INR"));
            options.put("name", call.getString("name", "MadamGy"));
            options.put("description", call.getString("description", "Consultation"));
            options.put("retry", new JSONObject().put("enabled", false));

            JSONObject theme = new JSONObject();
            theme.put("color", "#db6691");
            options.put("theme", theme);

            String email = call.getString("email");
            String contact = call.getString("contact");
            if (email != null || contact != null) {
                JSONObject prefill = new JSONObject();
                if (email != null) prefill.put("email", email);
                if (contact != null) prefill.put("contact", contact);
                options.put("prefill", prefill);
            }

            pendingCall = call;
            call.setKeepAlive(true);

            Checkout checkout = new Checkout();
            checkout.setKeyID(key);
            checkout.open(getActivity(), options);
        } catch (Exception e) {
            clearPending();
            call.reject("razorpay_open_failed: " + e.getMessage());
        }
    }

    /** Called from MainActivity.onPaymentSuccess. */
    static void handleSuccess(String razorpayPaymentId) {
        if (pendingCall == null) {
            return;
        }
        JSObject result = new JSObject();
        result.put("razorpay_payment_id", razorpayPaymentId);
        pendingCall.resolve(result);
        clearPending();
    }

    /** Called from MainActivity.onPaymentError. */
    static void handleError(int code, String description) {
        if (pendingCall == null) {
            return;
        }
        JSObject data = new JSObject();
        data.put("code", code);
        pendingCall.reject(description != null ? description : ("Payment failed (code " + code + ")"), String.valueOf(code), null, data);
        clearPending();
    }

    private static void clearPending() {
        if (pendingCall != null) {
            pendingCall.setKeepAlive(false);
            pendingCall = null;
        }
    }
}

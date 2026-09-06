package com.madamgy.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.razorpay.Checkout;
import com.razorpay.PaymentResultListener;

public class MainActivity extends BridgeActivity implements PaymentResultListener {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RazorpayPlugin.class);
        super.onCreate(savedInstanceState);
        // Warms the checkout so the native sheet opens fast on the first "Pay" tap.
        Checkout.preload(getApplicationContext());
    }

    @Override
    public void onPaymentSuccess(String razorpayPaymentId) {
        RazorpayPlugin.handleSuccess(razorpayPaymentId);
    }

    @Override
    public void onPaymentError(int code, String response) {
        RazorpayPlugin.handleError(code, response);
    }
}

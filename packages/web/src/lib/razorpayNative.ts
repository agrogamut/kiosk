import { registerPlugin } from "@capacitor/core";

// Bridge to the native Razorpay checkout implemented in
// packages/kiosk-android/android/app/src/main/java/com/madamgy/app/RazorpayPlugin.java
// Only wired on Android; on the web the app keeps using window.Razorpay (checkout.js).

export interface RazorpayNativeOpenOptions {
  key: string;
  orderId: string;
  amount: number; // in paise
  currency?: string;
  name?: string;
  description?: string;
  email?: string;
  contact?: string;
}

export interface RazorpayNativeResult {
  razorpay_payment_id: string;
}

export interface RazorpayNativePlugin {
  /** Resolves on a completed payment; rejects on cancel or gateway failure. */
  open(options: RazorpayNativeOpenOptions): Promise<RazorpayNativeResult>;
}

export const RazorpayNative = registerPlugin<RazorpayNativePlugin>("Razorpay");

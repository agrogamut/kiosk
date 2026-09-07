import { randomInt } from "crypto";
import axios from "axios";
import { redis } from "../lib/redis.js";

/**
 * What a code was issued for. Codes are namespaced by purpose so one can never be spent on
 * another: without this, a doctor's login code -- which is sent to a phone that already belongs
 * to someone -- would also satisfy "prove you own this phone" during patient sign-up, and any
 * flow that ever issues a code to a number becomes a way to open an account on it.
 */
export type OtpPurpose = "login" | "register" | "account_delete";

function otpKey(phone: string, purpose: OtpPurpose): string {
  // "login" keeps the original unprefixed key so codes already in flight when this ships stay
  // redeemable; a patient halfway through the numpad doesn't get a dead code out of the deploy.
  return purpose === "login" ? `otp:${phone}` : `otp:${purpose}:${phone}`;
}

export async function storeOtp(phone: string, purpose: OtpPurpose = "login"): Promise<string> {
  const code = process.env.NODE_ENV === "production" ? String(randomInt(100000, 1000000)) : "000000";
  await redis.set(otpKey(phone, purpose), code, "EX", 300);
  return code;
}

/**
 * Store and payment-gateway reviewers (Google Play "App access", Razorpay website
 * verification) cannot receive a real SMS OTP. When REVIEW_LOGIN_PHONE and REVIEW_LOGIN_OTP
 * are BOTH set, that one number logs in with that one fixed code, in any environment.
 * Unset both env vars once the reviews have cleared. Leaving them unset disables this
 * entirely -- there is no built-in default.
 */
function isReviewLogin(phone: string, code: string, purpose: OtpPurpose): boolean {
  // The seeded reviewer account already exists, so the bypass only ever needs to satisfy
  // "login" -- gating on purpose keeps a register-purpose call from being spent on it too,
  // matching the namespacing invariant described on OtpPurpose above.
  if (purpose !== "login") {
    return false;
  }
  const reviewPhone = process.env.REVIEW_LOGIN_PHONE;
  const reviewOtp = process.env.REVIEW_LOGIN_OTP;
  return Boolean(reviewPhone && reviewOtp && phone === reviewPhone && code === reviewOtp);
}

export async function verifyOtp(phone: string, code: string, purpose: OtpPurpose = "login"): Promise<boolean> {
  if (process.env.NODE_ENV === "development" && code === "000000") {
    return true;
  }

  if (isReviewLogin(phone, code, purpose)) {
    return true;
  }

  const stored = await redis.call("GETDEL", otpKey(phone, purpose));
  return stored === code;
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  // The reviewer bypass number never needs a real SMS -- it logs in with the fixed
  // REVIEW_LOGIN_OTP -- and it is not a real handset, so don't spend an SMS on it.
  if (process.env.REVIEW_LOGIN_PHONE && phone === process.env.REVIEW_LOGIN_PHONE) {
    return;
  }

  const localDigits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const mobile = localDigits.startsWith("91") && localDigits.length === 12 ? localDigits : `91${localDigits}`;

  try {
    const response = await axios.post(
      "https://control.msg91.com/api/v5/otp",
      {},
      {
        params: {
          template_id: process.env.MSG91_TEMPLATE_ID,
          mobile,
          otp,
        },
        headers: {
          authkey: process.env.MSG91_AUTH_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    if (response.data?.type === "error") {
      throw new Error(`MSG91 rejected OTP send: ${response.data.message ?? "unknown error"}`);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`MSG91 OTP request failed: ${error.response?.status} ${error.response?.data?.message ?? error.message}`);
    }
    throw error;
  }
}

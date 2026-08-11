import { randomInt } from "crypto";
import axios from "axios";
import { redis } from "../lib/redis.js";

/**
 * What a code was issued for. Codes are namespaced by purpose so one can never be spent on
 * another: without this, a doctor's login code -- which is sent to a phone that already belongs
 * to someone -- would also satisfy "prove you own this phone" during patient sign-up, and any
 * flow that ever issues a code to a number becomes a way to open an account on it.
 */
export type OtpPurpose = "login" | "register";

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

export async function verifyOtp(phone: string, code: string, purpose: OtpPurpose = "login"): Promise<boolean> {
  if (process.env.NODE_ENV === "development" && code === "000000") {
    return true;
  }

  const stored = await redis.call("GETDEL", otpKey(phone, purpose));
  return stored === code;
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
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

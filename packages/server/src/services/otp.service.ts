import { randomInt } from "crypto";
import axios from "axios";
import { redis } from "../lib/redis.js";

function otpKey(phone: string): string {
  return `otp:${phone}`;
}

export async function storeOtp(phone: string): Promise<string> {
  const code = process.env.NODE_ENV === "production" ? String(randomInt(100000, 1000000)) : "000000";
  await redis.set(otpKey(phone), code, "EX", 300);
  return code;
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  if (process.env.NODE_ENV === "development" && code === "000000") {
    return true;
  }

  const stored = await redis.call("GETDEL", otpKey(phone));
  return stored === code;
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const localDigits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const mobile = localDigits.startsWith("91") && localDigits.length === 12 ? localDigits : `91${localDigits}`;

  const response = await axios.post(
    "https://api.msg91.com/api/v5/otp",
    {
      template_id: process.env.MSG91_TEMPLATE_ID,
      mobile,
      otp,
    },
    {
      headers: {
        authkey: process.env.MSG91_AUTH_KEY,
        "Content-Type": "application/json",
      },
    },
  );

  if (response.data?.type === "error") {
    throw new Error(`MSG91 rejected OTP send: ${JSON.stringify(response.data)}`);
  }
}

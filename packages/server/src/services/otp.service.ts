import { randomInt } from "crypto";
import axios from "axios";
import { redis } from "../lib/redis.js";

function otpKey(phone: string): string {
  return `otp:${phone}`;
}

export async function storeOtp(phone: string): Promise<string> {
  const code = String(randomInt(100000, 1000000));
  await redis.set(otpKey(phone), code, "EX", 300);
  return code;
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const stored = await redis.call("GETDEL", otpKey(phone));
  return stored === code;
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  await axios.post(
    "https://api.msg91.com/api/v5/otp",
    {
      template_id: process.env.MSG91_TEMPLATE_ID,
      mobile: phone,
      otp,
    },
    {
      headers: {
        authkey: process.env.MSG91_AUTH_KEY,
        "Content-Type": "application/json",
      },
    },
  );
}

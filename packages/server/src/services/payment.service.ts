import Razorpay from "razorpay";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";
import { getRevenueConfig } from "./revenue-config.service.js";

function getRazorpayClient(): Razorpay {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

export async function createPaymentOrder(patientId: string) {
  const config = await getRevenueConfig();
  const fee = Number(config.consultationFee);

  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount: fee * 100,
    currency: "INR",
    receipt: `consult_${patientId}_${Date.now()}`,
  });

  const payment = await prisma.payment.create({
    data: {
      patientId,
      amount: fee,
      razorpayOrderId: order.id,
      status: "CREATED",
      doctorPct: config.doctorPct,
      adminPct: config.adminPct,
      superAdminPct: config.superAdminPct,
    },
  });

  return {
    paymentId: payment.id,
    razorpayOrderId: order.id,
    amount: fee,
    keyId: process.env.RAZORPAY_KEY_ID,
  };
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return false;
  }

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, provided);
}

export async function markPaymentPaid(razorpayOrderId: string, razorpayPaymentId: string): Promise<void> {
  await prisma.payment.updateMany({
    where: { razorpayOrderId, status: "CREATED" },
    data: { status: "PAID", razorpayPaymentId },
  });
}

export async function refundPayment(paymentId: string) {
  const claimed = await prisma.payment.updateMany({
    where: { id: paymentId, status: "PAID" },
    data: { status: "REFUNDED" },
  });
  if (claimed.count === 0) {
    throw new AppError(400, "Payment not eligible for refund");
  }

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (!payment.razorpayPaymentId) {
    throw new AppError(400, "Payment not eligible for refund");
  }

  const razorpay = getRazorpayClient();
  await razorpay.payments.refund(payment.razorpayPaymentId, {});
  return payment;
}

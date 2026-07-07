import Razorpay from "razorpay";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

const CONSULTATION_FEE = Number(process.env.CONSULTATION_FEE ?? "200");

function getRazorpayClient(): Razorpay {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

export async function createPaymentOrder(patientId: string) {
  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount: CONSULTATION_FEE * 100,
    currency: "INR",
    receipt: `consult_${patientId}_${Date.now()}`,
  });

  const payment = await prisma.payment.create({
    data: {
      patientId,
      amount: CONSULTATION_FEE,
      razorpayOrderId: order.id,
      status: "CREATED",
    },
  });

  return {
    paymentId: payment.id,
    razorpayOrderId: order.id,
    amount: CONSULTATION_FEE,
    keyId: process.env.RAZORPAY_KEY_ID,
  };
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}

export async function markPaymentPaid(razorpayOrderId: string, razorpayPaymentId: string) {
  return prisma.payment.update({
    where: { razorpayOrderId },
    data: { status: "PAID", razorpayPaymentId },
  });
}

export async function refundPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || !payment.razorpayPaymentId) {
    throw new AppError(400, "Payment not eligible for refund");
  }

  const razorpay = getRazorpayClient();
  await razorpay.payments.refund(payment.razorpayPaymentId, {});
  return prisma.payment.update({ where: { id: paymentId }, data: { status: "REFUNDED" } });
}

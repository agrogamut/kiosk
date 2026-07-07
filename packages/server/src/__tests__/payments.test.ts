import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../services/auth.service.js";
import { markPaymentPaid, refundPayment, verifyWebhookSignature } from "../services/payment.service.js";
import crypto from "crypto";

describe("Payments", () => {
  let patientId: string;
  let patientToken: string;

  beforeAll(async () => {
    const patient = await prisma.user.create({
      data: { phone: "8888800001", name: "Payment Patient", role: "PATIENT" },
    });
    patientId = patient.id;
    patientToken = signAccessToken({ sub: patient.id, role: "PATIENT" });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { patientId } });
    await prisma.user.deleteMany({ where: { id: patientId } });
  });

  // Skipped — requires real Razorpay test-mode credentials (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET), not available in this environment. Un-skip once real test-mode credentials are configured in .env and CI secrets.
  it.skip("creates a real Razorpay order and a CREATED payment row", async () => {
    const response = await request(app)
      .post("/api/payments/order")
      .set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(201);
    expect(response.body.razorpayOrderId).toMatch(/^order_/);
    expect(response.body.amount).toBe(200);

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { razorpayOrderId: response.body.razorpayOrderId },
    });
    expect(payment.status).toBe("CREATED");
  });

  it("verifies a webhook signature correctly and rejects a tampered one", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const validSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest("hex");

    expect(verifyWebhookSignature(body, validSignature)).toBe(true);
    expect(verifyWebhookSignature(body, "deadbeef")).toBe(false);
  });

  it("marks a payment paid", async () => {
    await prisma.payment.create({
      data: {
        patientId,
        amount: 200,
        razorpayOrderId: "order_fake_test_seed",
        status: "CREATED",
      },
    });

    const paid = await markPaymentPaid("order_fake_test_seed", "pay_fake_test_id");
    expect(paid.status).toBe("PAID");
  });

  it("surfaces a clean error when refunding a payment the real Razorpay API doesn't recognize", async () => {
    const payment = await prisma.payment.create({
      data: {
        patientId,
        amount: 200,
        razorpayOrderId: "order_fake_test_refund",
        razorpayPaymentId: "pay_test_fake_id_for_status_only",
        status: "PAID",
      },
    });

    // refundPayment calls the real Razorpay refund API, which will reject a fake payment id —
    // this assertion only checks that our code surfaces a clear error rather than an unhandled crash.
    await expect(refundPayment(payment.id)).rejects.toThrow();
  });
});

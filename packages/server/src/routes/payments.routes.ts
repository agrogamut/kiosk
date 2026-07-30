import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createPaymentOrder, markPaymentFailed, markPaymentPaid, verifyWebhookSignature } from "../services/payment.service.js";

export const paymentsRouter = Router();

paymentsRouter.post("/order", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await createPaymentOrder(req.user!.sub);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

paymentsRouter.post("/webhook", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = (req.body as Buffer).toString("utf-8");
    if (typeof signature !== "string" || !verifyWebhookSignature(rawBody, signature)) {
      res.status(400).json({ message: "Invalid signature" });
      return;
    }

    const event = JSON.parse(rawBody) as { event: string; payload: { payment: { entity: { order_id: string; id: string } } } };
    if (event.event === "payment.captured") {
      const { order_id: orderId, id: paymentId } = event.payload.payment.entity;
      await markPaymentPaid(orderId, paymentId);
    } else if (event.event === "payment.failed") {
      // Without this, a declined card leaves the Payment row stuck at CREATED forever --
      // never claimable (calls.routes only claims status: "PAID"), just dead clutter that
      // looks like a lost payment when someone goes looking.
      await markPaymentFailed(event.payload.payment.entity.order_id);
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

paymentsRouter.get("/:id", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment || payment.patientId !== req.user!.sub) {
      res.status(404).json({ message: "Payment not found" });
      return;
    }
    res.json(payment);
  } catch (error) {
    next(error);
  }
});

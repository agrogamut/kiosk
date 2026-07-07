import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { assignDoctorQueue } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const callsRouter = Router();

callsRouter.post("/", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patientId = req.user!.sub;

    const existing = await prisma.callSession.findFirst({
      where: { patientId, status: { in: ["QUEUED", "RINGING", "ACTIVE"] } },
    });
    if (existing) {
      res.status(409).json({ message: "Active call exists", callSession: existing, callSessionId: existing.id });
      return;
    }

    let claimedPaymentId: string | undefined;
    if (process.env.REQUIRE_PAYMENT_FOR_CALLS === "true") {
      const body = z.object({ paymentId: z.string() }).parse(req.body);
      // Atomically claim the payment before creating the call, so two concurrent requests with
      // the same paymentId can't both pass a read-then-check and both end up with a call created.
      // The empty-string callSessionId is a temporary "claimed but not yet linked" marker: it
      // satisfies the @unique constraint on Payment.callSessionId (only one payment can hold it
      // at a time) and no CallSession will ever have an empty-string id (cuid()-generated), so it
      // can never collide with a real call. It's corrected to the real call.id right after the
      // CallSession is created below.
      const claim = await prisma.payment.updateMany({
        where: { id: body.paymentId, patientId, status: "PAID", callSessionId: null },
        data: { callSessionId: "" },
      });
      if (claim.count === 0) {
        res.status(402).json({ message: "Valid unused paid payment required" });
        return;
      }
      claimedPaymentId = body.paymentId;
    }

    const call = await prisma.callSession.create({
      data: { patientId, livekitRoom: `room-${randomUUID()}`, status: "QUEUED" },
    });

    if (claimedPaymentId) {
      await prisma.payment.update({ where: { id: claimedPaymentId }, data: { callSessionId: call.id } });
    }

    await assignDoctorQueue.add(
      "assign",
      { callSessionId: call.id },
      { attempts: 3, backoff: { type: "fixed", delay: 30_000 } },
    );

    res.status(201).json(call);
  } catch (error) {
    next(error);
  }
});

callsRouter.get("/history", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page ?? "1"), 1);
    const limit = 20;
    const skip = (page - 1) * limit;
    let where: Prisma.CallSessionWhereInput = {};

    if (req.user!.role === "PATIENT") {
      where = { patientId: req.user!.sub };
    } else if (req.user!.role === "DOCTOR") {
      where = { doctorId: req.user!.sub };
    }

    const [calls, total] = await Promise.all([
      prisma.callSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          patient: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true } },
        },
      }),
      prisma.callSession.count({ where }),
    ]);

    res.json({ calls, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});

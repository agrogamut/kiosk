import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { CallCreateSchema } from "@madamgy/api-client";
import { assignDoctorQueue } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resolveAssistingAdmin } from "../services/kiosk.service.js";

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

    const { paymentId, deviceId } = CallCreateSchema.parse(req.body ?? {});

    const requirePayment = process.env.REQUIRE_PAYMENT_FOR_CALLS === "true";
    if (requirePayment && !paymentId) {
      z.object({ paymentId: z.string() }).parse(req.body);
    }

    const assistingAdminId = await resolveAssistingAdmin(deviceId);

    // Create the call first (cheap, no external side effects). The payment claim below uses the
    // real call.id directly as the callSessionId being set, never a placeholder, so it can never
    // violate the FK constraint on Payment.callSessionId and never collides across unrelated
    // payments (each claim only ever touches its own payment row).
    let call;
    try {
      call = await prisma.callSession.create({
        data: { patientId, assistingAdminId, livekitRoom: `room-${randomUUID()}`, status: "QUEUED" },
      });
    } catch (error) {
      // The findFirst check above is a fast-path UX check, not the real guard -- two
      // near-simultaneous requests can both pass it before either insert commits. The partial
      // unique index on CallSession(patientId) WHERE status IN (...) (see schema.prisma) is what
      // actually stops a patient ending up with two concurrent active calls; this is that guard
      // firing.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await prisma.callSession.findFirst({
          where: { patientId, status: { in: ["QUEUED", "RINGING", "ACTIVE"] } },
        });
        res.status(409).json({ message: "Active call exists", callSession: raced, callSessionId: raced?.id });
        return;
      }
      throw error;
    }

    if (requirePayment && paymentId) {
      // Atomically claim the payment for this call. Two concurrent requests with the same
      // paymentId each create their own distinct CallSession, then race on this updateMany
      // against the same Payment row; Postgres serializes the two UPDATEs, only one can match
      // callSessionId: null, and the loser deletes its own orphan CallSession below.
      const claim = await prisma.payment.updateMany({
        where: { id: paymentId, patientId, status: "PAID", callSessionId: null },
        data: { callSessionId: call.id },
      });
      if (claim.count === 0) {
        await prisma.callSession.delete({ where: { id: call.id } });
        res.status(402).json({ message: "Valid unused paid payment required" });
        return;
      }
    }

    await assignDoctorQueue.add(
      "assign",
      { callSessionId: call.id },
      {
        jobId: call.id,
        attempts: 6,
        backoff: { type: "fixed", delay: 20_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
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

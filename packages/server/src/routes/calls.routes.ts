import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { Prisma } from "@prisma/client";
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

    const call = await prisma.callSession.create({
      data: { patientId, livekitRoom: `room-${randomUUID()}`, status: "QUEUED" },
    });

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

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { io } from "../index.js";

export const adminRouter = Router();

const DisableUserSchema = z.object({ disabled: z.boolean() });

adminRouter.use(requireAuth("ADMIN"));

adminRouter.get("/doctors", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: "DOCTOR" },
      include: { doctorProfile: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(doctors);
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/doctors/:id/approve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user || user.role !== "DOCTOR") {
      throw new AppError(404, "Doctor not found");
    }

    await prisma.doctorProfile.update({
      where: { userId: req.params.id },
      data: { isApproved: true, approvedAt: new Date(), approvedById: req.user!.sub },
    });

    io.to(`user:${req.params.id}`).emit("doctor:approved");
    res.json({ message: "Doctor approved" });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/users", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, phone: true, role: true, disabled: true, createdAt: true },
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/users/:id/disable", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { disabled } = DisableUserSchema.parse(req.body);
    await prisma.user.update({ where: { id: req.params.id }, data: { disabled } });
    res.json({ message: disabled ? "User disabled" : "User enabled" });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [totalPatients, totalDoctors, totalCalls, activeCalls, totalRx] = await Promise.all([
      prisma.user.count({ where: { role: "PATIENT" } }),
      prisma.user.count({ where: { role: "DOCTOR" } }),
      prisma.callSession.count(),
      prisma.callSession.count({ where: { status: { in: ["QUEUED", "RINGING", "ACTIVE"] } } }),
      prisma.prescription.count(),
    ]);
    res.json({ totalPatients, totalDoctors, totalCalls, activeCalls, totalRx });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/calls", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page ?? "1"), 1);
    const limit = 20;
    const [calls, total] = await Promise.all([
      prisma.callSession.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          patient: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true } },
        },
      }),
      prisma.callSession.count(),
    ]);
    res.json({ calls, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});

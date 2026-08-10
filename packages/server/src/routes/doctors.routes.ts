import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { buildFileUrl } from "../services/file-url.service.js";

export const doctorsRouter = Router();

doctorsRouter.get("/available", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doctors = await prisma.doctorProfile.findMany({
      where: { isApproved: true, isAvailable: true },
      select: {
        specialization: true,
        photoKey: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { user: { name: "asc" } },
    });

    res.json(
      doctors.map((doctor) => ({
        id: doctor.user.id,
        name: doctor.user.name,
        specialization: doctor.specialization,
        photoUrl: doctor.photoKey ? buildFileUrl(req, doctor.photoKey) : null,
      })),
    );
  } catch (error) {
    next(error);
  }
});

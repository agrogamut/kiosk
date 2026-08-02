import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getPresignedUrl } from "../services/storage.service.js";

export const doctorsRouter = Router();

doctorsRouter.get("/available", requireAuth("PATIENT"), async (_req: Request, res: Response, next: NextFunction) => {
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

    const withPhotos = await Promise.all(
      doctors.map(async (doctor) => ({
        id: doctor.user.id,
        name: doctor.user.name,
        specialization: doctor.specialization,
        photoUrl: doctor.photoKey ? await getPresignedUrl(doctor.photoKey) : null,
      })),
    );

    res.json(withPhotos);
  } catch (error) {
    next(error);
  }
});

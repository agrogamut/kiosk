import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { UpdateProfileSchema } from "@madamgy/api-client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const usersRouter = Router();

usersRouter.get("/me", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.sub },
      include: { patientProfile: true, doctorProfile: true },
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

usersRouter.put("/me", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = UpdateProfileSchema.parse(req.body);
    const dob = body.dob ? new Date(body.dob) : undefined;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user!.sub },
        data: { name: body.name },
      }),
      prisma.patientProfile.update({
        where: { userId: req.user!.sub },
        data: {
          heightCm: body.heightCm,
          weightKg: body.weightKg,
          bloodType: body.bloodType,
          dob,
        },
      }),
    ]);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.sub },
      include: { patientProfile: true },
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

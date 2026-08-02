import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { UpdateProfileSchema } from "@madamgy/api-client";
import { parseDateOfBirth } from "../lib/date-of-birth.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getPresignedUrl } from "../services/storage.service.js";

export const usersRouter = Router();

const SAFE_USER_SELECT = {
  id: true,
  phone: true,
  name: true,
  role: true,
  disabled: true,
  walletBalance: true,
  createdAt: true,
  patientProfile: true,
  doctorProfile: true,
} as const;

async function withDoctorPhotoUrl<T extends { doctorProfile?: { photoKey: string | null } | null }>(
  user: T,
): Promise<T & { doctorProfile?: (T["doctorProfile"] & { photoUrl: string | null }) | null }> {
  if (!user.doctorProfile) {
    return { ...user, doctorProfile: user.doctorProfile ?? null };
  }
  const photoUrl = user.doctorProfile.photoKey ? await getPresignedUrl(user.doctorProfile.photoKey) : null;
  return { ...user, doctorProfile: { ...user.doctorProfile, photoUrl } };
}

usersRouter.get("/me", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.sub },
      select: SAFE_USER_SELECT,
    });
    res.json(await withDoctorPhotoUrl(user));
  } catch (error) {
    next(error);
  }
});

usersRouter.put("/me", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = UpdateProfileSchema.parse(req.body);
    const dob = body.dob ? parseDateOfBirth(body.dob) : undefined;

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
      select: SAFE_USER_SELECT,
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

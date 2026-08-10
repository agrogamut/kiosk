import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { WithdrawRequestSchema } from "@madamgy/api-client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { uploadBuffer } from "../services/storage.service.js";
import { buildFileUrl } from "../services/file-url.service.js";
import { createWithdrawRequest, getWalletBalance } from "../services/wallet.service.js";
import { findLiveCallForDoctor } from "../services/call-queue.service.js";

export const doctorRouter = Router();

doctorRouter.use(requireAuth("DOCTOR"));

// 10MB, matching the chat upload limit: a photo taken on a modern phone is routinely 3-12MB, and
// the old 5MB cap rejected ordinary camera output.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

doctorRouter.post(
  "/license",
  upload.single("licenseDocument"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new AppError(400, "License document required");
      }
      if (
        req.file.mimetype !== "application/pdf" ||
        !req.file.buffer.subarray(0, 5).toString("ascii").startsWith("%PDF-")
      ) {
        throw new AppError(400, "License document must be a valid PDF");
      }

      const doctorId = req.user!.sub;
      const objectKey = `doctor-verification/${doctorId}.pdf`;
      await uploadBuffer(objectKey, req.file.buffer, "application/pdf");
      await prisma.doctorProfile.update({ where: { userId: doctorId }, data: { licenseDocKey: objectKey } });

      res.json({ message: "License uploaded" });
    } catch (error) {
      next(error);
    }
  },
);

const PHOTO_EXTENSION_BY_MIMETYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

doctorRouter.post("/photo", upload.single("photo"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw new AppError(400, "Photo required");
    }
    const extension = PHOTO_EXTENSION_BY_MIMETYPE[req.file.mimetype];
    if (!extension) {
      throw new AppError(400, "Photo must be a JPEG, PNG, or WebP image");
    }

    const doctorId = req.user!.sub;
    const objectKey = `doctor-photos/${doctorId}.${extension}`;
    await uploadBuffer(objectKey, req.file.buffer, req.file.mimetype);
    await prisma.doctorProfile.update({ where: { userId: doctorId }, data: { photoKey: objectKey } });

    res.json({ photoUrl: buildFileUrl(req, objectKey) });
  } catch (error) {
    next(error);
  }
});

// A doctor had no way to see whether patients could reach them, no way to go off duty, and no way
// back if their availability got stuck -- the only fix was editing the database by hand.
doctorRouter.get("/availability", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user!.sub },
      select: { isOnDuty: true, isAvailable: true, isApproved: true },
    });
    if (!profile) {
      throw new AppError(404, "Doctor profile not found");
    }

    res.json({
      isOnDuty: profile.isOnDuty,
      // isAvailable is false for the whole of a call, so on its own it would read as "off duty"
      // to a doctor who is simply busy.
      isInCall: profile.isOnDuty && profile.isApproved && !profile.isAvailable,
      reachable: profile.isOnDuty && profile.isApproved && profile.isAvailable,
    });
  } catch (error) {
    next(error);
  }
});

doctorRouter.put("/availability", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isOnDuty } = req.body ?? {};
    if (typeof isOnDuty !== "boolean") {
      throw new AppError(400, "isOnDuty must be true or false");
    }

    // Coming back on duty also clears a stuck isAvailable, which is the only recovery a doctor
    // can perform for themselves -- but not while they are genuinely on a call, or the next
    // assignment would ring them in the middle of the consultation they are already in.
    // Shares findLiveCallForDoctor with the socket reconnect path so both agree on what "on a
    // call" means. A stale row must not count, or this recovery -- the only one a doctor has --
    // would refuse exactly when it is needed.
    const busy = isOnDuty && (await findLiveCallForDoctor(req.user!.sub)) !== null;

    const profile = await prisma.doctorProfile.update({
      where: { userId: req.user!.sub },
      data: isOnDuty ? { isOnDuty: true, isAvailable: !busy } : { isOnDuty: false },
      select: { isOnDuty: true, isAvailable: true, isApproved: true },
    });

    res.json({
      isOnDuty: profile.isOnDuty,
      isInCall: profile.isOnDuty && profile.isApproved && !profile.isAvailable,
      reachable: profile.isOnDuty && profile.isApproved && profile.isAvailable,
    });
  } catch (error) {
    next(error);
  }
});

doctorRouter.get("/patients/:patientId/records", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doctorId = req.user!.sub;
    const patientId = req.params.patientId;

    const hasHistory = await prisma.callSession.findFirst({
      where: { doctorId, patientId },
      select: { id: true },
    });
    if (!hasHistory) {
      throw new AppError(403, "No consultation history with this patient");
    }

    const [healthFiles, prescriptions] = await Promise.all([
      prisma.healthFile.findMany({
        where: { userId: patientId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.prescription.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        include: { doctor: { select: { id: true, name: true } } },
      }),
    ]);

    const healthFilesWithUrls = healthFiles.map((file) => ({ ...file, url: buildFileUrl(req, file.objectKey) }));

    res.json({ healthFiles: healthFilesWithUrls, prescriptions });
  } catch (error) {
    next(error);
  }
});

doctorRouter.get("/prescriptions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prescriptions = await prisma.prescription.findMany({
      where: { doctorId: req.user!.sub },
      orderBy: { createdAt: "desc" },
      include: { patient: { select: { id: true, name: true } } },
    });

    res.json(prescriptions);
  } catch (error) {
    next(error);
  }
});

doctorRouter.get("/wallet", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const balance = await getWalletBalance(req.user!.sub);
    res.json({ balance: balance.toString() });
  } catch (error) {
    next(error);
  }
});

doctorRouter.get("/wallet/transactions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page ?? "1"), 1);
    const limit = 20;
    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { userId: req.user!.sub },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.walletTransaction.count({ where: { userId: req.user!.sub } }),
    ]);

    res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});

doctorRouter.post("/wallet/withdraw", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, bankName, accountNumber, ifsc, holderName } = WithdrawRequestSchema.parse(req.body);
    const transaction = await createWithdrawRequest(req.user!.sub, amount, {
      bankName,
      accountNumber,
      ifsc,
      holderName,
    });
    res.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
});

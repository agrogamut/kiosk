import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { WithdrawRequestSchema } from "@madamgy/api-client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { getPresignedUrl } from "../services/storage.service.js";
import { createWithdrawRequest, getWalletBalance } from "../services/wallet.service.js";

export const doctorRouter = Router();

doctorRouter.use(requireAuth("DOCTOR"));

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

    const healthFilesWithUrls = await Promise.all(
      healthFiles.map(async (file) => ({ ...file, url: await getPresignedUrl(file.objectKey) })),
    );

    res.json({ healthFiles: healthFilesWithUrls, prescriptions });
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

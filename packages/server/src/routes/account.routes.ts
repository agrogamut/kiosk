import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { AccountDeleteInitiateSchema, AccountDeleteVerifySchema } from "@madamgy/api-client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { checkAttemptLimit, clearAttempts, recordFailedAttempt } from "../lib/rate-limit.js";
import { sendOtpSms, storeOtp, verifyOtp } from "../services/otp.service.js";
import { anonymizeUser } from "../services/account-deletion.service.js";

export const accountRouter = Router();

accountRouter.delete("/me", requireAuth(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await anonymizeUser(req.user!.sub);
    res.json({ message: "Account deleted" });
  } catch (error) {
    next(error);
  }
});

accountRouter.post(
  "/delete/initiate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone } = AccountDeleteInitiateSchema.parse(req.body);
      const attemptKey = `account_delete_initiate:${phone}:${req.ip}`;
      await checkAttemptLimit(attemptKey);

      const user = await prisma.user.findUnique({ where: { phone } });
      // Same response whether the phone exists or not -- don't let this endpoint
      // become a way to enumerate registered phone numbers.
      if (user && !user.deletedAt && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
        const otp = await storeOtp(phone);
        await sendOtpSms(phone, otp);
      }

      res.json({ message: "If this phone number has an account, an OTP has been sent." });
    } catch (error) {
      next(error);
    }
  },
);

accountRouter.post(
  "/delete/verify",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, otp } = AccountDeleteVerifySchema.parse(req.body);
      const attemptKey = `account_delete_verify:${phone}`;
      await checkAttemptLimit(attemptKey);

      const valid = await verifyOtp(phone, otp);
      if (!valid) {
        await recordFailedAttempt(attemptKey);
        throw new AppError(401, "Invalid or expired OTP");
      }
      await clearAttempts(attemptKey);

      const user = await prisma.user.findUnique({ where: { phone } });
      if (!user || user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
        throw new AppError(404, "Account not found");
      }

      await anonymizeUser(user.id);
      res.json({ message: "Account deleted" });
    } catch (error) {
      next(error);
    }
  },
);

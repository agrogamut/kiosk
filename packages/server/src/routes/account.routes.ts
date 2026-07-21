import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import bcrypt from "bcryptjs";
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
      // become a way to enumerate registered phone numbers. ADMIN/SUPER_ADMIN accounts
      // never get an OTP stored at all (not just SMS-suppressed) -- storing one here would
      // be new, pointless attack surface against the same Redis key the login flow shares.
      if (user && !user.deletedAt && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
        Promise.resolve()
          .then(async () => {
            const otp = await storeOtp(phone);
            await sendOtpSms(phone, otp);
          })
          .catch((error) => {
            console.error("otp send failed for", phone, error);
          });
      }

      await recordFailedAttempt(attemptKey);
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
      const { phone, otp, password } = AccountDeleteVerifySchema.parse(req.body);
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

      // Doctors require password verification (same as their login flow)
      if (user.role === "DOCTOR") {
        if (!password || !user.passwordHash) {
          throw new AppError(401, "Invalid credentials");
        }
        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          throw new AppError(401, "Invalid credentials");
        }
      }

      await anonymizeUser(user.id);
      res.json({ message: "Account deleted" });
    } catch (error) {
      next(error);
    }
  },
);

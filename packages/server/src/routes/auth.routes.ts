import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import {
  AdminLoginSchema,
  DoctorLoginInitiateSchema,
  DoctorLoginVerifySchema,
  DoctorRegisterSchema,
  PatientLoginSchema,
  PatientLoginOtpInitiateSchema,
  PatientLoginOtpVerifySchema,
  PatientRegisterSchema,
} from "@madamgy/api-client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";
import { checkAttemptLimit, clearAttempts, recordFailedAttempt } from "../lib/rate-limit.js";
import { REFRESH_COOKIE_MAX_AGE_MS, refreshCookieOptions } from "../lib/refresh-cookie.js";
import {
  findActivePatientByPhone,
  loginStaff,
  loginDoctorInitiate,
  loginPatient,
  registerDoctor,
  registerPatient,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../services/auth.service.js";
import { sendOtpSms, storeOtp, verifyOtp } from "../services/otp.service.js";
import { io } from "../index.js";

export const authRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function setRefreshCookie(res: Response, token: string): void {
  res.cookie("refreshToken", token, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

authRouter.post(
  "/patient/register",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = PatientRegisterSchema.parse(req.body);
      const user = await registerPatient(body);
      const payload = { sub: user.id, role: user.role };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);
      setRefreshCookie(res, refreshToken);
      res.status(201).json({ accessToken, user: { id: user.id, name: user.name, role: user.role } });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/patient/login",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, pin } = PatientLoginSchema.parse(req.body);
      const user = await loginPatient(phone, pin);
      const payload = { sub: user.id, role: user.role };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);
      setRefreshCookie(res, refreshToken);
      res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role } });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/patient/login/otp/initiate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone } = PatientLoginOtpInitiateSchema.parse(req.body);
      const attemptKey = `otp_initiate_attempts:${phone}:${req.ip}`;
      await checkAttemptLimit(attemptKey);

      let activePatient;
      try {
        activePatient = await findActivePatientByPhone(phone);
      } catch (error) {
        if (error instanceof AppError && (error.statusCode === 401 || error.statusCode === 403)) {
          activePatient = null;
        } else {
          throw error;
        }
      }

      if (activePatient) {
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
      res.json({ message: "OTP sent" });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/patient/login/otp/verify",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, otp } = PatientLoginOtpVerifySchema.parse(req.body);
      const attemptKey = `otp_attempts:${phone}`;
      await checkAttemptLimit(attemptKey);

      const valid = await verifyOtp(phone, otp);
      if (!valid) {
        await recordFailedAttempt(attemptKey);
        throw new AppError(401, "Invalid or expired OTP");
      }
      await clearAttempts(attemptKey);

      const user = await findActivePatientByPhone(phone);
      const payload = { sub: user.id, role: user.role };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);
      setRefreshCookie(res, refreshToken);
      res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role } });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/doctor/register",
  upload.single("licenseDocument"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const attemptKey = `doctor_register_attempts:${req.ip}`;
    try {
      await checkAttemptLimit(attemptKey);

      try {
        if (
          req.file &&
          (req.file.mimetype !== "application/pdf" ||
            !req.file.buffer.subarray(0, 5).toString("ascii").startsWith("%PDF-"))
        ) {
          throw new AppError(400, "License document must be a valid PDF");
        }

        const body = DoctorRegisterSchema.parse(JSON.parse(req.body.data));
        const user = await registerDoctor(
          body,
          req.file ? { buffer: req.file.buffer, mimetype: req.file.mimetype } : undefined,
        );
        io.to("admins").emit("doctor:new_registration", { doctorId: user.id, name: user.name });
        res.status(201).json({ message: "Registration submitted, awaiting admin approval" });
      } finally {
        await recordFailedAttempt(attemptKey);
      }
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/doctor/login/initiate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, password } = DoctorLoginInitiateSchema.parse(req.body);
      await loginDoctorInitiate(phone, password);
      const otp = await storeOtp(phone);
      await sendOtpSms(phone, otp);
      res.json({ message: "OTP sent" });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/doctor/login/verify",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, otp } = DoctorLoginVerifySchema.parse(req.body);
      const attemptKey = `otp_attempts:${phone}`;
      await checkAttemptLimit(attemptKey);

      const valid = await verifyOtp(phone, otp);
      if (!valid) {
        await recordFailedAttempt(attemptKey);
        throw new AppError(401, "Invalid or expired OTP");
      }
      await clearAttempts(attemptKey);

      const user = await prisma.user.findUnique({ where: { phone }, include: { doctorProfile: true } });
      if (!user || user.role !== "DOCTOR" || user.disabled || !user.doctorProfile?.isApproved) {
        throw new AppError(401, "Unauthorized");
      }

      const payload = { sub: user.id, role: user.role };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);
      setRefreshCookie(res, refreshToken);
      res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role } });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/admin/login",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, password } = AdminLoginSchema.parse(req.body);
      const user = await loginStaff(phone, password);
      const payload = { sub: user.id, role: user.role };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);
      setRefreshCookie(res, refreshToken);
      res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role } });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post("/refresh", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken;
    if (typeof token !== "string") {
      throw new AppError(401, "No refresh token");
    }

    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.disabled) {
      throw new AppError(401, "Unauthorized");
    }

    const newPayload = { sub: user.id, role: user.role };
    const accessToken = signAccessToken(newPayload);
    const refreshToken = signRefreshToken(newPayload);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (_req: Request, res: Response): void => {
  // Browsers only drop a cookie when the clearing Set-Cookie carries the same attributes it was
  // written with, so this has to mirror setRefreshCookie -- otherwise logout would leave the
  // production (SameSite=None; Secure) cookie sitting in the jar, still good for a refresh.
  res.clearCookie("refreshToken", refreshCookieOptions());
  res.json({ message: "Logged out" });
});

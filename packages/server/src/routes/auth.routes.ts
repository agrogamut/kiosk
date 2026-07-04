import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
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
import {
  findActivePatientByPhone,
  loginAdmin,
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

function setRefreshCookie(res: Response, token: string): void {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
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
      } catch {
        activePatient = null;
      }

      if (activePatient) {
        const otp = await storeOtp(phone);
        await sendOtpSms(phone, otp);
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
      const attemptKey = `otp_attempts:${phone}:${req.ip}`;
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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = DoctorRegisterSchema.parse(req.body);
      const user = await registerDoctor(body);
      io.to("admins").emit("doctor:new_registration", { doctorId: user.id, name: user.name });
      res.status(201).json({ message: "Registration submitted, awaiting admin approval" });
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
      const valid = await verifyOtp(phone, otp);
      if (!valid) {
        throw new AppError(401, "Invalid or expired OTP");
      }

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
      const user = await loginAdmin(phone, password);
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
    res.json({ accessToken });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (_req: Request, res: Response): void => {
  res.clearCookie("refreshToken");
  res.json({ message: "Logged out" });
});

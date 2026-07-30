import { randomBytes } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  DoctorProfileUpdateSchema,
  KioskRegisterSchema,
  RevenueConfigUpdateSchema,
  StaffCreateSchema,
  UserUpdateSchema,
  WithdrawRequestSchema,
} from "@madamgy/api-client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { io } from "../index.js";
import {
  completeWithdrawal,
  createWithdrawRequest,
  getWalletBalance,
  listPendingWithdrawals,
  rejectWithdrawal,
} from "../services/wallet.service.js";
import { recordAuditLog } from "../services/audit-log.service.js";
import { getPresignedUrl } from "../services/storage.service.js";
import { getRevenueConfig, updateRevenueConfig } from "../services/revenue-config.service.js";
import { anonymizeUser } from "../services/account-deletion.service.js";
import {
  deactivateKioskDevice,
  forceDeactivateKioskDevice,
  listAllKioskDevices,
  listKioskDevicesForAdmin,
  registerKioskDevice,
} from "../services/kiosk.service.js";

export const adminRouter = Router();

const DisableUserSchema = z.object({ disabled: z.boolean() });

adminRouter.post("/staff", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = StaffCreateSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (existing) {
      throw new AppError(409, "Phone already registered");
    }

    if (data.role === "DOCTOR") {
      const existingProfile = await prisma.doctorProfile.findUnique({ where: { regNumber: data.regNumber } });
      if (existingProfile) {
        throw new AppError(409, "Registration number already in use");
      }
    }

    // PATIENT accounts authenticate by OTP only (see auth.routes.ts /patient/login/otp/*),
    // so there's nothing for a password to gate -- skip issuing one. ADMIN/DOCTOR log in with
    // phone+password, so they need a real (if temporary) credential to get started.
    const tempPin = data.role === "PATIENT" ? null : randomBytes(16).toString("base64url");
    const passwordHash = tempPin ? await bcrypt.hash(tempPin, 12) : null;

    const user = await prisma.user.create({
      data: {
        phone: data.phone,
        name: data.name,
        role: data.role,
        passwordHash,
        ...(data.role === "DOCTOR"
          ? {
              doctorProfile: {
                create: {
                  degree: data.degree,
                  regNumber: data.regNumber,
                  specialization: data.specialization,
                },
              },
            }
          : {}),
      },
    });

    await recordAuditLog(req.user!.sub, "staff.create", user.id, { role: data.role });
    res.status(201).json({ id: user.id, phone: user.phone, name: user.name, role: user.role, tempPin });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/doctors", requireAuth("SUPER_ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: "DOCTOR" },
      include: { doctorProfile: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(doctors);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/doctors/:id/license", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.doctorProfile.findUnique({ where: { userId: req.params.id } });
    if (!profile?.licenseDocKey) {
      throw new AppError(404, "No license document uploaded");
    }

    const url = await getPresignedUrl(profile.licenseDocKey, 3600, {
      "response-content-disposition": "attachment",
    });
    res.json({ url });
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/doctors/:id/approve", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user || user.role !== "DOCTOR") {
      throw new AppError(404, "Doctor not found");
    }

    await prisma.doctorProfile.update({
      where: { userId: req.params.id },
      data: { isApproved: true, approvedAt: new Date(), approvedById: req.user!.sub },
    });

    io.to(`user:${req.params.id}`).emit("doctor:approved");
    await recordAuditLog(req.user!.sub, "doctor.approve", req.params.id);
    res.json({ message: "Doctor approved" });
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/doctors/:id", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = DoctorProfileUpdateSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user || user.role !== "DOCTOR") {
      throw new AppError(404, "Doctor not found");
    }

    const regNumberOwner = await prisma.doctorProfile.findUnique({ where: { regNumber: data.regNumber } });
    if (regNumberOwner && regNumberOwner.userId !== user.id) {
      throw new AppError(409, "Registration number already in use");
    }

    const profile = await prisma.doctorProfile.update({
      where: { userId: user.id },
      data: { degree: data.degree, regNumber: data.regNumber, specialization: data.specialization },
    });
    await recordAuditLog(req.user!.sub, "doctor.update", user.id, { regNumber: data.regNumber });
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/users", requireAuth("SUPER_ADMIN", "ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, phone: true, role: true, disabled: true, createdAt: true },
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

adminRouter.put(
  "/users/:id/disable",
  requireAuth("SUPER_ADMIN", "ADMIN"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { disabled } = DisableUserSchema.parse(req.body);

      if (req.user!.role === "ADMIN") {
        const target = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!target || target.role !== "PATIENT") {
          throw new AppError(403, "Forbidden");
        }
      }

      await prisma.user.update({ where: { id: req.params.id }, data: { disabled } });
      await recordAuditLog(req.user!.sub, disabled ? "user.disable" : "user.enable", req.params.id);
      res.json({ message: disabled ? "User disabled" : "User enabled" });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.put("/users/:id", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = UserUpdateSchema.parse(req.body);

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.deletedAt) {
      throw new AppError(404, "User not found");
    }

    const phoneOwner = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (phoneOwner && phoneOwner.id !== target.id) {
      throw new AppError(409, "Phone already registered to another user");
    }

    const user = await prisma.user.update({ where: { id: target.id }, data: { name: data.name, phone: data.phone } });
    await recordAuditLog(req.user!.sub, "user.update", user.id, { name: data.name, phone: data.phone });
    res.json({ id: user.id, name: user.name, phone: user.phone, role: user.role });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/users/:id", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === req.user!.sub) {
      throw new AppError(400, "Use your own account settings to delete your own account");
    }

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.deletedAt) {
      throw new AppError(404, "User not found");
    }
    // Never allow one super admin to delete another via this route -- a mistaken or malicious
    // click here could lock every operator out of the platform at once. Self-service deletion
    // for other roles already goes through the same anonymizeUser() this route calls.
    if (target.role === "SUPER_ADMIN") {
      throw new AppError(403, "Super admin accounts cannot be deleted here");
    }

    await anonymizeUser(target.id);
    await recordAuditLog(req.user!.sub, "user.delete", target.id, { role: target.role });
    res.json({ message: "User deleted" });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/users/:id", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        disabled: true,
        createdAt: true,
        walletBalance: true,
        patientProfile: true,
        doctorProfile: true,
      },
    });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const [healthFiles, prescriptions, callsAsPatient, callsAsDoctor] = await Promise.all([
      prisma.healthFile.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      prisma.prescription.findMany({
        where: { OR: [{ patientId: user.id }, { doctorId: user.id }] },
        orderBy: { createdAt: "desc" },
        include: {
          patient: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true } },
        },
      }),
      prisma.callSession.findMany({ where: { patientId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.callSession.findMany({ where: { doctorId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

    res.json({ user, healthFiles, prescriptions, callsAsPatient, callsAsDoctor });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/stats", requireAuth("SUPER_ADMIN", "ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [totalPatients, totalDoctors, totalCalls, activeCalls, totalRx] = await Promise.all([
      prisma.user.count({ where: { role: "PATIENT" } }),
      prisma.user.count({ where: { role: "DOCTOR" } }),
      prisma.callSession.count(),
      prisma.callSession.count({ where: { status: { in: ["QUEUED", "RINGING", "ACTIVE"] } } }),
      prisma.prescription.count(),
    ]);
    res.json({ totalPatients, totalDoctors, totalCalls, activeCalls, totalRx });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/calls", requireAuth("SUPER_ADMIN", "ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page ?? "1"), 1);
    const limit = 20;
    const [calls, total] = await Promise.all([
      prisma.callSession.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          patient: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true } },
        },
      }),
      prisma.callSession.count(),
    ]);
    res.json({ calls, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/wallet/withdrawals", requireAuth("SUPER_ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const withdrawals = await listPendingWithdrawals();
    res.json(withdrawals);
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/wallet/withdrawals/:id/complete", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transaction = await completeWithdrawal(req.params.id);
    await recordAuditLog(req.user!.sub, "withdrawal.complete", transaction.id, { amount: transaction.amount.toString() });
    res.json(transaction);
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/wallet/withdrawals/:id/reject", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transaction = await rejectWithdrawal(req.params.id);
    await recordAuditLog(req.user!.sub, "withdrawal.reject", transaction.id);
    res.json(transaction);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/wallet", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const balance = await getWalletBalance(req.user!.sub);
    res.json({ balance: balance.toString() });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/wallet/transactions", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
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

adminRouter.post("/wallet/withdraw", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
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

adminRouter.get("/revenue-config", requireAuth("SUPER_ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getRevenueConfig();
    res.json(config);
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/revenue-config", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = RevenueConfigUpdateSchema.parse(req.body);
    const before = await getRevenueConfig();
    const updated = await updateRevenueConfig(req.user!.sub, data);
    await recordAuditLog(req.user!.sub, "revenue-config.update", updated.id, {
      before: { fee: before.consultationFee.toString(), doctorPct: before.doctorPct.toString(), adminPct: before.adminPct.toString(), superAdminPct: before.superAdminPct.toString() },
      after: { fee: updated.consultationFee.toString(), doctorPct: updated.doctorPct.toString(), adminPct: updated.adminPct.toString(), superAdminPct: updated.superAdminPct.toString() },
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/kiosk-devices/all", requireAuth("SUPER_ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const kiosks = await listAllKioskDevices();
    res.json(kiosks);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/kiosk-devices", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kiosks = await listKioskDevicesForAdmin(req.user!.sub);
    res.json(kiosks);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/kiosk-devices", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceId, label } = KioskRegisterSchema.parse(req.body);
    const kiosk = await registerKioskDevice(req.user!.sub, deviceId, label);
    res.status(201).json(kiosk);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/kiosk-devices/:deviceId", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kiosk = await deactivateKioskDevice(req.user!.sub, req.params.deviceId);
    res.json(kiosk);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete(
  "/kiosk-devices/:deviceId/force",
  requireAuth("SUPER_ADMIN"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kiosk = await forceDeactivateKioskDevice(req.params.deviceId);
      await recordAuditLog(req.user!.sub, "kiosk.force-deactivate", kiosk.id);
      res.json(kiosk);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get("/audit-log", requireAuth("SUPER_ADMIN", "ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page ?? "1"), 1);
    const limit = 50;
    const where = req.user!.role === "ADMIN" ? { actorId: req.user!.sub } : {};
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: { id: true, name: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});

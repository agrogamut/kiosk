import type { SignOptions } from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { parseDateOfBirth } from "../lib/date-of-birth.js";
import { prisma } from "../lib/prisma.js";
import { checkAttemptLimit, clearAttempts, recordFailedAttempt } from "../lib/rate-limit.js";
import { AppError } from "../middleware/error.middleware.js";
import { uploadBuffer } from "./storage.service.js";

export interface JwtPayload {
  sub: string;
  role: UserRole;
}

export function signAccessToken(payload: JwtPayload): string {
  const expiresIn = (process.env.JWT_ACCESS_EXPIRES ?? "15m") as SignOptions["expiresIn"];
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn });
}

export function signRefreshToken(payload: JwtPayload): string {
  const expiresIn = (process.env.JWT_REFRESH_EXPIRES ?? "30d") as SignOptions["expiresIn"];
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as JwtPayload;
}

export async function registerPatient(data: {
  phone: string;
  name: string;
  dob: string;
  pin?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existing) {
    throw new AppError(409, "Phone already registered");
  }

  const dob = parseDateOfBirth(data.dob);
  const pinHash = data.pin ? await bcrypt.hash(data.pin, 12) : null;
  return prisma.user.create({
    data: {
      phone: data.phone,
      name: data.name,
      role: "PATIENT",
      pinHash,
      patientProfile: { create: { dob } },
    },
  });
}

export async function findActivePatientByPhone(phone: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.role !== "PATIENT") {
    throw new AppError(401, "Invalid credentials");
  }
  if (user.disabled) {
    throw new AppError(403, "Account disabled");
  }
  return user;
}

export async function loginPatient(phone: string, pin: string) {
  const attemptsKey = `pin_attempts:${phone}`;
  await checkAttemptLimit(attemptsKey);

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.role !== "PATIENT" || !user.pinHash) {
    throw new AppError(401, "Invalid credentials");
  }
  if (user.disabled) {
    throw new AppError(403, "Account disabled");
  }

  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) {
    await recordFailedAttempt(attemptsKey);
    throw new AppError(401, "Invalid credentials");
  }

  await clearAttempts(attemptsKey);
  return user;
}

export async function registerDoctor(
  data: {
    phone: string;
    name: string;
    password: string;
    degree: string;
    regNumber: string;
    specialization?: string;
  },
  licenseFile?: { buffer: Buffer; mimetype: string },
) {
  const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existing) {
    throw new AppError(409, "Phone already registered");
  }

  const existingProfile = await prisma.doctorProfile.findUnique({
    where: { regNumber: data.regNumber },
  });
  if (existingProfile) {
    throw new AppError(409, "Registration number already in use");
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      phone: data.phone,
      name: data.name,
      role: "DOCTOR",
      passwordHash,
      doctorProfile: {
        create: {
          degree: data.degree,
          regNumber: data.regNumber,
          specialization: data.specialization,
        },
      },
    },
  });

  if (licenseFile) {
    const objectKey = `doctor-verification/${user.id}.pdf`;
    await uploadBuffer(objectKey, licenseFile.buffer, "application/pdf");
    await prisma.doctorProfile.update({ where: { userId: user.id }, data: { licenseDocKey: objectKey } });
  }

  return user;
}

export async function loginDoctorInitiate(phone: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { doctorProfile: true },
  });
  if (!user || user.role !== "DOCTOR" || !user.passwordHash) {
    throw new AppError(401, "Invalid credentials");
  }
  if (user.disabled) {
    throw new AppError(403, "Account disabled");
  }
  if (!user.doctorProfile?.isApproved) {
    throw new AppError(403, "Account pending admin approval");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid credentials");
  }

  return user;
}

export async function loginAdmin(phone: string, password: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.role !== "ADMIN" || !user.passwordHash) {
    throw new AppError(401, "Invalid credentials");
  }
  if (user.disabled) {
    throw new AppError(403, "Account disabled");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid credentials");
  }

  return user;
}

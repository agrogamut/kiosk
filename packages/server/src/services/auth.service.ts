import type { SignOptions } from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { Prisma } from "@prisma/client";
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

/**
 * Rejects a sign-up for a number that is already an account, before any code is sent.
 *
 * Called at the start of sign-up so the caller finds out immediately, rather than after an SMS
 * they'd have to pay for and the user would have to read.
 */
export async function assertPhoneAvailable(phone: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    throw new AppError(409, "Phone already registered");
  }
}

export async function registerPatient(data: {
  phone: string;
  name: string;
  dob: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  email?: string;
  pin?: string;
}) {
  const dob = parseDateOfBirth(data.dob);
  const pinHash = data.pin ? await bcrypt.hash(data.pin, 12) : null;
  try {
    return await prisma.user.create({
      data: {
        phone: data.phone,
        name: data.name,
        role: "PATIENT",
        pinHash,
        patientProfile: {
          create: { dob, gender: data.gender, email: data.email, consentGivenAt: new Date() },
        },
      },
    });
  } catch (error) {
    // The unique index on phone is what actually decides this, not the read above -- two sign-ups
    // for the same number in the same instant both pass a findUnique and only one can insert.
    // Without this the loser surfaces as a 500 instead of the 409 it is.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "Phone already registered");
    }
    throw error;
  }
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
    regYear: string;
    regType: string;
    email: string;
    altMobile?: string;
    gender: "MALE" | "FEMALE" | "OTHER";
    dob: string;
    experienceYears: number;
    city: string;
    state: string;
    pincode?: string;
    address: string;
    about: string;
    specializations: string[];
    educations: { degree: string; institution: string; year?: string }[];
    experiences?: { organization: string; role?: string; years?: string }[];
    hospitals?: { name: string; address?: string }[];
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
  const dob = parseDateOfBirth(data.dob);
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
          specialization: data.specializations.join(", "),
          regYear: data.regYear,
          regType: data.regType,
          email: data.email,
          altMobile: data.altMobile,
          gender: data.gender,
          dob,
          experienceYears: data.experienceYears,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          address: data.address,
          about: data.about,
          specializations: { create: data.specializations.map((name) => ({ name })) },
          educations: { create: data.educations },
          experiences: { create: data.experiences ?? [] },
          hospitals: { create: data.hospitals ?? [] },
        },
      },
    },
  });

  if (licenseFile) {
    const objectKey = `doctor-verification/${user.id}.pdf`;
    try {
      await uploadBuffer(objectKey, licenseFile.buffer, "application/pdf");
      await prisma.doctorProfile.update({ where: { userId: user.id }, data: { licenseDocKey: objectKey } });
    } catch (error) {
      // Storage being down must not lose an otherwise-valid registration -- the account still
      // gets created, just without licenseDocKey set, so it's visibly missing a document to the
      // admin reviewing it instead of vanishing into a 500.
      console.error("License document upload failed, registration still created", error);
    }
  }

  return user;
}

export async function loginDoctorInitiate(phone: string, password: string) {
  const attemptsKey = `password_attempts:${phone}`;
  await checkAttemptLimit(attemptsKey);

  const user = await prisma.user.findUnique({
    where: { phone },
    include: { doctorProfile: true },
  });
  if (!user || user.role !== "DOCTOR" || !user.passwordHash) {
    await recordFailedAttempt(attemptsKey);
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
    await recordFailedAttempt(attemptsKey);
    throw new AppError(401, "Invalid credentials");
  }

  await clearAttempts(attemptsKey);
  return user;
}

export async function loginStaff(phone: string, password: string) {
  const attemptsKey = `password_attempts:${phone}`;
  await checkAttemptLimit(attemptsKey);

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") || !user.passwordHash) {
    await recordFailedAttempt(attemptsKey);
    throw new AppError(401, "Invalid credentials");
  }
  if (user.disabled) {
    throw new AppError(403, "Account disabled");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await recordFailedAttempt(attemptsKey);
    throw new AppError(401, "Invalid credentials");
  }

  await clearAttempts(attemptsKey);
  return user;
}

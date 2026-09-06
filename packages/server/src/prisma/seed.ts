import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;

  if (!phone || !password) {
    throw new Error("ADMIN_PHONE and ADMIN_PASSWORD env vars required");
  }

  let superAdmin = await prisma.user.findUnique({ where: { phone } });
  if (!superAdmin) {
    const passwordHash = await bcrypt.hash(password, 12);
    superAdmin = await prisma.user.create({
      data: { phone, name: "Super Admin", role: "SUPER_ADMIN", passwordHash },
    });
    console.log(`Super admin created: ${phone}`);
  } else {
    console.log("Super admin already exists, skipping user seed");
  }

  const existingConfig = await prisma.revenueConfig.findFirst();
  if (!existingConfig) {
    const consultationFee = Number(process.env.CONSULTATION_FEE ?? "200");
    await prisma.revenueConfig.create({
      data: {
        consultationFee,
        doctorPct: 65,
        adminPct: 25,
        superAdminPct: 10,
        updatedById: superAdmin.id,
      },
    });
    console.log(`Revenue config seeded: fee=${consultationFee}, split=65/25/10`);
  } else {
    console.log("Revenue config already exists, skipping");
  }

  // Patient account for Play Store / Razorpay reviewers. Only created when REVIEW_LOGIN_PHONE
  // is set; it logs in with the fixed REVIEW_LOGIN_OTP (see otp.service.ts). Remove the env
  // vars once the reviews clear -- the account can stay, it just becomes an ordinary patient
  // with no bypass.
  const reviewPhone = process.env.REVIEW_LOGIN_PHONE;
  if (reviewPhone) {
    const existingReviewer = await prisma.user.findUnique({ where: { phone: reviewPhone } });
    if (!existingReviewer) {
      await prisma.user.create({
        data: {
          phone: reviewPhone,
          name: "Store Review Tester",
          role: "PATIENT",
          patientProfile: { create: { dob: new Date("1990-01-01"), consentGivenAt: new Date() } },
        },
      });
      console.log(`Review test patient created: ${reviewPhone}`);
    } else {
      console.log("Review test patient already exists, skipping");
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// Creates (or re-approves) a single already-approved doctor account, for getting a deployment
// into a testable state. The normal path -- self-registration through /doctor/register followed
// by a SUPER_ADMIN approval in the admin panel -- is the one real doctors use and is not replaced
// by this; that path needs a ~20-field form and a working admin login before anyone can place a
// single test call, which is the only reason this shortcut exists.
//
// Run it against whichever database DATABASE_URL points at:
//   DOCTOR_PHONE=9876543210 DOCTOR_PASSWORD=... npm run db:seed:doctor --workspace @madamgy/server
//
// Unlike seed.ts this is NOT wired into the container start command -- it only runs when someone
// asks for it, so a production deploy never grows a doctor account by accident.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const phone = process.env.DOCTOR_PHONE;
  const password = process.env.DOCTOR_PASSWORD;
  const name = process.env.DOCTOR_NAME ?? "Test Doctor";

  if (!phone || !password) {
    throw new Error(
      "DOCTOR_PHONE and DOCTOR_PASSWORD env vars required. DOCTOR_PHONE must be a real phone that can receive SMS -- doctor login is password + OTP, and the OTP goes to this number.",
    );
  }
  if (password.length < 8) {
    throw new Error("DOCTOR_PASSWORD must be at least 8 characters (matches DoctorRegisterSchema)");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { phone }, include: { doctorProfile: true } });

  if (existing && existing.role !== "DOCTOR") {
    throw new Error(`${phone} already exists on this database as ${existing.role} -- pick a different number.`);
  }

  if (existing?.doctorProfile) {
    // Re-runnable on purpose: the common case is "the account is there but I've lost the password"
    // or "it was never approved", and both should be fixable without deleting rows by hand.
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, disabled: false, deletedAt: null },
    });
    await prisma.doctorProfile.update({
      where: { userId: existing.id },
      data: { isApproved: true, approvedAt: new Date(), isAvailable: true },
    });
    console.log(`Doctor ${phone} already existed — password reset, approved, marked available.`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      phone,
      name,
      role: "DOCTOR",
      passwordHash,
      doctorProfile: {
        create: {
          degree: "MBBS",
          // Namespaced by phone so seeding a second test doctor can't collide on the unique index.
          regNumber: `TEST-${phone}`,
          specialization: "General Physician",
          isApproved: true,
          approvedAt: new Date(),
          isAvailable: true,
          about: "Test account for pre-launch call testing.",
          city: "Test City",
          state: "Test State",
          experienceYears: 5,
          educations: { create: [{ degree: "MBBS", institution: "Test Medical College" }] },
          specializations: { create: [{ name: "General Physician" }] },
        },
      },
    },
  });

  console.log(`Approved doctor created: ${phone} (user ${user.id})`);
  console.log("Log in at /?role=doctor with this phone + password; the OTP is sent by SMS to it.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

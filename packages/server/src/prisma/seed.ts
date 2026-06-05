import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;

  if (!phone || !password) {
    throw new Error("ADMIN_PHONE and ADMIN_PASSWORD env vars required");
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log("Admin already exists, skipping seed");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { phone, name: "Admin", role: "ADMIN", passwordHash },
  });

  console.log(`Admin created: ${phone}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

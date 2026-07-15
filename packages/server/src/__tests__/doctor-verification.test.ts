import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../services/auth.service.js";

describe("Doctor verification document upload", () => {
  const phone = "8889000001";

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { phone } });
    if (user) {
      await prisma.doctorProfile.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  it("stores the uploaded license document and exposes it to admin", async () => {
    const registerResponse = await request(app)
      .post("/api/auth/doctor/register")
      .field("data", JSON.stringify({
        phone,
        name: "Verification Doctor",
        password: "password123",
        degree: "MBBS",
        regNumber: "VERIFY-REG-1",
      }))
      .attach("licenseDocument", Buffer.from("%PDF-1.4 fake license content"), "license.pdf");

    expect(registerResponse.status).toBe(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { phone }, include: { doctorProfile: true } });
    expect(user.doctorProfile?.licenseDocKey).toBeTruthy();

    const admin = await prisma.user.create({
      data: { phone: "8889000099", name: "Verify Admin", role: "SUPER_ADMIN", passwordHash: "unused" },
    });
    const adminToken = signAccessToken({ sub: admin.id, role: "SUPER_ADMIN" });

    const licenseResponse = await request(app)
      .get(`/api/admin/doctors/${user.id}/license`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(licenseResponse.status).toBe(200);
    expect(licenseResponse.body.url).toContain("http");

    await prisma.user.deleteMany({ where: { id: admin.id } });
  });
});

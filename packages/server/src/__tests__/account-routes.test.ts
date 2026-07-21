import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";

async function registerTestPatient(phone: string) {
  const response = await request(app)
    .post("/api/auth/patient/register")
    .send({ phone, name: "Delete Route Test", dob: "01/01/1990", consent: true });
  if (!response.body.user) {
    console.error(`Failed to register patient ${phone}:`, response.status, response.body);
  }
  return response.body as { accessToken: string; user: { id: string } };
}

async function registerTestDoctor(phone: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const doctor = await prisma.user.create({
    data: {
      phone,
      name: "Test Doctor",
      role: "DOCTOR",
      passwordHash,
      doctorProfile: {
        create: {
          degree: "MD",
          regNumber: `REG${phone}`,
          isApproved: true,
        },
      },
    },
  });
  return { user: { id: doctor.id } };
}

async function registerTestPrivilegedUser(phone: string, role: "ADMIN" | "SUPER_ADMIN") {
  const passwordHash = await bcrypt.hash("adminpassword123", 12);
  const user = await prisma.user.create({
    data: {
      phone,
      name: `Test ${role}`,
      role,
      passwordHash,
    },
  });
  return { user: { id: user.id } };
}

describe("account deletion routes", () => {
  const createdIds: string[] = [];
  const testPhones = [
    "7778000001",
    "7778000002",
    "7778000003",
    "7778000004",
    "7778000050",
    "8889000001",
    "8889000002",
    "8889000003",
    "9990000001",
    "9990000002",
    "9990000003",
    "9990000004",
    "7778999999",
    "7778999998",
  ];

  beforeAll(async () => {
    // Clear rate limit keys from Redis
    const keys = await redis.keys("account_delete_*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    const otpKeys = await redis.keys("otp:*");
    if (otpKeys.length > 0) {
      await redis.del(...otpKeys);
    }

    // Clean up any existing test users before running tests
    const usersToDelete = await prisma.user.findMany({ where: { phone: { in: testPhones } } });
    for (const user of usersToDelete) {
      await prisma.patientProfile.deleteMany({ where: { userId: user.id } });
      await prisma.doctorProfile.deleteMany({ where: { userId: user.id } });
    }
    await prisma.user.deleteMany({ where: { phone: { in: testPhones } } });
  });

  afterAll(async () => {
    await prisma.patientProfile.deleteMany({ where: { userId: { in: createdIds } } });
    await prisma.doctorProfile.deleteMany({ where: { userId: { in: createdIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
  });

  it("DELETE /api/account/me deletes the authenticated user", async () => {
    const { accessToken, user } = await registerTestPatient("7778000001");
    createdIds.push(user.id);

    const response = await request(app).delete("/api/account/me").set("Authorization", `Bearer ${accessToken}`);
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.deletedAt).not.toBeNull();
  });

  it("rejects an unauthenticated DELETE /api/account/me", async () => {
    const response = await request(app).delete("/api/account/me");
    expect(response.status).toBe(401);
  });

  it("initiate always returns the same message, registered or not", async () => {
    const { user } = await registerTestPatient("7778000002");
    createdIds.push(user.id);

    const registered = await request(app).post("/api/account/delete/initiate").send({ phone: "7778000002" });
    const unregistered = await request(app).post("/api/account/delete/initiate").send({ phone: "7778999999" });

    expect(registered.body.message).toBe(unregistered.body.message);
  });

  it("verify with the dev OTP deletes the account by phone", async () => {
    const { user } = await registerTestPatient("7778000003");
    createdIds.push(user.id);

    const initiateResp = await request(app).post("/api/account/delete/initiate").send({ phone: "7778000003" });
    expect(initiateResp.status).toBe(200);

    const response = await request(app).post("/api/account/delete/verify").send({ phone: "7778000003", otp: "000000" });
    if (response.status !== 200) {
      console.error("Verify failed:", response.status, response.body);
    }

    expect(response.status).toBe(200);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.deletedAt).not.toBeNull();
  });

  it("verify with a wrong OTP is rejected", async () => {
    const { user } = await registerTestPatient("7778000004");
    createdIds.push(user.id);

    await request(app).post("/api/account/delete/initiate").send({ phone: "7778000004" });
    const response = await request(app).post("/api/account/delete/verify").send({ phone: "7778000004", otp: "111111" });

    expect(response.status).toBe(401);
  });

  it("initiate returns same message for deleted account", async () => {
    const { accessToken, user } = await registerTestPatient("7778000050");
    createdIds.push(user.id);

    // Delete the account first
    await request(app).delete("/api/account/me").set("Authorization", `Bearer ${accessToken}`);

    // Try to initiate deletion on the now-deleted account
    const response = await request(app).post("/api/account/delete/initiate").send({ phone: "7778000050" });
    const unregistered = await request(app).post("/api/account/delete/initiate").send({ phone: "7778999998" });

    expect(response.body.message).toBe(unregistered.body.message);
  });

  it("doctor with correct password can delete account", async () => {
    const { user } = await registerTestDoctor("8889000001", "testpassword123");
    createdIds.push(user.id);

    await request(app).post("/api/account/delete/initiate").send({ phone: "8889000001" });
    const response = await request(app).post("/api/account/delete/verify").send({
      phone: "8889000001",
      otp: "000000",
      password: "testpassword123",
    });

    expect(response.status).toBe(200);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.deletedAt).not.toBeNull();
  });

  it("doctor without password is rejected", async () => {
    const { user } = await registerTestDoctor("8889000002", "testpassword123");
    createdIds.push(user.id);

    await request(app).post("/api/account/delete/initiate").send({ phone: "8889000002" });
    const response = await request(app).post("/api/account/delete/verify").send({
      phone: "8889000002",
      otp: "000000",
    });

    expect(response.status).toBe(401);
  });

  it("doctor with wrong password is rejected", async () => {
    const { user } = await registerTestDoctor("8889000003", "testpassword123");
    createdIds.push(user.id);

    await request(app).post("/api/account/delete/initiate").send({ phone: "8889000003" });
    const response = await request(app).post("/api/account/delete/verify").send({
      phone: "8889000003",
      otp: "000000",
      password: "wrongpassword",
    });

    expect(response.status).toBe(401);
  });

  it("initiate returns same message for ADMIN phone as unregistered", async () => {
    const { user } = await registerTestPrivilegedUser("9990000001", "ADMIN");
    createdIds.push(user.id);

    const adminPhone = await request(app).post("/api/account/delete/initiate").send({ phone: "9990000001" });
    const unregistered = await request(app).post("/api/account/delete/initiate").send({ phone: "7778999999" });

    expect(adminPhone.body.message).toBe(unregistered.body.message);
  });

  it("verify rejects ADMIN with 404 even with valid OTP", async () => {
    const { user } = await registerTestPrivilegedUser("9990000002", "ADMIN");
    createdIds.push(user.id);

    // initiate no longer stores an OTP for ADMIN/SUPER_ADMIN phones at all (not just
    // SMS-suppressed) -- seed one directly so this test still proves verify's role check
    // rejects even a technically-valid OTP, without the route needing to store one in prod.
    await redis.set("otp:9990000002", "000000", "EX", 300);
    const response = await request(app).post("/api/account/delete/verify").send({
      phone: "9990000002",
      otp: "000000",
    });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Account not found");
  });

  it("initiate returns same message for SUPER_ADMIN phone as unregistered", async () => {
    const { user } = await registerTestPrivilegedUser("9990000003", "SUPER_ADMIN");
    createdIds.push(user.id);

    const superAdminPhone = await request(app).post("/api/account/delete/initiate").send({ phone: "9990000003" });
    const unregistered = await request(app).post("/api/account/delete/initiate").send({ phone: "7778999998" });

    expect(superAdminPhone.body.message).toBe(unregistered.body.message);
  });

  it("verify rejects SUPER_ADMIN with 404 even with valid OTP", async () => {
    const { user } = await registerTestPrivilegedUser("9990000004", "SUPER_ADMIN");
    createdIds.push(user.id);

    // Same reasoning as the ADMIN case above -- seed the OTP directly since initiate no
    // longer stores one for SUPER_ADMIN phones.
    await redis.set("otp:9990000004", "000000", "EX", 300);
    const response = await request(app).post("/api/account/delete/verify").send({
      phone: "9990000004",
      otp: "000000",
    });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Account not found");
  });
});

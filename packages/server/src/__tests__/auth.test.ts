import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";

async function deleteTestUsers(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { OR: [{ phone: { startsWith: "999900" } }, { phone: { startsWith: "88885" } }] },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length === 0) {
    return;
  }

  const calls = await prisma.callSession.findMany({
    where: { OR: [{ patientId: { in: userIds } }, { doctorId: { in: userIds } }] },
    select: { id: true },
  });
  const callIds = calls.map((call) => call.id);

  await prisma.healthFile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.walletTransaction.deleteMany({ where: { doctorId: { in: userIds } } });
  await prisma.prescription.deleteMany({
    where: {
      OR: [{ patientId: { in: userIds } }, { doctorId: { in: userIds } }, { callSessionId: { in: callIds } }],
    },
  });
  await prisma.chatMessage.deleteMany({
    where: { OR: [{ senderId: { in: userIds } }, { callSessionId: { in: callIds } }] },
  });
  await prisma.callSession.deleteMany({
    where: { OR: [{ patientId: { in: userIds } }, { doctorId: { in: userIds } }] },
  });
  await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.doctorProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await deleteTestUsers();
  const adminPhone = process.env.ADMIN_PHONE ?? "9000000000";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";
  const existingAdmin = await prisma.user.findUnique({ where: { phone: adminPhone } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        phone: adminPhone,
        name: "Admin",
        role: "ADMIN",
        passwordHash: await bcrypt.hash(adminPassword, 12),
      },
    });
  }
});

afterAll(async () => {
  await deleteTestUsers();
  await prisma.$disconnect();
  await redis.quit();
});

describe("Patient auth", () => {
  it("rejects invalid patient registration input", async () => {
    const response = await request(app).post("/api/auth/patient/register").send({
      phone: "9999000000",
      name: "Invalid Patient",
      dob: "01/01/1990",
      pin: "abcd",
    });

    expect(response.status).toBe(400);
  });

  it("rejects invalid patient date of birth", async () => {
    const response = await request(app).post("/api/auth/patient/register").send({
      phone: "9999000000",
      name: "Invalid Patient",
      dob: "77777-08-09",
      pin: "1234",
    });

    expect(response.status).toBe(400);
  });

  it("registers a new patient", async () => {
    const response = await request(app).post("/api/auth/patient/register").send({
      phone: "9999000001",
      name: "Test Patient",
      dob: "01/01/1990",
      pin: "1234",
    });

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.user.role).toBe("PATIENT");
  });

  it("rejects duplicate phone on register", async () => {
    const response = await request(app).post("/api/auth/patient/register").send({
      phone: "9999000001",
      name: "Duplicate Patient",
      dob: "01/01/1990",
      pin: "1234",
    });

    expect(response.status).toBe(409);
  });

  it("logs in with correct PIN", async () => {
    const response = await request(app).post("/api/auth/patient/login").send({
      phone: "9999000001",
      pin: "1234",
    });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeTruthy();
  });

  it("rejects wrong PIN", async () => {
    const response = await request(app).post("/api/auth/patient/login").send({
      phone: "9999000001",
      pin: "0000",
    });

    expect(response.status).toBe(401);
  });

  it("locks after 5 failed attempts", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post("/api/auth/patient/login").send({
        phone: "9999000001",
        pin: "0000",
      });
    }

    const response = await request(app).post("/api/auth/patient/login").send({
      phone: "9999000001",
      pin: "1234",
    });

    expect(response.status).toBe(429);
    await redis.del("pin_attempts:9999000001");
  });

  describe("Patient OTP login", () => {
    it("registers a patient with no pin, then logs in via OTP", async () => {
      const phone = "8888500001";
      const register = await request(app).post("/api/auth/patient/register").send({
        phone,
        name: "OTP Patient",
        dob: "15/06/1985",
      });
      expect(register.status).toBe(201);

      const initiate = await request(app).post("/api/auth/patient/login/otp/initiate").send({ phone });
      expect(initiate.status).toBe(200);

      const verify = await request(app).post("/api/auth/patient/login/otp/verify").send({ phone, otp: "000000" });
      expect(verify.status).toBe(200);
      expect(verify.body.user.role).toBe("PATIENT");
      expect(verify.body.accessToken).toBeTruthy();
    });

    it("rejects a wrong OTP and locks out after 5 attempts", async () => {
      const phone = "8888500002";
      await request(app).post("/api/auth/patient/register").send({
        phone,
        name: "OTP Lockout Patient",
        dob: "15/06/1985",
      });
      await request(app).post("/api/auth/patient/login/otp/initiate").send({ phone });

      for (let i = 0; i < 5; i++) {
        const attempt = await request(app)
          .post("/api/auth/patient/login/otp/verify")
          .send({ phone, otp: "111111" });
        expect(attempt.status).toBe(401);
      }

      const locked = await request(app)
        .post("/api/auth/patient/login/otp/verify")
        .send({ phone, otp: "111111" });
      expect(locked.status).toBe(429);

      await redis.del(`otp_attempts:${phone}`);
    });

    it("returns an identical response for registered and unregistered phone numbers", async () => {
      const registeredPhone = "8888500003";
      await request(app).post("/api/auth/patient/register").send({
        phone: registeredPhone,
        name: "OTP Enum Patient",
        dob: "15/06/1985",
      });

      const unregisteredPhone = "8888500099";

      const registeredResponse = await request(app)
        .post("/api/auth/patient/login/otp/initiate")
        .send({ phone: registeredPhone });
      const unregisteredResponse = await request(app)
        .post("/api/auth/patient/login/otp/initiate")
        .send({ phone: unregisteredPhone });

      expect(registeredResponse.status).toBe(200);
      expect(unregisteredResponse.status).toBe(200);
      expect(registeredResponse.body).toEqual(unregisteredResponse.body);

      const initiateKeys = await redis.keys("otp_initiate_attempts:*");
      if (initiateKeys.length > 0) {
        await redis.del(...initiateKeys);
      }
    });

    it("rejects the initiate request with 429 once the attempt cap is hit", async () => {
      const phone = "8888500004";
      await request(app).post("/api/auth/patient/register").send({
        phone,
        name: "OTP Rate Limit Patient",
        dob: "15/06/1985",
      });

      for (let i = 0; i < 5; i++) {
        const attempt = await request(app).post("/api/auth/patient/login/otp/initiate").send({ phone });
        expect(attempt.status).toBe(200);
      }

      const limited = await request(app).post("/api/auth/patient/login/otp/initiate").send({ phone });
      expect(limited.status).toBe(429);

      const initiateKeys = await redis.keys("otp_initiate_attempts:*");
      if (initiateKeys.length > 0) {
        await redis.del(...initiateKeys);
      }
    });
  });
});

describe("Doctor auth", () => {
  it("registers a doctor pending approval", async () => {
    const response = await request(app)
      .post("/api/auth/doctor/register")
      .field("data", JSON.stringify({
        phone: "9999000002",
        name: "Test Doctor",
        password: "password123",
        degree: "MBBS",
        regNumber: "DOC-9999000002",
        specialization: "General Medicine",
      }));

    expect(response.status).toBe(201);
    expect(response.body.message).toContain("awaiting admin approval");
  });

  it("rejects duplicate doctor phone and registration number", async () => {
    const duplicatePhone = await request(app)
      .post("/api/auth/doctor/register")
      .field("data", JSON.stringify({
        phone: "9999000002",
        name: "Duplicate Doctor",
        password: "password123",
        degree: "MBBS",
        regNumber: "DOC-NEW",
      }));
    const duplicateReg = await request(app)
      .post("/api/auth/doctor/register")
      .field("data", JSON.stringify({
        phone: "9999000003",
        name: "Duplicate Registration",
        password: "password123",
        degree: "MBBS",
        regNumber: "DOC-9999000002",
      }));

    expect(duplicatePhone.status).toBe(409);
    expect(duplicateReg.status).toBe(409);
  });

  it("blocks doctor login before approval", async () => {
    const response = await request(app).post("/api/auth/doctor/login/initiate").send({
      phone: "9999000002",
      password: "password123",
    });

    expect(response.status).toBe(403);
  });

  it("initiates and verifies approved doctor OTP login", async () => {
    const doctor = await prisma.user.findUniqueOrThrow({ where: { phone: "9999000002" } });
    await prisma.doctorProfile.update({ where: { userId: doctor.id }, data: { isApproved: true } });

    const badPassword = await request(app).post("/api/auth/doctor/login/initiate").send({
      phone: "9999000002",
      password: "wrong-password",
    });
    expect(badPassword.status).toBe(401);

    const initiate = await request(app).post("/api/auth/doctor/login/initiate").send({
      phone: "9999000002",
      password: "password123",
    });
    expect(initiate.status).toBe(200);

    const wrongOtp = await request(app).post("/api/auth/doctor/login/verify").send({
      phone: "9999000002",
      otp: "111111",
    });
    expect(wrongOtp.status).toBe(401);

    await request(app).post("/api/auth/doctor/login/initiate").send({
      phone: "9999000002",
      password: "password123",
    });
    const verify = await request(app).post("/api/auth/doctor/login/verify").send({
      phone: "9999000002",
      otp: "000000",
    });

    expect(verify.status).toBe(200);
    expect(verify.body.accessToken).toBeTruthy();
    expect(verify.body.user.role).toBe("DOCTOR");
  });
});

describe("Admin auth", () => {
  it("logs in with env credentials", async () => {
    const response = await request(app).post("/api/auth/admin/login").send({
      phone: process.env.ADMIN_PHONE ?? "9000000000",
      password: process.env.ADMIN_PASSWORD ?? "admin123",
    });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("ADMIN");
  });

  it("rejects invalid admin credentials", async () => {
    const response = await request(app).post("/api/auth/admin/login").send({
      phone: process.env.ADMIN_PHONE ?? "9000000000",
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
  });
});

describe("Session auth", () => {
  it("refreshes access tokens from the refresh cookie", async () => {
    const login = await request(app).post("/api/auth/patient/login").send({
      phone: "9999000001",
      pin: "1234",
    });
    const cookies = login.headers["set-cookie"];
    expect(cookies).toBeTruthy();

    const refresh = await request(app).post("/api/auth/refresh").set("Cookie", cookies);

    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toBeTruthy();
  });

  it("rejects refresh without a cookie", async () => {
    const response = await request(app).post("/api/auth/refresh");

    expect(response.status).toBe(401);
  });

  it("clears the refresh cookie on logout", async () => {
    const response = await request(app).post("/api/auth/logout");

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Logged out");
  });
});

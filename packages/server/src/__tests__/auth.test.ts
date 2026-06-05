import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";

async function deleteTestUsers(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { phone: { startsWith: "9999" } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
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
  it("registers a new patient", async () => {
    const response = await request(app).post("/api/auth/patient/register").send({
      phone: "9999000001",
      name: "Test Patient",
      dob: "1990-01-01",
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
      dob: "1990-01-01",
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
});

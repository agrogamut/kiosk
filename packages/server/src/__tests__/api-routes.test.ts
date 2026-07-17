import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { signAccessToken } from "../services/auth.service.js";
import { ensureBucket } from "../services/storage.service.js";

let adminId: string;
let adminToken: string;
let patientId: string;
let patientToken: string;
let doctorId: string;
let doctorToken: string;
let pendingDoctorId: string;
let callSessionId: string;

async function deleteApiTestData(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { phone: { startsWith: "8888" } },
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
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
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
  await prisma.doctorProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await ensureBucket();
  await deleteApiTestData();

  const admin = await prisma.user.create({
    data: {
      phone: "8888000001",
      name: "API Admin",
      role: "SUPER_ADMIN",
      passwordHash: "x",
    },
  });
  adminId = admin.id;
  adminToken = signAccessToken({ sub: admin.id, role: "SUPER_ADMIN" });

  const patient = await prisma.user.create({
    data: {
      phone: "8888000002",
      name: "API Patient",
      role: "PATIENT",
      pinHash: "x",
      patientProfile: { create: {} },
    },
  });
  patientId = patient.id;
  patientToken = signAccessToken({ sub: patient.id, role: "PATIENT" });

  const doctor = await prisma.user.create({
    data: {
      phone: "8888000003",
      name: "API Doctor",
      role: "DOCTOR",
      passwordHash: "x",
      walletBalance: 250,
      doctorProfile: {
        create: {
          degree: "MBBS",
          regNumber: `API-${randomUUID()}`,
          isApproved: true,
        },
      },
    },
  });
  doctorId = doctor.id;
  doctorToken = signAccessToken({ sub: doctor.id, role: "DOCTOR" });

  const pendingDoctor = await prisma.user.create({
    data: {
      phone: "8888000004",
      name: "Pending Doctor",
      role: "DOCTOR",
      passwordHash: "x",
      doctorProfile: {
        create: { degree: "BAMS", regNumber: `API-PENDING-${randomUUID()}` },
      },
    },
  });
  pendingDoctorId = pendingDoctor.id;

  const call = await prisma.callSession.create({
    data: {
      patientId,
      doctorId,
      status: "ENDED",
      livekitRoom: `api-test-room-${randomUUID()}`,
      startedAt: new Date(),
      endedAt: new Date(),
    },
  });
  callSessionId = call.id;

  await prisma.walletTransaction.create({
    data: {
      userId: doctorId,
      callSessionId,
      amount: 100,
      type: "CREDIT",
      status: "COMPLETED",
      description: "API test credit",
    },
  });
});

afterAll(async () => {
  await deleteApiTestData();
  await prisma.$disconnect();
  await redis.quit();
});

describe("Users API", () => {
  it("returns the current authenticated user with profile data", async () => {
    const response = await request(app).get("/api/users/me").set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(patientId);
    expect(response.body.patientProfile).toBeTruthy();
  });

  it("updates a patient profile", async () => {
    const response = await request(app).put("/api/users/me").set("Authorization", `Bearer ${patientToken}`).send({
      name: "Updated API Patient",
      heightCm: 165,
      weightKg: 58,
      bloodType: "O+",
      dob: "03/02/1991",
    });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Updated API Patient");
    expect(response.body.patientProfile.heightCm).toBe(165);
    expect(response.body.patientProfile.weightKg).toBe(58);
    expect(response.body.patientProfile.bloodType).toBe("O+");
  });

  it("rejects doctor profile updates through patient endpoint", async () => {
    const response = await request(app)
      .put("/api/users/me")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ name: "Wrong Role" });

    expect(response.status).toBe(403);
  });
});

describe("Admin API", () => {
  it("requires admin role", async () => {
    const response = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(403);
  });

  it("lists doctors and approves a pending doctor", async () => {
    const listResponse = await request(app).get("/api/admin/doctors").set("Authorization", `Bearer ${adminToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((doctor: { id: string }) => doctor.id === pendingDoctorId)).toBe(true);

    const approveResponse = await request(app)
      .put(`/api/admin/doctors/${pendingDoctorId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(approveResponse.status).toBe(200);

    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: pendingDoctorId } });
    expect(profile.isApproved).toBe(true);
    expect(profile.approvedById).toBe(adminId);
  });

  it("returns 404 when approving a non-doctor", async () => {
    const response = await request(app)
      .put(`/api/admin/doctors/${patientId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });

  it("lists and disables users", async () => {
    const listResponse = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${adminToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((user: { id: string }) => user.id === patientId)).toBe(true);

    const disableResponse = await request(app)
      .put(`/api/admin/users/${patientId}/disable`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ disabled: true });

    expect(disableResponse.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: patientId } });
    expect(user.disabled).toBe(true);

    await prisma.user.update({ where: { id: patientId }, data: { disabled: false } });
  });

  it("validates disable user payloads", async () => {
    const response = await request(app)
      .put(`/api/admin/users/${patientId}/disable`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ disabled: "yes" });

    expect(response.status).toBe(400);
  });

  it("returns stats and paginated calls", async () => {
    const statsResponse = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${adminToken}`);
    const callsResponse = await request(app).get("/api/admin/calls").set("Authorization", `Bearer ${adminToken}`);

    expect(statsResponse.status).toBe(200);
    expect(statsResponse.body.totalPatients).toBeGreaterThanOrEqual(1);
    expect(statsResponse.body.totalDoctors).toBeGreaterThanOrEqual(2);
    expect(callsResponse.status).toBe(200);
    expect(callsResponse.body.calls.some((call: { id: string }) => call.id === callSessionId)).toBe(true);
  });

  it("rejects a kiosk ADMIN from a SUPER_ADMIN-only route but allows the shared operational route", async () => {
    const passwordHash = await bcrypt.hash("kiosk-pass", 12);
    const kioskAdmin = await prisma.user.create({
      data: { phone: "8888700002", name: "Kiosk Admin Route Test", role: "ADMIN", passwordHash },
    });
    const kioskToken = signAccessToken({ sub: kioskAdmin.id, role: "ADMIN" });

    const forbidden = await request(app)
      .get("/api/admin/wallet/withdrawals")
      .set("Authorization", `Bearer ${kioskToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${kioskToken}`);
    expect(allowed.status).toBe(200);

    await prisma.user.delete({ where: { id: kioskAdmin.id } });
  });

  it("restricts a kiosk ADMIN to disabling only PATIENT accounts", async () => {
    const passwordHash = await bcrypt.hash("kiosk-pass", 12);
    const kioskAdmin = await prisma.user.create({
      data: { phone: "8888700003", name: "Kiosk Admin Disable Test", role: "ADMIN", passwordHash },
    });
    const kioskToken = signAccessToken({ sub: kioskAdmin.id, role: "ADMIN" });

    const forbidden = await request(app)
      .put(`/api/admin/users/${doctorId}/disable`)
      .set("Authorization", `Bearer ${kioskToken}`)
      .send({ disabled: true });
    expect(forbidden.status).toBe(403);

    const doctorAfter = await prisma.user.findUniqueOrThrow({ where: { id: doctorId } });
    expect(doctorAfter.disabled).toBe(false);

    const allowed = await request(app)
      .put(`/api/admin/users/${patientId}/disable`)
      .set("Authorization", `Bearer ${kioskToken}`)
      .send({ disabled: true });
    expect(allowed.status).toBe(200);

    const patientAfter = await prisma.user.findUniqueOrThrow({ where: { id: patientId } });
    expect(patientAfter.disabled).toBe(true);

    await prisma.user.update({ where: { id: patientId }, data: { disabled: false } });
    await prisma.auditLog.deleteMany({ where: { actorId: kioskAdmin.id } });
    await prisma.user.delete({ where: { id: kioskAdmin.id } });
  });
});

describe("Doctor wallet API", () => {
  it("returns wallet balance and transactions", async () => {
    const balanceResponse = await request(app).get("/api/doctor/wallet").set("Authorization", `Bearer ${doctorToken}`);
    const transactionsResponse = await request(app)
      .get("/api/doctor/wallet/transactions")
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(balanceResponse.status).toBe(200);
    expect(balanceResponse.body.balance).toBe("250");
    expect(transactionsResponse.status).toBe(200);
    expect(transactionsResponse.body.transactions).toHaveLength(1);
  });

  it("rejects wallet endpoints for patients", async () => {
    const response = await request(app).get("/api/doctor/wallet").set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(403);
  });

  it("rejects withdrawals above the available balance", async () => {
    const response = await request(app).post("/api/doctor/wallet/withdraw").set("Authorization", `Bearer ${doctorToken}`).send({
      amount: 300,
      bankName: "Test Bank",
      accountNumber: "1234567890",
      ifsc: "TEST0001",
      holderName: "API Doctor",
    });

    expect(response.status).toBe(400);
  });

  it("creates one pending withdrawal and rejects duplicates", async () => {
    const payload = {
      amount: 50,
      bankName: "Test Bank",
      accountNumber: "1234567890",
      ifsc: "TEST0001",
      holderName: "API Doctor",
    };

    const createResponse = await request(app)
      .post("/api/doctor/wallet/withdraw")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send(payload);
    const duplicateResponse = await request(app)
      .post("/api/doctor/wallet/withdraw")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send(payload);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.type).toBe("DEBIT");
    expect(createResponse.body.status).toBe("PENDING");
    expect(duplicateResponse.status).toBe(409);
  });
});

describe("Health files API", () => {
  it("returns an empty health folder", async () => {
    const response = await request(app).get("/api/health-files").set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("returns 404 for a missing file", async () => {
    const response = await request(app).get(`/api/health-files/${randomUUID()}`).set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(404);
  });

  it("rejects uploads without a file", async () => {
    const response = await request(app).post("/api/health-files").set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(400);
  });

  it("uploads, fetches, lists, and deletes a lab report", async () => {
    const uploadResponse = await request(app)
      .post("/api/health-files")
      .set("Authorization", `Bearer ${patientToken}`)
      .attach("file", Buffer.from("lab report"), {
        filename: "lab-report.pdf",
        contentType: "application/pdf",
      });

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body.name).toBe("lab-report.pdf");
    expect(uploadResponse.body.type).toBe("LAB_REPORT");
    expect(uploadResponse.body.url).toContain("lab-report.pdf");

    const fileId = uploadResponse.body.id as string;
    const getResponse = await request(app).get(`/api/health-files/${fileId}`).set("Authorization", `Bearer ${patientToken}`);
    const listResponse = await request(app).get("/api/health-files").set("Authorization", `Bearer ${patientToken}`);
    const deleteResponse = await request(app).delete(`/api/health-files/${fileId}`).set("Authorization", `Bearer ${patientToken}`);
    const missingAfterDelete = await request(app).get(`/api/health-files/${fileId}`).set("Authorization", `Bearer ${patientToken}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(fileId);
    expect(getResponse.body.url).toBeTruthy();
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((file: { id: string }) => file.id === fileId)).toBe(true);
    expect(deleteResponse.status).toBe(200);
    expect(missingAfterDelete.status).toBe(404);
  });

  it("rejects health folder listing for doctors", async () => {
    const response = await request(app).get("/api/health-files").set("Authorization", `Bearer ${doctorToken}`);

    expect(response.status).toBe(403);
  });

  it("rejects access to another patient's file before presigning", async () => {
    const file = await prisma.healthFile.create({
      data: {
        userId: patientId,
        name: "Private Lab Report",
        type: "LAB_REPORT",
        objectKey: "health-files/private.pdf",
        sizeBytes: 10,
      },
    });

    const response = await request(app).get(`/api/health-files/${file.id}`).set("Authorization", `Bearer ${doctorToken}`);

    expect(response.status).toBe(403);
  });

  it("rejects deleting prescriptions and missing files", async () => {
    const prescriptionFile = await prisma.healthFile.create({
      data: {
        userId: patientId,
        name: "Prescription",
        type: "PRESCRIPTION",
        objectKey: "prescriptions/private.pdf",
        sizeBytes: 10,
      },
    });
    const prescriptionDelete = await request(app)
      .delete(`/api/health-files/${prescriptionFile.id}`)
      .set("Authorization", `Bearer ${patientToken}`);
    const missingDelete = await request(app)
      .delete(`/api/health-files/${randomUUID()}`)
      .set("Authorization", `Bearer ${patientToken}`);

    expect(prescriptionDelete.status).toBe(400);
    expect(missingDelete.status).toBe(404);
  });
});

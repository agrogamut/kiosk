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

  it("lets SUPER_ADMIN create an ADMIN staff account directly", async () => {
    const response = await request(app)
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ phone: "8888700003", name: "New Kiosk Owner", role: "ADMIN" });

    expect(response.status).toBe(201);
    expect(response.body.role).toBe("ADMIN");
    expect(typeof response.body.tempPin).toBe("string");

    const created = await prisma.user.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(created.passwordHash).not.toBeNull();

    await prisma.user.delete({ where: { id: response.body.id } });
  });

  it("lets SUPER_ADMIN create a DOCTOR staff account with real license fields, then the doctor uploads their license", async () => {
    const createResponse = await request(app)
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        phone: "8888700006",
        name: "Staff Doctor",
        role: "DOCTOR",
        degree: "MBBS",
        regNumber: "STAFF-DOC-REG-1",
      });
    expect(createResponse.status).toBe(201);

    const doctorToken = signAccessToken({ sub: createResponse.body.id, role: "DOCTOR" });
    const uploadResponse = await request(app)
      .post("/api/doctor/license")
      .set("Authorization", `Bearer ${doctorToken}`)
      .attach("licenseDocument", Buffer.from("%PDF-1.4 fake license content"), "license.pdf");
    expect(uploadResponse.status).toBe(200);

    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: createResponse.body.id } });
    expect(profile.degree).toBe("MBBS");
    expect(profile.licenseDocKey).toBeTruthy();

    await prisma.doctorProfile.deleteMany({ where: { userId: createResponse.body.id } });
    await prisma.user.delete({ where: { id: createResponse.body.id } });
  });

  it("rejects a staff DOCTOR creation with a regNumber already in use", async () => {
    const first = await request(app)
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ phone: "8888700007", name: "First Reg Doctor", role: "DOCTOR", degree: "MBBS", regNumber: "STAFF-DOC-REG-DUPE" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ phone: "8888700008", name: "Second Reg Doctor", role: "DOCTOR", degree: "BAMS", regNumber: "STAFF-DOC-REG-DUPE" });
    expect(second.status).toBe(409);

    await prisma.doctorProfile.deleteMany({ where: { userId: first.body.id } });
    await prisma.user.delete({ where: { id: first.body.id } });
  });

  it("rejects staff creation from a non-SUPER_ADMIN role", async () => {
    const response = await request(app)
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ phone: "8888700004", name: "Nope", role: "ADMIN" });

    expect(response.status).toBe(403);
  });

  it("lets SUPER_ADMIN create a PATIENT account without an OTP or password", async () => {
    const response = await request(app)
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ phone: "8888700012", name: "Walk-in Patient", role: "PATIENT" });

    expect(response.status).toBe(201);
    expect(response.body.role).toBe("PATIENT");
    expect(response.body.tempPin).toBeNull();

    const created = await prisma.user.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(created.passwordHash).toBeNull();

    await prisma.user.delete({ where: { id: response.body.id } });
  });

  it("lets SUPER_ADMIN edit a user's name and phone, but rejects a phone already taken", async () => {
    const target = await prisma.user.create({
      data: { phone: "8888700013", name: "Editable User", role: "PATIENT" },
    });

    const response = await request(app)
      .put(`/api/admin/users/${target.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Renamed User", phone: "8888700014" });
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.name).toBe("Renamed User");
    expect(updated.phone).toBe("8888700014");

    const conflict = await request(app)
      .put(`/api/admin/users/${target.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Renamed User", phone: "8888000002" });
    expect(conflict.status).toBe(409);

    await prisma.user.delete({ where: { id: target.id } });
  });

  it("rejects a non-SUPER_ADMIN editing a user", async () => {
    const response = await request(app)
      .put(`/api/admin/users/${patientId}`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ name: "Nope", phone: "8888700015" });
    expect(response.status).toBe(403);
  });

  it("lets SUPER_ADMIN anonymize-delete a user, but blocks targeting SUPER_ADMIN or self", async () => {
    const target = await prisma.user.create({
      data: { phone: "8888700016", name: "Deletable User", role: "PATIENT" },
    });
    const otherSuperAdmin = await prisma.user.create({
      data: { phone: "8888700017", name: "Other Super Admin", role: "SUPER_ADMIN", passwordHash: "x" },
    });

    const blockedTarget = await request(app)
      .delete(`/api/admin/users/${otherSuperAdmin.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(blockedTarget.status).toBe(403);

    const blockedSelf = await request(app)
      .delete(`/api/admin/users/${adminId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(blockedSelf.status).toBe(400);

    const response = await request(app)
      .delete(`/api/admin/users/${target.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(response.status).toBe(200);

    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(deleted.deletedAt).not.toBeNull();

    await prisma.user.delete({ where: { id: otherSuperAdmin.id } });
  });

  it("lets SUPER_ADMIN edit a doctor's profile, but rejects a regNumber already in use", async () => {
    const editableDoctor = await prisma.user.create({
      data: {
        phone: "8888700018",
        name: "Editable Doctor",
        role: "DOCTOR",
        passwordHash: "x",
        doctorProfile: { create: { degree: "BAMS", regNumber: "STAFF-DOC-EDIT-ORIGINAL" } },
      },
    });
    const takenRegDoctor = await prisma.user.create({
      data: {
        phone: "8888700019",
        name: "Reg Taken Doctor",
        role: "DOCTOR",
        passwordHash: "x",
        doctorProfile: { create: { degree: "MBBS", regNumber: "STAFF-DOC-EDIT-TAKEN" } },
      },
    });

    const response = await request(app)
      .put(`/api/admin/doctors/${editableDoctor.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ degree: "MD", regNumber: "STAFF-DOC-EDIT-NEW", specialization: "Cardiology" });
    expect(response.status).toBe(200);

    const updated = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: editableDoctor.id } });
    expect(updated.degree).toBe("MD");
    expect(updated.regNumber).toBe("STAFF-DOC-EDIT-NEW");
    expect(updated.specialization).toBe("Cardiology");

    const conflict = await request(app)
      .put(`/api/admin/doctors/${editableDoctor.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ degree: "MD", regNumber: "STAFF-DOC-EDIT-TAKEN" });
    expect(conflict.status).toBe(409);

    await prisma.doctorProfile.deleteMany({ where: { userId: { in: [editableDoctor.id, takenRegDoctor.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [editableDoctor.id, takenRegDoctor.id] } } });
  });

  it("returns 404 editing a non-doctor via the doctor profile route", async () => {
    const response = await request(app)
      .put(`/api/admin/doctors/${patientId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ degree: "MD", regNumber: "STAFF-DOC-EDIT-NONE" });
    expect(response.status).toBe(404);
  });

  it("lets SUPER_ADMIN see kiosk devices platform-wide, but rejects ADMIN from that route", async () => {
    const passwordHash = await bcrypt.hash("pw12345", 10);
    const ownAdmin = await prisma.user.create({
      data: { phone: "8888700020", name: "Platform Devices Admin", role: "ADMIN", passwordHash },
    });
    const ownToken = signAccessToken({ sub: ownAdmin.id, role: "ADMIN" });

    await prisma.kiosk.create({ data: { deviceId: "device-platform-test", adminId: ownAdmin.id, active: true } });

    const asAdmin = await request(app).get("/api/admin/kiosk-devices/all").set("Authorization", `Bearer ${ownToken}`);
    expect(asAdmin.status).toBe(403);

    const asSuperAdmin = await request(app)
      .get("/api/admin/kiosk-devices/all")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(asSuperAdmin.status).toBe(200);
    const platformKiosk = asSuperAdmin.body.find((kiosk: { deviceId: string }) => kiosk.deviceId === "device-platform-test");
    expect(platformKiosk).toBeDefined();
    expect(platformKiosk.admin.id).toBe(ownAdmin.id);

    await prisma.kiosk.deleteMany({ where: { deviceId: "device-platform-test" } });
    await prisma.user.delete({ where: { id: ownAdmin.id } });
  });

  it("lets an ADMIN list only their own kiosk devices", async () => {
    const passwordHash = await bcrypt.hash("pw12345", 10);
    const ownAdmin = await prisma.user.create({
      data: { phone: "8888700009", name: "Devices Admin Own", role: "ADMIN", passwordHash },
    });
    const otherAdmin = await prisma.user.create({
      data: { phone: "8888700010", name: "Devices Admin Other", role: "ADMIN", passwordHash },
    });
    const ownToken = signAccessToken({ sub: ownAdmin.id, role: "ADMIN" });

    await prisma.kiosk.create({ data: { deviceId: "device-list-test-own", adminId: ownAdmin.id, active: true } });
    await prisma.kiosk.create({ data: { deviceId: "device-list-test-other", adminId: otherAdmin.id, active: true } });

    const response = await request(app).get("/api/admin/kiosk-devices").set("Authorization", `Bearer ${ownToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].deviceId).toBe("device-list-test-own");

    await prisma.kiosk.deleteMany({ where: { deviceId: { in: ["device-list-test-own", "device-list-test-other"] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownAdmin.id, otherAdmin.id] } } });
  });

  it("scopes the audit log to the caller's own actions for an ADMIN, but not for SUPER_ADMIN", async () => {
    const passwordHash = await bcrypt.hash("pw12345", 10);
    const scopedAdmin = await prisma.user.create({
      data: { phone: "8888700011", name: "Audit Scoped Admin", role: "ADMIN", passwordHash },
    });
    const scopedToken = signAccessToken({ sub: scopedAdmin.id, role: "ADMIN" });

    await prisma.auditLog.create({ data: { actorId: scopedAdmin.id, action: "test.own-action" } });
    await prisma.auditLog.create({ data: { actorId: adminId, action: "test.other-action" } });

    const asAdmin = await request(app).get("/api/admin/audit-log").set("Authorization", `Bearer ${scopedToken}`);
    const asSuperAdmin = await request(app).get("/api/admin/audit-log").set("Authorization", `Bearer ${adminToken}`);

    expect(asAdmin.status).toBe(200);
    const adminActions = asAdmin.body.logs.map((log: { action: string }) => log.action);
    expect(adminActions).toContain("test.own-action");
    expect(adminActions).not.toContain("test.other-action");

    expect(asSuperAdmin.status).toBe(200);
    const superAdminActions = asSuperAdmin.body.logs.map((log: { action: string }) => log.action);
    expect(superAdminActions).toContain("test.own-action");
    expect(superAdminActions).toContain("test.other-action");

    await prisma.auditLog.deleteMany({ where: { action: { in: ["test.own-action", "test.other-action"] } } });
    await prisma.user.deleteMany({ where: { id: scopedAdmin.id } });
  });

  it("accepts a public contact-us submission and lists it for SUPER_ADMIN only", async () => {
    const submitResponse = await request(app)
      .post("/api/support/contact")
      .send({ name: "Worried Patient", phone: "8888700030", message: "The video call keeps freezing." });

    expect(submitResponse.status).toBe(201);

    const asAdmin = await request(app).get("/api/admin/support-messages").set("Authorization", `Bearer ${doctorToken}`);
    expect(asAdmin.status).toBe(403);

    const asSuperAdmin = await request(app).get("/api/admin/support-messages").set("Authorization", `Bearer ${adminToken}`);
    expect(asSuperAdmin.status).toBe(200);
    const submitted = asSuperAdmin.body.find((entry: { phone: string }) => entry.phone === "8888700030");
    expect(submitted).toBeDefined();
    expect(submitted.message).toBe("The video call keeps freezing.");

    await prisma.contactMessage.deleteMany({ where: { phone: "8888700030" } });
  });

  it("rejects a contact-us submission missing required fields", async () => {
    const response = await request(app).post("/api/support/contact").send({ name: "No Phone" });

    expect(response.status).toBe(400);
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

  it("lets an ADMIN check their own wallet and request a withdrawal, but not see another user's", async () => {
    const admin = await prisma.user.create({
      data: { phone: "8888700005", name: "Wallet Admin", role: "ADMIN", passwordHash: "x", walletBalance: 100 },
    });
    const adminToken2 = signAccessToken({ sub: admin.id, role: "ADMIN" });

    const balance = await request(app)
      .get("/api/admin/wallet")
      .set("Authorization", `Bearer ${adminToken2}`);
    expect(balance.status).toBe(200);
    expect(balance.body.balance).toBe("100");

    const withdraw = await request(app)
      .post("/api/admin/wallet/withdraw")
      .set("Authorization", `Bearer ${adminToken2}`)
      .send({ amount: 50, bankName: "Test Bank", accountNumber: "12345", ifsc: "TEST0001", holderName: "Wallet Admin" });
    expect(withdraw.status).toBe(201);

    const forbidden = await request(app)
      .get("/api/doctor/wallet")
      .set("Authorization", `Bearer ${adminToken2}`);
    expect(forbidden.status).toBe(403);

    await prisma.walletTransaction.deleteMany({ where: { userId: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
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

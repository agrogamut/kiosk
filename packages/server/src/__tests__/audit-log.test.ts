import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../services/auth.service.js";

describe("Audit log", () => {
  let adminId: string;
  let adminToken: string;
  let doctorId: string;
  let withdrawalDoctorId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: "8888900001", name: "Audit Admin", role: "ADMIN", passwordHash: "unused" },
    });
    adminId = admin.id;
    adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" });

    const doctor = await prisma.user.create({
      data: {
        phone: "8888900002",
        name: "Audit Doctor",
        role: "DOCTOR",
        doctorProfile: { create: { degree: "MBBS", regNumber: "AUDIT-REG-1" } },
      },
    });
    doctorId = doctor.id;

    const withdrawalDoctor = await prisma.user.create({
      data: {
        phone: "8888900003",
        name: "Audit Withdrawal Doctor",
        role: "DOCTOR",
        doctorProfile: { create: { degree: "MBBS", regNumber: "AUDIT-REG-2", walletBalance: 200 } },
      },
    });
    withdrawalDoctorId = withdrawalDoctor.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.walletTransaction.deleteMany({ where: { doctorId: withdrawalDoctorId } });
    await prisma.doctorProfile.deleteMany({ where: { userId: { in: [doctorId, withdrawalDoctorId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, doctorId, withdrawalDoctorId] } } });
  });

  it("records an audit log entry when an admin approves a doctor", async () => {
    const response = await request(app)
      .put(`/api/admin/doctors/${doctorId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(response.status).toBe(200);

    const logs = await prisma.auditLog.findMany({ where: { actorId: adminId, action: "doctor.approve" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].targetId).toBe(doctorId);
  });

  it("records an audit log entry when an admin completes a withdrawal", async () => {
    const txn = await prisma.walletTransaction.create({
      data: {
        doctorId: withdrawalDoctorId,
        amount: 50,
        type: "DEBIT",
        status: "PENDING",
        description: "Withdrawal to Test Bank 1234",
      },
    });

    const response = await request(app)
      .put(`/api/admin/wallet/withdrawals/${txn.id}/complete`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(response.status).toBe(200);

    const logs = await prisma.auditLog.findMany({ where: { actorId: adminId, action: "withdrawal.complete" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].targetId).toBe(txn.id);
  });

  it("records an audit log entry when an admin rejects a withdrawal", async () => {
    const txn = await prisma.walletTransaction.create({
      data: {
        doctorId: withdrawalDoctorId,
        amount: 50,
        type: "DEBIT",
        status: "PENDING",
        description: "Withdrawal to Test Bank 5678",
      },
    });

    const response = await request(app)
      .put(`/api/admin/wallet/withdrawals/${txn.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(response.status).toBe(200);

    const logs = await prisma.auditLog.findMany({ where: { actorId: adminId, action: "withdrawal.reject" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].targetId).toBe(txn.id);
  });
});

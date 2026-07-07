import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../services/auth.service.js";

describe("Audit log", () => {
  let adminId: string;
  let adminToken: string;
  let doctorId: string;

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
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, doctorId] } } });
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
});

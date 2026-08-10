import { randomUUID } from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../services/auth.service.js";

// Messages have always been persisted by chat.handler.ts, but nothing read them back, so the
// panel showed "No messages yet" after any reload while the conversation sat in the database.
describe("GET /api/chat/:callSessionId/messages", () => {
  let patientId: string;
  let doctorId: string;
  let outsiderId: string;
  let patientToken: string;
  let doctorToken: string;
  let outsiderToken: string;
  let callSessionId: string;

  beforeAll(async () => {
    const patient = await prisma.user.create({
      data: { phone: "9999500001", name: "Chat Patient", role: "PATIENT" },
    });
    patientId = patient.id;
    patientToken = signAccessToken({ sub: patientId, role: "PATIENT" });

    const doctor = await prisma.user.create({
      data: {
        phone: "9999500002",
        name: "Chat Doctor",
        role: "DOCTOR",
        doctorProfile: { create: { degree: "MBBS", regNumber: "CHAT-REG-1", isApproved: true, isAvailable: false } },
      },
    });
    doctorId = doctor.id;
    doctorToken = signAccessToken({ sub: doctorId, role: "DOCTOR" });

    const outsider = await prisma.user.create({
      data: { phone: "9999500003", name: "Chat Outsider", role: "PATIENT" },
    });
    outsiderId = outsider.id;
    outsiderToken = signAccessToken({ sub: outsiderId, role: "PATIENT" });

    const call = await prisma.callSession.create({
      data: {
        patientId,
        doctorId,
        status: "ACTIVE",
        livekitRoom: `chat-history-room-${randomUUID()}`,
        startedAt: new Date(),
      },
    });
    callSessionId = call.id;

    await prisma.chatMessage.create({
      data: { callSessionId, senderId: patientId, type: "TEXT", content: "my throat hurts" },
    });
    await prisma.chatMessage.create({
      data: { callSessionId, senderId: doctorId, type: "TEXT", content: "since when?" },
    });
  });

  afterAll(async () => {
    await prisma.chatMessage.deleteMany({ where: { callSessionId } });
    await prisma.callSession.deleteMany({ where: { id: callSessionId } });
    await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [patientId, doctorId, outsiderId] } } });
  });

  it("returns the conversation in order, with sender names, to the patient", async () => {
    const response = await request(app)
      .get(`/api/chat/${callSessionId}/messages`)
      .set("Authorization", `Bearer ${patientToken}`)
      .expect(200);

    expect(response.body.messages).toHaveLength(2);
    expect(response.body.messages[0].content).toBe("my throat hurts");
    expect(response.body.messages[1].content).toBe("since when?");
    // The panel decides own/other alignment from senderId and labels from sender.name.
    expect(response.body.messages[0].senderId).toBe(patientId);
    expect(response.body.messages[1].sender.name).toBe("Chat Doctor");
  });

  it("returns the same conversation to the doctor on the call", async () => {
    const response = await request(app)
      .get(`/api/chat/${callSessionId}/messages`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .expect(200);

    expect(response.body.messages).toHaveLength(2);
  });

  it("refuses someone who is not on the call", async () => {
    await request(app)
      .get(`/api/chat/${callSessionId}/messages`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .expect(403);
  });

  it("refuses an unauthenticated caller", async () => {
    await request(app).get(`/api/chat/${callSessionId}/messages`).expect(401);
  });
});

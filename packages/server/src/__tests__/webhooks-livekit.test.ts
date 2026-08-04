import { createHash } from "node:crypto";
import request from "supertest";
import { AccessToken } from "livekit-server-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";

async function signedWebhookHeaders(bodyString: string): Promise<Record<string, string>> {
  const hash = createHash("sha256").update(bodyString).digest("base64");
  const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
  token.sha256 = hash;
  const jwt = await token.toJwt();
  return { Authorize: jwt, "Content-Type": "application/webhook+json" };
}

describe("POST /api/webhooks/livekit", () => {
  let patientId: string;
  let doctorId: string;
  let callId: string;

  beforeAll(async () => {
    const patient = await prisma.user.create({
      data: { phone: "8888800001", name: "Webhook Patient", role: "PATIENT" },
    });
    patientId = patient.id;
    const doctor = await prisma.user.create({
      data: {
        phone: "8888800002",
        name: "Webhook Doctor",
        role: "DOCTOR",
        doctorProfile: { create: { degree: "MBBS", regNumber: "WEBHOOK-REG-1", isApproved: true } },
      },
    });
    doctorId = doctor.id;
    const call = await prisma.callSession.create({
      data: { patientId, doctorId, status: "ACTIVE", livekitRoom: "room-webhook-test", startedAt: new Date() },
    });
    callId = call.id;
  });

  afterAll(async () => {
    await prisma.walletTransaction.deleteMany({ where: { userId: doctorId } });
    await prisma.callSession.deleteMany({ where: { id: callId } });
    await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [patientId, doctorId] } } });
  });

  it("ends the call when its room's room_finished event arrives", async () => {
    const body = JSON.stringify({ event: "room_finished", room: { name: "room-webhook-test" } });
    const headers = await signedWebhookHeaders(body);

    const response = await request(app).post("/api/webhooks/livekit").set(headers).send(body);
    expect(response.status).toBe(200);

    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("ENDED");
  });

  it("rejects a payload with an invalid signature", async () => {
    const body = JSON.stringify({ event: "room_finished", room: { name: "room-webhook-test" } });

    const response = await request(app)
      .post("/api/webhooks/livekit")
      .set({ Authorize: "not-a-real-token", "Content-Type": "application/webhook+json" })
      .send(body);

    expect(response.status).toBe(400);
  });

  it("ignores events for rooms with no matching call session", async () => {
    const body = JSON.stringify({ event: "room_finished", room: { name: "room-does-not-exist" } });
    const headers = await signedWebhookHeaders(body);

    const response = await request(app).post("/api/webhooks/livekit").set(headers).send(body);
    expect(response.status).toBe(200);
  });

  it("does not re-complete a call that is already ENDED", async () => {
    const endedCall = await prisma.callSession.create({
      data: {
        patientId,
        doctorId,
        status: "ENDED",
        livekitRoom: "room-webhook-already-ended",
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });

    const body = JSON.stringify({ event: "room_finished", room: { name: "room-webhook-already-ended" } });
    const headers = await signedWebhookHeaders(body);

    const response = await request(app).post("/api/webhooks/livekit").set(headers).send(body);
    expect(response.status).toBe(200);

    const callAfter = await prisma.callSession.findUniqueOrThrow({ where: { id: endedCall.id } });
    expect(callAfter.status).toBe("ENDED");

    await prisma.callSession.delete({ where: { id: endedCall.id } });
  });
});

import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";

async function registerTestPatient(phone: string) {
  const response = await request(app)
    .post("/api/auth/patient/register")
    .send({ phone, name: "Delete Route Test", dob: "01/01/1990", consent: true });
  return response.body as { accessToken: string; user: { id: string } };
}

describe("account deletion routes", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await prisma.patientProfile.deleteMany({ where: { userId: { in: createdIds } } });
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

    await request(app).post("/api/account/delete/initiate").send({ phone: "7778000003" });
    const response = await request(app).post("/api/account/delete/verify").send({ phone: "7778000003", otp: "000000" });

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
});

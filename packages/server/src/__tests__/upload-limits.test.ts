import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../services/auth.service.js";

// An oversized upload used to reach the catch-all handler and come back as a 500
// "Internal server error", so a photo straight from a phone camera looked like a broken server
// rather than a file the user needed to shrink.
describe("upload size limits", () => {
  let doctorId: string;
  let doctorToken: string;

  beforeAll(async () => {
    const doctor = await prisma.user.create({
      data: {
        phone: "9999700001",
        name: "Upload Doctor",
        role: "DOCTOR",
        doctorProfile: { create: { degree: "MBBS", regNumber: "UPLOAD-REG-1", isApproved: true } },
      },
    });
    doctorId = doctor.id;
    doctorToken = signAccessToken({ sub: doctorId, role: "DOCTOR" });
  });

  afterAll(async () => {
    await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({ where: { id: doctorId } });
  });

  it("answers an oversized photo with 413 and an actionable message", async () => {
    const tooBig = Buffer.alloc(11 * 1024 * 1024, 1);

    const response = await request(app)
      .post("/api/doctor/photo")
      .set("Authorization", `Bearer ${doctorToken}`)
      .attach("photo", tooBig, { filename: "huge.jpg", contentType: "image/jpeg" });

    expect(response.status).toBe(413);
    expect(response.body.message).toMatch(/too large/i);
  });

  it("accepts a photo of the size a phone camera actually produces", async () => {
    // The previous 5MB cap rejected ordinary camera output.
    const sixMegabytes = Buffer.alloc(6 * 1024 * 1024, 1);

    const response = await request(app)
      .post("/api/doctor/photo")
      .set("Authorization", `Bearer ${doctorToken}`)
      .attach("photo", sixMegabytes, { filename: "camera.jpg", contentType: "image/jpeg" });

    expect(response.status).toBe(200);
    expect(response.body.photoUrl).toContain("/api/files/");
  });
});

import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { storeOtp } from "../services/otp.service.js";

function validDoctorRegisterPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phone: "9999000002",
    name: "Test Doctor",
    password: "password123",
    degree: "MBBS",
    regNumber: "DOC-9999000002",
    regYear: "2015",
    regType: "Medical Council of India",
    email: "doctor@example.com",
    gender: "MALE",
    dob: "01/01/1990",
    experienceYears: 5,
    city: "Mumbai",
    state: "Maharashtra",
    address: "123 Health St",
    about: "Experienced general physician.",
    specializations: ["General Medicine"],
    educations: [{ degree: "MBBS", institution: "Grant Medical College", year: "2012" }],
    ...overrides,
  };
}

// Sign-up is two calls now: details plus a code sent to the phone, then the code. Outside
// production storeOtp always writes "000000", so a test can request one and spend it.
async function registerPatient(payload: Record<string, unknown>) {
  const initiate = await request(app).post("/api/auth/patient/register/initiate").send(payload);
  if (initiate.status !== 200) {
    return initiate;
  }
  return request(app).post("/api/auth/patient/register").send({ ...payload, otp: "000000" });
}

async function deleteTestUsers(): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { phone: { startsWith: "999900" } },
        { phone: { startsWith: "88885" } },
        { phone: { startsWith: "88891" } },
        { phone: { startsWith: "88887" } },
      ],
    },
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
        role: "SUPER_ADMIN",
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
    const response = await request(app).post("/api/auth/patient/register/initiate").send({
      phone: "9999000000",
      name: "Invalid Patient",
      dob: "01/01/1990",
      pin: "abcd",
    });

    expect(response.status).toBe(400);
  });

  it("rejects invalid patient date of birth", async () => {
    const response = await request(app).post("/api/auth/patient/register/initiate").send({
      phone: "9999000000",
      name: "Invalid Patient",
      dob: "77777-08-09",
      pin: "1234",
    });

    expect(response.status).toBe(400);
  });

  it("registers a new patient", async () => {
    const response = await registerPatient({
      phone: "9999000001",
      name: "Test Patient",
      dob: "01/01/1990",
      gender: "FEMALE",
      email: "test.patient@example.com",
      pin: "1234",
      consent: true,
    });

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.user.role).toBe("PATIENT");

    const profile = await prisma.patientProfile.findUnique({ where: { userId: response.body.user.id } });
    expect(profile?.gender).toBe("FEMALE");
    expect(profile?.email).toBe("test.patient@example.com");
  });

  it("registers a patient without gender or email (both optional)", async () => {
    const response = await registerPatient({
      phone: "9999000013",
      name: "No Optional Fields Patient",
      dob: "01/01/1990",
      pin: "1234",
      consent: true,
    });

    expect(response.status).toBe(201);
    const profile = await prisma.patientProfile.findUnique({ where: { userId: response.body.user.id } });
    expect(profile?.gender).toBeNull();
    expect(profile?.email).toBeNull();
  });

  // Caught at the first step, before an SMS goes out, so a taken number costs nothing to reject.
  it("rejects duplicate phone on register", async () => {
    const response = await request(app).post("/api/auth/patient/register/initiate").send({
      phone: "9999000001",
      name: "Duplicate Patient",
      dob: "01/01/1990",
      pin: "1234",
      consent: true,
    });

    expect(response.status).toBe(409);
  });

  it("rejects patient registration without consent", async () => {
    const response = await request(app).post("/api/auth/patient/register/initiate").send({
      phone: "8889100001",
      name: "No Consent Patient",
      dob: "01/01/1990",
    });
    expect(response.status).toBe(400);
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
      const register = await registerPatient({
        phone,
        name: "OTP Patient",
        dob: "15/06/1985",
        consent: true,
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
      await registerPatient({
        phone,
        name: "OTP Lockout Patient",
        dob: "15/06/1985",
        consent: true,
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
      await registerPatient({
        phone: registeredPhone,
        name: "OTP Enum Patient",
        dob: "15/06/1985",
        consent: true,
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
      await registerPatient({
        phone,
        name: "OTP Rate Limit Patient",
        dob: "15/06/1985",
        consent: true,
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

  // Sign-up used to be a single call that created the account and returned a session outright, so
  // anyone could open an account on a number they don't own -- taking a session tied to a stranger
  // and permanently burning that number for whoever actually holds it.
  describe("Patient registration phone verification", () => {
    const payload = (phone: string) => ({ phone, name: "Gate Patient", dob: "15/06/1985", consent: true });

    it("does not create an account from the details alone", async () => {
      const phone = "8888700001";
      const initiate = await request(app).post("/api/auth/patient/register/initiate").send(payload(phone));

      expect(initiate.status).toBe(200);
      expect(await prisma.user.findUnique({ where: { phone } })).toBeNull();
    });

    it("refuses to register without a code", async () => {
      const phone = "8888700002";
      await request(app).post("/api/auth/patient/register/initiate").send(payload(phone));

      const response = await request(app).post("/api/auth/patient/register").send(payload(phone));

      expect(response.status).toBe(400);
      expect(await prisma.user.findUnique({ where: { phone } })).toBeNull();
    });

    it("refuses to register with the wrong code", async () => {
      const phone = "8888700003";
      await request(app).post("/api/auth/patient/register/initiate").send(payload(phone));

      const response = await request(app)
        .post("/api/auth/patient/register")
        .send({ ...payload(phone), otp: "111111" });

      expect(response.status).toBe(401);
      expect(await prisma.user.findUnique({ where: { phone } })).toBeNull();
      await redis.del(`register_otp_attempts:${phone}`);
    });

    it("refuses to register with a code that was never requested", async () => {
      const phone = "8888700004";

      const response = await request(app)
        .post("/api/auth/patient/register")
        .send({ ...payload(phone), otp: "000000" });

      expect(response.status).toBe(401);
      expect(await prisma.user.findUnique({ where: { phone } })).toBeNull();
      await redis.del(`register_otp_attempts:${phone}`);
    });

    // A code issued to sign someone in is proof of nothing about opening a new account on that
    // number -- shared key space would make every login SMS a sign-up token for the same phone.
    it("refuses to spend a login code on a registration", async () => {
      const phone = "8888700005";
      await storeOtp(phone, "login");

      const response = await request(app)
        .post("/api/auth/patient/register")
        .send({ ...payload(phone), otp: "000000" });

      expect(response.status).toBe(401);
      expect(await prisma.user.findUnique({ where: { phone } })).toBeNull();
      await redis.del(`otp:${phone}`, `register_otp_attempts:${phone}`);
    });

    it("locks the registration out after five wrong codes", async () => {
      const phone = "8888700006";
      await request(app).post("/api/auth/patient/register/initiate").send(payload(phone));

      for (let i = 0; i < 5; i++) {
        const attempt = await request(app)
          .post("/api/auth/patient/register")
          .send({ ...payload(phone), otp: "111111" });
        expect(attempt.status).toBe(401);
      }

      const locked = await request(app)
        .post("/api/auth/patient/register")
        .send({ ...payload(phone), otp: "111111" });
      expect(locked.status).toBe(429);

      await redis.del(`register_otp_attempts:${phone}`);
    });

    it("creates the account once the code checks out", async () => {
      const phone = "8888700007";
      await request(app).post("/api/auth/patient/register/initiate").send(payload(phone));

      const response = await request(app)
        .post("/api/auth/patient/register")
        .send({ ...payload(phone), otp: "000000" });

      expect(response.status).toBe(201);
      expect(response.body.accessToken).toBeTruthy();
      expect(await prisma.user.findUnique({ where: { phone } })).not.toBeNull();
    });

    it("will not let one code create two accounts", async () => {
      const phone = "8888700008";
      await request(app).post("/api/auth/patient/register/initiate").send(payload(phone));

      const first = await request(app)
        .post("/api/auth/patient/register")
        .send({ ...payload(phone), otp: "000000" });
      const replay = await request(app)
        .post("/api/auth/patient/register")
        .send({ ...payload(phone), phone: "8888700009", otp: "000000" });

      expect(first.status).toBe(201);
      expect(replay.status).toBe(401);
      expect(await prisma.user.findUnique({ where: { phone: "8888700009" } })).toBeNull();
      await redis.del("register_otp_attempts:8888700009");
    });

    afterAll(async () => {
      const keys = await redis.keys("register_initiate_attempts:*");
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    });
  });
});

describe("Doctor auth", () => {
  it("registers a doctor pending approval", async () => {
    const response = await request(app)
      .post("/api/auth/doctor/register")
      .field("data", JSON.stringify(validDoctorRegisterPayload()));

    expect(response.status).toBe(201);
    expect(response.body.message).toContain("awaiting admin approval");
  });

  it("rejects duplicate doctor phone and registration number", async () => {
    const duplicatePhone = await request(app)
      .post("/api/auth/doctor/register")
      .field("data", JSON.stringify(validDoctorRegisterPayload({ name: "Duplicate Doctor", regNumber: "DOC-NEW" })));
    const duplicateReg = await request(app)
      .post("/api/auth/doctor/register")
      .field("data", JSON.stringify(
        validDoctorRegisterPayload({ phone: "9999000003", name: "Duplicate Registration" }),
      ));

    expect(duplicatePhone.status).toBe(409);
    expect(duplicateReg.status).toBe(409);
  });

  it("rejects a license document that is not a valid PDF", async () => {
    const response = await request(app)
      .post("/api/auth/doctor/register")
      .field("data", JSON.stringify({
        phone: "9999000009",
        name: "Fake License Doctor",
        password: "password123",
        regNumber: "DOC-9999000009",
        degree: "MBBS",
      }))
      .attach("licenseDocument", Buffer.from("just a plain text file, not a pdf"), {
        filename: "license.pdf",
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);
  });

  it("counts rejected non-PDF uploads toward the rate limit", async () => {
    const existingKeys = await redis.keys("doctor_register_attempts:*");
    if (existingKeys.length > 0) {
      await redis.del(...existingKeys);
    }

    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post("/api/auth/doctor/register")
        .field("data", JSON.stringify({
          phone: "9999000011",
          name: "Spoofed Mimetype Doctor",
          password: "password123",
          degree: "MBBS",
          regNumber: `DOC-SPOOF-${i}`,
        }))
        .attach("licenseDocument", Buffer.from("just a plain text file, not a pdf"), {
          filename: "license.pdf",
          contentType: "text/plain",
        });

      expect(response.status).toBe(400);
    }

    const limited = await request(app)
      .post("/api/auth/doctor/register")
      .field("data", JSON.stringify({
        phone: "9999000012",
        name: "Should Be Blocked After Spoofed Uploads",
        password: "password123",
        degree: "MBBS",
        regNumber: "DOC-9999000012",
      }));

    expect(limited.status).toBe(429);

    const cleanupKeys = await redis.keys("doctor_register_attempts:*");
    if (cleanupKeys.length > 0) {
      await redis.del(...cleanupKeys);
    }
  });

  it("counts failed registration attempts toward the rate limit, not just successes", async () => {
    const existingKeys = await redis.keys("doctor_register_attempts:*");
    if (existingKeys.length > 0) {
      await redis.del(...existingKeys);
    }

    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post("/api/auth/doctor/register")
        .field("data", JSON.stringify(
          validDoctorRegisterPayload({ name: "Rate Limit Doctor", regNumber: `DOC-RATE-${i}` }),
        ));

      expect(response.status).toBe(409);
    }

    const limited = await request(app)
      .post("/api/auth/doctor/register")
      .field("data", JSON.stringify({
        phone: "9999000010",
        name: "Should Be Blocked",
        password: "password123",
        degree: "MBBS",
        regNumber: "DOC-9999000010",
      }));

    expect(limited.status).toBe(429);

    const cleanupKeys = await redis.keys("doctor_register_attempts:*");
    if (cleanupKeys.length > 0) {
      await redis.del(...cleanupKeys);
    }
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
    expect(response.body.user.role).toBe("SUPER_ADMIN");
  });

  it("rejects invalid admin credentials", async () => {
    const response = await request(app).post("/api/auth/admin/login").send({
      phone: process.env.ADMIN_PHONE ?? "9000000000",
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
  });

  it("logs in a kiosk ADMIN through the same /admin/login route", async () => {
    const passwordHash = await bcrypt.hash("kiosk-pass-123", 12);
    const kioskAdmin = await prisma.user.create({
      data: { phone: "8888700001", name: "Kiosk Admin", role: "ADMIN", passwordHash },
    });

    const response = await request(app).post("/api/auth/admin/login").send({
      phone: "8888700001",
      password: "kiosk-pass-123",
    });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("ADMIN");

    await prisma.user.delete({ where: { id: kioskAdmin.id } });
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

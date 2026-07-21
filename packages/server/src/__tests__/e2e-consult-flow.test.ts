import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ChildProcess, spawn } from "child_process";
import bcrypt from "bcryptjs";
import axios, { type AxiosInstance } from "axios";
import FormData from "form-data";
import { io as ioClient, type Socket } from "socket.io-client";
import { prisma } from "../lib/prisma.js";

// This test boots the REAL server (workers + sockets enabled) as a child process, rather than
// importing `app` directly like the rest of the suite (which runs under NODE_ENV=test, where
// workers are deliberately disabled). It drives the full consult flow over real HTTP and a real
// socket.io connection, with no mocks, so it genuinely waits on queue processing (BullMQ ->
// worker -> DB -> socket emit) instead of using fake timers. Expect several real seconds of wall
// clock time for this test to complete -- that is expected, not a hang.

const PORT = 3901;
const BASE = `http://localhost:${PORT}/api`;

let serverProcess: ChildProcess;
let api: AxiosInstance;

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await axios.get(`${BASE}/health`, { timeout: 1000 });
      if (response.status === 200) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("server did not become healthy in time");
}

async function ensureAdmin(): Promise<{ phone: string; password: string }> {
  const phone = process.env.ADMIN_PHONE ?? "9000000000";
  const password = process.env.ADMIN_PASSWORD ?? "admin123";
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (!existing) {
    await prisma.user.create({
      data: {
        phone,
        name: "Admin",
        role: "SUPER_ADMIN",
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
  }
  return { phone, password };
}

describe("Full consult flow (real workers + sockets, no mocks)", () => {
  beforeAll(async () => {
    serverProcess = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(PORT),
        // Deliberately NOT hardcoded: inherited from the outer process's DATABASE_URL/REDIS_URL
        // (via the spread above) so this works unchanged against both the local worktree's docker
        // ports (55432/56379) and CI's service-container ports (5432/6379, db "madamgy_test").
        JWT_ACCESS_SECRET: "e2e-test-access-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        JWT_REFRESH_SECRET: "e2e-test-refresh-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        LIVEKIT_HOST: "ws://localhost:7880",
        LIVEKIT_API_KEY: "devkey",
        LIVEKIT_API_SECRET: "devsecretdevsecretdevsecret",
        MINIO_ENDPOINT: "localhost",
        MINIO_PORT: "19000",
        MINIO_ACCESS_KEY: "madamgy",
        MINIO_SECRET_KEY: "madamgy123",
        MINIO_BUCKET: "madamgy",
        MINIO_USE_SSL: "false",
        CONSULTATION_FEE: "200",
        WEB_URL: "*",
        REQUIRE_PAYMENT_FOR_CALLS: "false",
        STALE_CALL_REAPER_ENABLED: "false",
      },
      stdio: "pipe",
    });

    api = axios.create({ baseURL: BASE, validateStatus: () => true });
    await waitForHealth();
    await ensureAdmin();
  }, 30_000);

  afterAll(async () => {
    // Wait for the spawned server to actually exit before letting the next test file
    // run. It has real BullMQ workers listening on the same shared Redis queues every
    // other test file's app instance also enqueues jobs into (those jobs normally sit
    // inert under NODE_ENV=test, since no in-process worker consumes them) -- if this
    // process is still shutting down when the next file starts, it can pick up and
    // process that file's jobs for real, creating rows that file's own cleanup never
    // expects and doesn't account for.
    await new Promise<void>((resolve) => {
      if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
        resolve();
        return;
      }

      const forceKillTimer = setTimeout(() => {
        serverProcess.kill("SIGKILL");
      }, 5000);

      serverProcess.once("exit", () => {
        clearTimeout(forceKillTimer);
        resolve();
      });

      serverProcess.kill();
    });
  }, 10_000);

  it("drives registration through wallet credit end to end", async () => {
    const rand = Math.floor(Math.random() * 1e8);
    const patientPhone = `70001${rand}`.slice(0, 12);
    const doctorPhone = `80001${rand}`.slice(0, 12);
    const { phone: adminPhone, password: adminPassword } = await ensureAdmin();

    const patientRegister = await api.post("/auth/patient/register", {
      phone: patientPhone,
      name: "E2E Patient",
      dob: "01/01/1990",
      consent: true,
    });
    expect(patientRegister.status).toBe(201);
    const patientToken: string = patientRegister.data.accessToken;

    // Doctor registration is multipart/form-data (Task 9): a "data" field carrying the JSON
    // payload, plus an optional licenseDocument file field. A plain axios.post(url, {...}) with a
    // JSON body would 400, since the route only reads req.body.data after multer parses the
    // multipart form.
    const doctorForm = new FormData();
    doctorForm.append(
      "data",
      JSON.stringify({
        phone: doctorPhone,
        name: "E2E Doctor",
        password: "password123",
        degree: "MBBS",
        regNumber: `E2E-REG-${rand}`,
      }),
    );
    const doctorRegister = await api.post("/auth/doctor/register", doctorForm, {
      headers: doctorForm.getHeaders(),
    });
    expect(doctorRegister.status).toBe(201);

    const adminLogin = await api.post("/auth/admin/login", { phone: adminPhone, password: adminPassword });
    expect(adminLogin.status).toBe(200);
    const adminToken: string = adminLogin.data.accessToken;

    const doctors = await api.get("/admin/doctors", { headers: { Authorization: `Bearer ${adminToken}` } });
    const doctor = doctors.data.find((d: { phone: string }) => d.phone === doctorPhone);
    expect(doctor).toBeTruthy();

    const approve = await api.put(`/admin/doctors/${doctor.id}/approve`, {}, { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(approve.status).toBe(200);

    await api.post("/auth/doctor/login/initiate", { phone: doctorPhone, password: "password123" });
    const doctorLogin = await api.post("/auth/doctor/login/verify", { phone: doctorPhone, otp: "000000" });
    expect(doctorLogin.status).toBe(200);
    const doctorToken: string = doctorLogin.data.accessToken;

    const patientSocket: Socket = ioClient(`http://localhost:${PORT}`, { auth: { token: patientToken } });
    const doctorSocket: Socket = ioClient(`http://localhost:${PORT}`, { auth: { token: doctorToken } });

    await new Promise<void>((resolve, reject) => {
      let connected = 0;
      const done = () => {
        connected++;
        if (connected === 2) resolve();
      };
      patientSocket.on("connect", done);
      doctorSocket.on("connect", done);
      patientSocket.on("connect_error", reject);
      doctorSocket.on("connect_error", reject);
      setTimeout(() => reject(new Error("socket connect timeout")), 5000);
    });

    // Real doctor clients heartbeat over "presence:ping" (packages/web/src/pages/doctor/Dashboard.tsx)
    // so assign-doctor.worker's Redis heartbeat check treats them as reachable; simulate that here.
    doctorSocket.emit("presence:ping");
    await new Promise((resolve) => setTimeout(resolve, 300));

    const incomingPromise = new Promise<{ callSession: { id: string } }>((resolve, reject) => {
      doctorSocket.once("call:incoming", resolve);
      setTimeout(() => reject(new Error("call:incoming timeout")), 8000);
    });

    const createCall = await api.post("/calls", {}, { headers: { Authorization: `Bearer ${patientToken}` } });
    expect(createCall.status).toBe(201);
    const callSessionId: string = createCall.data.id;

    const incoming = await incomingPromise;
    expect(incoming.callSession.id).toBe(callSessionId);

    const acceptedPromise = new Promise<{ patient?: { livekitToken: string }; doctor?: { livekitToken: string } }>((resolve, reject) => {
      const results: { patient?: { livekitToken: string }; doctor?: { livekitToken: string } } = {};
      let got = 0;
      patientSocket.once("call:accepted", (data: { livekitToken: string }) => {
        results.patient = data;
        got++;
        if (got === 2) resolve(results);
      });
      doctorSocket.once("call:accepted", (data: { livekitToken: string }) => {
        results.doctor = data;
        got++;
        if (got === 2) resolve(results);
      });
      setTimeout(() => reject(new Error("call:accepted timeout")), 5000);
    });
    doctorSocket.emit("call:accept", { callSessionId });
    const accepted = await acceptedPromise;
    expect(accepted.patient?.livekitToken).toBeTruthy();
    expect(accepted.patient!.livekitToken.length).toBeGreaterThan(20);
    expect(accepted.doctor?.livekitToken).toBeTruthy();
    expect(accepted.doctor!.livekitToken.length).toBeGreaterThan(20);

    const endedPromise = new Promise<void>((resolve, reject) => {
      patientSocket.once("call:ended", () => resolve());
      setTimeout(() => reject(new Error("call:ended timeout")), 15000);
    });

    const submitRx = await api.post(
      "/prescriptions",
      { callSessionId, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Rest and fluids" }] }] } },
      { headers: { Authorization: `Bearer ${doctorToken}` } },
    );
    expect(submitRx.status).toBe(202);

    await endedPromise;

    const wallet = await api.get("/doctor/wallet", { headers: { Authorization: `Bearer ${doctorToken}` } });
    expect(Number(wallet.data.balance)).toBeGreaterThan(0);

    patientSocket.close();
    doctorSocket.close();
  }, 30_000);

  it("matches a doctor who logs in after the patient already started searching", async () => {
    const rand = Math.floor(Math.random() * 1e8);
    const patientPhone = `70002${rand}`.slice(0, 12);
    const doctorPhone = `80002${rand}`.slice(0, 12);
    const { phone: adminPhone, password: adminPassword } = await ensureAdmin();

    const patientRegister = await api.post("/auth/patient/register", {
      phone: patientPhone,
      name: "E2E Late Patient",
      dob: "01/01/1990",
      consent: true,
    });
    expect(patientRegister.status).toBe(201);
    const patientToken: string = patientRegister.data.accessToken;

    const doctorForm = new FormData();
    doctorForm.append(
      "data",
      JSON.stringify({
        phone: doctorPhone,
        name: "E2E Late Doctor",
        password: "password123",
        degree: "MBBS",
        regNumber: `E2E-REG-LATE-${rand}`,
      }),
    );
    const doctorRegister = await api.post("/auth/doctor/register", doctorForm, {
      headers: doctorForm.getHeaders(),
    });
    expect(doctorRegister.status).toBe(201);

    const adminLogin = await api.post("/auth/admin/login", { phone: adminPhone, password: adminPassword });
    expect(adminLogin.status).toBe(200);
    const adminToken: string = adminLogin.data.accessToken;

    const doctors = await api.get("/admin/doctors", { headers: { Authorization: `Bearer ${adminToken}` } });
    const doctor = doctors.data.find((d: { phone: string }) => d.phone === doctorPhone);
    expect(doctor).toBeTruthy();
    const approve = await api.put(`/admin/doctors/${doctor.id}/approve`, {}, { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(approve.status).toBe(200);

    await api.post("/auth/doctor/login/initiate", { phone: doctorPhone, password: "password123" });
    const doctorLogin = await api.post("/auth/doctor/login/verify", { phone: doctorPhone, otp: "000000" });
    expect(doctorLogin.status).toBe(200);
    const doctorToken: string = doctorLogin.data.accessToken;

    // Patient starts searching while no doctor is online at all -- no socket connected yet, so
    // no heartbeat exists and the assign-doctor job's immediate first attempt finds nobody.
    const createCall = await api.post("/calls", {}, { headers: { Authorization: `Bearer ${patientToken}` } });
    expect(createCall.status).toBe(201);
    const callSessionId: string = createCall.data.id;

    // Let the first attempt run and fail before the doctor shows up, so this genuinely exercises
    // the "doctor logs in later" path rather than winning a lucky race against it.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const doctorSocket: Socket = ioClient(`http://localhost:${PORT}`, { auth: { token: doctorToken } });
    await new Promise<void>((resolve, reject) => {
      doctorSocket.on("connect", () => resolve());
      doctorSocket.on("connect_error", reject);
      setTimeout(() => reject(new Error("doctor socket connect timeout")), 5000);
    });

    const incomingPromise = new Promise<{ callSession: { id: string } }>((resolve, reject) => {
      doctorSocket.once("call:incoming", resolve);
      // Well under the 20s scheduled-retry interval: only presence.handler.ts's nudge on
      // "presence:ping" (not the assign-doctor job's own backoff schedule) can plausibly
      // deliver this in time, so this proves the nudge path specifically.
      setTimeout(() => reject(new Error("call:incoming timeout -- presence nudge did not fire")), 6000);
    });

    doctorSocket.emit("presence:ping");
    const incoming = await incomingPromise;
    expect(incoming.callSession.id).toBe(callSessionId);

    doctorSocket.close();
  }, 20_000);

  it("keeps a call's credited split fixed even if RevenueConfig changes afterward", async () => {
    const { updateRevenueConfig, getRevenueConfig } = await import("../services/revenue-config.service.js");
    const { markPaymentPaid } = await import("../services/payment.service.js");
    const { completeCall } = await import("../services/call-completion.service.js");

    const originalConfig = await getRevenueConfig();
    const originalDoctorPct = Number(originalConfig.doctorPct);

    let doctorId: string | undefined;
    let patientId: string | undefined;
    let callId: string | undefined;
    let configChanged = false;

    try {
      const doctor = await prisma.user.create({
        data: {
          phone: "9999600001",
          name: "Snapshot Doctor",
          role: "DOCTOR",
          doctorProfile: { create: { degree: "MBBS", regNumber: "SNAPSHOT-REG-1", isApproved: true } },
        },
      });
      doctorId = doctor.id;
      const patient = await prisma.user.create({
        data: { phone: "9999600002", name: "Snapshot Patient", role: "PATIENT", pinHash: "x" },
      });
      patientId = patient.id;

      // Not calling the real createPaymentOrder here: it hits the live Razorpay orders API, and
      // this environment (like the rest of this suite -- see the skipped "creates a real Razorpay
      // order" test in payments.test.ts) only has placeholder RAZORPAY_KEY_ID/SECRET, so that call
      // 401s. Instead, replicate exactly what createPaymentOrder writes to the DB -- a Payment row
      // snapshotting the *current* RevenueConfig's fee and split -- which is the only part of it
      // this test cares about. markPaymentPaid and completeCall below are the real, unmocked
      // service functions.
      const config = await getRevenueConfig();
      const order = {
        razorpayOrderId: `order_snapshot_test_${Date.now()}`,
        amount: Number(config.consultationFee),
      };
      await prisma.payment.create({
        data: {
          patientId: patient.id,
          amount: order.amount,
          razorpayOrderId: order.razorpayOrderId,
          status: "CREATED",
          doctorPct: config.doctorPct,
          adminPct: config.adminPct,
          superAdminPct: config.superAdminPct,
        },
      });
      await markPaymentPaid(order.razorpayOrderId, "razorpay_pay_snapshot_test");

      const call = await prisma.callSession.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          status: "ACTIVE",
          livekitRoom: "room-snapshot-test",
          startedAt: new Date(),
        },
      });
      callId = call.id;
      await prisma.payment.update({
        where: { razorpayOrderId: order.razorpayOrderId },
        data: { callSessionId: call.id },
      });

      // Use the config's existing owner as the actor for these updates, not doctor.id: RevenueConfig
      // .updatedById is a required FK with no cascade, and this test deletes the doctor row in its
      // own cleanup below, so attributing the update to a row we're about to delete would leave
      // RevenueConfig pointing at nothing and fail that cleanup with a foreign key violation.
      await updateRevenueConfig(originalConfig.updatedById, {
        consultationFee: 999,
        doctorPct: 10,
        adminPct: 10,
        superAdminPct: 80,
      });
      configChanged = true;

      await completeCall(call.id);

      const doctorTxn = await prisma.walletTransaction.findFirstOrThrow({
        where: { callSessionId: call.id, userId: doctor.id },
      });
      expect(Number(doctorTxn.amount)).toBeCloseTo(Number(order.amount) * (originalDoctorPct / 100), 2);
      expect(Number(doctorTxn.amount)).not.toBeCloseTo(999 * 0.1, 2);
    } finally {
      // Runs even if an assertion above throws, so a failed run can never leave the shared
      // RevenueConfig singleton mutated or orphan unique-phone users that would block every
      // subsequent run of this test.
      if (configChanged) {
        await updateRevenueConfig(originalConfig.updatedById, {
          consultationFee: Number(originalConfig.consultationFee),
          doctorPct: Number(originalConfig.doctorPct),
          adminPct: Number(originalConfig.adminPct),
          superAdminPct: Number(originalConfig.superAdminPct),
        });
      }
      if (callId) {
        await prisma.walletTransaction.deleteMany({ where: { callSessionId: callId } });
      }
      if (patientId) {
        await prisma.payment.deleteMany({ where: { patientId } });
      }
      if (callId) {
        await prisma.callSession.delete({ where: { id: callId } });
      }
      if (doctorId) {
        await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
      }
      const idsToDelete = [doctorId, patientId].filter((id): id is string => Boolean(id));
      if (idsToDelete.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: idsToDelete } } });
      }
    }
  });
});

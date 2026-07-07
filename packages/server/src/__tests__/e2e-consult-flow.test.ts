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
        role: "ADMIN",
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

  afterAll(() => {
    serverProcess.kill();
  });

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

    doctorSocket.emit("doctor:toggle_available", { isAvailable: true });
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

    const acceptedPromise = new Promise<void>((resolve, reject) => {
      let got = 0;
      const check = () => {
        got++;
        if (got === 2) resolve();
      };
      patientSocket.once("call:accepted", check);
      doctorSocket.once("call:accepted", check);
      setTimeout(() => reject(new Error("call:accepted timeout")), 5000);
    });
    doctorSocket.emit("call:accept", { callSessionId });
    await acceptedPromise;

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
});

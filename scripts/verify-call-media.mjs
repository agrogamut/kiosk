import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes, randomInt } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { RoomServiceClient } from "livekit-server-sdk";

process.loadEnvFile();
const base = process.env.CALL_VERIFY_URL ?? "http://localhost:5173";
const output = resolve(process.env.CALL_VERIFY_OUTPUT ?? "data/uploads/call-verification/media");
assert.equal(process.env.CALL_VERIFY_SCRATCH, "1", "Set CALL_VERIFY_SCRATCH=1 only for disposable local services");
assert.equal(process.env.NODE_ENV, "development", "The login flow requires development OTPs");
for (const url of [base, process.env.DATABASE_URL, process.env.LIVEKIT_HOST]) {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname), "Use local services only");
}
assert.equal(process.env.REQUIRE_PAYMENT_FOR_CALLS, "false", "This verifier does not initiate provider payments");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
await mkdir(output, { recursive: true });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(read, accept, label, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (accept(value)) return value;
    await pause(250);
  }
  throw new Error(`${label}: ${JSON.stringify(value)}`);
}

// A continuous tone makes nonzero decoded audio reproducible across Chromium versions.
const wav = Buffer.alloc(44 + 48_000 * 2);
wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(48_000, 24); wav.writeUInt32LE(96_000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < 48_000; i++) wav.writeInt16LE(Math.round(6000 * Math.sin(2 * Math.PI * 440 * i / 48_000)), 44 + i * 2);
const tonePath = join(output, "tone.wav");
await writeFile(tonePath, wav);

const prisma = new PrismaClient();
const rooms = new RoomServiceClient(process.env.LIVEKIT_HOST, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
const report = { runtime: process.version, boundaries: { payment: "Provider payment skipped; REQUIRE_PAYMENT_FOR_CALLS=false on disposable services", media: "Chromium fake devices and continuous synthetic tone" }, startedAt: new Date().toISOString(), base, stages: {}, screenshots: [], recordings: [], pageErrors: [] };
const password = randomBytes(18).toString("hex");
const doctorPhone = `9${randomInt(100_000_000, 999_999_999)}`;
const patientPhone = `8${randomInt(100_000_000, 999_999_999)}`;
let browser, doctorContext, patientContext, doctor, patient, call;

async function capture(label) {
  for (const [role, page] of [["doctor", doctor], ["patient", patient]]) {
    const path = join(output, `${label}-${role}.png`);
    await page.screenshot({ path, fullPage: true });
    report.screenshots.push(path);
  }
}

function instrumentMedia() {
  window.__mediaPeers = [];
  window.__localMediaTracks = [];
  const Native = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends Native {
    constructor(...args) { super(...args); window.__mediaPeers.push(this); }
  };
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (...args) => {
    const stream = await getUserMedia(...args);
    window.__localMediaTracks.push(...stream.getTracks());
    return stream;
  };
}

async function stats(page) {
  return page.evaluate(async () => {
    const totals = {};
    for (const peer of window.__mediaPeers) {
      if (peer.connectionState !== "connected") continue;
      for (const row of (await peer.getStats()).values()) {
        if (!["inbound-rtp", "outbound-rtp"].includes(row.type)) continue;
        const key = `${row.type}:${row.kind}`;
        const total = totals[key] ??= { bytes: 0, packets: 0, frames: 0, audioEnergy: 0, samples: 0, streams: [] };
        total.streams.push(`${row.id}:${row.ssrc}`);
        total.bytes += row.bytesReceived ?? row.bytesSent ?? 0;
        total.packets += row.packetsReceived ?? row.packetsSent ?? 0;
        total.frames += row.framesDecoded ?? row.framesEncoded ?? 0;
        total.audioEnergy += row.totalAudioEnergy ?? 0;
        total.samples += row.totalSamplesReceived ?? 0;
      }
    }
    return totals;
  });
}

async function audioSamples(page, path) {
  const recording = await page.evaluate(async () => {
    const tracks = window.__mediaPeers.filter((pc) => pc.connectionState === "connected")
      .flatMap((pc) => pc.getReceivers()).map((r) => r.track).filter((t) => t.kind === "audio" && t.readyState === "live");
    if (!tracks.length) throw new Error("No received audio tracks");
    const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: "audio/webm;codecs=opus" });
    const chunks = [];
    recorder.ondataavailable = ({ data }) => chunks.push(data);
    const stopped = new Promise((done) => { recorder.onstop = done; });
    recorder.start();
    await new Promise((done) => setTimeout(done, 1200));
    recorder.stop();
    await stopped;
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  });
  await writeFile(path, Buffer.from(recording, "base64"));
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "pipe:1"]);
  let peak = 0, squared = 0;
  for (let i = 0; i < pcm.length; i += 4) {
    const value = pcm.readFloatLE(i);
    peak = Math.max(peak, Math.abs(value)); squared += value * value;
  }
  const samples = pcm.length / 4;
  return { peak, rms: Math.sqrt(squared / samples), samples, path };
}

const keys = ["inbound-rtp:audio", "inbound-rtp:video", "outbound-rtp:audio", "outbound-rtp:video"];
async function verifyMedia(label) {
  console.log(`Measuring ${label}`);
  const evidence = {};
  report.stages[label] = evidence;
  for (const [role, page] of [["doctor", doctor], ["patient", patient]]) {
    await until(() => stats(page), (value) => keys.every((key) => value[key]?.bytes > 0), `${role} media readiness`);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const [role, page] of [["doctor", doctor], ["patient", patient]]) evidence[role] = { before: await stats(page) };
    await pause(2500);
    for (const [role, page] of [["doctor", doctor], ["patient", patient]]) evidence[role].after = await stats(page);
    const replaced = ["doctor", "patient"].some((role) => keys.some((key) =>
      JSON.stringify(evidence[role].before[key]?.streams) !== JSON.stringify(evidence[role].after[key]?.streams)));
    if (!replaced) break;
    assert.ok(attempt < 4, "Media streams must settle after replacement");
    evidence.replacedStreamSamples = attempt + 1;
  }
  for (const [role, page] of [["doctor", doctor], ["patient", patient]]) {
    const entry = evidence[role];
    entry.delta = {};
    for (const key of keys) {
      entry.delta[key] = Object.fromEntries(["bytes", "packets", "frames", "audioEnergy", "samples"].map((metric) => [metric, entry.after[key][metric] - entry.before[key][metric]]));
      assert.ok(entry.delta[key].bytes > 0 && entry.delta[key].packets > 0, `${role} ${key} must advance`);
      if (key.endsWith("video")) assert.ok(entry.delta[key].frames > 0, `${role} ${key} frames must advance`);
    }
    assert.ok(entry.delta["inbound-rtp:audio"].audioEnergy > 0, `${role} remote audio energy must advance`);
    entry.audio = await audioSamples(page, join(output, `${label}-${role}-received-audio.webm`));
    assert.ok(entry.audio.peak > 0 && entry.audio.rms > 0, `${role} decoded audio must be nonzero: ${JSON.stringify(entry.audio)}`);
  }
  const participants = await rooms.listParticipants(call.livekitRoom);
  assert.equal(participants.length, 2);
  for (const peer of participants) {
    assert.ok(peer.tracks.some((track) => track.type === 0), "LiveKit must receive audio");
    assert.ok(peer.tracks.some((track) => track.type === 1), "LiveKit must receive video");
  }
  evidence.participants = participants.map((peer) => ({ identity: peer.identity, tracks: peer.tracks.map(({ type, muted, source }) => ({ type, muted, source })) }));
  report.stages[label] = evidence;
  await writeFile(join(output, "media-report.json"), JSON.stringify(report, null, 2));
}

async function login(page, role, phone) {
  await page.goto(`${base}/login?role=${role}`);
  await page.getByLabel("Phone number", { exact: true }).fill(phone);
  if (role === "doctor") await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Send OTP", exact: true }).click();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(`${base}/${role === "doctor" ? "doctor" : "dashboard"}`);
}

async function sendChat(from, to, message) {
  await from.getByPlaceholder("Type message").fill(message);
  await from.getByRole("button", { name: "Send", exact: true }).click();
  await to.getByText(message, { exact: true }).waitFor();
}

async function apiGet(page, path) {
  return page.evaluate(async (path) => {
    const { api } = await import("/src/lib/api.ts");
    return (await api.get(path)).data;
  }, path);
}

async function registerAndValidate() {
  const license = { name: "synthetic-license.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF") };
  await doctor.goto(base + "/doctor/register");
  await doctor.locator("#licenseDocument").setInputFiles(license);
  await doctor.getByRole("button", { name: "Submit registration", exact: true }).click();
  await doctor.getByText("Enter your name", { exact: true }).waitFor();
  await doctor.getByText("Required", { exact: true }).waitFor();
  await doctor.getByText("Password must be at least 8 characters", { exact: true }).waitFor();
  await patient.goto(base + "/register");
  await patient.getByLabel("Full name", { exact: true }).fill("Call Patient");
  await patient.getByLabel("Phone number", { exact: true }).fill("12");
  await patient.getByLabel("Date of birth", { exact: true }).fill("31/04/1990");
  await patient.getByRole("checkbox").check();
  await patient.getByRole("button", { name: "Send OTP", exact: true }).click();
  await patient.getByText("Enter a valid phone number", { exact: true }).waitFor();
  await patient.getByText("Date of birth must be a valid date in DD/MM/YYYY format", { exact: true }).waitFor();
  await capture("registration-invalid");

  const fields = { name: "Call Doctor", phone: doctorPhone, password, email: "synthetic@example.com",
    dob: "01/01/1990", degree: "MBBS", experienceYears: "5", regNumber: "VERIFY-" + doctorPhone,
    regYear: "2015", regType: "Test council", city: "Pune", state: "Maharashtra",
    address: "Synthetic clinic", about: "Local verification account" };
  for (const [id, value] of Object.entries(fields)) await doctor.locator("#" + id).fill(value);
  await doctor.getByRole("button", { name: "Female", exact: true }).click();
  await doctor.getByPlaceholder("e.g. Cardiology").fill("General Medicine");
  await doctor.getByRole("button", { name: "Add", exact: true }).click();
  await doctor.locator('[name="educations.0.degree"]').fill("MBBS");
  await doctor.locator('[name="educations.0.institution"]').fill("Synthetic college");
  const registered = doctor.waitForResponse(r => r.url().endsWith("/api/auth/doctor/register") && r.request().method() === "POST");
  await doctor.getByRole("button", { name: "Submit registration", exact: true }).click();
  assert.equal((await registered).status(), 201);
  const doctorUser = await prisma.user.findUniqueOrThrow({ where: { phone: doctorPhone }, include: { doctorProfile: true } });
  assert.equal(doctorUser.doctorProfile.experienceYears, 5);
  assert.equal(doctorUser.doctorProfile.isApproved, false);
  await prisma.doctorProfile.update({ where: { userId: doctorUser.id }, data: { isApproved: true, approvedAt: new Date() } });
  await patient.getByLabel("Phone number", { exact: true }).fill(patientPhone);
  await patient.getByLabel("Date of birth", { exact: true }).fill("29/02/1992");
  await patient.getByRole("button", { name: "Send OTP", exact: true }).click();
  for (let i = 0; i < 6; i++) await patient.getByRole("button", { name: "0", exact: true }).click();
  await patient.getByRole("button", { name: "Create account", exact: true }).click();
  await patient.waitForURL(base + "/dashboard");
  const patientUser = await prisma.user.findUniqueOrThrow({ where: { phone: patientPhone } });
  report.registration = { invalidFieldsRendered: true, correctedFormsSubmitted: true, doctorNumericCoercion: 5,
    patientOtp: "development code", doctorApproval: "local synthetic fixture, approval UI not exercised" };
  return { doctorUser, patientUser };
}

async function verifyStorage(patientId) {
  await patient.goto(base + "/dashboard/locker");
  const name = "synthetic + 100% report.pdf";
  const bytes = Buffer.from("%PDF-1.4\n% synthetic upload\n%%EOF");
  const uploaded = patient.waitForResponse(r => r.url().endsWith("/api/health-files") && r.request().method() === "POST");
  await patient.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/pdf", buffer: bytes });
  const upload = await uploaded;
  assert.equal(upload.status(), 201);
  const file = await upload.json();
  await patient.getByText(name, { exact: true }).waitFor();
  const download = await patientContext.request.get(file.url);
  assert.equal(download.status(), 200);
  assert.deepEqual(await download.body(), bytes);
  assert.ok(download.headers()["content-type"].includes("application/pdf"));
  const { uploadBuffer, deleteObject } = await import("../packages/server/dist/services/storage.service.js");
  const key = "verification/" + patientId + "/space + percent%2F ? hash# Unicode-α.txt";
  const encodedBody = Buffer.from("Synthetic encoded-key storage round trip: α");
  await uploadBuffer(key, encodedBody, "text/plain; charset=utf-8");
  const fixture = await prisma.healthFile.create({ data: {
    userId: patientId, name: "Encoded-key fixture", type: "LAB_REPORT", objectKey: key, sizeBytes: encodedBody.length,
  } });
  try {
    const signed = await apiGet(patient, "/health-files/" + fixture.id);
    const raw = await patientContext.request.get(signed.url);
    assert.equal(raw.status(), 200);
    assert.deepEqual(await raw.body(), encodedBody);
    assert.equal(raw.headers()["content-type"], "text/plain; charset=utf-8");
    const page = await patientContext.newPage();
    const response = await page.goto(signed.url);
    assert.equal(response.status(), 200);
    assert.deepEqual(await response.body(), encodedBody);
    assert.equal(response.headers()["content-length"], String(encodedBody.length));
    await page.getByText(encodedBody.toString(), { exact: true }).waitFor();
    await page.close();
    await deleteObject(key);
    assert.equal((await patientContext.request.get(signed.url)).status(), 404);
  } finally {
    await deleteObject(key);
    await prisma.healthFile.delete({ where: { id: fixture.id } });
  }
  await patient.getByText(name, { exact: true }).locator("../..").getByRole("button", { name: "Delete", exact: true }).click();
  await until(() => apiGet(patient, "/health-files"), value => !value.some(row => row.id === file.id), "UI upload deletion");
  assert.equal((await patientContext.request.get(file.url)).status(), 404);
  report.storage = { uiUploadDownloadDelete: true, byteExact: true, metadata: true, encodedKey: key, signedBrowserLink: true, deletedLink404: true };
  await patient.goto(base + "/dashboard");
}

async function invalidApi(page, method, path, data, expectedPath, message) {
  const result = await page.evaluate(async ({ method, path, data }) => {
    const { api } = await import("/src/lib/api.ts");
    try { const r = await api.request({ method, url: path, data }); return { status: r.status, body: r.data }; }
    catch (error) { return { status: error.response?.status, body: error.response?.data }; }
  }, { method, path, data });
  assert.equal(result.status, 400, JSON.stringify(result));
  assert.equal(result.body.message, "Invalid request");
  assert.ok(result.body.issues.some(issue => JSON.stringify(issue.path) === JSON.stringify(expectedPath) && (!message || issue.message === message)));
  return result;
}

try {
  browser = await chromium.launch({ headless: true, args: [
    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${tonePath}`,
    "--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage",
  ] });
  report.browser = browser.version();
  const contextOptions = { permissions: ["camera", "microphone"], viewport: { width: 1440, height: 900 }, recordVideo: { dir: join(output, "recordings"), size: { width: 1280, height: 800 } } };
  doctorContext = await browser.newContext(contextOptions);
  patientContext = await browser.newContext(contextOptions);
  await doctorContext.addInitScript(instrumentMedia);
  await patientContext.addInitScript(instrumentMedia);
  doctor = await doctorContext.newPage(); patient = await patientContext.newPage();
  for (const [role, page] of [["doctor", doctor], ["patient", patient]]) {
    page.setDefaultTimeout(20_000);
    page.on("pageerror", (error) => report.pageErrors.push({ role, message: error.message }));
  }
  const { doctorUser, patientUser } = await registerAndValidate();
  report.users = { doctor: doctorUser.id, patient: patientUser.id };
  const initialBalance = Number(doctorUser.walletBalance);
  await login(doctor, "doctor", doctorPhone);
  await login(patient, "patient", patientPhone);
  assert.notDeepEqual(await doctorContext.cookies(), await patientContext.cookies());
  console.log("Both real app pages authenticated separately");
  report.invalidProfile = await invalidApi(patient, "put", "/users/me", { heightCm: -1 }, ["heightCm"], "Enter a valid height");
  await verifyStorage(patientUser.id);
  await patient.getByRole("button", { name: "Consult a doctor", exact: true }).click();
  await doctor.getByRole("button", { name: "Accept", exact: true }).waitFor();
  await patient.getByRole("button", { name: "Minimize", exact: true }).click();
  await patient.waitForURL(`${base}/dashboard`);
  await patientContext.setOffline(true);
  await patient.evaluate(async () => { const { getSocket } = await import("/src/lib/socket.ts"); getSocket().io.engine.close(); });
  await until(() => patient.evaluate(async () => (await import("/src/lib/socket.ts")).getSocket().connected), value => !value, "Patient transport disconnected");
  await doctor.reload({ waitUntil: "domcontentloaded" });
  await doctor.getByRole("button", { name: "Accept", exact: true }).click();
  await doctor.waitForURL(/\/doctor\/call\//);
  await patientContext.setOffline(false);
  await patient.waitForURL(base + "/consult");
  report.entryRecovery = { minimizedRinging: true, doctorRingReload: true, missedAcceptanceRecoveredAfterReconnect: true };
  call = await prisma.callSession.findFirstOrThrow({ where: { patientId: patientUser.id } });
  report.callId = call.id; report.room = call.livekitRoom;
  assert.equal(await prisma.callSession.count({ where: { patientId: patientUser.id } }), 1);
  await verifyMedia("initial");
  await doctor.getByRole("tab", { name: "Chat", exact: true }).click();
  await sendChat(patient, doctor, "Patient message before reload");
  await sendChat(doctor, patient, "Doctor reply before reload");
  await capture("initial");

  await doctor.reload({ waitUntil: "domcontentloaded" });
  await verifyMedia("doctor-reload");
  await doctor.getByRole("tab", { name: "Chat", exact: true }).click();
  await doctor.getByText("Patient message before reload", { exact: true }).waitFor();
  await sendChat(doctor, patient, "Doctor message after reload");
  await capture("doctor-reload");

  await patient.reload({ waitUntil: "domcontentloaded" });
  await verifyMedia("patient-reload");
  await patient.getByText("Doctor reply before reload", { exact: true }).waitFor();
  await sendChat(patient, doctor, "Patient message after reload");
  await capture("patient-reload");
  report.chat = { restoredAfterBothReloads: true, deliveredAfterBothReloads: true };

  await doctor.getByRole("tab", { name: "Prescription", exact: true }).click();
  assert.equal(await doctor.getByRole("button", { name: "Submit prescription", exact: true }).isDisabled(), true);
  report.invalidPrescription = await invalidApi(doctor, "post", "/prescriptions", { callSessionId: call.id, content: [] }, ["content"]);
  assert.equal(await prisma.prescription.count({ where: { callSessionId: call.id } }), 0);
  await doctor.getByLabel("Patient complaint", { exact: true }).fill("Local verification entry");
  await doctor.getByLabel("Diagnosis", { exact: true }).fill("Test document");
  const submitted = doctor.waitForResponse((response) => response.url().endsWith("/api/prescriptions") && response.request().method() === "POST");
  await doctor.getByRole("button", { name: "Submit prescription", exact: true }).click();
  const response = await submitted;
  assert.equal(response.status(), 202);
  const prescription = await response.json();
  const ready = await until(() => apiGet(patient, `/prescriptions/${prescription.id}`), (value) => value.pdfReady && value.pdfUrl, "PDF generation");
  assert.deepEqual(ready.content, { complaint: "Local verification entry", diagnosis: "Test document", medications: "", advice: "" });
  const pdf = await patientContext.request.get(ready.pdfUrl);
  assert.equal(pdf.status(), 200);
  const pdfBytes = await pdf.body();
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  await writeFile(join(output, "prescription.pdf"), pdfBytes);
  assert.equal((await prisma.callSession.findUniqueOrThrow({ where: { id: call.id } })).status, "ACTIVE");
  assert.equal(await prisma.walletTransaction.count({ where: { callSessionId: call.id, type: "CREDIT" } }), 0);
  await verifyMedia("after-pdf");
  await capture("after-pdf");
  report.pdf = { id: prescription.id, bytes: pdfBytes.length, path: join(output, "prescription.pdf"), callStayedActive: true };

  report.toggles = [];
  for (const [role, page, other, identity] of [["doctor", doctor, patient, doctorUser.id], ["patient", patient, doctor, patientUser.id]]) {
    for (const [label, kind] of [["Microphone", 0], ["Camera", 1]]) {
      const button = page.getByRole("button", { name: label, exact: true });
      await button.click();
      await until(() => rooms.listParticipants(call.livekitRoom), (peers) => peers.find((peer) => peer.identity === identity)?.tracks.some((track) => track.type === kind && track.muted), `${role} ${label} muted`);
      if (kind === 0) await other.getByLabel("Their microphone is off").waitFor();
      else await other.getByText(/camera off$/).first().waitFor();
      await capture(`${role}-${label.toLowerCase()}-off`);
      await button.click();
      await until(() => rooms.listParticipants(call.livekitRoom), (peers) => peers.find((peer) => peer.identity === identity)?.tracks.some((track) => track.type === kind && !track.muted), `${role} ${label} restored`);
      report.toggles.push({ role, device: label, off: true, restored: true });
    }
  }
  await verifyMedia("after-toggles");
  await doctor.getByRole("button", { name: "Close room", exact: true }).click();
  await doctor.getByRole("alertdialog").getByRole("button", { name: "Close room", exact: true }).click();
  await doctor.waitForURL(`${base}/doctor`);
  await patient.waitForURL(`${base}/dashboard`);
  await doctor.getByRole("heading", { name: "Welcome, Dr. Call Doctor", exact: true }).waitFor();
  await patient.getByRole("button", { name: "Consult a doctor", exact: true }).waitFor();
  await until(() => rooms.listRooms([call.livekitRoom]), (value) => value.length === 0, "LiveKit room deletion");
  const ended = await prisma.callSession.findUniqueOrThrow({ where: { id: call.id } });
  assert.equal(ended.status, "ENDED");
  assert.ok(ended.endedAt);
  report.cleanup = { status: ended.status, endedAt: ended.endedAt, roomDeleted: true, peers: {} };
  const consultationCount = await prisma.callSession.count({ where: { patientId: patientUser.id } });
  assert.equal(consultationCount, 1, "Hangup must not create a replacement consultation");
  for (const page of [doctor, patient]) assert.equal((await apiGet(page, "/calls/active")).callSession, null);
  await until(() => apiGet(doctor, "/doctor/availability"), (value) => !value.isInCall, "Doctor released after hangup");
  report.cleanup.consultationCount = consultationCount;
  report.cleanup.dashboardsReady = true;
  report.cleanup.noActiveCalls = true;
  report.cleanup.doctorReleased = true;
  for (const [role, page] of [["doctor", doctor], ["patient", patient]]) {
    const cleanup = await until(() => page.evaluate(() => ({
      tracks: window.__localMediaTracks.map((track) => ({ kind: track.kind, state: track.readyState })),
      connections: window.__mediaPeers.map((peer) => peer.connectionState),
    })), (value) => value.tracks.every((track) => track.state === "ended") && value.connections.every((state) => state === "closed"), `${role} devices stopped`);
    report.cleanup.peers[role] = cleanup;
  }
  for (const page of [doctor, patient]) {
    await page.evaluate(async id => { const { getSocket } = await import("/src/lib/socket.ts"); getSocket().emit("call:end", { callSessionId: id }); }, call.id);
  }
  await pause(1500);
  const credits = await prisma.walletTransaction.findMany({ where: { callSessionId: call.id, type: "CREDIT" } });
  const config = await prisma.revenueConfig.findFirstOrThrow();
  const expectedCredit = Number((Number(config.consultationFee) * Number(config.doctorPct) / 100).toFixed(2));
  assert.equal(credits.length, 1);
  assert.equal(credits[0].userId, doctorUser.id);
  assert.equal(credits[0].status, "COMPLETED");
  assert.equal(Number(credits[0].amount), expectedCredit);
  assert.equal(Number((await prisma.user.findUniqueOrThrow({ where: { id: doctorUser.id } })).walletBalance), initialBalance + expectedCredit);
  assert.equal(await prisma.callSession.count({ where: { patientId: patientUser.id } }), 1);
  report.credit = { count: 1, amount: expectedCredit, noCreditBeforeHangup: true, duplicateEndAttempts: 2, balanceAdvancedOnce: true };
  await capture("ended");
  assert.deepEqual(report.pageErrors, []);
  report.success = true;
  console.log("TWO_PEER_CALL_VERIFIED");
} catch (error) {
  report.success = false;
  report.error = error.stack;
  if (doctor && patient) await capture("failure").catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const [role, context, page] of [["doctor", doctorContext, doctor], ["patient", patientContext, patient]]) {
    if (context) {
      const video = page?.video();
      await context.close();
      if (video) { const path = join(output, `${role}.webm`); await video.saveAs(path); report.recordings.push(path); }
    }
  }
  await browser?.close();
  await prisma.$disconnect();
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, "media-report.json"), JSON.stringify(report, null, 2));
}

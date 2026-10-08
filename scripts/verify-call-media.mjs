import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes, randomInt } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { RoomServiceClient } from "livekit-server-sdk";

process.loadEnvFile();
const base = process.env.CALL_VERIFY_URL ?? "http://localhost:5173";
const output = resolve(process.env.CALL_VERIFY_OUTPUT ?? "data/uploads/call-verification/media");
assert.equal(process.env.CALL_VERIFY_SCRATCH, "1", "Set CALL_VERIFY_SCRATCH=1 only for disposable local services");
assert.equal(process.env.NODE_ENV, "development", "The login flow requires development OTPs");
for (const url of [base, process.env.DATABASE_URL, process.env.LIVEKIT_HOST]) {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname), "Use local services only");
}
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
const report = { startedAt: new Date().toISOString(), base, stages: {}, screenshots: [], recordings: [], pageErrors: [] };
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

try {
  const doctorUser = await prisma.user.create({ data: {
    phone: doctorPhone, name: "Call Doctor", role: "DOCTOR", passwordHash: await bcrypt.hash(password, 10),
    doctorProfile: { create: { degree: "MBBS", regNumber: `VERIFY-${doctorPhone}`, isApproved: true, approvedAt: new Date() } },
  } });
  const patientUser = await prisma.user.create({ data: {
    phone: patientPhone, name: "Call Patient", role: "PATIENT", patientProfile: { create: { consentGivenAt: new Date() } },
  } });
  report.users = { doctor: doctorUser.id, patient: patientUser.id };
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
  await login(doctor, "doctor", doctorPhone);
  await login(patient, "patient", patientPhone);
  assert.notDeepEqual(await doctorContext.cookies(), await patientContext.cookies());
  console.log("Both real app pages authenticated separately");
  await patient.getByRole("button", { name: "Consult a doctor", exact: true }).click();
  await doctor.getByRole("button", { name: "Accept", exact: true }).waitFor();
  await patient.getByRole("button", { name: "Minimize", exact: true }).click();
  await patient.waitForURL(`${base}/dashboard`);
  await doctor.reload({ waitUntil: "domcontentloaded" });
  await doctor.getByRole("button", { name: "Accept", exact: true }).click();
  await doctor.waitForURL(/\/doctor\/call\//);
  await patient.waitForURL(`${base}/consult`);
  report.entryRecovery = { minimizedRinging: true, doctorRingReload: true };
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
  await doctor.getByLabel("Patient complaint", { exact: true }).fill("Local verification entry");
  await doctor.getByLabel("Diagnosis", { exact: true }).fill("Test document");
  const submitted = doctor.waitForResponse((response) => response.url().endsWith("/api/prescriptions") && response.request().method() === "POST");
  await doctor.getByRole("button", { name: "Submit prescription", exact: true }).click();
  const response = await submitted;
  assert.equal(response.status(), 202);
  const prescription = await response.json();
  const ready = await until(() => apiGet(patient, `/prescriptions/${prescription.id}`), (value) => value.pdfReady && value.pdfUrl, "PDF generation");
  const pdf = await patientContext.request.get(ready.pdfUrl);
  assert.equal(pdf.status(), 200);
  const pdfBytes = await pdf.body();
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  await writeFile(join(output, "prescription.pdf"), pdfBytes);
  assert.equal((await prisma.callSession.findUniqueOrThrow({ where: { id: call.id } })).status, "ACTIVE");
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

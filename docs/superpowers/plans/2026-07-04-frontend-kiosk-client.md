# Frontend Kiosk Client Implementation Plan

> **Status: NOT APPLIED.** Written for later reference only. Only the backend production-readiness plan (`2026-07-04-backend-production-readiness.md`) is being executed in this pass. Do not run this plan until that decision is revisited.
>
> **For agentic workers (when this plan is eventually picked up):** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the MadamGy kiosk a real Android delivery mechanism (native wrapper, not just a browser tab) and wire the frontend up to every backend contract the companion backend plan introduces: patient OTP login, consent capture, doctor license upload, Razorpay checkout, doctor presence heartbeat, in-call image/document chat, patient gender/email at registration, and the doctor-side patient health folder panel (Task 11 — the highest-priority item in this plan; it's a clinical-safety gap, not cosmetic).

**Architecture:** The existing `packages/web` React/Vite app is wrapped in a Capacitor Android project rather than rewritten — Capacitor loads the same web build inside a native WebView shell and exposes native plugin APIs (printer, camera/mic permission handling, kiosk lockdown) to it via a JS bridge. No separate native codebase to maintain in parallel; the web app remains the single source of UI truth.

**Tech Stack:** `@capacitor/core` + `@capacitor/android`, existing React/Vite/Tailwind stack unchanged, `razorpay` Checkout.js (frontend SDK, separate from the backend's server-side `razorpay` npm package), a to-be-selected native printer plugin (Task 3 spike decides which).

## Global Constraints

- This repo currently has **no frontend test tooling** (no Vitest+RTL, no Playwright) — confirmed absent from `packages/web/package.json`. Tasks below use manual verification steps (`npm run dev`, drive it in a browser, describe exact expected behavior) consistent with how the existing frontend code was verified, per this session's own manual E2E approach. Adding a frontend test harness is a fair follow-up but is not itself a task here — it wasn't asked for and would be scope creep on top of an already large plan.
- TypeScript `strict: true`, no `any`.
- Component naming: `PascalCase.tsx`; hooks/lib: `camelCase.ts`.
- Every task below states the exact backend contract it depends on and the plan+task number where that contract is defined, so this plan can be picked up independently of whether the backend plan's author is available to ask.
- **Design is out of scope for every task below.** Each task specifies function and wiring only — inputs, outputs, what data moves where, using existing Tailwind utility classes copied verbatim from the nearest existing sibling component so something renders and is clickable/testable. None of it should be treated as final visual design. See the blank "Visual & Brand Design" section at the end.

---

### Task 1: Capacitor Android wrapper scaffolding

**Files:**
- Create: `packages/kiosk-android/` (new package — Capacitor project root)
- Modify: root `package.json` (add to `workspaces`)
- Create: `packages/kiosk-android/capacitor.config.ts`

**Interfaces:**
- Produces: an installable Android project that loads `packages/web`'s production build (`packages/web/dist`) as its WebView content.

- [ ] **Step 1: Install Capacitor CLI and core packages**

Run (from repo root): `npm install -D @capacitor/cli --workspace packages/kiosk-android` — this will fail until the workspace directory exists; instead run from a fresh directory first:

Run: `mkdir -p packages/kiosk-android && cd packages/kiosk-android && npm init -y`

- [ ] **Step 2: Add the workspace to the root**

In root `package.json`, add `"packages/kiosk-android"` to the `workspaces` array.

- [ ] **Step 3: Install Capacitor**

Run (from `packages/kiosk-android/`): `npm install @capacitor/core @capacitor/android && npm install -D @capacitor/cli`

- [ ] **Step 4: Initialize Capacitor pointing at the web build**

Run: `npx cap init MadamGy com.madamgy.kiosk --web-dir=../web/dist`
Expected: creates `capacitor.config.ts` in `packages/kiosk-android/`.

- [ ] **Step 5: Add the Android platform**

Run: `npx cap add android`
Expected: creates `packages/kiosk-android/android/`, a full Gradle Android Studio project.

- [ ] **Step 6: Build the web app and sync**

Run (from repo root): `npm run build --workspace @madamgy/web`
Run (from `packages/kiosk-android/`): `npx cap sync android`
Expected: `√ copy android`, `√ update android` — the compiled web assets are copied into the Android project.

- [ ] **Step 7: Verify it launches in an emulator or connected device**

Run: `npx cap open android` (opens Android Studio) → Run ▶ on an emulator or a connected device.
Expected: the app launches showing the MadamGy kiosk home screen exactly as it appears in a desktop browser at `npm run dev`.

- [ ] **Step 8: Commit**

```bash
git add packages/kiosk-android package.json
git commit -m "feat: scaffold Capacitor Android wrapper around the existing web app"
```

---

### Task 2: Kiosk lockdown and auto-launch

**Files:**
- Modify: `packages/kiosk-android/android/app/src/main/AndroidManifest.xml`
- Modify: `packages/kiosk-android/android/app/src/main/java/com/madamgy/kiosk/MainActivity.java` (or `.kt`, whichever Capacitor generates)

**Interfaces:**
- Produces: an app that launches automatically on device boot, pins itself to the foreground (no home/recents button escape), and hides the status bar.

- [ ] **Step 1: Add boot-launch permission and receiver**

In `AndroidManifest.xml`, add inside `<manifest>`: `<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />`

Add a `BootReceiver` that launches `MainActivity` on `android.intent.action.BOOT_COMPLETED` — this requires a small native `BroadcastReceiver` class; write it in the same language Capacitor generated the rest of the Android project in (check `MainActivity`'s extension first).

- [ ] **Step 2: Enable Android's Screen Pinning (Lock Task Mode) in `MainActivity`**

In `MainActivity`'s `onCreate`, after `super.onCreate(...)`, add a call to `startLockTask()` so the app pins itself and the user cannot navigate away via the recents/home buttons without a PIN unlock at the OS level.

- [ ] **Step 3: Hide the system status bar**

In the same `onCreate`, set the window to fullscreen immersive mode using `WindowInsetsController` (API 30+) or `View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY` (older APIs) — check the target Android API level in `packages/kiosk-android/android/variables.gradle` first and use whichever matches.

- [ ] **Step 4: Verify manually on a device**

Install the APK on a test tablet/device (`npx cap run android`). Confirm: (a) rebooting the device auto-launches the app without user interaction, (b) pressing the home button does not exit the app (or requires the configured PIN), (c) no status bar/notification shade is visible.

- [ ] **Step 5: Commit**

```bash
git add packages/kiosk-android/android
git commit -m "feat: add kiosk lockdown (screen pinning, boot auto-launch, hidden status bar)"
```

---

### Task 3: Native printer bridge — spike, then integrate

**This is a spike task.** The exact approach depends on the physical printer model the kiosk hardware vendor supplies (thermal receipt printer over USB/Bluetooth using ESC/POS commands, or a standard AirPrint/Android-Print-Framework-compatible printer). This cannot be planned further than "investigate and decide" until that hardware detail is known.

**Files:**
- Create: `docs/superpowers/specs/YYYY-MM-DD-printer-spike-findings.md`
- (Follow-up files depend entirely on the spike's outcome — not planned here.)

- [ ] **Step 1: Identify the actual printer hardware**

Get the exact make/model of printer the kiosk vendor is installing (or planning to install). This is a hardware procurement fact, not something derivable from this codebase.

- [ ] **Step 2: If it's a standard printer (accepts print jobs via the Android Print Framework)**

Test whether `window.print()` inside the Capacitor WebView triggers the native Android print dialog (it generally does, since Capacitor's WebView is a standard Android WebView with print support). If a print dialog appears and successfully prints a test page to the connected printer, this is sufficient — no native plugin needed, keep the existing `react-to-print` integration in `PrintButton.tsx` as-is, and skip to Step 5.

- [ ] **Step 3: If it's a thermal/receipt printer requiring raw ESC/POS commands**

This needs a native Capacitor plugin. Search for an existing community plugin first (e.g. search npm for `capacitor` + the printer vendor's SDK name, or a generic `capacitor-plugin-printer` / ESC/POS plugin) before writing a custom one. If nothing suitable exists, a custom Capacitor plugin needs: a native Android class implementing the vendor's SDK calls (USB/Bluetooth connection, raw byte formatting per the printer's ESC/POS command set), and a TypeScript wrapper exposing a `print(base64Pdf: string): Promise<void>` method to the web layer.

- [ ] **Step 4: Convert the prescription PDF to the printer's input format**

If a native/raw printer path is needed (Step 3), the existing presigned MinIO PDF URL (`GET /api/prescriptions/:id` → `pdfUrl`) needs to be fetched, converted to whatever raster/ESC-POS format the plugin expects, and sent through the plugin instead of `react-to-print`'s browser dialog.

- [ ] **Step 5: Document the decision**

Create `docs/superpowers/specs/YYYY-MM-DD-printer-spike-findings.md` recording: which printer hardware was tested, which path (standard print framework vs. native plugin) was chosen and why, and — if a plugin was needed — its exact package name/version and integration notes for whoever implements the follow-up task.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/
git commit -m "docs: record printer integration spike findings and chosen approach"
```

---

### Task 4: WebRTC-in-WebView compatibility spike (camera/mic for LiveKit video calls)

**This is a spike task** — Android WebView's `getUserMedia`/WebRTC support varies by Android System WebView version and by whether the hosting native app has granted the right runtime permissions to the WebView. This must be verified on real target hardware before the video-consult feature can be trusted inside the Capacitor wrapper.

**Files:**
- Modify: `packages/kiosk-android/android/app/src/main/AndroidManifest.xml`
- Modify: `packages/kiosk-android/android/app/src/main/java/.../MainActivity.*`
- Create: `docs/superpowers/specs/YYYY-MM-DD-webrtc-webview-spike-findings.md`

- [ ] **Step 1: Add camera/microphone permissions to the manifest**

In `AndroidManifest.xml`, add:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
```

- [ ] **Step 2: Grant WebView runtime permission delegation**

Capacitor's `WebViewClient`/`WebChromeClient` needs to override `onPermissionRequest` to grant `PermissionRequest.RESOURCE_VIDEO_CAPTURE` and `RESOURCE_AUDIO_CAPTURE` when the web page calls `getUserMedia`, after the native runtime permission has already been granted by the user. Capacitor may already do this out of the box in recent versions — check the installed `@capacitor/android` version's default `MainActivity` behavior first before writing custom permission-bridging code.

- [ ] **Step 3: Manually test a real video call from the Android app**

Build and install the app on a real target device (`npx cap run android`). Log in as a kiosk patient, hit the actual `/consult` flow against a real doctor session on another device/browser, and confirm: camera preview renders, audio is transmitted both ways, no silent `getUserMedia` rejection.

- [ ] **Step 4: Document findings**

Create `docs/superpowers/specs/YYYY-MM-DD-webrtc-webview-spike-findings.md` recording the Android API level tested, whether it worked out of the box or needed the permission-bridging change from Step 2, and any codec/quality issues observed versus the same call in a desktop Chrome tab.

- [ ] **Step 5: Commit**

```bash
git add packages/kiosk-android/android docs/superpowers/specs/
git commit -m "feat: grant camera/mic permissions to the kiosk WebView for LiveKit video calls"
```

---

### Task 5: Patient OTP login/registration UI + consent checkbox

**Backend contract** (from `2026-07-04-backend-production-readiness.md`, Tasks 4 and 10): `POST /api/auth/patient/login/otp/initiate` `{ phone }` → `{ message }`; `POST /api/auth/patient/login/otp/verify` `{ phone, otp }` → `{ accessToken, user }`; `POST /api/auth/patient/register` now requires `consent: true` in the body alongside the existing `phone`, `name`, `dob` fields (`pin` is now optional and no longer needs to be collected from the UI at all).

**Files:**
- Modify: `packages/web/src/pages/kiosk/Login.tsx`
- Modify: `packages/web/src/pages/kiosk/Register.tsx`

**Interfaces:**
- Consumes: the two new endpoints above, plus the existing `useAuthStore.setAuth` and `api` client already used by every other login page (copy the exact pattern from `packages/web/src/pages/doctor/Login.tsx`'s OTP step, which already implements this same two-step phone→OTP flow for doctors).

- [ ] **Step 1: Read the existing doctor OTP login page as the pattern to mirror**

Open `packages/web/src/pages/doctor/Login.tsx` and note its two-step state machine (phone+password → OTP), the `useState` for which step is showing, and how it calls `/auth/doctor/login/initiate` then `/auth/doctor/login/verify`. The patient version is the same shape with one fewer field (no password).

- [ ] **Step 2: Rewrite `Login.tsx` as a two-step phone→OTP flow**

Replace the current single-step phone+PIN form with: Step A — phone number input, "Send OTP" button calling `POST /auth/patient/login/otp/initiate`; Step B — 6-digit OTP input (reuse the existing `NumPad.tsx` kiosk component if it fits a 6-digit entry, otherwise a plain `<input inputMode="numeric" maxLength={6}>` ), "Verify" button calling `POST /auth/patient/login/otp/verify`, on success calling `setAuth(...)` and navigating to `/dashboard` exactly as the current PIN flow does.

- [ ] **Step 3: Add the consent checkbox to `Register.tsx`**

Add a required checkbox: "I consent to receiving a teleconsultation and understand my health data will be stored for this purpose." Wire it to a `consent` boolean in the form state; the submit handler must include `consent: true` in the `POST /auth/patient/register` body, and the submit button should be disabled until it's checked. Remove the PIN input field entirely from this form (registration no longer needs one, since login moves to OTP).

- [ ] **Step 4: Manually verify**

Run `npm run dev`, open the kiosk register page, confirm the submit button is disabled until the consent box is checked, complete a registration, then log out and log back in via the new phone→OTP flow (dev OTP is fixed at `000000` per the backend's existing dev convention) and confirm it lands on `/dashboard`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/kiosk/Login.tsx packages/web/src/pages/kiosk/Register.tsx
git commit -m "feat: switch patient login to OTP and add consent capture at registration"
```

---

### Task 6: Doctor registration document upload UI

**Backend contract** (from backend plan Task 9): `POST /api/auth/doctor/register` is now `multipart/form-data` with a `data` field (JSON string of the existing registration fields) and an optional `licenseDocument` file field.

**Files:**
- Modify: `packages/web/src/pages/doctor/Register.tsx`

- [ ] **Step 1: Add a file input**

Add a required file input labeled "Degree certificate or medical license (PDF)" accepting `application/pdf`, stored in component state as a `File | null`.

- [ ] **Step 2: Switch the submit to multipart**

Change the submit handler from a plain JSON `api.post("/auth/doctor/register", data)` to building a `FormData`: append `data` as `JSON.stringify(formFields)` and `licenseDocument` as the selected file, then `api.post("/auth/doctor/register", formData)` — axios sets the correct multipart boundary automatically when given a `FormData` instance, do not manually set a `Content-Type` header.

- [ ] **Step 3: Manually verify**

Run `npm run dev`, fill the doctor registration form including a small test PDF, submit, confirm the existing "Registration submitted, awaiting admin approval" success state still shows, then confirm from the admin `Doctors.tsx` page (or a direct API call) that the license document is retrievable via `GET /api/admin/doctors/:id/license`.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/doctor/Register.tsx
git commit -m "feat: collect doctor license document at registration for admin verification"
```

---

### Task 7: Doctor presence heartbeat emission

**Backend contract** (from backend plan Task 6): the server records a doctor as "present" only while it keeps receiving `presence:ping` on the existing socket connection, with a 45-second TTL. Nothing currently emits this from the client.

**Files:**
- Modify: `packages/web/src/pages/doctor/Dashboard.tsx`

**Interfaces:**
- Consumes: the existing `getSocket()` helper (see `packages/web/src/lib/socket.ts`, already used by `CallChatPanel.tsx` and others).

- [ ] **Step 1: Add a heartbeat interval**

In `Dashboard.tsx`, add a `useEffect` that starts a `setInterval` emitting `getSocket().emit("presence:ping")` every 20 seconds while the component is mounted (i.e., while the doctor is logged in and viewing their dashboard), and clears the interval on unmount.

- [ ] **Step 2: Manually verify**

Run `npm run dev`, log in as an approved doctor, open browser devtools' network/WS inspector, confirm a `presence:ping` frame goes out roughly every 20 seconds while the dashboard tab stays open, and stops when navigating away or closing the tab.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/doctor/Dashboard.tsx
git commit -m "feat: emit periodic presence heartbeat from the doctor dashboard"
```

**Note:** do not enable the backend's `STALE_CALL_REAPER_ENABLED` flag in production until this task has actually shipped and been verified — otherwise every active call gets ended after ~45 seconds with no heartbeat ever recorded, per the explicit warning in the backend plan's Task 6.

---

### Task 8: Razorpay checkout before consult

**Backend contract** (from backend plan Task 7): `POST /api/payments/order` (patient-authed) → `{ paymentId, razorpayOrderId, amount, keyId }`; once paid, `POST /api/calls` must include `{ paymentId }` in its body — but only once the backend's `REQUIRE_PAYMENT_FOR_CALLS` flag is flipped to `"true"` (coordinate that flag flip with this task's deployment, not before).

**Files:**
- Modify: `packages/web/index.html` (add the Razorpay Checkout.js script tag)
- Modify: `packages/web/src/pages/kiosk/Home.tsx` (or wherever the "Consult Doctor" button currently lives — check `App.tsx`'s routes first to confirm which page owns it)

- [ ] **Step 1: Add the Razorpay Checkout script**

In `packages/web/index.html`, add before the closing `</body>`: `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>`

No `integrity`/`crossorigin` (Subresource Integrity) attribute is added here deliberately, not by oversight: Razorpay documents that `checkout.js` is served dynamically and rotates without notice, so a pinned SRI hash breaks checkout silently the next time they update the file (the same reason Stripe.js can't be SRI-pinned either). If this changes to a versioned/immutable URL in a future Razorpay release, add SRI then.

- [ ] **Step 2: Create the order and open checkout on "Consult Doctor" click**

Replace the current direct `POST /api/calls` call (find it in the kiosk consult-initiation page) with: first `const order = await api.post("/payments/order")`, then open Razorpay Checkout using `order.data`:

```ts
const razorpayOptions = {
  key: order.data.keyId,
  amount: order.data.amount * 100,
  currency: "INR",
  name: "MadamGy Consultation",
  order_id: order.data.razorpayOrderId,
  handler: async () => {
    const call = await api.post("/calls", { paymentId: order.data.paymentId });
    navigate(`/consult`, { state: { callSessionId: call.data.id } });
  },
};
declare global {
  interface Window {
    Razorpay: new (options: typeof razorpayOptions) => { open: () => void };
  }
}
new window.Razorpay(razorpayOptions).open();
```

Note the `handler` fires only after Razorpay's client-side flow reports success — the actual payment confirmation the backend trusts is the webhook (`POST /api/payments/webhook`), which may land slightly after this handler fires. If `POST /api/calls` responds `402` because the webhook hasn't processed yet, retry once after a short delay (1-2 seconds) before surfacing an error to the patient.

- [ ] **Step 3: Manually verify against Razorpay's test mode**

With the backend's `REQUIRE_PAYMENT_FOR_CALLS=true` and real Razorpay test-mode keys configured, run `npm run dev`, click "Consult Doctor", complete a test-mode card payment (Razorpay documents standard test card numbers for this), and confirm the call is created and the doctor-assignment flow proceeds exactly as it did before payment gating existed.

- [ ] **Step 4: Commit**

```bash
git add packages/web/index.html packages/web/src/pages/kiosk
git commit -m "feat: gate consult creation on a Razorpay payment"
```

---

### Task 9: In-call image/document chat UI

**Backend contract**: already exists and is unchanged — `chat:send` accepts `{ type: "IMAGE", callSessionId, imageKey }` (see `packages/api-client/src/schemas/chat.schema.ts`'s `SendChatSchema`). The gap is purely that no UI exists to pick a file, upload it, and get an `imageKey` to send. There is no existing REST endpoint that accepts an arbitrary chat image upload and returns a MinIO key — check `packages/server/src/routes/health-files.routes.ts` first, since the closest existing analog (lab report upload) already does something similar and may be reusable or a close template for a new small endpoint; if no suitable endpoint exists, a corresponding backend addition (a small `POST /api/chat/upload` returning `{ imageKey }`) needs to be added to the backend plan as a follow-up before this task can fully work — flag that explicitly if discovered true, rather than silently building only half the feature.

**Files:**
- Modify: `packages/web/src/components/call/CallChatPanel.tsx`

- [ ] **Step 1: Confirm whether a chat-image upload endpoint exists**

Run: `grep -rn "imageKey\|upload" packages/server/src/routes` — if nothing returns a MinIO key from an arbitrary authenticated upload usable mid-call, stop here and add that endpoint to the backend plan first (a small multer + `uploadBuffer` route mirroring the pattern in backend plan Task 9's license upload), then resume this task.

- [ ] **Step 2: Add a file input to the chat panel**

Add a small paperclip/attach button next to the existing text input in `CallChatPanel.tsx`, opening a hidden `<input type="file" accept="image/*,application/pdf">`.

- [ ] **Step 3: Wire the upload-then-send flow**

On file selection: `POST` the file to the upload endpoint confirmed/added in Step 1, get back `imageKey`, then `getSocket().emit("chat:send", { type: "IMAGE", callSessionId, imageKey })` — mirroring the existing `sendVitals`/`sendText` functions already in this file.

- [ ] **Step 4: Render IMAGE messages**

In the message-rendering section of `CallChatPanel.tsx`, add a branch for `message.type === "IMAGE"` that fetches a presigned URL for `message.imageKey` (reuse whatever presigned-URL pattern the health-files route already uses) and renders an `<img>` or a "View document" link depending on content type.

- [ ] **Step 5: Manually verify**

Run `npm run dev`, start a consult, send an image from both the kiosk and doctor sides, confirm it renders on the other side.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/call/CallChatPanel.tsx
git commit -m "feat: add image/document sharing to in-call chat"
```

---

### Task 10: Collect gender and email at patient registration

**Backend contract** (already implemented, ahead of this frontend plan): `PatientRegisterSchema` now accepts optional `gender: "MALE" | "FEMALE" | "OTHER"` and `email` (validated email format) alongside the existing fields — see `packages/api-client/src/schemas/user.schema.ts`'s `GenderSchema`/`PatientRegisterSchema`. Both are genuinely optional; omitting them still registers the patient successfully. This closes a literal requirement-doc gap (the doc lists Patient Name, Age, Gender, Phone, Email under registration) that the original PIN/OTP-focused build missed.

**Files:**
- Modify: `packages/web/src/pages/kiosk/Register.tsx`

- [ ] **Step 1: Add a gender selector**

Add a simple three-option control (radio group or select) for Male / Female / Other, wired to a `gender` field in the form state, sent as `"MALE" | "FEMALE" | "OTHER"` — matching `GenderSchema`'s exact literal values (case-sensitive).

- [ ] **Step 2: Add an optional email input**

Add a labeled `<input type="email">` for "Email (optional)", wired to an `email` field in the form state. Leave it empty-string-omittable — if the field is empty, don't send `email` in the request body at all (an empty string would fail the backend's `z.string().email()` validation; omitting the key is what makes it genuinely optional).

- [ ] **Step 3: Include both in the registration payload**

In the submit handler's `POST /auth/patient/register` body, add `gender` (if selected) and `email` (if non-empty) alongside the existing fields.

- [ ] **Step 4: Manually verify**

Run `npm run dev`, register a patient leaving gender/email blank — confirm registration still succeeds (matches current behavior, nothing broke). Register a second patient with gender and email filled in, then confirm via the admin `UserDetail.tsx` page (or a direct API call to `GET /api/admin/users/:id`) that both values were persisted.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/kiosk/Register.tsx
git commit -m "feat: collect gender and email at patient registration"
```

---

### Task 11: Doctor-side patient health folder panel during consult

**Backend contract** (already implemented, ahead of this frontend plan): `GET /api/doctor/patients/:patientId/records` (doctor-authed) returns `{ healthFiles: HealthFile[], prescriptions: Prescription[] }` for a given patient, but only if the requesting doctor has at least one `CallSession` (any status) with that patient — otherwise `403`. This closes a literal requirement-doc gap: *"Once the doctor accepts the consultation: Patient details will become visible, the patient's Health Folder will be accessible, previous prescriptions and records (if any) will be available to the doctor for smooth consultation."* Today `Call.tsx` shows chat, vitals, and a blank prescription editor — nothing about the patient's history. This is the highest-priority item in this entire frontend plan: it's a real clinical-safety gap, not a cosmetic one — a returning patient's doctor is currently consulting blind.

**Files:**
- Modify: `packages/web/src/pages/doctor/Call.tsx`
- Create: `packages/web/src/components/call/PatientHistoryPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/doctor/patients/:patientId/records` (the `patientId` is already available in `Call.tsx`'s call-session state, since the doctor has already accepted the call and knows who they're talking to).

- [ ] **Step 1: Create the history panel component**

`PatientHistoryPanel.tsx` takes a `patientId: string` prop, fetches `GET /api/doctor/patients/${patientId}/records` on mount (via `@tanstack/react-query`, matching the pattern already used throughout `packages/web/src/pages/admin/*.tsx`), and renders two sections: a list of health files (name, type, date, a link to the presigned `url` already included in each item) and a list of past prescriptions (date, and a link/expand to view `content`). If the fetch 403s (first-time patient, no prior history with this doctor — this is the expected, common case, not an error state), render a plain "No prior consultation history with this patient" message instead of an error toast.

- [ ] **Step 2: Mount it in the doctor call screen**

In `Call.tsx`, once the call session and `patientId` are known (check how the existing chat/vitals panels already get `patientId` in this file, likely from the `call:incoming`/`call:accepted` socket payload or route state), render `<PatientHistoryPanel patientId={patientId} />` alongside the existing chat panel — e.g. as a second tab or a collapsible side panel, whichever fits the existing layout with the least structural change.

- [ ] **Step 3: Manually verify**

Run `npm run dev`. Drive one full consult end to end for a brand-new patient (confirm the panel shows "no prior history"), submit a prescription to end the call, then start a second consult between the same doctor and patient (or reuse the doctor-patient pair from `packages/server/src/__tests__/doctor-patient-records.test.ts`'s fixtures as a mental model) and confirm the panel now shows the prior prescription and any health files.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/doctor/Call.tsx packages/web/src/components/call/PatientHistoryPanel.tsx
git commit -m "feat: show patient health folder and prescription history during doctor consult"
```

---

### Task 12: Multi-language support (deferred — not detailed)

Flagged as a real requirement-adjacent gap for an Indian kiosk deployment (patients may not be comfortable in English), but this is a content/i18n-architecture decision (which library, which languages, who provides translations) that depends on business decisions not yet made. Do not start this without first deciding: target languages, translation source (professional translation vs. machine translation reviewed by a native speaker), and whether it's per-region kiosk configuration or a runtime language switcher. Revisit as its own brainstorming session when those are known.

---

## Visual & Brand Design

**Intentionally left blank.** Every task above specifies function, data flow, and just enough Tailwind reuse to render something clickable — none of it is final visual/brand design. When this plan is picked up, run the `frontend-design` skill in its own session before or alongside implementation to make deliberate typography, color, and layout decisions for: the OTP entry screen, the consent checkbox treatment, the Razorpay checkout branding/redirect experience, the file-attach affordance in chat, and the kiosk lockdown boot/splash screen. Do not treat any code sample above as a design decision — it is wiring only.

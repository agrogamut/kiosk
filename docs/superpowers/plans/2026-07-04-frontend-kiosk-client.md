# Frontend Client Implementation Plan

> **Status: READY.** Unblocked 2026-07-21 — backend production-readiness plan's contracts (Razorpay, OTP, etc.) are implemented and tested in `packages/server`, confirmed by code inspection (checkboxes in that plan were never ticked live, so don't trust those alone). Cleared to execute task-by-task; hold off on writing code until explicitly told to start.
>
> **For agentic workers (when this plan is eventually picked up):** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Distribution decision (locked 2026-07-10): public Play Store, installable on any Android phone.** This is NOT dedicated clinic kiosk hardware under MDM/device-owner enrollment — it is a normal consumer app a patient or doctor installs on their own device. This removed the original kiosk-lockdown task entirely (no `startLockTask()`/boot-auto-launch — there is no fleet to lock down and no device-owner status to make it real on a public-store install) and downgraded the printer task to best-effort OS print framework only (no vendor ESC/POS integration, since there's no fixed printer hardware to target anymore). See Task 13 for what public distribution newly requires (account deletion flow, privacy policy, Data Safety form, signing) that a sideloaded/MDM build would not have forced.

**Goal:** Wire the frontend up to every backend contract the companion backend plan introduces — patient OTP login, consent capture, doctor license upload, Razorpay checkout, doctor presence heartbeat, in-call image/document chat, patient gender/email at registration, and the doctor-side patient health folder panel (Task 11 — the highest-priority item in this plan; it's a clinical-safety gap, not cosmetic) — and get the result onto the Play Store as a normal installable app.

**Architecture:** The existing `packages/web` React/Vite app is wrapped in a Capacitor Android project rather than rewritten — Capacitor loads the same web build inside a native WebView shell and exposes native plugin APIs (camera/mic permission handling, optionally printing) to it via a JS bridge. No separate native codebase to maintain in parallel; the web app remains the single source of UI truth.

**Tech Stack:** `@capacitor/core` + `@capacitor/android`, existing React/Vite/Tailwind stack unchanged, `razorpay` Checkout.js (frontend SDK, separate from the backend's server-side `razorpay` npm package).

## Global Constraints

- This repo currently has **no frontend test tooling** (no Vitest+RTL, no Playwright) — confirmed absent from `packages/web/package.json`. Tasks below use manual verification steps (`npm run dev`, drive it in a browser, describe exact expected behavior) consistent with how the existing frontend code was verified, per this session's own manual E2E approach. Adding a frontend test harness is a fair follow-up but is not itself a task here — it wasn't asked for and would be scope creep on top of an already large plan.
- TypeScript `strict: true`, no `any`.
- Component naming: `PascalCase.tsx`; hooks/lib: `camelCase.ts`.
- Every task below states the exact backend contract it depends on and the plan+task number where that contract is defined, so this plan can be picked up independently of whether the backend plan's author is available to ask.
- **Design is out of scope for every task below except Task 14.** Each functional task specifies function and wiring only — inputs, outputs, what data moves where, using existing Tailwind utility classes copied verbatim from the nearest existing sibling component so something renders and is clickable/testable. None of it should be treated as final visual design. See the "Visual & Brand Design" section at the end, and Task 14 for when that pass happens in the sequence.
- **This is a phone app, not a responsive website in a WebView.** Every screen (patient and doctor surfaces — admin is a separate desktop-web surface and is exempt) must read and behave like a native mobile app: single-column layouts, no hover-dependent interactions, primary actions thumb-reachable near the bottom of the screen rather than top-anchored, and touch targets at least 44×44px. Task 4 below covers the mechanical half of "feels native" (back button, safe areas, keyboard, splash); Task 14 covers the visual half.

---

### Task 1: Capacitor Android wrapper scaffolding

**Files:**
- Create: `packages/kiosk-android/` (new package — Capacitor project root; directory name kept from the original kiosk-specific plan, no functional reason to rename it)
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

Run: `npx cap init MadamGy com.madamgy.app --web-dir=../web/dist`
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
Expected: the app launches showing the MadamGy home screen exactly as it appears in a desktop browser at `npm run dev`.

- [ ] **Step 8: Commit**

```bash
git add packages/kiosk-android package.json
git commit -m "feat: scaffold Capacitor Android wrapper around the existing web app"
```

---

### Task 2: Printer support — best-effort OS print framework only (optional, no native plugin)

Originally planned as a hardware spike targeting a specific vendor thermal printer. That premise is gone now that the app runs on patients'/doctors' own phones with no fixed printer hardware. Scope cut down to: try the OS-level path, and if it doesn't just work, drop it rather than building a native plugin with nothing concrete to integrate against.

**Files:**
- No new files expected unless Step 1 fails and a decision is made to drop this entirely (in which case, no files at all — nothing to build).

- [ ] **Step 1: Test whether `window.print()` triggers the native Android print flow inside the Capacitor WebView**

The existing `react-to-print` integration in `PrintButton.tsx` already calls `window.print()`. Capacitor's WebView is a standard Android WebView, which generally surfaces `window.print()` through Android's native Print Framework (share-to-PDF, any paired printer via the OS print dialog, "Save as PDF", etc.) without any native plugin. Build and run the app (`npx cap run android`), open a prescription, hit print, and confirm the Android print dialog appears and produces a usable PDF/print output.

- [ ] **Step 2: If it works, stop — nothing else to do**

No native plugin, no ESC/POS integration, no vendor SDK research. This is intentionally the ceiling for this task now that there's no dedicated printer hardware in scope.

- [ ] **Step 3: If it doesn't work, drop the task**

Do not build a custom native plugin against unknown/no hardware. Leave prescription access as view/download-PDF only (the existing web behavior), and note in the commit message that the native print path was tried and didn't pan out on a generic device, so it was left as download-only.

- [ ] **Step 4: Commit**

```bash
git add packages/kiosk-android
git commit -m "chore: verify OS-level print framework support in the Android WebView wrapper"
```

---

### Task 3: WebRTC-in-WebView compatibility spike (camera/mic for LiveKit video calls)

**This is a spike task** — Android WebView's `getUserMedia`/WebRTC support varies by Android System WebView version and by whether the hosting native app has granted the right runtime permissions to the WebView. This must be verified on real target hardware before the video-consult feature can be trusted inside the Capacitor wrapper. Still fully relevant on a public-distribution build — every install is a fresh WebView + permission grant, regardless of who owns the device.

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

Build and install the app on a real target device (`npx cap run android`). Log in as a patient, hit the actual `/consult` flow against a real doctor session on another device/browser, and confirm: camera preview renders, audio is transmitted both ways, no silent `getUserMedia` rejection.

- [ ] **Step 4: Document findings**

Create `docs/superpowers/specs/YYYY-MM-DD-webrtc-webview-spike-findings.md` recording the Android API level tested, whether it worked out of the box or needed the permission-bridging change from Step 2, and any codec/quality issues observed versus the same call in a desktop Chrome tab.

- [ ] **Step 5: Commit**

```bash
git add packages/kiosk-android/android docs/superpowers/specs/
git commit -m "feat: grant camera/mic permissions to the app's WebView for LiveKit video calls"
```

---

### Task 4: Native app-shell mechanics (back button, safe areas, keyboard, splash, immersive call)

**Added 2026-07-21.** A Capacitor WebView with none of this wired up feels like a website opened in a browser shell, not a phone app — this is what makes the wiring from Tasks 5+ actually feel native once it's built. Do this right after Tasks 1 and 3 (needs the Capacitor project and confirmed WebView behavior to exist first) and before building out the screens in Tasks 5-11, so every screen built after this point already sits inside a correctly-behaving shell instead of retrofitting it later.

**Files:**
- Modify: `packages/kiosk-android/capacitor.config.ts` (plugin config: SplashScreen, Keyboard, StatusBar)
- Modify: `packages/kiosk-android/android/app/src/main/java/.../MainActivity.*`
- Create: `packages/web/src/hooks/useAndroidBackButton.ts`
- Modify: `packages/web/src/index.css` (or wherever global CSS lives — check `packages/web/src` first)
- Modify: `packages/web/src/pages/kiosk/Consult.tsx`, `packages/web/src/pages/doctor/Call.tsx` (immersive mode during a call)

- [ ] **Step 1: Install the plugins**

Run (from `packages/kiosk-android/`): `npm install @capacitor/app @capacitor/keyboard @capacitor/splash-screen @capacitor/status-bar`

- [ ] **Step 2: Wire the hardware back button to router history**

Android's back button/gesture must behave like an in-app back action, not close the app from any screen. Create `useAndroidBackButton.ts`: on mount, `App.addListener('backButton', () => { if (window.history.length > 1) navigate(-1); else App.exitApp(); })` (from `@capacitor/app`), call this hook once near the root (`App.tsx` or a top-level layout). Verify there isn't already a similar listener from Capacitor's defaults before adding a duplicate.

- [ ] **Step 3: Respect safe-area insets**

Add to the global stylesheet: `padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);` on the app's root layout container (not on every screen individually), and set `<meta name="viewport" content="viewport-fit=cover">` in `packages/web/index.html` if not already present — otherwise content renders under the status bar/notch or the 3-button/gesture nav bar on modern Android phones.

- [ ] **Step 4: Keep inputs visible above the native keyboard**

Configure the Keyboard plugin (`resize: "native"` or `"body"` in `capacitor.config.ts` — check current `@capacitor/keyboard` docs for the recommended mode, this has changed across major versions) so that when the OTP input, register form, or chat text field is focused, the keyboard doesn't cover the input or its submit button. Manually verify on a real device/emulator: focus the phone-number field on `Login.tsx`, confirm the "Send OTP" button stays visible above the keyboard rather than being pushed off-screen.

- [ ] **Step 5: Add a real splash screen**

Configure `@capacitor/splash-screen` with the app's launch icon/background (coordinate with Task 14 for the actual asset) so cold start shows a branded splash instead of a blank white flash before the React app mounts. Call `SplashScreen.hide()` once the app's root component has mounted, not before.

- [ ] **Step 6: Kill the website-style overscroll bounce**

Add `overscroll-behavior: none` to the root scroll container in global CSS. Without this, scrolling past the top/bottom of a page rubber-bands the whole WebView the way an accidentally-scrolled webpage does — a website tell, not a phone-app one.

- [ ] **Step 7: Immersive fullscreen during video calls**

In `Consult.tsx` (patient) and `Call.tsx` (doctor), call `StatusBar.hide()` (from `@capacitor/status-bar`) on mount and `StatusBar.show()` on unmount, so the LiveKit video call runs edge-to-edge like a native call/video-chat app instead of showing the OS status bar over the video feed.

- [ ] **Step 8: Manually verify the full shell**

Build and run on a real device (`npx cap run android`). Confirm: back gesture/button navigates screen-to-screen and only exits the app from the root; no content sits under the status bar or gesture-nav bar on a modern phone; the keyboard never covers an active input; cold start shows the splash, not a white flash; scrolling doesn't rubber-band; a video call goes edge-to-edge with no status bar.

- [ ] **Step 9: Commit**

```bash
git add packages/kiosk-android packages/web/src
git commit -m "feat: wire native app-shell mechanics (back button, safe areas, keyboard, splash, immersive call)"
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

Replace the current single-step phone+PIN form with: Step A — phone number input, "Send OTP" button calling `POST /auth/patient/login/otp/initiate`; Step B — 6-digit OTP input (reuse the existing `NumPad.tsx` component if it fits a 6-digit entry, otherwise a plain `<input inputMode="numeric" maxLength={6}>`), "Verify" button calling `POST /auth/patient/login/otp/verify`, on success calling `setAuth(...)` and navigating to `/dashboard` exactly as the current PIN flow does.

- [ ] **Step 3: Add the consent checkbox to `Register.tsx`**

Add a required checkbox: "I consent to receiving a teleconsultation and understand my health data will be stored for this purpose." Wire it to a `consent` boolean in the form state; the submit handler must include `consent: true` in the `POST /auth/patient/register` body, and the submit button should be disabled until it's checked. Remove the PIN input field entirely from this form (registration no longer needs one, since login moves to OTP).

- [ ] **Step 4: Manually verify**

Run `npm run dev`, open the register page, confirm the submit button is disabled until the consent box is checked, complete a registration, then log out and log back in via the new phone→OTP flow (dev OTP is fixed at `000000` per the backend's existing dev convention) and confirm it lands on `/dashboard`.

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

Replace the current direct `POST /api/calls` call (find it in the consult-initiation page) with: first `const order = await api.post("/payments/order")`, then open Razorpay Checkout using `order.data`:

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

Run `npm run dev`, start a consult, send an image from both sides, confirm it renders on the other side.

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

**Backend contract** (already implemented, ahead of this frontend plan): `GET /api/doctor/patients/:patientId/records` (doctor-authed) returns `{ healthFiles: HealthFile[], prescriptions: Prescription[] }` for a given patient, but only if the requesting doctor has at least one `CallSession` (any status) with that patient — otherwise `403`. This closes a literal requirement-doc gap: *"Once the doctor accepts the consultation: Patient details will become visible, the patient's Health Folder will be accessible, previous prescriptions and records (if any) will be available to the doctor for smooth consultation."* Today `Call.tsx` shows chat, vitals, and a blank prescription editor — nothing about the patient's history. **This is the highest-priority item in this entire frontend plan: it's a real clinical-safety gap, not a cosmetic one — a returning patient's doctor is currently consulting blind.**

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

Flagged as a real requirement-adjacent gap for an Indian deployment (patients may not be comfortable in English), but this is a content/i18n-architecture decision (which library, which languages, who provides translations) that depends on business decisions not yet made. Do not start this without first deciding: target languages, translation source (professional translation vs. machine translation reviewed by a native speaker), and whether it's per-region configuration or a runtime language switcher. Revisit as its own brainstorming session when those are known.

---

### Task 13: Play Store compliance — account deletion, privacy policy, Data Safety, signing

**New task, added 2026-07-10 as a direct consequence of the public-distribution decision.** None of this was needed for a sideloaded/MDM-managed kiosk build; all of it is required (by Google Play policy, not by choice) to publish an app with user accounts that stores health data to the public Play Store. Sequence this task's store-listing steps (5-6) after Task 14's design pass — screenshots and store copy need the real UI, not the wiring-only version.

- [ ] **Step 1: Account deletion flow (backend gap — flag before building, do not silently build only the frontend half)**

Google requires any app that lets users create an account to offer account deletion both in-app and via a web page reachable without installing the app, even if the developer account/app itself is later removed from the account holder's device. Check `packages/server/src/routes` for an existing account/data deletion endpoint first — as of this plan being written, none exists. This needs a backend addition (something like `POST /api/patient/account/delete-request` and the doctor equivalent, plus a decision on hard-delete vs. anonymize given `CallSession`/`Prescription` rows referencing the user) added to the backend plan before this step can be implemented, not assumed away.

- [ ] **Step 2: Web deletion page**

A plain hosted page (no app install required) where a user can submit a deletion request by phone number + a verification step (OTP re-use is the obvious fit, given the existing OTP infrastructure from Task 5). This is a Play Store policy requirement, not a nice-to-have.

- [ ] **Step 3: Privacy policy page**

A hosted, publicly reachable privacy policy describing exactly what's collected (phone, name, dob, gender/email if provided, health files, prescriptions, payment metadata via Razorpay) and who can access it (assigned doctor for that consult, admin). Required to even submit the app to Play Console.

- [ ] **Step 4: Data Safety form**

Fill out Play Console's Data Safety questionnaire against the actual data model (`PatientProfile`, `HealthFile`, `Prescription`, payment records) — do this by reading the current Prisma schema at submission time, not from memory, since the schema will have changed by then.

- [ ] **Step 5: Play App Signing enrollment**

Generate the upload keystore, enroll in Play App Signing, and store the keystore + its password outside the repo (a password manager or secrets vault — never commit it). Document where it lives in a private ops note, not in this repo.

- [ ] **Step 6: Store listing assets**

Icon, screenshots, feature graphic, short/long description, category selection (likely "Medical" — re-check Play's current Medical apps policy at submission time, since it periodically adds certification/documentation requirements for health-adjacent apps). Do this after Task 14, using the real designed UI for screenshots.

- [ ] **Step 7: Commit**

```bash
git add docs/
git commit -m "docs: record Play Store compliance requirements for public distribution"
```

---

### Task 14: Visual & Brand Design pass

Run the `frontend-design` skill in its own dedicated session — after Tasks 1-12's wiring is functionally proven, before Task 13's Steps 5-6 (store assets need final UI) — to design: the OTP entry screen, the consent checkbox treatment, the Razorpay checkout branding/redirect experience, the file-attach affordance in chat, the patient history panel, and general app branding, using the color tokens below plus the phone-app UX constraints from Task 4. This is a phone app being designed for arbitrary phone sizes/aspect ratios, not a fixed-hardware kiosk display or a website — normal phone viewing distance and touch ergonomics, not kiosk touch-target/viewing-distance assumptions. Needs a real app icon/splash for the Play Store listing (coordinate the splash asset with Task 4 Step 5). Do not treat any code sample in Tasks 1-13 as a design decision — it is wiring only. Layout, typography, and component shape are this task's own decisions to make (informed by Task 4's phone-app constraints), not carried over from the marketing-site reference below — see "Design decisions, 2026-07-21" underneath.

## Visual & Brand Design

**Source:** Figma file `MadamGy` (node 0-1) — https://www.figma.com/design/HML4lVLRbHiSDtOcX6nA83/MadamGy. The browser extension needed to open Figma directly wasn't connected this session; the user supplied three screenshots of the file's Home page instead (header/hero, stats + services + medical-tourism section, doctors grid + partners + footer). **Scoped to color only, by explicit decision** — this Figma frame is the public marketing website (nav: Home / Our Services / Blog / About us / Contact us / Patient Login), a surface this plan does not build (see "Design decisions" below), so its layout, typography, and component patterns (pill nav chips, service carousel, partner logo strip, footer blob) do not transfer to the app and are intentionally not documented here. Only the color palette carries over as the brand's color system.

Hex values below were sampled by pixel-inspecting the supplied PNGs, not read from Figma's own Inspect/Dev Mode panel — accurate to a few RGB units. Confirmed close enough to build against (no need to re-verify against Figma's Inspect panel).

### Color tokens (sampled from the Home page screenshots)

| Token | Hex | Where it appears in the Figma reference |
|---|---|---|
| `--color-bg` | `#FEF8F8` | page background — warm cream/blush, not pure white |
| `--color-surface` | `#FFFFFF` | cards, tiles |
| `--color-accent-coral` | `#EE908D` | highlighted words in headings, stat numbers, primary CTA fill |
| `--color-accent-coral-light` | `#F9A8A5` | lighter stop of a salmon gradient fill |
| `--color-accent-coral-deep` | `#E28A86` | darker stop of the same gradient |
| `--color-brand-rose` | `#DB6591` | logo mark, primary header CTA — deliberately distinct, more saturated pink from the coral accent, not a tint of it |
| `--color-text-heading` | `#4A4A4A` | headline/title text — charcoal, not pure black |
| `--color-text-body` | `#A8A6A6` | paragraph/secondary copy |
| `--color-placeholder` | `#A6A6A6` | avatar placeholder fill |

Typography, layout, and component shape (button style, card radius, iconography, decorative texture) are Task 14's own decisions, made for the phone-app screens directly — not inherited from the marketing site.

## Design decisions, 2026-07-21

Resolved by the user this session, recorded so a future agentic worker doesn't reopen them:

- **Figma scope:** colors only. Ignore the marketing site's layout, typography, and component patterns entirely — they were reviewed and are not part of this app's design.
- **No marketing website in this plan.** Only the Capacitor-wrapped `packages/web` app (Tasks 1-13) is being built. If a marketing site becomes a real deliverable later, it needs its own plan.
- **Doctor-card gray-circle avatars are a confirmed placeholder**, not final — expect a photo-upload step to be added to doctor registration later; not part of this plan yet.
- **Sampled hex values are final enough to build against** — no re-verification against Figma's Inspect panel needed.
- **Phone-app feel is a hard requirement**, not a nice-to-have — see the new Task 4 (native app-shell mechanics: back button, safe areas, keyboard, splash, immersive call) and Task 14's phone-app UX constraints (single column, thumb-reachable primary actions, no hover-dependent UI, ≥44px touch targets).

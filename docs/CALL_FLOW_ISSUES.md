# Call flow — issues found, 2026-08-10

Triage of the problems hit during the first real prod call test. Each entry names the evidence in
the code, since several of these look like unrelated symptoms but share one cause.

Ordered by what blocks a usable test, not by effort.

## Status — all fixed and deployed, 2026-08-10

| # | Issue | Fixed in |
| --- | --- | --- |
| 1 | Files unreachable from the browser | `525a1cc` |
| 2 | Doctor stuck after an unanswered ring | `b692a05` |
| 3 | Prescription ends the consultation | `e41086c` |
| 4 | Phantom incoming calls | `e41086c` |
| 5 | Reload during a ring loses the call | `e41086c` |
| 6 | Chat history lost on reload | `99df8a3` |
| 7 | No availability control | `07e9261` |
| 8, 9, 10 | Chat, vitals and video polish | `99df8a3` |
| — | Oversized upload returned a 500 | `9c379fc` |

The last row was not in the original list: it turned up in the production logs while verifying the
deploy, and is a **second, independent cause** of "picture upload is failing" — the 5MB cap
rejected ordinary phone-camera photos, and multer's rejection surfaced as `500 Internal server
error` rather than anything actionable.

Verified live: the reaper logs `Stale call reaper started` on boot, `/api/doctor/availability`,
`/api/files/:token` and `/api/chat/:id/messages` all answer on Railway, and the Vercel bundle
carries the new client code.

Not yet re-tested end to end with two real participants — that is the next step.

---

## P0 — blocks testing

### 1. Every file and image in the app is unreachable from the browser

**Symptom:** picture upload appears to fail. It isn't the upload — that succeeds.

`getPresignedUrl` (`packages/server/src/services/storage.service.ts:31`) signs URLs against
`MINIO_ENDPOINT`, which on Railway is `minio.railway.internal` with `MINIO_USE_SSL=false`. So the
API hands the browser `http://minio.railway.internal:9000/...`. That hostname is private Railway
DNS the browser cannot resolve, and plain `http` on an HTTPS page is blocked as mixed content
anyway. Two independent reasons it can never load.

This is not a chat bug. Every presigned URL in the app is affected — 7 route files:

| Feature | Route |
| --- | --- |
| Chat attachments | `chat.routes.ts` |
| Prescription PDF | `prescriptions.routes.ts` |
| Health locker files | `health-files.routes.ts` |
| Doctor photo (patient-facing) | `doctors.routes.ts`, `users.routes.ts` |
| Doctor licence (admin review) | `admin.routes.ts` |
| Doctor's own files | `doctor.routes.ts` |

**Two ways to fix, pick one:**

- *Public MinIO host.* Give the MinIO service a public Railway domain and presign against it via a
  new `MINIO_PUBLIC_ENDPOINT` (keeping the internal one for uploads). S3 signatures cover the Host
  header, so the URL must be **signed** with the public host — you cannot sign internally and
  string-replace the hostname afterwards. Requires SSL on, or it stays mixed content.
- *Proxy through the API.* `GET /api/chat/image?key=…` streams the object from MinIO instead of
  redirecting. Keeps object storage entirely private and reuses the existing auth checks; costs API
  bandwidth. Better fit here, since every one of these routes already does an ownership check.

### 2. A doctor gets permanently stuck after one unanswered ring

**Symptom:** "finding the doctor doesn't work properly" — works once, then no doctor is ever found.

`assign-doctor.worker.ts:45` sets `isAvailable: false` when it assigns a call. Only two things set
it back: `completeCall` and `requeueRingingCall`. If the doctor never answers, neither fires — the
ring has no timeout, so the call sits `RINGING` forever and that doctor is unavailable forever.
Being absent from `isAvailable` also removes them from `GET /api/doctors/available`, so they vanish
from the patient's doctor list too.

The timeout **is** implemented — `stale-call-reaper.worker.ts` requeues any `RINGING` call older
than 25s — but it's gated behind `STALE_CALL_REAPER_ENABLED` (`index.ts:171`), which is `false` on
Railway. The boot logs confirm it: no "Stale call reaper started" line.

The flag's warning in `.env.example` is stale. It says to leave it off until the doctor-heartbeat
work ships, because the reaper would end ACTIVE calls after ~45s. The heartbeat has since shipped
(`useDoctorPresenceHeartbeat.ts`), and commit `873f3bd` removed the ACTIVE-call reaping entirely —
what's left only requeues `RINGING` calls. **The reaper is now safe to enable, and nothing else
restores doctor availability.** The LiveKit webhook that supposedly superseded it only ever fires
`room_finished` for calls that reached ACTIVE, so it never covers a call that was still ringing.

Fix: set `STALE_CALL_REAPER_ENABLED=true`, update the stale comment, and consider dropping the flag
so this can't silently regress.

### 3. Submitting a prescription ends the consultation

`doctor/Call.tsx:139-140` — `submitPrescription` calls `clearCall()` then `navigate("/doctor")`.
That unmounts `DoctorCallView`, disconnecting the doctor from the LiveKit room; the patient is left
alone, and LiveKit's 2-minute departure timeout then fires `room_finished`, whose webhook calls
`completeCall`. Hence "submitting the prescription closes the room".

The server is not at fault — `POST /api/prescriptions` only creates the record and queues the PDF.

Fix: stay on the call after submitting. Mark the prescription as submitted (disable/collapse the
form, show a confirmation), and let the doctor end the call explicitly via **Close room**. Note the
server rejects a prescription unless the call is `ACTIVE` (`prescriptions.routes.ts:28`), so
submitting must remain possible *during* the call — which this fix preserves.

---

## P1 — broken behaviour

### 4. Phantom incoming calls on the doctor dashboard

**Symptom:** "the call seems to keep coming."

`Dashboard.tsx:81` sets `incoming` on `call:incoming` and only ever clears it when the doctor clicks
Accept or Reject. It does **not** listen for `call:ended`. So when the patient cancels,
`completeCall` emits `call:ended` to the doctor (`call-completion.service.ts:113`) and the dashboard
ignores it — the incoming-call card stays on screen indefinitely for a call that no longer exists.
Accepting it does nothing, because the server rejects a non-`RINGING` call.

Fix: handle `call:ended` (and the requeue case) on the dashboard and clear `incoming`.

### 5. A doctor who reloads during a ring loses the call for good

`incoming` is local component state, populated only by the socket event. Refresh the dashboard while
a call is ringing and it's gone — with no way to get it back, while the patient keeps ringing (see
#2). `GET /api/calls/active` already exists and covers the doctor path.

Fix: on dashboard mount, fetch any call currently `RINGING` for this doctor and restore the card.

### 6. Chat history is lost on any reload

Messages are persisted correctly — `chat.handler.ts:31` writes every message to `ChatMessage` — but
there is **no endpoint to read them back**. `grep` for `chatMessage.findMany` returns nothing.
`CallChatPanel` starts from `[]` and fills only from live socket events, so a reload or a rejoin
mid-call shows "No messages yet" while the messages sit in the database.

Fix: add `GET /api/chat/:callSessionId` (membership-checked like `/upload`) and load it on mount.

### 7. Doctors have no availability control or indicator

There is no availability toggle anywhere — `grep isAvailable packages/server/src/routes/doctor.routes.ts`
returns nothing. A doctor cannot see whether they're currently reachable, cannot go off duty, and
cannot recover from #2 without a database edit.

Fix: show availability on the dashboard and add a toggle.

---

## P2 — UX, from the screenshots

### 8. Chat panel

- **No auto-scroll.** New messages append but the list never scrolls; long conversations silently
  hide the newest message.
- **No timestamps** on any message.
- **Alignment.** Own/other alignment is driven by `senderId === user.id`, and the payload does carry
  `senderId`, so the logic is sound — but with no history and no scroll the panel reads as broken.
  Worth revisiting bubble max-width and spacing once messages actually render.
- **Enter sends, with no multiline.** No Shift+Enter for a newline; the input is single-line, which
  is awkward for anything clinical.
- **Upload feedback** is a spinner on the button and a toast on failure — no thumbnail, no progress,
  no retry.

### 9. Vitals form (`VitalsForm.tsx`)

The current form is four bare inputs with placeholder-only labels.

- **Placeholders are not labels.** Once a value is typed the field's meaning disappears — visible in
  the screenshot. Needs real labels with units.
- **No validation or ranges.** SpO2 accepts any number rather than 0–100; weight and height are
  unbounded. Nothing catches a typo like 700 kg.
- **Blood pressure is free text** with no format hint. Should be two fields (systolic/diastolic) or
  a masked `120/80` input, so it can be stored and charted rather than kept as an opaque string.
- **`type="number"` quirks** — scroll-wheel changes values, and spinners are awkward on mobile.
  `inputMode="decimal"` is the better fit.
- **Panel overflow.** The form is injected between the message list and the composer
  (`CallChatPanel.tsx:113`). In a short panel it squeezes the message area toward zero and overflows
  the card, which is what the screenshot shows. Make it a sheet/dialog, or give it its own scroll
  region and the message list a `min-height`.

### 10. Video area

- **Black tile when the camera is off** — no avatar or name placeholder, so a working call looks
  broken (screenshot 3).
- **Fixed viewport heights.** `h-[55vh] lg:h-[70vh]` on the doctor call page, with the control bar
  offset hardcoded as `calc(100% - 4rem)` in `CallLayout.tsx:32`. On a phone this leaves the video
  cramped and the controls crowding the prescription form.

---

## Suggested order

1. #2 — one env var, unblocks doctor discovery immediately.
2. #3 and #4 — small client changes, make the call flow usable end to end.
3. #1 — pick the proxy approach; unblocks attachments, prescriptions, and photos together.
4. #6 and #5 — restore state across reloads.
5. #8, #9, #10 — polish before handing the APK to testers.

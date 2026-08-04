# Call reconnect & room-close design

## Problem

Network drops during an active video consult currently destroy the call outright:

- Patient side (`packages/web/src/pages/kiosk/Consult.tsx:163`): `KioskCallView`'s `onDisconnected` is wired directly to `cancel()`, which emits `call:end`. Any LiveKit disconnect — a wifi blip, a backgrounded tab, anything — ends the call immediately for both parties.
- Doctor side (`packages/web/src/pages/doctor/Call.tsx:97`): `onDisconnected` just navigates back to `/doctor` with no server-side effect. The call is left dangling until `stale-call-reaper.worker.ts`'s `reapStaleCalls()` notices the doctor's presence heartbeat (`doctor_heartbeat:<id>`, 45s TTL, checked every 30s) has gone stale and force-ends it — 45-75s later, and only keyed on the doctor, never the patient.
- Neither client persists call state across a reload. `useCallStore` (`packages/web/src/store/call.store.ts`) is in-memory only, so a full page reload or kiosk app relaunch loses all knowledge of an in-progress call — there's no way to get back into it even if the room is technically still open server-side.

Desired behavior: a network drop should not end the call. The room stays open until either the doctor explicitly closes it, or it sits empty (nobody connected) for 2 minutes.

## Decisions from brainstorming

1. **Empty-room detection**: owned by LiveKit itself, not application code. Rooms are explicitly created via `RoomServiceClient.createRoom({ name, emptyTimeout: 120 })` at `call:accept` time (before token generation), instead of relying on implicit auto-creation on first join. LiveKit fires a `room_finished` webhook when the 120s empty timer elapses; the backend listens for it and ends the call. No custom timer, no BullMQ delayed job, no new DB column — LiveKit is ground truth for "is anyone actually connected."
2. **Old reaper mechanism removed**: `reapStaleCalls()`'s heartbeat-based call-ending is deleted. It was keyed only on doctor presence (not patient), had a much shorter and different window (45-75s vs. 2min), and is now fully superseded by the webhook path. `reapRingingTimeouts()` (unanswered-ring timeout — an unrelated concern) is untouched. `doctor_heartbeat` itself stays; it's still used for `nudgeWaitingCalls()` and `isAvailable` bookkeeping.
3. **Reconnect UX**: manual "Rejoin" button, not silent auto-retry. LiveKit's client SDK already auto-recovers from brief ICE/network blips on its own without ever calling `onDisconnected`; that handler only fires once LiveKit's own reconnection attempts are exhausted. At that point we show a local "Connection lost" screen with a Rejoin button rather than looping retries ourselves.
4. **Reload/relaunch survival**: rejoin must work even after a full page reload or kiosk app relaunch, not just a live in-tab disconnect. This requires a new `GET /calls/active` endpoint and an app-boot check that redirects a user with an active call straight back into the call screen instead of their dashboard.
5. **Who can end an ACTIVE call**: once a call reaches ACTIVE, only the doctor can deliberately end it (the literal "doctor presses close room" requirement). The patient's existing pre-ACTIVE (QUEUED/RINGING) cancel button is unchanged. Once ACTIVE, a patient can only leave (disconnect) — never close — mirroring the empty-timeout/doctor-close rule exactly.

## Architecture

### Backend

**`livekit.service.ts`** — add a `RoomServiceClient` (needs a new server-side env var, `LIVEKIT_HOST`, an http(s) URL; today only `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` exist server-side, used solely for token minting). Add `createRoom(name)` calling `roomService.createRoom({ name, emptyTimeout: 120 })`.

**`call.handler.ts` (`call:accept`)** — call `livekitService.createRoom(call.livekitRoom)` before generating the doctor/patient tokens, so the room exists with the 2-minute empty timeout from the moment it's created.

**`call.handler.ts` (`call:end`)** — add an authorization gate: if `call.status === "ACTIVE"`, only `call.doctorId === userId` may proceed (reject silently otherwise, matching existing handler style). Pre-ACTIVE (QUEUED/RINGING) keeps today's behavior — either party may end it.

**New webhook route** (e.g. `POST /webhooks/livekit`) — verify the request via `WebhookReceiver` (livekit-server-sdk, same API key/secret already in use). On a `room_finished` event, look up the `CallSession` by `livekitRoom`, and if its status is still `ACTIVE`, call `completeCall(id)` (already idempotent — checks `ACTIVE_STATUSES` before acting, per the existing comment in `call-completion.service.ts` about concurrent completion triggers). Other event types are ignored for now.

**New `GET /calls/active`** — role-aware: returns the requesting user's own call session if it's in `QUEUED`, `RINGING`, or `ACTIVE`, else 404/empty. When `ACTIVE`, also mints and returns a fresh LiveKit token (reusing `livekitService.generateToken`), so the client can rejoin without a second round trip.

**`stale-call-reaper.worker.ts`** — delete the call-ending half of `reapStaleCalls()` (the doctor-heartbeat-driven `completeCall()` loop). Keep `reapRingingTimeouts()` as-is.

**`prescriptions.routes.ts`** — after a successful prescription submission, call `completeCall(callSessionId)` directly (the same effect as the doctor pressing "Close room") rather than leaving the call to expire via the empty-room timeout. This keeps wallet-credit timing immediate instead of adding an incidental 2-minute delay after every normal consult.

### Frontend

**`DoctorCallView.tsx` / `KioskCallView.tsx` `onDisconnected` handlers** — no longer call `cancel()` / navigate away / touch the server at all. Both set local state to show a "Connection lost" overlay with a Rejoin button. This is the actual bug fix: a disconnect stops being a call-ending event on the client side, full stop.

**Rejoin (live drop, tab still open)** — Rejoin button re-fetches a fresh LiveKit token (call session id still known client-side) and remounts `LiveKitRoom` with the new token (e.g. by changing its `key`) to force a clean reconnect.

**Rejoin (reload / relaunch)** — on app boot (wherever the patient/doctor post-login landing route renders — dashboard, doctor home), call `GET /calls/active`. If it returns an active call, hydrate `useCallStore` from the response and redirect straight into the call screen instead of the normal landing page.

**`DoctorCall.tsx`** — add a "Close room" button (new UI — doesn't exist today) with a confirm step before emitting `call:end`, since it's now a deliberate, irreversible, patient-affecting action.

**`Consult.tsx`** — once ACTIVE, the patient has no end-the-call control at all (matches decision 5). Pre-ACTIVE `cancel()` (QUEUED/RINGING) is unchanged.

## Deployment dependency

The LiveKit project (self-hosted or Cloud) needs its webhook URL configured to point at the new `/webhooks/livekit` route, and the backend needs the new `LIVEKIT_HOST` env var set. Flagging this now since it's an out-of-repo config step that won't show up in a diff.

## Out of scope

- Auto-retry/silent reconnect (explicitly rejected in favor of manual rejoin).
- Any change to pre-ACTIVE (QUEUED/RINGING) cancel behavior.
- Any DB schema change — the design uses only the existing `CallSession.status` / `livekitRoom` fields.

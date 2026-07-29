# Kiosk Lock Layer — Design Spec

**Date:** 2026-07-29
**Status:** Approved by user, ready for implementation plan.
**Approach:** Frontend-only lock/gate on the existing shared login screen, reusing all existing auth/kiosk-attribution backend as-is. Also closes a real gap found while grounding this spec: device-based revenue attribution was never actually wired up client-side, so it has been silently inert since the 2026-07-15 spec shipped.

---

## Overview

Today, `Entry.tsx` is one shared login screen with a role dropdown (Patient / Doctor / Admin). Anyone standing at a physical terminal can flip the dropdown and attempt any role's login. The ask: an admin ("kiosk owner") logs in once on a physical device, after which that device shows only the patient login — no dropdown, no path to Doctor/Admin login — so a walk-in customer only ever sees the patient flow. The admin can still get back to their own dashboard/wallet on that same device through a deliberately unobtrusive re-login gate.

This is explicitly **not** a revival of the "admin books on behalf of the patient" actor-model that the 2026-07-15 roles/wallet/revenue spec dropped in favor of device-based attribution. Booking, payment, and attribution logic are unchanged — this spec only adds a lock state to the login screen and finishes wiring the device-attribution mechanism that spec already designed.

### Gap discovered during grounding (in scope for this spec)

The 2026-07-15 spec called for the client to auto-generate a stable per-install `deviceId` and send it on every booking request so the server could resolve kiosk attribution. Checking the current code:

- `packages/web/src/pages/admin/Devices.tsx` has the admin type a `deviceId` into a free-text `<Input>` field by hand — there is no client-side auto-generated ID anywhere in the repo.
- `packages/web/src/pages/kiosk/Consult.tsx` never sends `deviceId` on `POST /calls` (checked both call sites — the free-consult path and the pay-then-call path). `CallCreateSchema.deviceId` is optional and always arrives `undefined` today.
- Net effect: `resolveAssistingAdmin(deviceId)` (`kiosk.service.ts`) always receives `undefined` in production traffic today, so every booking falls to the un-attributed 65/35 split — kiosk revenue attribution has never actually functioned end to end, despite the backend and admin registration UI being fully built and tested.

This spec closes that gap as a natural side effect of building the kiosk-lock feature, since the lock feature needs a real per-device identity anyway.

---

## Device identity

A new persisted, per-install device ID, generated once and reused for the life of the install.

**Storage mechanism:** extend the existing zustand `persist` pattern already used by `auth.store.ts` (localStorage-backed, already trusted to survive app restarts on both web and the Capacitor Android wrapper) rather than adding a new Capacitor plugin dependency (`@capacitor/preferences` is not currently installed; the existing pattern already does the job with zero new dependencies).

New `packages/web/src/store/kiosk.store.ts`:

```ts
interface KioskState {
  deviceId: string;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}
```

- `deviceId` is generated once via `crypto.randomUUID()` on first read if not already present, then persisted — same lazy-init-on-first-access shape as any other persisted zustand store here.
- `locked` defaults to `false` (today's full role-picker behavior) until an admin completes the kiosk-login flow described below.

**Implementation note:** in the actual `kiosk.store.ts`, `deviceId` and `locked` end up under two separate `localStorage` keys rather than both living inside zustand's persisted blob. `deviceId` is read/written directly against its own `madamgy-kiosk-device-id` key the first time the store initializes (outside of zustand's `persist` middleware entirely), while only `locked` is persisted through zustand's `persist` (`partialize` explicitly keeps just `locked`, under the `madamgy-kiosk` key). Functionally this is equivalent to what's described above — a stable per-install ID plus a persisted lock flag — just split across two storage entries instead of one.

---

## Kiosk login and auto-registration

Reuses the existing admin login (`POST /auth/admin/login`, phone+password — already built, no new credential system) and the existing kiosk-registration endpoint (`POST /admin/kiosk-devices` — already upserts by `deviceId`, already handles the 409-if-claimed-by-another-admin case). No backend changes.

Flow, added to `Entry.tsx`'s existing `signInAdmin` success path:
1. Admin selects "Admin" from the (still-visible, since device isn't locked yet) role dropdown and logs in as today.
2. On every successful `ADMIN`-role login — not just the first one on a given device — call `POST /admin/kiosk-devices` with this device's `deviceId` and the admin's own name as `label` (editable later from the existing `/admin/devices` page, which is unaffected by this spec). The endpoint is an idempotent upsert, so re-registering an already-registered device is a safe no-op; this also makes attribution self-healing (see "Unlock flow" below).
3. On success, call `kiosk.store`'s `lock()`, show a brief confirmation toast, and navigate to `/admin` as today — the admin still lands on their own dashboard immediately after logging in; the lock only affects what the screen shows *the next time* the app is opened on this device.
4. If registration fails (e.g. 409, another admin already owns this device), surface an error toast (a specific message for the 409 case, a generic one otherwise) and do **not** lock the device — admin still reaches their dashboard normally, device stays fully open. Locking only ever happens on a successful registration.

This means a device only ever locks after a deliberate, successful admin action — never automatically or silently.

`SUPER_ADMIN` logins are excluded from this entirely: only `ADMIN`-role logins trigger registration and locking. A super-admin's own dashboard access is never gated behind a kiosk lock.

---

## Locked entry screen

When `kiosk.store().locked` is `true`, `Entry.tsx` renders differently:
- No role `<Select>`.
- Only the patient phone-number-entry + OTP form (today's `role === "PATIENT"` branch), unconditionally.
- A small, visually unobtrusive affordance remains reachable (exact placement/styling is a visual-design decision, deferred to the patient-app-shell visual pass since it should match that subsystem's "stylish but minimal" direction — functionally, e.g. a long-press on the logo, or a small low-contrast icon in a corner).

## Unlock flow

Tapping/triggering the hidden affordance shows the existing admin phone+password form (same fields, same `signInAdmin` submit handler). On success:
- Kiosk registration is re-run on this login too (see "Kiosk login and auto-registration" above) — this is what makes attribution self-healing: if the `Kiosk` row backing this device was deactivated behind the scenes (e.g. from `/admin/devices`, or a super-admin force-deactivation) without the client's local `locked` flag ever changing, a device could otherwise get stuck silently un-attributed forever with no recovery path. Re-running the upsert on every admin login reactivates it automatically.
- Session-scoped unlock only: this still doesn't call `kiosk.store().unlock()` persistently. The device goes straight back to locked (patient-only) the next time `Entry.tsx` mounts fresh (app reopen / logout), matching the earlier decision that this is a peek-in, not a permanent unlock. `RequireRole`'s existing behavior (redirect to `/` on missing/invalid auth) already handles returning to `Entry.tsx` correctly when the admin's session ends — no changes needed there.

On failure (wrong password), show the existing error toast and stay on the hidden-form view — never falls back to showing the full role picker.

**Forced logout on re-lock:** because `user` (unlike `accessToken`) is persisted across app restarts, and `RequireRole` gates purely on it, simply reopening the app after a peek-in would otherwise leave a live, resumable `ADMIN`/`SUPER_ADMIN` session sitting behind the patient-only screen — anyone at the terminal could navigate straight into `/admin/*` and see live data, without the lock screen protecting anything real underneath it. To close this, `Entry.tsx` now force-logs-out any leftover privileged session (via the full `logout()` flow in `lib/logout.ts` — server-side `/auth/logout`, socket disconnect, call-store clear, auth-store clear) the moment the screen is genuinely back in its plain locked/patient-only state (locked, no unlock attempt in progress). This never affects a patient who is mid-session on that device. Separately, `AdminShell` now also renders the existing `IdleGuard` component, so an admin who peeks in and then walks away mid-session (without the app ever restarting) is auto-logged-out after 5 minutes of inactivity, same as other guarded pages in the app.

---

## Booking now actually carries the device ID

`KioskConsult.tsx`'s two `api.post("/calls", ...)` call sites both add `deviceId: useKioskStore.getState().deviceId` to the request body. This is the piece that makes attribution real: from this point on, any booking made from a device that an admin has registered (locked or not — registration and lock are two separate outcomes of the same action, but registration is what matters for attribution) gets correctly attributed server-side, exactly as the 2026-07-15 spec always intended.

No change needed to `CallCreateSchema`, `resolveAssistingAdmin`, or any revenue-split logic — all of that already does the right thing once it actually receives a `deviceId`.

---

## Interaction with the existing `/admin/devices` page

Left as-is. It remains useful for:
- Viewing all devices registered to an admin (a kiosk owner might run more than one physical terminal).
- Manually deactivating a device (e.g. decommissioning a terminal) without needing physical access to it.
- The free-text manual registration form on that page still works exactly as today — it's a secondary path for cases like pre-registering a device before it's physically set up. Not removed, not changed.

---

## Testing

- Fresh device (no persisted `kiosk.store` state): `Entry.tsx` shows the full role picker, unchanged from today.
- Admin logs in successfully on a fresh device → device becomes registered (`Kiosk` row created/updated) and `locked` becomes `true` in persisted state.
- Reopening the app after a successful kiosk login: `Entry.tsx` shows patient-only form, no role picker.
- Hidden affordance → admin re-login → lands on `/admin` dashboard; reopening the app again afterward returns to the locked patient-only view (unlock does not persist), and any leftover `ADMIN`/`SUPER_ADMIN` session is force-logged-out as soon as `Entry.tsx` settles back into that plain locked state.
- Admin peeks in, then walks away without touching the app again: after 5 minutes of inactivity on any `/admin/*` route, `IdleGuard` logs them out and returns to `/` automatically.
- Wrong password on the hidden re-login form: stays on that form with an error, never reveals the role picker.
- Registration conflict (device already claimed by a different admin, active): login still succeeds and takes the admin to their dashboard, but the device does **not** lock and does **not** re-attribute to the new admin — the 409 case surfaces a specific "already registered to another admin" toast; any other registration failure surfaces a generic one. Sign-in is never blocked by either.
- Previously-registered device whose `Kiosk` row was deactivated behind the scenes (via `/admin/devices` or a super-admin force-deactivation) without the client's local `locked` flag changing: the device stays stuck showing the locked patient-only screen and silently loses attribution until an admin uses the hidden gate to log in again on it, which re-runs registration and self-heals the `Kiosk` row back to active — no manual `localStorage` clearing required.
- Patient booking from a registered+locked device: `POST /calls` request body now includes the real `deviceId`; server resolves `assistingAdminId` correctly and the three-way split applies on call completion — end-to-end confirmation that the 2026-07-15 spec's attribution logic, previously dead code in production, now actually fires.
- Patient booking from a never-registered device: `deviceId` sent but unresolved server-side (existing behavior) → falls to the un-attributed 65/35 split, unchanged.

---

## Out of scope

- Any change to who books, who pays, or the actor model — booking stays patient-initiated, unchanged from the 2026-07-15 spec.
- Visual styling of the locked screen and the hidden unlock affordance — deferred to the patient-app-shell visual-design pass (subsystem 2 in the 2026-07-29 feature-batch planfile), which owns the "stylish but minimal" direction for all patient-facing screens.
- Multi-device kiosk fleets, remote lock/unlock by a super-admin, or any change to the existing `/admin/devices` management page.
- Idle-timeout auto-relock while the admin is mid-session on their own dashboard was originally deferred here, but has since been added as a small additive change (see "Unlock flow" above — `AdminShell` now renders `IdleGuard`, a 5-minute inactivity auto-logout already used elsewhere in the app).

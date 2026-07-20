# Roles, Kiosk Attribution & Revenue Wallet — Design Spec

**Date:** 2026-07-15
**Status:** Approved and implemented — confirmed 2026-07-21 by code inspection (`role_split_and_wallet_rework` migration applied, `revenue-config.service.ts` and its tests exist in `packages/server`).
**Approach:** Rework existing 3-role/2-way-split system into 4-role/3-way-split, incrementally

---

## Overview

Today's system already has most of the load-bearing pieces: 3 roles (`PATIENT`, `DOCTOR`, `ADMIN`), a ledger-only wallet (`WalletTransaction` + `walletBalance`), and a manual-transfer withdrawal flow (super-admin approves, hands over money outside the system, marks complete). None of that is being replaced — it's being extended.

Three real changes:
1. Today's single `ADMIN` role (full power) becomes `SUPER_ADMIN`. A new, narrower `ADMIN` role is introduced for kiosk owners/runners.
2. Revenue per consult splits three ways instead of two: doctor 65% / admin (kiosk owner) 25% / super-admin (company) 10% — but only when the booking came from a registered kiosk device. Un-attributed bookings (patient's own phone, no kiosk) split doctor 65% / super-admin 35%, no admin wallet touched.
3. Kiosk attribution is device-based: an admin registers a specific physical device (already-installed app instance) as their kiosk once; every booking made from that device afterward is automatically attributed to that admin, no per-booking manual action needed.

Everything here is configurable by `SUPER_ADMIN` at runtime (fee, all three percentages) — no hardcoded values, replacing today's `CONSULTATION_FEE` env var and per-doctor `commissionRate` field.

---

## Roles & Permissions

| Capability | PATIENT | ADMIN (kiosk owner) | SUPER_ADMIN (company) | DOCTOR |
|---|---|---|---|---|
| Book own consult | yes | — | — | — |
| View all patients/calls/doctor availability | — | yes | yes | own only |
| Disable/enable patient accounts | — | yes | yes | — |
| Disable/enable doctor/admin accounts | — | — | yes | — |
| View audit log | — | read-only | full | — |
| Approve doctor registration | — | — | yes | — |
| Assign DOCTOR/ADMIN role (create staff account) | — | — | yes | — |
| Own wallet balance + request withdrawal | — | yes | n/a (see below) | yes |
| Approve/reject any withdrawal | — | — | yes | — |
| Edit revenue config (fee, split %) | — | — | yes | — |
| Register/unregister own kiosk device | — | yes | — | — |

`SUPER_ADMIN`'s 10% share is **not** run through `WalletTransaction`/withdrawal. It's the company's own money landing in the company's own Razorpay settlement account already — routing it through the same payable-ledger-plus-manual-approval flow as doctor/admin would mean the super admin approving a payout to themselves, which serves no purpose. It's tracked for revenue reporting by reading `Payment` rows directly. If a ledger trail is wanted later for accounting/tax records, that's a cheap additive change — out of scope here.

### Role rename migration

`UserRole.ADMIN` → `UserRole.SUPER_ADMIN` (existing rows remapped by the Prisma migration itself, not application code — no live users to migrate around a dual-read/write period, this ships before Play Store launch). New `UserRole.ADMIN` value added for kiosk owners.

Blast radius on the rename (all mechanical, no logic changes beyond permission-list splits): `admin.routes.ts`, `auth.service.ts`, `socket/index.ts`, `prescriptions.routes.ts`, `health-files.routes.ts`, `seed.ts`, `packages/web/src/pages/admin/Login.tsx`, `packages/web/src/App.tsx`, `packages/web/src/pages/admin/UserDetail.tsx`, `packages/api-client/src/schemas/user.schema.ts` (+ its generated `.d.ts`).

`requireAuth(...roles)` middleware (`middleware/auth.middleware.ts`) needs no change — already takes a role list. Existing `admin.routes.ts` call sites split: money/config/approval/role-assignment routes → `requireAuth("SUPER_ADMIN")`; shared operational routes (users list, calls list, stats, own wallet) → `requireAuth("SUPER_ADMIN", "ADMIN")` with route-body logic scoping ADMIN to their own data where the table above says "yes" but not "full".

### Role assignment

New `POST /api/super-admin/staff` (`SUPER_ADMIN`-only): `{ phone, name, role: "DOCTOR" | "ADMIN" }` → creates the `User` row directly in that role with a system-generated temp PIN returned once in the response. Skips patient OTP self-serve entirely — staff accounts are never created via the patient signup path. Doctor accounts created this way still go through the existing `DoctorProfile` + license-upload + `approve` flow unchanged. Audit-logged as `staff.create`.

---

## Kiosk Device Registration

New `Kiosk` model:

```prisma
model Kiosk {
  id        String   @id @default(cuid())
  deviceId  String   @unique
  adminId   String
  label     String?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())

  admin User @relation(fields: [adminId], references: [id])

  @@index([adminId])
}
```

- Client generates a stable per-install `deviceId` once — a UUID persisted via Capacitor Preferences (more reliable than OS-level device identifiers, which can reset on factory-reset or reinstall).
- Admin, authenticated on that physical device, toggles "mark this device as my kiosk" → `POST /api/admin/kiosk-devices { deviceId }`, binding that device to their own `adminId`. Toggling off sets `active: false` (row kept for history, not deleted — past attributed calls must not lose their record of which kiosk they came from).
- Every booking request includes the device's `deviceId`. Server looks up `Kiosk` by `deviceId`; if found and `active`, sets `CallSession.assistingAdminId` to that kiosk's `adminId`. Not found, inactive, or absent → `null`, booking is treated as un-attributed (falls to the 65/35 split).
- Registration is an upsert keyed on `deviceId`: an admin re-registering their own already-bound device (reinstall, re-toggle) just updates `active`/`label`. Claiming a `deviceId` currently `active` under a **different** admin is rejected with 409 — ownership only transfers if the current owner deactivates it first (or `SUPER_ADMIN` force-reassigns via a separate admin action, not exposed to `ADMIN` itself). Prevents one admin from silently hijacking another's kiosk attribution.

**Security guardrail (non-negotiable):** the client only ever sends the opaque `deviceId` — never an `adminId` directly. The server resolves attribution itself from the registered binding. If a client could assert "attribute this booking to admin X" directly, any patient's personal phone could claim kiosk revenue for an arbitrary admin. The binding is established once, authenticated, by the admin themselves; every booking afterward is resolved server-side from that stored mapping.

### Booking capability change

Today, only `PATIENT` can create a call (`calls.routes.ts:12`, `requireAuth("PATIENT")`). This is unchanged — the patient (whether on their own phone or physically at a kiosk device) is still the one who books. What's new is that the booking request now carries `deviceId`, and the server resolves `assistingAdminId` from it. No new "admin books on behalf of patient" endpoint is needed — the earlier actor-based design (admin manually initiates each booking) is dropped in favor of this device-based one.

---

## Revenue Config

New `RevenueConfig` model, single row, `SUPER_ADMIN`-editable at runtime:

```prisma
model RevenueConfig {
  id               String   @id @default(cuid())
  consultationFee  Decimal  @db.Decimal(10, 2)
  doctorPct        Decimal  @db.Decimal(5, 2)
  adminPct         Decimal  @db.Decimal(5, 2)
  superAdminPct    Decimal  @db.Decimal(5, 2)
  updatedAt        DateTime @updatedAt
  updatedById      String

  updatedBy User @relation(fields: [updatedById], references: [id])
}
```

- Replaces `CONSULTATION_FEE` env var and the per-doctor `commissionRate` field entirely (dropped from `DoctorProfile`) — one global split applies to every doctor equally, per explicit decision (no per-doctor override).
- `doctorPct + adminPct + superAdminPct` must equal 100; validated on write, rejected with 400 otherwise, no partial write.
- Every edit audit-logged (`revenue-config.update`, old + new values in metadata).
- New `PUT /api/super-admin/revenue-config` (`SUPER_ADMIN`-only).

### Snapshot at payment time

The resolved fee and all three percentages are copied onto `Payment` at charge time — **not** recomputed later from live config. If config changes after a call is charged, that call's historical split must not retroactively change.

```prisma
model Payment {
  // ...existing fields unchanged...
  doctorPct     Decimal @db.Decimal(5, 2)
  adminPct      Decimal @db.Decimal(5, 2)
  superAdminPct Decimal @db.Decimal(5, 2)
}
```

Call-completion logic reads these snapshotted values off `Payment`, never the live `RevenueConfig`, when crediting wallets.

---

## Wallet Model Changes

Both `DOCTOR` and `ADMIN` roles now need payable wallets — today `walletBalance` lives only on `DoctorProfile`, and `WalletTransaction.doctorId` is a doctor-only FK.

- `walletBalance` moves up onto `User` (both roles use the same field), removed from `DoctorProfile`.
- `WalletTransaction.doctorId` renamed to `userId` — same FK shape, now accepts `DOCTOR` or `ADMIN`.
- Existing withdrawal flow (`createWithdrawRequest`, `listPendingWithdrawals`, `completeWithdrawal`, `rejectWithdrawal` in `wallet.service.ts`) is otherwise unchanged — same one-pending-withdrawal-at-a-time rule, same manual-transfer-then-mark-complete pattern, now just usable by either role.

### Credit flow at call completion

Extends the existing `prisma.$transaction` in `call-completion.service.ts` (not a second transaction bolted on — doctor/admin credits succeed or fail atomically with the existing prescription/status update):

- Read `Payment.doctorPct` / `adminPct` / `superAdminPct` and `consultationFee` (all snapshotted).
- Always credit doctor: one `WalletTransaction` CREDIT, `amount = fee * doctorPct / 100`.
- If `CallSession.assistingAdminId` is set: credit that admin too, one `WalletTransaction` CREDIT, `amount = fee * adminPct / 100`. Super-admin's cut (`superAdminPct`) stays untouched by any wallet — tracked via the `Payment` row alone.
- If `assistingAdminId` is null: admin's `adminPct` share is not credited to anyone — folds into the company's tracked revenue alongside `superAdminPct` (both readable straight off `Payment`, no wallet entry needed for either).

---

## Testing

Extends the existing `e2e-consult-flow.test.ts` pattern:
- Un-attributed call → only doctor wallet credited, correct amount.
- Kiosk-attributed call → doctor + admin wallets both credited, correct amounts, percentages match `Payment` snapshot not live config.
- `RevenueConfig` update rejected when percentages don't sum to 100.
- Config changed after one call is charged, before a second — first call's credited amounts still match its own snapshot, unaffected by the change.
- Role-permission boundary — `ADMIN` cannot reach `SUPER_ADMIN`-only routes (revenue-config edit, staff creation, withdrawal approval).
- Kiosk device registration — booking from a registered+active device sets `assistingAdminId`; booking from unregistered or deactivated device does not; a booking cannot set `assistingAdminId` by passing an arbitrary value directly (server ignores any client-asserted admin id, only resolves via the `deviceId` lookup).

---

## Out of Scope (this spec)

- Play Store launch compliance checklist — separate, already tracked as Task 12 in `docs/superpowers/plans/2026-07-04-frontend-kiosk-client.md`. Not a design decision, an audit/checklist deliverable.
- Ledger/wallet trail for `SUPER_ADMIN`'s 10% share, if wanted later for accounting/tax records.
- Per-doctor custom split override (explicitly declined — one global config for all doctors).
- Reassigning an existing `Kiosk` registration to a different admin, or a kiosk having more than one owning admin.

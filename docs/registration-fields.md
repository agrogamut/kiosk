# Registration Fields — Current System vs Old Reference System

Source for "old" columns: `madamGy-old-backup-20260512.tar.gz` (`old/HealingGmautServer` NestJS backend + `old/Doctor` Vue portal). That system covered doctors, hospitals, labs, ambulances, franchises, hotels — madamGy is video-consult only, so not every old field applies. Source for "current" columns: `new/packages/api-client/src/schemas/user.schema.ts` and `new/packages/server/src/prisma/schema.prisma`.

---

## Patient

Old system: **two-phase, implicit registration** — `old/User/src/views/Login.vue` is phone + OTP only, no name/DOB/etc collected at signup; the account is created on first OTP verify and profile fields are filled in afterward on the profile page (`old/User/src/views/ProfilePages/Profile.vue`), all optional/no server-side enforcement seen in the form. Current system: **single-phase** — one form via `/patient/register` (`PatientRegisterSchema`), enforced with zod at signup.

| Field | In current | In old | Gap |
|---|---|---|---|
| Phone | ✓ required, unique | ✓ required (only field at signup) | same |
| Name | ✓ required at registration | ✗ not at signup — collected later on profile page, no required validation found | old lets a patient exist with no name |
| Date of birth | ✓ required, `DD/MM/YYYY`, at registration | ✗ not at signup — profile page, required client-side (`dobValid`), max=today | current enforces this earlier |
| Gender | optional (MALE/FEMALE/OTHER) | ✗ not at signup — profile page, required client-side, same 3 options | same options, different timing |
| Email | optional | ✗ not at signup — profile page, required client-side, regex-validated | old validates format; current schema uses zod `.email()` |
| Blood group | ✗ missing entirely from registration; exists later via `UpdateProfileSchema.bloodType` | ✗ not at signup — profile page, required client-side, 8-value dropdown (A+/A-/B+/B-/O+/O-/AB+/AB-) | present on both sides eventually, neither at signup |
| Address | ✗ missing entirely | ✗ not at signup — profile page, required client-side, free text | **current has no address field anywhere for patients** — old at least collects it post-signup |
| Profile photo | ✗ missing entirely | ✗ not at signup — separate upload action on profile page | old supports it, current doesn't have patient photo at all |
| PIN (4-digit) / password | optional at register, required to log in | ✗ no PIN/password — OTP-only login, every time | current adds a password layer old never had |
| Consent | ✓ required (`literal(true)`) | ✗ no explicit consent checkbox found; only a "By continuing, you agree to terms" footer link | new addition, not in old system |
| Height / weight | ✗ missing from registration, exists later via `UpdateProfileSchema` | ✗ not found anywhere in reviewed old patient files | neither collects at signup, current has the field defined for later |

**Net gap:** current patient registration is stricter up front (name, DOB, consent all required day one) but has dropped address and profile photo — old collected both (albeit post-signup, unenforced). Height/weight/blood-type exist as an `UpdateProfileSchema` field but nothing prompts the patient to fill them in.

---

## Doctor

Old system: **two-phase** — quick self-register (name/email/phone + OTP) creates an `ACTIVE` account with doctor status `PENDING`, then a required "complete your profile" flow (`UnderVerification.vue` gate) before admin approval flips status to `VERIFIED`. Current system: **single-phase** — one form + one file upload via `/doctor/register` (`DoctorRegisterSchema`), then `isApproved` flips by admin.

### Phase 1 — account creation

| Field | In current | In old | Gap |
|---|---|---|---|
| Phone | ✓ required, unique | ✓ required | same |
| Name | ✓ required | ✓ required (prefixed "Dr." for DOCTOR role type) | same, minus the title-prefix convenience |
| Password | ✓ required, min 8 chars | ✗ no password field — OTP-based only | current adds a credential old never asked for at this step |
| Email | ✗ missing entirely from doctor registration | ✓ required | **current never collects doctor email anywhere** |
| OTP verification | ✗ not part of registration (password + separate OTP login flow instead) | ✓ required to complete registration | old confirms phone ownership at signup; current doesn't |

### Phase 2 — professional/profile details

| Field | In current (`DoctorProfile`) | In old (`DoctorDetail` + child tables) | Gap |
|---|---|---|---|
| Medical degree | ✓ required (`degree`, single string) | ✓ via Education sub-table (qualification, college, city, passing year) — repeatable, each with a doc upload | current has no proof-of-degree document, no college/city/year, no way to list multiple degrees |
| Registration number | ✓ required, unique | ✓ `reg_number`, required | same |
| Registration council/year/type | ✗ missing | ✓ `reg_number` (council+no combined), `reg_year`, `reg_type` (Country/State) | current can't distinguish state vs national council registration |
| Specialization | ✓ optional, free text | ✓ linked lookup table, multi-select | current allows only one free-text value with no validation against a real list |
| Experience | ✗ missing | ✓ auto-calculated from `reg_year`, editable | patients on current system can't see doctor experience anywhere |
| License/ID proof | ✓ one PDF upload (`licenseDocKey`) | ✓ `proof` + `proofName` image upload | present both sides, different file type |
| Gender | ✗ missing | ✓ required | gap |
| Date of birth | ✗ missing | ✓ required, must be 18+ | gap, also means current has no adult-verification check on doctors |
| Alternate phone / email | ✗ missing | ✓ both present | gap |
| Address / city / state / pincode | ✗ missing | ✓ all present | gap |
| About / bio | ✗ missing | ✓ present, free text | current doctor listing has no doctor-facing description for patients to read |
| Profile photo | ✗ missing | ✓ separate upload action | **doctor cards in current app have no photo field at all** (confirmed via memory: gray-circle avatars are a known placeholder) |
| Signature image | ✗ missing | ✓ separate upload, used on prescriptions | current already generates prescription PDFs (`@react-pdf/renderer`) but has no signature to place on them |
| Consultation fee | ✗ missing | ✓ `fees` | **current has no per-doctor fee field at all** — payment amount must be hardcoded/global right now |
| Follow-up fee / follow-up days | ✗ missing | ✓ `followUpFees`, `followUpDays` | gap |
| Offline / studio-clinic fee tiers | ✗ missing | ✓ `offlineFees`, `offlineFollowUpFees`, `studioClinicFees` | **not applicable to madamGy** (video-only, no physical clinic tiers) — intentional non-gap |
| Expertise tags | ✗ missing | ✓ free-text multi-select, repeatable | minor gap, low priority |
| Hospital affiliation | ✗ missing | ✓ linked org, repeatable | **not applicable** (no multi-hospital model in madamGy) — intentional non-gap |
| Weekly schedule | ✗ missing | ✓ day/mode/status/leave dates, repeatable | current availability is just a single `isAvailable` boolean toggle — no actual weekly slot schedule anywhere |
| Bank details | ✗ missing | ✓ bank name, branch, IFSC, holder name, account number, repeatable | current has no payout-destination data at all — `walletBalance` accrues but withdrawal has nowhere to send money to |
| Availability toggle | ✓ `isAvailable` | ✓ implied by schedule table | current's version is a blunt on/off, old had real per-day slots |
| Approval state | ✓ `isApproved`, `approvedAt`, `approvedById` | ✓ `status` enum (PENDING/VERIFIED/IN_SERVICE/SUSPENDED) | current is boolean, old had 4 states including mid-service suspension — current can't represent "was verified, now suspended" distinctly from "never verified" |

### Recommended additions for madamGy (decided, not yet built)

Relevant to a video-consult-only platform — add to `DoctorProfile` + a new `DoctorEducation` child table:

- Profile: date of birth, gender, city, state, pincode, address, about, profile photo, alternate phone
- Consultation fee, follow-up fee, follow-up days (single online-fee tier)
- Registration council, registration year, registration type, auto-calculated experience
- Education history (repeatable: qualification, college, city, passing year, document upload) — this is the actual credential evidence an admin needs to approve a doctor
- Signature image (drops directly into the existing `@react-pdf/renderer` prescription flow)

Explicitly dropped as out of scope: bank details at registration (move to withdrawal request instead), expertise tags, hospital affiliation, offline/studio-clinic fee tiers, franchise/hospital-specific fields.

---

## Admin / Staff

Not self-registration in either system — created by a higher role.

| Field | Current (`StaffCreateSchema`, created by `SUPER_ADMIN` via `/admin/staff`) | Old |
|---|---|---|
| Role | `ADMIN` or `DOCTOR` (discriminated union) | broader role list: ADMIN, EMPLOYEE, DOCTOR, PATHOLOGIST, HOSPITAL, NURSE, AMBULANCE, FRANCHISE, LABORATORY, HOTEL, TRANSPORTATION, USER |
| Phone, name | required for both roles | required |
| Doctor-specific fields | degree, regNumber, specialization (same as self-register) | same profile-completion flow as self-registered doctors |
| Credential issuance | random temp PIN generated server-side, bcrypt-hashed, returned once to the creating admin | OTP-based, no password step |

`SUPER_ADMIN` itself is not created through any registration endpoint in the current system — implied to be seeded directly.

---

## Kiosk (device, not a user)

Current only — no equivalent in the old system (old system was pure web/mobile, no kiosk hardware concept).

| Field | Current (`KioskRegisterSchema`, tied to an `ADMIN` account) |
|---|---|
| Device ID | required, unique |
| Label | optional, max 100 chars |

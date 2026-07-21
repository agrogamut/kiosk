# Play Console Data Safety Form — MadamGy

Re-verify every row against `packages/server/src/prisma/schema.prisma` at submission
time before pasting into Play Console — this snapshot is dated 2026-07-21.

## Does your app collect or share any of the required user data types?
Yes.

## Data types collected

| Play Console category | Specific data | Collected? | Shared with third parties? | Purpose | Optional? | Deletable on request? |
|---|---|---|---|---|---|---|
| Personal info > Name | `User.name` | Yes | No | Account functionality | No | Yes (Task 1-2) |
| Personal info > Phone number | `User.phone` | Yes | No | Account functionality, OTP auth | No | Yes (tombstoned) |
| Personal info > Email address | `PatientProfile.email` | Yes | No | Account functionality | Yes | Yes |
| Personal info > Other (DOB, gender) | `PatientProfile.dob`, `PatientProfile.gender` | Yes | No | Account functionality | Gender: yes; DOB: no | Yes |
| Health and fitness > Health info | `PatientProfile.heightCm/weightKg/bloodType`, vitals in `ChatMessage.vitals`, `HealthFile`, `Prescription.content` | Yes | No (doctor treating the patient sees it; not a third party) | App functionality (telemedicine) | N/A | Personal identity yes; retained clinical records per Global Constraints |
| Financial info > Purchase history | `Payment` (amount, status) | Yes | Yes — Razorpay (payment processor) | Payment processing | No | Retained for financial audit |
| Financial info > Other | `WalletTransaction` (doctor/admin earnings) | Yes | No | App functionality (doctor payouts) | No | Retained for financial audit |
| Messages > In-app messages | `ChatMessage` (text, imageKey) | Yes | No | App functionality (consult chat) | No | Retained, tied to CallSession not identity after deletion |
| Photos and videos | Chat image attachments, lab report uploads (MinIO) | Yes | No | App functionality | Yes | Retained per above |
| App activity | Call session status/timing (`CallSession`) | Yes | No | App functionality | No | Retained |

## Security practices to declare
- Data is encrypted in transit (HTTPS/WSS).
- Users can request data deletion (`/delete-account`, in-app control — Tasks 3 and 5).
- Confirm with current infra whether data is encrypted at rest (check the Postgres/MinIO deployment config at submission time — not verified by this plan).

## Data collected but NOT covered above (verify still true at submission time)
- No location data collected.
- No contacts/calendar access.
- No advertising/analytics identifiers (no ad SDKs in `packages/web/package.json` as of this snapshot).

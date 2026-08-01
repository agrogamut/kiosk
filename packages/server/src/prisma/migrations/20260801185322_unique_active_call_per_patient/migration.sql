-- Partial unique index: a patient can have at most one CallSession in an active status
-- (QUEUED/RINGING/ACTIVE) at a time. Prisma's schema-level @@unique can't express a
-- filtered/partial index, so this is a hand-written migration.
CREATE UNIQUE INDEX "CallSession_patientId_active_key" ON "CallSession" ("patientId") WHERE "status" IN ('QUEUED', 'RINGING', 'ACTIVE');

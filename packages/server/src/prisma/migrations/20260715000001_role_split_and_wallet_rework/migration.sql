-- Role split: existing full-power ADMIN becomes SUPER_ADMIN, new narrower ADMIN added for kiosk owners
ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'ADMIN';

-- Wallet: every payable role (DOCTOR, ADMIN) now has a balance directly on User
ALTER TABLE "User" ADD COLUMN "walletBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "User" u
SET "walletBalance" = dp."walletBalance"
FROM "DoctorProfile" dp
WHERE dp."userId" = u.id;

ALTER TABLE "DoctorProfile" DROP COLUMN "walletBalance";
ALTER TABLE "DoctorProfile" DROP COLUMN "commissionRate";

-- WalletTransaction now belongs to either a doctor or an admin
ALTER TABLE "WalletTransaction" RENAME COLUMN "doctorId" TO "userId";

-- Kiosk device registration: opaque deviceId bound to an admin, resolved server-side only
CREATE TABLE "Kiosk" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kiosk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Kiosk_deviceId_key" ON "Kiosk"("deviceId");
CREATE INDEX "Kiosk_adminId_idx" ON "Kiosk"("adminId");

ALTER TABLE "Kiosk" ADD CONSTRAINT "Kiosk_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Revenue config: single row, runtime-editable, replaces CONSULTATION_FEE env var + per-doctor commissionRate
CREATE TABLE "RevenueConfig" (
    "id" TEXT NOT NULL,
    "consultationFee" DECIMAL(10,2) NOT NULL,
    "doctorPct" DECIMAL(5,2) NOT NULL,
    "adminPct" DECIMAL(5,2) NOT NULL,
    "superAdminPct" DECIMAL(5,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "RevenueConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RevenueConfig" ADD CONSTRAINT "RevenueConfig_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Payment: snapshot the split that applied at charge time (nullable — pre-existing rows predate this model)
ALTER TABLE "Payment" ADD COLUMN "doctorPct" DECIMAL(5,2);
ALTER TABLE "Payment" ADD COLUMN "adminPct" DECIMAL(5,2);
ALTER TABLE "Payment" ADD COLUMN "superAdminPct" DECIMAL(5,2);

-- CallSession: which kiosk admin, if any, this booking is attributed to
ALTER TABLE "CallSession" ADD COLUMN "assistingAdminId" TEXT;
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_assistingAdminId_fkey"
    FOREIGN KEY ("assistingAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

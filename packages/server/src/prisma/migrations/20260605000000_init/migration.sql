CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN');
CREATE TYPE "CallStatus" AS ENUM ('QUEUED', 'RINGING', 'ACTIVE', 'ENDED', 'MISSED', 'REJECTED', 'NO_DOCTOR');
CREATE TYPE "MsgType" AS ENUM ('TEXT', 'IMAGE', 'VITALS');
CREATE TYPE "FileType" AS ENUM ('PRESCRIPTION', 'LAB_REPORT', 'OTHER');
CREATE TYPE "TxnType" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "TxnStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'PATIENT',
  "pinHash" TEXT,
  "passwordHash" TEXT,
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "heightCm" DOUBLE PRECISION,
  "weightKg" DOUBLE PRECISION,
  "bloodType" TEXT,
  "dob" TIMESTAMP(3),
  CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DoctorProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "degree" TEXT NOT NULL,
  "regNumber" TEXT NOT NULL,
  "specialization" TEXT,
  "isAvailable" BOOLEAN NOT NULL DEFAULT false,
  "isApproved" BOOLEAN NOT NULL DEFAULT false,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "walletBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "commissionRate" DECIMAL(4,2) NOT NULL DEFAULT 0.80,
  CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CallSession" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "doctorId" TEXT,
  "status" "CallStatus" NOT NULL DEFAULT 'QUEUED',
  "livekitRoom" TEXT NOT NULL,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "callSessionId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "content" TEXT,
  "imageKey" TEXT,
  "vitals" JSONB,
  "type" "MsgType" NOT NULL DEFAULT 'TEXT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Prescription" (
  "id" TEXT NOT NULL,
  "callSessionId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "objectKey" TEXT,
  "pdfReady" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthFile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "prescriptionId" TEXT,
  "name" TEXT NOT NULL,
  "type" "FileType" NOT NULL,
  "objectKey" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletTransaction" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "callSessionId" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "type" "TxnType" NOT NULL,
  "status" "TxnStatus" NOT NULL DEFAULT 'PENDING',
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");
CREATE UNIQUE INDEX "DoctorProfile_regNumber_key" ON "DoctorProfile"("regNumber");
CREATE INDEX "DoctorProfile_isAvailable_idx" ON "DoctorProfile"("isAvailable");
CREATE UNIQUE INDEX "CallSession_livekitRoom_key" ON "CallSession"("livekitRoom");
CREATE INDEX "CallSession_patientId_idx" ON "CallSession"("patientId");
CREATE INDEX "CallSession_status_idx" ON "CallSession"("status");
CREATE INDEX "ChatMessage_callSessionId_idx" ON "ChatMessage"("callSessionId");
CREATE UNIQUE INDEX "Prescription_callSessionId_key" ON "Prescription"("callSessionId");
CREATE UNIQUE INDEX "HealthFile_prescriptionId_key" ON "HealthFile"("prescriptionId");
CREATE INDEX "HealthFile_userId_createdAt_idx" ON "HealthFile"("userId", "createdAt");
CREATE INDEX "WalletTransaction_doctorId_createdAt_idx" ON "WalletTransaction"("doctorId", "createdAt");

ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthFile" ADD CONSTRAINT "HealthFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthFile" ADD CONSTRAINT "HealthFile_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

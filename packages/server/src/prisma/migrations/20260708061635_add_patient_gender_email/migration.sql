-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN     "email" TEXT,
ADD COLUMN     "gender" "Gender";

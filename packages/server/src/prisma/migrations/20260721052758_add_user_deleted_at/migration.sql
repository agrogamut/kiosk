-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- RenameForeignKey
ALTER TABLE "WalletTransaction" RENAME CONSTRAINT "WalletTransaction_doctorId_fkey" TO "WalletTransaction_userId_fkey";

-- RenameIndex
ALTER INDEX "WalletTransaction_doctorId_createdAt_idx" RENAME TO "WalletTransaction_userId_createdAt_idx";

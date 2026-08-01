-- AlterTable
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_callSessionId_userId_type_key" UNIQUE ("callSessionId", "userId", "type");

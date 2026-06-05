import { z } from "zod";

export const TxnTypeSchema = z.enum(["CREDIT", "DEBIT"]);
export const TxnStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);

export const WalletTransactionSchema = z.object({
  id: z.string(),
  doctorId: z.string(),
  callSessionId: z.string().nullable(),
  amount: z.string(),
  type: TxnTypeSchema,
  status: TxnStatusSchema,
  description: z.string().nullable(),
  createdAt: z.string(),
});
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;

export const WithdrawRequestSchema = z.object({
  amount: z.number().positive(),
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  ifsc: z.string().min(1),
  holderName: z.string().min(1),
});
export type WithdrawRequest = z.infer<typeof WithdrawRequestSchema>;

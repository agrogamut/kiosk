import { z } from "zod";
export const TxnTypeSchema = z.enum(["CREDIT", "DEBIT"]);
export const TxnStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);
export const BankDetailsSchema = z.object({
    bankName: z.string(),
    accountNumber: z.string(),
    ifsc: z.string(),
    holderName: z.string(),
});
export const WalletTransactionSchema = z.object({
    id: z.string(),
    userId: z.string(),
    callSessionId: z.string().nullable(),
    amount: z.string(),
    type: TxnTypeSchema,
    status: TxnStatusSchema,
    description: z.string().nullable(),
    bankDetails: BankDetailsSchema.nullable().optional(),
    createdAt: z.string(),
});
export const WithdrawRequestSchema = z.object({
    amount: z.number().positive("Enter an amount greater than 0"),
    bankName: z.string().min(1, "Enter your bank name"),
    accountNumber: z.string().min(1, "Enter your account number"),
    ifsc: z.string().min(1, "Enter your IFSC code"),
    holderName: z.string().min(1, "Enter the account holder name"),
});
export const RevenueConfigUpdateSchema = z.object({
    consultationFee: z.number().positive("Enter a consultation fee greater than 0"),
    doctorPct: z.number().min(0, "Must be between 0 and 100").max(100, "Must be between 0 and 100"),
    adminPct: z.number().min(0, "Must be between 0 and 100").max(100, "Must be between 0 and 100"),
    superAdminPct: z.number().min(0, "Must be between 0 and 100").max(100, "Must be between 0 and 100"),
});
//# sourceMappingURL=wallet.schema.js.map
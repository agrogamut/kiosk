import { z } from "zod";
export declare const TxnTypeSchema: z.ZodEnum<["CREDIT", "DEBIT"]>;
export declare const TxnStatusSchema: z.ZodEnum<["PENDING", "COMPLETED", "FAILED"]>;
export declare const BankDetailsSchema: z.ZodObject<{
    bankName: z.ZodString;
    accountNumber: z.ZodString;
    ifsc: z.ZodString;
    holderName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    bankName: string;
    accountNumber: string;
    ifsc: string;
    holderName: string;
}, {
    bankName: string;
    accountNumber: string;
    ifsc: string;
    holderName: string;
}>;
export type BankDetails = z.infer<typeof BankDetailsSchema>;
export declare const WalletTransactionSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    callSessionId: z.ZodNullable<z.ZodString>;
    amount: z.ZodString;
    type: z.ZodEnum<["CREDIT", "DEBIT"]>;
    status: z.ZodEnum<["PENDING", "COMPLETED", "FAILED"]>;
    description: z.ZodNullable<z.ZodString>;
    bankDetails: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        bankName: z.ZodString;
        accountNumber: z.ZodString;
        ifsc: z.ZodString;
        holderName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        bankName: string;
        accountNumber: string;
        ifsc: string;
        holderName: string;
    }, {
        bankName: string;
        accountNumber: string;
        ifsc: string;
        holderName: string;
    }>>>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "CREDIT" | "DEBIT";
    status: "PENDING" | "COMPLETED" | "FAILED";
    id: string;
    createdAt: string;
    callSessionId: string | null;
    userId: string;
    amount: string;
    description: string | null;
    bankDetails?: {
        bankName: string;
        accountNumber: string;
        ifsc: string;
        holderName: string;
    } | null | undefined;
}, {
    type: "CREDIT" | "DEBIT";
    status: "PENDING" | "COMPLETED" | "FAILED";
    id: string;
    createdAt: string;
    callSessionId: string | null;
    userId: string;
    amount: string;
    description: string | null;
    bankDetails?: {
        bankName: string;
        accountNumber: string;
        ifsc: string;
        holderName: string;
    } | null | undefined;
}>;
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;
export declare const WithdrawRequestSchema: z.ZodObject<{
    amount: z.ZodNumber;
    bankName: z.ZodString;
    accountNumber: z.ZodString;
    ifsc: z.ZodString;
    holderName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    bankName: string;
    accountNumber: string;
    ifsc: string;
    holderName: string;
    amount: number;
}, {
    bankName: string;
    accountNumber: string;
    ifsc: string;
    holderName: string;
    amount: number;
}>;
export type WithdrawRequest = z.infer<typeof WithdrawRequestSchema>;
export declare const RevenueConfigUpdateSchema: z.ZodObject<{
    consultationFee: z.ZodNumber;
    doctorPct: z.ZodNumber;
    adminPct: z.ZodNumber;
    superAdminPct: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    consultationFee: number;
    doctorPct: number;
    adminPct: number;
    superAdminPct: number;
}, {
    consultationFee: number;
    doctorPct: number;
    adminPct: number;
    superAdminPct: number;
}>;
export type RevenueConfigUpdate = z.infer<typeof RevenueConfigUpdateSchema>;
//# sourceMappingURL=wallet.schema.d.ts.map
import { z } from "zod";
export declare const AccountDeleteInitiateSchema: z.ZodObject<{
    phone: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
}, {
    phone: string;
}>;
export type AccountDeleteInitiate = z.infer<typeof AccountDeleteInitiateSchema>;
export declare const AccountDeleteVerifySchema: z.ZodObject<{
    phone: z.ZodString;
    otp: z.ZodString;
    password: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    phone: string;
    otp: string;
    password?: string | undefined;
}, {
    phone: string;
    otp: string;
    password?: string | undefined;
}>;
export type AccountDeleteVerify = z.infer<typeof AccountDeleteVerifySchema>;
//# sourceMappingURL=account.schema.d.ts.map
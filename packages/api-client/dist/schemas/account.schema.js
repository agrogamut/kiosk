import { z } from "zod";
const phoneField = z.string().min(10, "Enter a valid phone number").max(15, "Enter a valid phone number");
const otpField = z.string().length(6, "Enter the 6-digit code").regex(/^\d{6}$/, "Enter the 6-digit code");
export const AccountDeleteInitiateSchema = z.object({
    phone: phoneField,
});
export const AccountDeleteVerifySchema = z.object({
    phone: phoneField,
    otp: otpField,
    password: z.string().optional(),
});
//# sourceMappingURL=account.schema.js.map
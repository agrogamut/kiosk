import { z } from "zod";

export const AccountDeleteInitiateSchema = z.object({
  phone: z.string().min(10).max(15),
});
export type AccountDeleteInitiate = z.infer<typeof AccountDeleteInitiateSchema>;

export const AccountDeleteVerifySchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6).regex(/^\d{6}$/),
});
export type AccountDeleteVerify = z.infer<typeof AccountDeleteVerifySchema>;

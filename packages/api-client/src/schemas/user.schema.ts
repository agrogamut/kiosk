import { z } from "zod";

export const UserRoleSchema = z.enum(["PATIENT", "DOCTOR", "ADMIN"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  image: z.string().url().nullable().optional(),
  role: UserRoleSchema.default("PATIENT"),
  heightCm: z.number().positive().nullable().optional(),
  weightKg: z.number().positive().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  bloodType: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  disabled: z.boolean().default(false),
  createdAt: z.string().datetime().optional(),
});

export type User = z.infer<typeof UserSchema>;

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  heightCm: z.number().positive().max(300).optional(),
  weightKg: z.number().positive().max(500).optional(),
  dueDate: z.string().optional(),
  bloodType: z.string().max(10).optional(),
  phone: z.string().max(20).optional(),
});

export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;

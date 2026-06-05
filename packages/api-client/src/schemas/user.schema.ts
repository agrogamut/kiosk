import { z } from "zod";

export const UserRoleSchema = z.enum(["PATIENT", "DOCTOR", "ADMIN"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PatientRegisterSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(100),
  dob: z.string().min(1),
  pin: z.string().length(4).regex(/^\d{4}$/),
});
export type PatientRegister = z.infer<typeof PatientRegisterSchema>;

export const PatientLoginSchema = z.object({
  phone: z.string().min(10).max(15),
  pin: z.string().length(4).regex(/^\d{4}$/),
});
export type PatientLogin = z.infer<typeof PatientLoginSchema>;

export const DoctorRegisterSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
  degree: z.string().min(1),
  regNumber: z.string().min(1),
  specialization: z.string().optional(),
});
export type DoctorRegister = z.infer<typeof DoctorRegisterSchema>;

export const DoctorLoginInitiateSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(1),
});
export type DoctorLoginInitiate = z.infer<typeof DoctorLoginInitiateSchema>;

export const DoctorLoginVerifySchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6).regex(/^\d{6}$/),
});
export type DoctorLoginVerify = z.infer<typeof DoctorLoginVerifySchema>;

export const AdminLoginSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(1),
});
export type AdminLogin = z.infer<typeof AdminLoginSchema>;

export const UserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  name: z.string(),
  role: UserRoleSchema,
  disabled: z.boolean(),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  heightCm: z.number().positive().max(300).optional(),
  weightKg: z.number().positive().max(500).optional(),
  bloodType: z.string().max(10).optional(),
  dob: z.string().min(1).optional(),
});
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;

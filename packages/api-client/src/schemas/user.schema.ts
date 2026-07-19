import { z } from "zod";

const dateOfBirthPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const minDateOfBirthYear = 1900;

function isValidDateOfBirth(value: string): boolean {
  const match = dateOfBirthPattern.exec(value);
  if (!match) {
    return false;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  return (
    year >= minDateOfBirthYear &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date <= todayUtc
  );
}

export const UserRoleSchema = z.enum(["PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const GenderSchema = z.enum(["MALE", "FEMALE", "OTHER"]);
export type Gender = z.infer<typeof GenderSchema>;

export const DateOfBirthSchema = z.string().refine(isValidDateOfBirth, {
  message: "Date of birth must be a valid date in DD/MM/YYYY format",
});

export const PatientRegisterSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(100),
  dob: DateOfBirthSchema,
  gender: GenderSchema.optional(),
  email: z.string().email().optional(),
  pin: z.string().length(4).regex(/^\d{4}$/).optional(),
  consent: z.literal(true),
});
export type PatientRegister = z.infer<typeof PatientRegisterSchema>;

export const PatientLoginSchema = z.object({
  phone: z.string().min(10).max(15),
  pin: z.string().length(4).regex(/^\d{4}$/),
});
export type PatientLogin = z.infer<typeof PatientLoginSchema>;

export const PatientLoginOtpInitiateSchema = z.object({
  phone: z.string().min(10).max(15),
});
export type PatientLoginOtpInitiate = z.infer<typeof PatientLoginOtpInitiateSchema>;

export const PatientLoginOtpVerifySchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6).regex(/^\d{6}$/),
});
export type PatientLoginOtpVerify = z.infer<typeof PatientLoginOtpVerifySchema>;

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

export const StaffCreateSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("ADMIN"),
    phone: z.string().min(10).max(15),
    name: z.string().min(1).max(100),
  }),
  z.object({
    role: z.literal("DOCTOR"),
    phone: z.string().min(10).max(15),
    name: z.string().min(1).max(100),
    degree: z.string().min(1),
    regNumber: z.string().min(1),
    specialization: z.string().optional(),
  }),
]);
export type StaffCreate = z.infer<typeof StaffCreateSchema>;

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  heightCm: z.number().positive().max(300).optional(),
  weightKg: z.number().positive().max(500).optional(),
  bloodType: z.string().max(10).optional(),
  dob: DateOfBirthSchema.optional(),
});
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;

export const KioskRegisterSchema = z.object({
  deviceId: z.string().min(1),
  label: z.string().max(100).optional(),
});
export type KioskRegister = z.infer<typeof KioskRegisterSchema>;

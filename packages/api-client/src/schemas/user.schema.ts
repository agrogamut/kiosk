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

const phoneField = z.string().min(10, "Enter a valid phone number").max(15, "Enter a valid phone number");
const nameField = z.string().min(1, "Enter your name").max(100, "Name is too long");
const otpField = z.string().length(6, "Enter the 6-digit code").regex(/^\d{6}$/, "Enter the 6-digit code");
const pinField = z.string().length(4, "PIN must be 4 digits").regex(/^\d{4}$/, "PIN must be 4 digits");

// Step one of sign-up: the details, checked and answered with a code sent to the phone. Nothing
// is written until step two, so a number typed here does not become an account.
export const PatientRegisterInitiateSchema = z.object({
  phone: phoneField,
  name: nameField,
  dob: DateOfBirthSchema,
  gender: GenderSchema.optional(),
  email: z.string().email("Enter a valid email address").optional(),
  pin: pinField.optional(),
  consent: z.literal(true),
});
export type PatientRegisterInitiate = z.infer<typeof PatientRegisterInitiateSchema>;

// Step two: the same details plus the code, which is what actually creates the account.
export const PatientRegisterSchema = PatientRegisterInitiateSchema.extend({ otp: otpField });
export type PatientRegister = z.infer<typeof PatientRegisterSchema>;

export const PatientLoginSchema = z.object({
  phone: phoneField,
  pin: pinField,
});
export type PatientLogin = z.infer<typeof PatientLoginSchema>;

export const PatientLoginOtpInitiateSchema = z.object({
  phone: phoneField,
});
export type PatientLoginOtpInitiate = z.infer<typeof PatientLoginOtpInitiateSchema>;

export const PatientLoginOtpVerifySchema = z.object({
  phone: phoneField,
  otp: otpField,
});
export type PatientLoginOtpVerify = z.infer<typeof PatientLoginOtpVerifySchema>;

export const DoctorEducationEntrySchema = z.object({
  degree: z.string().min(1, "Enter the degree"),
  institution: z.string().min(1, "Enter the institution"),
  year: z.string().max(20).optional(),
});
export type DoctorEducationEntry = z.infer<typeof DoctorEducationEntrySchema>;

export const DoctorExperienceEntrySchema = z.object({
  organization: z.string().min(1, "Enter the organization"),
  role: z.string().max(100).optional(),
  years: z.string().max(20).optional(),
});
export type DoctorExperienceEntry = z.infer<typeof DoctorExperienceEntrySchema>;

export const DoctorHospitalEntrySchema = z.object({
  name: z.string().min(1, "Enter the hospital or clinic name"),
  address: z.string().max(250).optional(),
});
export type DoctorHospitalEntry = z.infer<typeof DoctorHospitalEntrySchema>;

export const DoctorRegisterSchema = z.object({
  phone: phoneField,
  name: nameField,
  password: z.string().min(8, "Password must be at least 8 characters"),
  degree: z.string().min(1, "Enter your medical degree"),
  regNumber: z.string().min(1, "Enter your registration number"),
  regYear: z.string().min(1, "Enter your registration year"),
  regType: z.string().min(1, "Enter your registration type/council"),
  email: z.string().email("Enter a valid email address"),
  altMobile: z.string().max(20).optional(),
  gender: GenderSchema,
  dob: DateOfBirthSchema,
  experienceYears: z.coerce.number().int().min(0, "Enter years of experience").max(80),
  city: z.string().min(1, "Enter your city"),
  state: z.string().min(1, "Enter your state"),
  pincode: z.string().max(20).optional(),
  address: z.string().min(1, "Enter your clinic/practice address"),
  about: z.string().min(1, "Tell patients a bit about yourself"),
  specializations: z.array(z.string().min(1)).min(1, "Add at least one specialization"),
  educations: z.array(DoctorEducationEntrySchema).min(1, "Add at least one qualification"),
  experiences: z.array(DoctorExperienceEntrySchema).optional(),
  hospitals: z.array(DoctorHospitalEntrySchema).optional(),
});
export type DoctorRegister = z.infer<typeof DoctorRegisterSchema>;

export const DoctorLoginInitiateSchema = z.object({
  phone: phoneField,
  password: z.string().min(1, "Enter your password"),
});
export type DoctorLoginInitiate = z.infer<typeof DoctorLoginInitiateSchema>;

export const DoctorLoginVerifySchema = z.object({
  phone: phoneField,
  otp: otpField,
});
export type DoctorLoginVerify = z.infer<typeof DoctorLoginVerifySchema>;

export const AdminLoginSchema = z.object({
  phone: phoneField,
  password: z.string().min(1, "Enter your password"),
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
    role: z.literal("PATIENT"),
    phone: phoneField,
    name: nameField,
  }),
  z.object({
    role: z.literal("ADMIN"),
    phone: phoneField,
    name: nameField,
  }),
  z.object({
    role: z.literal("DOCTOR"),
    phone: phoneField,
    name: nameField,
    degree: z.string().min(1, "Enter your medical degree"),
    regNumber: z.string().min(1, "Enter your registration number"),
    specialization: z.string().optional(),
  }),
]);
export type StaffCreate = z.infer<typeof StaffCreateSchema>;

export const UserUpdateSchema = z.object({
  name: nameField,
  phone: phoneField,
});
export type UserUpdate = z.infer<typeof UserUpdateSchema>;

export const DoctorProfileUpdateSchema = z.object({
  degree: z.string().min(1, "Enter a medical degree"),
  regNumber: z.string().min(1, "Enter a registration number"),
  specialization: z.string().optional(),
});
export type DoctorProfileUpdate = z.infer<typeof DoctorProfileUpdateSchema>;

export const UpdateProfileSchema = z.object({
  name: nameField.optional(),
  heightCm: z.number().positive("Enter a valid height").max(300, "Enter a valid height").optional(),
  weightKg: z.number().positive("Enter a valid weight").max(500, "Enter a valid weight").optional(),
  bloodType: z.string().max(10, "Enter a valid blood type").optional(),
  dob: DateOfBirthSchema.optional(),
});
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;

export const KioskRegisterSchema = z.object({
  deviceId: z.string().min(1, "Enter a device ID"),
  label: z.string().max(100, "Label is too long").optional(),
});
export type KioskRegister = z.infer<typeof KioskRegisterSchema>;

export const KioskSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  adminId: z.string(),
  label: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
});
export type Kiosk = z.infer<typeof KioskSchema>;

export const AuditLogSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: z.string(),
  targetId: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
  actor: z.object({
    id: z.string(),
    name: z.string(),
    role: UserRoleSchema,
  }),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

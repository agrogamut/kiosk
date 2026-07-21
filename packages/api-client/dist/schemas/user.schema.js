import { z } from "zod";
const dateOfBirthPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const minDateOfBirthYear = 1900;
function isValidDateOfBirth(value) {
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
    return (year >= minDateOfBirthYear &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day &&
        date <= todayUtc);
}
export const UserRoleSchema = z.enum(["PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"]);
export const GenderSchema = z.enum(["MALE", "FEMALE", "OTHER"]);
export const DateOfBirthSchema = z.string().refine(isValidDateOfBirth, {
    message: "Date of birth must be a valid date in DD/MM/YYYY format",
});
const phoneField = z.string().min(10, "Enter a valid phone number").max(15, "Enter a valid phone number");
const nameField = z.string().min(1, "Enter your name").max(100, "Name is too long");
const otpField = z.string().length(6, "Enter the 6-digit code").regex(/^\d{6}$/, "Enter the 6-digit code");
const pinField = z.string().length(4, "PIN must be 4 digits").regex(/^\d{4}$/, "PIN must be 4 digits");
export const PatientRegisterSchema = z.object({
    phone: phoneField,
    name: nameField,
    dob: DateOfBirthSchema,
    gender: GenderSchema.optional(),
    email: z.string().email("Enter a valid email address").optional(),
    pin: pinField.optional(),
    consent: z.literal(true),
});
export const PatientLoginSchema = z.object({
    phone: phoneField,
    pin: pinField,
});
export const PatientLoginOtpInitiateSchema = z.object({
    phone: phoneField,
});
export const PatientLoginOtpVerifySchema = z.object({
    phone: phoneField,
    otp: otpField,
});
export const DoctorRegisterSchema = z.object({
    phone: phoneField,
    name: nameField,
    password: z.string().min(8, "Password must be at least 8 characters"),
    degree: z.string().min(1, "Enter your medical degree"),
    regNumber: z.string().min(1, "Enter your registration number"),
    specialization: z.string().optional(),
});
export const DoctorLoginInitiateSchema = z.object({
    phone: phoneField,
    password: z.string().min(1, "Enter your password"),
});
export const DoctorLoginVerifySchema = z.object({
    phone: phoneField,
    otp: otpField,
});
export const AdminLoginSchema = z.object({
    phone: phoneField,
    password: z.string().min(1, "Enter your password"),
});
export const UserSchema = z.object({
    id: z.string(),
    phone: z.string(),
    name: z.string(),
    role: UserRoleSchema,
    disabled: z.boolean(),
    createdAt: z.string(),
});
export const StaffCreateSchema = z.discriminatedUnion("role", [
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
export const UpdateProfileSchema = z.object({
    name: nameField.optional(),
    heightCm: z.number().positive("Enter a valid height").max(300, "Enter a valid height").optional(),
    weightKg: z.number().positive("Enter a valid weight").max(500, "Enter a valid weight").optional(),
    bloodType: z.string().max(10, "Enter a valid blood type").optional(),
    dob: DateOfBirthSchema.optional(),
});
export const KioskRegisterSchema = z.object({
    deviceId: z.string().min(1, "Enter a device ID"),
    label: z.string().max(100, "Label is too long").optional(),
});
export const KioskSchema = z.object({
    id: z.string(),
    deviceId: z.string(),
    adminId: z.string(),
    label: z.string().nullable(),
    active: z.boolean(),
    createdAt: z.string(),
});
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
//# sourceMappingURL=user.schema.js.map
import { z } from "zod";
export declare const UserRoleSchema: z.ZodEnum<["PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"]>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export declare const GenderSchema: z.ZodEnum<["MALE", "FEMALE", "OTHER"]>;
export type Gender = z.infer<typeof GenderSchema>;
export declare const DateOfBirthSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const PatientRegisterSchema: z.ZodObject<{
    phone: z.ZodString;
    name: z.ZodString;
    dob: z.ZodEffects<z.ZodString, string, string>;
    gender: z.ZodOptional<z.ZodEnum<["MALE", "FEMALE", "OTHER"]>>;
    email: z.ZodOptional<z.ZodString>;
    pin: z.ZodOptional<z.ZodString>;
    consent: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    phone: string;
    name: string;
    dob: string;
    consent: true;
    gender?: "MALE" | "FEMALE" | "OTHER" | undefined;
    email?: string | undefined;
    pin?: string | undefined;
}, {
    phone: string;
    name: string;
    dob: string;
    consent: true;
    gender?: "MALE" | "FEMALE" | "OTHER" | undefined;
    email?: string | undefined;
    pin?: string | undefined;
}>;
export type PatientRegister = z.infer<typeof PatientRegisterSchema>;
export declare const PatientLoginSchema: z.ZodObject<{
    phone: z.ZodString;
    pin: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
    pin: string;
}, {
    phone: string;
    pin: string;
}>;
export type PatientLogin = z.infer<typeof PatientLoginSchema>;
export declare const PatientLoginOtpInitiateSchema: z.ZodObject<{
    phone: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
}, {
    phone: string;
}>;
export type PatientLoginOtpInitiate = z.infer<typeof PatientLoginOtpInitiateSchema>;
export declare const PatientLoginOtpVerifySchema: z.ZodObject<{
    phone: z.ZodString;
    otp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
    otp: string;
}, {
    phone: string;
    otp: string;
}>;
export type PatientLoginOtpVerify = z.infer<typeof PatientLoginOtpVerifySchema>;
export declare const DoctorEducationEntrySchema: z.ZodObject<{
    degree: z.ZodString;
    institution: z.ZodString;
    year: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    degree: string;
    institution: string;
    year?: string | undefined;
}, {
    degree: string;
    institution: string;
    year?: string | undefined;
}>;
export type DoctorEducationEntry = z.infer<typeof DoctorEducationEntrySchema>;
export declare const DoctorExperienceEntrySchema: z.ZodObject<{
    organization: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
    years: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    organization: string;
    role?: string | undefined;
    years?: string | undefined;
}, {
    organization: string;
    role?: string | undefined;
    years?: string | undefined;
}>;
export type DoctorExperienceEntry = z.infer<typeof DoctorExperienceEntrySchema>;
export declare const DoctorHospitalEntrySchema: z.ZodObject<{
    name: z.ZodString;
    address: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    address?: string | undefined;
}, {
    name: string;
    address?: string | undefined;
}>;
export type DoctorHospitalEntry = z.infer<typeof DoctorHospitalEntrySchema>;
export declare const DoctorRegisterSchema: z.ZodObject<{
    phone: z.ZodString;
    name: z.ZodString;
    password: z.ZodString;
    degree: z.ZodString;
    regNumber: z.ZodString;
    regYear: z.ZodString;
    regType: z.ZodString;
    email: z.ZodString;
    altMobile: z.ZodOptional<z.ZodString>;
    gender: z.ZodEnum<["MALE", "FEMALE", "OTHER"]>;
    dob: z.ZodEffects<z.ZodString, string, string>;
    experienceYears: z.ZodNumber;
    city: z.ZodString;
    state: z.ZodString;
    pincode: z.ZodOptional<z.ZodString>;
    address: z.ZodString;
    about: z.ZodString;
    specializations: z.ZodArray<z.ZodString, "many">;
    educations: z.ZodArray<z.ZodObject<{
        degree: z.ZodString;
        institution: z.ZodString;
        year: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        degree: string;
        institution: string;
        year?: string | undefined;
    }, {
        degree: string;
        institution: string;
        year?: string | undefined;
    }>, "many">;
    experiences: z.ZodOptional<z.ZodArray<z.ZodObject<{
        organization: z.ZodString;
        role: z.ZodOptional<z.ZodString>;
        years: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        organization: string;
        role?: string | undefined;
        years?: string | undefined;
    }, {
        organization: string;
        role?: string | undefined;
        years?: string | undefined;
    }>, "many">>;
    hospitals: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        address: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        address?: string | undefined;
    }, {
        name: string;
        address?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    phone: string;
    name: string;
    dob: string;
    gender: "MALE" | "FEMALE" | "OTHER";
    email: string;
    degree: string;
    address: string;
    password: string;
    regNumber: string;
    regYear: string;
    regType: string;
    experienceYears: number;
    city: string;
    state: string;
    about: string;
    specializations: string[];
    educations: {
        degree: string;
        institution: string;
        year?: string | undefined;
    }[];
    altMobile?: string | undefined;
    pincode?: string | undefined;
    experiences?: {
        organization: string;
        role?: string | undefined;
        years?: string | undefined;
    }[] | undefined;
    hospitals?: {
        name: string;
        address?: string | undefined;
    }[] | undefined;
}, {
    phone: string;
    name: string;
    dob: string;
    gender: "MALE" | "FEMALE" | "OTHER";
    email: string;
    degree: string;
    address: string;
    password: string;
    regNumber: string;
    regYear: string;
    regType: string;
    experienceYears: number;
    city: string;
    state: string;
    about: string;
    specializations: string[];
    educations: {
        degree: string;
        institution: string;
        year?: string | undefined;
    }[];
    altMobile?: string | undefined;
    pincode?: string | undefined;
    experiences?: {
        organization: string;
        role?: string | undefined;
        years?: string | undefined;
    }[] | undefined;
    hospitals?: {
        name: string;
        address?: string | undefined;
    }[] | undefined;
}>;
export type DoctorRegister = z.infer<typeof DoctorRegisterSchema>;
export declare const DoctorLoginInitiateSchema: z.ZodObject<{
    phone: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
    password: string;
}, {
    phone: string;
    password: string;
}>;
export type DoctorLoginInitiate = z.infer<typeof DoctorLoginInitiateSchema>;
export declare const DoctorLoginVerifySchema: z.ZodObject<{
    phone: z.ZodString;
    otp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
    otp: string;
}, {
    phone: string;
    otp: string;
}>;
export type DoctorLoginVerify = z.infer<typeof DoctorLoginVerifySchema>;
export declare const AdminLoginSchema: z.ZodObject<{
    phone: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
    password: string;
}, {
    phone: string;
    password: string;
}>;
export type AdminLogin = z.infer<typeof AdminLoginSchema>;
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    phone: z.ZodString;
    name: z.ZodString;
    role: z.ZodEnum<["PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"]>;
    disabled: z.ZodBoolean;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
    name: string;
    role: "PATIENT" | "DOCTOR" | "ADMIN" | "SUPER_ADMIN";
    id: string;
    disabled: boolean;
    createdAt: string;
}, {
    phone: string;
    name: string;
    role: "PATIENT" | "DOCTOR" | "ADMIN" | "SUPER_ADMIN";
    id: string;
    disabled: boolean;
    createdAt: string;
}>;
export type User = z.infer<typeof UserSchema>;
export declare const StaffCreateSchema: z.ZodDiscriminatedUnion<"role", [z.ZodObject<{
    role: z.ZodLiteral<"PATIENT">;
    phone: z.ZodString;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
    name: string;
    role: "PATIENT";
}, {
    phone: string;
    name: string;
    role: "PATIENT";
}>, z.ZodObject<{
    role: z.ZodLiteral<"ADMIN">;
    phone: z.ZodString;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
    name: string;
    role: "ADMIN";
}, {
    phone: string;
    name: string;
    role: "ADMIN";
}>, z.ZodObject<{
    role: z.ZodLiteral<"DOCTOR">;
    phone: z.ZodString;
    name: z.ZodString;
    degree: z.ZodString;
    regNumber: z.ZodString;
    specialization: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    phone: string;
    name: string;
    degree: string;
    role: "DOCTOR";
    regNumber: string;
    specialization?: string | undefined;
}, {
    phone: string;
    name: string;
    degree: string;
    role: "DOCTOR";
    regNumber: string;
    specialization?: string | undefined;
}>]>;
export type StaffCreate = z.infer<typeof StaffCreateSchema>;
export declare const UserUpdateSchema: z.ZodObject<{
    name: z.ZodString;
    phone: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
    name: string;
}, {
    phone: string;
    name: string;
}>;
export type UserUpdate = z.infer<typeof UserUpdateSchema>;
export declare const DoctorProfileUpdateSchema: z.ZodObject<{
    degree: z.ZodString;
    regNumber: z.ZodString;
    specialization: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    degree: string;
    regNumber: string;
    specialization?: string | undefined;
}, {
    degree: string;
    regNumber: string;
    specialization?: string | undefined;
}>;
export type DoctorProfileUpdate = z.infer<typeof DoctorProfileUpdateSchema>;
export declare const UpdateProfileSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    heightCm: z.ZodOptional<z.ZodNumber>;
    weightKg: z.ZodOptional<z.ZodNumber>;
    bloodType: z.ZodOptional<z.ZodString>;
    dob: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    dob?: string | undefined;
    heightCm?: number | undefined;
    weightKg?: number | undefined;
    bloodType?: string | undefined;
}, {
    name?: string | undefined;
    dob?: string | undefined;
    heightCm?: number | undefined;
    weightKg?: number | undefined;
    bloodType?: string | undefined;
}>;
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
export declare const KioskRegisterSchema: z.ZodObject<{
    deviceId: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    deviceId: string;
    label?: string | undefined;
}, {
    deviceId: string;
    label?: string | undefined;
}>;
export type KioskRegister = z.infer<typeof KioskRegisterSchema>;
export declare const KioskSchema: z.ZodObject<{
    id: z.ZodString;
    deviceId: z.ZodString;
    adminId: z.ZodString;
    label: z.ZodNullable<z.ZodString>;
    active: z.ZodBoolean;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    deviceId: string;
    label: string | null;
    adminId: string;
    active: boolean;
}, {
    id: string;
    createdAt: string;
    deviceId: string;
    label: string | null;
    adminId: string;
    active: boolean;
}>;
export type Kiosk = z.infer<typeof KioskSchema>;
export declare const AuditLogSchema: z.ZodObject<{
    id: z.ZodString;
    actorId: z.ZodString;
    action: z.ZodString;
    targetId: z.ZodNullable<z.ZodString>;
    metadata: z.ZodNullable<z.ZodUnknown>;
    createdAt: z.ZodString;
    actor: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        role: z.ZodEnum<["PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"]>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        role: "PATIENT" | "DOCTOR" | "ADMIN" | "SUPER_ADMIN";
        id: string;
    }, {
        name: string;
        role: "PATIENT" | "DOCTOR" | "ADMIN" | "SUPER_ADMIN";
        id: string;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    actorId: string;
    action: string;
    targetId: string | null;
    actor: {
        name: string;
        role: "PATIENT" | "DOCTOR" | "ADMIN" | "SUPER_ADMIN";
        id: string;
    };
    metadata?: unknown;
}, {
    id: string;
    createdAt: string;
    actorId: string;
    action: string;
    targetId: string | null;
    actor: {
        name: string;
        role: "PATIENT" | "DOCTOR" | "ADMIN" | "SUPER_ADMIN";
        id: string;
    };
    metadata?: unknown;
}>;
export type AuditLog = z.infer<typeof AuditLogSchema>;
//# sourceMappingURL=user.schema.d.ts.map
import { z } from "zod";
export declare const CallStatusSchema: z.ZodEnum<["QUEUED", "RINGING", "ACTIVE", "ENDED", "MISSED", "REJECTED", "NO_DOCTOR"]>;
export type CallStatus = z.infer<typeof CallStatusSchema>;
export declare const CallSessionSchema: z.ZodObject<{
    id: z.ZodString;
    patientId: z.ZodString;
    doctorId: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<["QUEUED", "RINGING", "ACTIVE", "ENDED", "MISSED", "REJECTED", "NO_DOCTOR"]>;
    livekitRoom: z.ZodString;
    queuedAt: z.ZodString;
    startedAt: z.ZodNullable<z.ZodString>;
    endedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "QUEUED" | "RINGING" | "ACTIVE" | "ENDED" | "MISSED" | "REJECTED" | "NO_DOCTOR";
    id: string;
    createdAt: string;
    patientId: string;
    doctorId: string | null;
    livekitRoom: string;
    queuedAt: string;
    startedAt: string | null;
    endedAt: string | null;
}, {
    status: "QUEUED" | "RINGING" | "ACTIVE" | "ENDED" | "MISSED" | "REJECTED" | "NO_DOCTOR";
    id: string;
    createdAt: string;
    patientId: string;
    doctorId: string | null;
    livekitRoom: string;
    queuedAt: string;
    startedAt: string | null;
    endedAt: string | null;
}>;
export type CallSession = z.infer<typeof CallSessionSchema>;
export declare const CallCreateSchema: z.ZodObject<{
    paymentId: z.ZodOptional<z.ZodString>;
    deviceId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    deviceId?: string | undefined;
    paymentId?: string | undefined;
}, {
    deviceId?: string | undefined;
    paymentId?: string | undefined;
}>;
export type CallCreate = z.infer<typeof CallCreateSchema>;
export declare const VitalsSchema: z.ZodObject<{
    weightKg: z.ZodOptional<z.ZodNumber>;
    heightCm: z.ZodOptional<z.ZodNumber>;
    bp: z.ZodOptional<z.ZodString>;
    spo2: z.ZodOptional<z.ZodNumber>;
    temp: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    heightCm?: number | undefined;
    weightKg?: number | undefined;
    bp?: string | undefined;
    spo2?: number | undefined;
    temp?: number | undefined;
}, {
    heightCm?: number | undefined;
    weightKg?: number | undefined;
    bp?: string | undefined;
    spo2?: number | undefined;
    temp?: number | undefined;
}>;
export type Vitals = z.infer<typeof VitalsSchema>;
//# sourceMappingURL=call.schema.d.ts.map
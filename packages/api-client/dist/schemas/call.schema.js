import { z } from "zod";
export const CallStatusSchema = z.enum([
    "QUEUED",
    "RINGING",
    "ACTIVE",
    "ENDED",
    "MISSED",
    "REJECTED",
    "NO_DOCTOR",
]);
export const CallSessionSchema = z.object({
    id: z.string(),
    patientId: z.string(),
    doctorId: z.string().nullable(),
    status: CallStatusSchema,
    livekitRoom: z.string(),
    queuedAt: z.string(),
    startedAt: z.string().nullable(),
    endedAt: z.string().nullable(),
    createdAt: z.string(),
});
export const CallCreateSchema = z.object({
    paymentId: z.string().min(1).optional(),
    deviceId: z.string().min(1).optional(),
});
export const VitalsSchema = z.object({
    weightKg: z.number().positive().optional(),
    heightCm: z.number().positive().optional(),
    bp: z.string().optional(),
    spo2: z.number().min(0, "SpO2 must be between 0 and 100").max(100, "SpO2 must be between 0 and 100").optional(),
    temp: z.number().optional(),
});
//# sourceMappingURL=call.schema.js.map
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
export type CallStatus = z.infer<typeof CallStatusSchema>;

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
export type CallSession = z.infer<typeof CallSessionSchema>;

export const VitalsSchema = z.object({
  weightKg: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  bp: z.string().optional(),
  spo2: z.number().min(0).max(100).optional(),
  temp: z.number().optional(),
});
export type Vitals = z.infer<typeof VitalsSchema>;

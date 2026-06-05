import { z } from "zod";

export const PrescriptionSchema = z.object({
  id: z.string(),
  callSessionId: z.string(),
  patientId: z.string(),
  doctorId: z.string(),
  content: z.record(z.unknown()),
  objectKey: z.string().nullable(),
  pdfReady: z.boolean(),
  createdAt: z.string(),
});
export type Prescription = z.infer<typeof PrescriptionSchema>;

export const SubmitPrescriptionSchema = z.object({
  callSessionId: z.string(),
  content: z.record(z.unknown()),
});
export type SubmitPrescription = z.infer<typeof SubmitPrescriptionSchema>;

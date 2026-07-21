import { z } from "zod";
export declare const PrescriptionSchema: z.ZodObject<{
    id: z.ZodString;
    callSessionId: z.ZodString;
    patientId: z.ZodString;
    doctorId: z.ZodString;
    content: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    objectKey: z.ZodNullable<z.ZodString>;
    pdfReady: z.ZodBoolean;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    patientId: string;
    doctorId: string;
    callSessionId: string;
    content: Record<string, unknown>;
    objectKey: string | null;
    pdfReady: boolean;
}, {
    id: string;
    createdAt: string;
    patientId: string;
    doctorId: string;
    callSessionId: string;
    content: Record<string, unknown>;
    objectKey: string | null;
    pdfReady: boolean;
}>;
export type Prescription = z.infer<typeof PrescriptionSchema>;
export declare const SubmitPrescriptionSchema: z.ZodObject<{
    callSessionId: z.ZodString;
    content: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    callSessionId: string;
    content: Record<string, unknown>;
}, {
    callSessionId: string;
    content: Record<string, unknown>;
}>;
export type SubmitPrescription = z.infer<typeof SubmitPrescriptionSchema>;
//# sourceMappingURL=prescription.schema.d.ts.map
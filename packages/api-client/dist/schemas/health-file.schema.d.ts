import { z } from "zod";
export declare const FileTypeSchema: z.ZodEnum<["PRESCRIPTION", "LAB_REPORT", "OTHER"]>;
export type FileType = z.infer<typeof FileTypeSchema>;
export declare const HealthFileSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    prescriptionId: z.ZodNullable<z.ZodString>;
    name: z.ZodString;
    type: z.ZodEnum<["PRESCRIPTION", "LAB_REPORT", "OTHER"]>;
    sizeBytes: z.ZodNumber;
    createdAt: z.ZodString;
    url: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "OTHER" | "PRESCRIPTION" | "LAB_REPORT";
    name: string;
    id: string;
    createdAt: string;
    userId: string;
    prescriptionId: string | null;
    sizeBytes: number;
    url: string;
}, {
    type: "OTHER" | "PRESCRIPTION" | "LAB_REPORT";
    name: string;
    id: string;
    createdAt: string;
    userId: string;
    prescriptionId: string | null;
    sizeBytes: number;
    url: string;
}>;
export type HealthFile = z.infer<typeof HealthFileSchema>;
//# sourceMappingURL=health-file.schema.d.ts.map
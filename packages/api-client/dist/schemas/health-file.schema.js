import { z } from "zod";
export const FileTypeSchema = z.enum(["PRESCRIPTION", "LAB_REPORT", "OTHER"]);
export const HealthFileSchema = z.object({
    id: z.string(),
    userId: z.string(),
    prescriptionId: z.string().nullable(),
    name: z.string(),
    type: FileTypeSchema,
    sizeBytes: z.number(),
    createdAt: z.string(),
    url: z.string(),
});
//# sourceMappingURL=health-file.schema.js.map
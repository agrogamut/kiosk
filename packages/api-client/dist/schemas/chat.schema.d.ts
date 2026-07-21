import { z } from "zod";
export declare const MsgTypeSchema: z.ZodEnum<["TEXT", "IMAGE", "VITALS"]>;
export type MsgType = z.infer<typeof MsgTypeSchema>;
export declare const ChatMessageSchema: z.ZodObject<{
    id: z.ZodString;
    callSessionId: z.ZodString;
    senderId: z.ZodString;
    content: z.ZodNullable<z.ZodString>;
    imageKey: z.ZodNullable<z.ZodString>;
    vitals: z.ZodNullable<z.ZodObject<{
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
    }>>;
    type: z.ZodEnum<["TEXT", "IMAGE", "VITALS"]>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "TEXT" | "IMAGE" | "VITALS";
    id: string;
    createdAt: string;
    callSessionId: string;
    content: string | null;
    senderId: string;
    imageKey: string | null;
    vitals: {
        heightCm?: number | undefined;
        weightKg?: number | undefined;
        bp?: string | undefined;
        spo2?: number | undefined;
        temp?: number | undefined;
    } | null;
}, {
    type: "TEXT" | "IMAGE" | "VITALS";
    id: string;
    createdAt: string;
    callSessionId: string;
    content: string | null;
    senderId: string;
    imageKey: string | null;
    vitals: {
        heightCm?: number | undefined;
        weightKg?: number | undefined;
        bp?: string | undefined;
        spo2?: number | undefined;
        temp?: number | undefined;
    } | null;
}>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export declare const SendChatSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"TEXT">;
    callSessionId: z.ZodString;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "TEXT";
    callSessionId: string;
    content: string;
}, {
    type: "TEXT";
    callSessionId: string;
    content: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"IMAGE">;
    callSessionId: z.ZodString;
    imageKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "IMAGE";
    callSessionId: string;
    imageKey: string;
}, {
    type: "IMAGE";
    callSessionId: string;
    imageKey: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"VITALS">;
    callSessionId: z.ZodString;
    vitals: z.ZodObject<{
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
}, "strip", z.ZodTypeAny, {
    type: "VITALS";
    callSessionId: string;
    vitals: {
        heightCm?: number | undefined;
        weightKg?: number | undefined;
        bp?: string | undefined;
        spo2?: number | undefined;
        temp?: number | undefined;
    };
}, {
    type: "VITALS";
    callSessionId: string;
    vitals: {
        heightCm?: number | undefined;
        weightKg?: number | undefined;
        bp?: string | undefined;
        spo2?: number | undefined;
        temp?: number | undefined;
    };
}>]>;
export type SendChat = z.infer<typeof SendChatSchema>;
//# sourceMappingURL=chat.schema.d.ts.map
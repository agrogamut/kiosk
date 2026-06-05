import { z } from "zod";
import { VitalsSchema } from "./call.schema.js";

export const MsgTypeSchema = z.enum(["TEXT", "IMAGE", "VITALS"]);
export type MsgType = z.infer<typeof MsgTypeSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  callSessionId: z.string(),
  senderId: z.string(),
  content: z.string().nullable(),
  imageKey: z.string().nullable(),
  vitals: VitalsSchema.nullable(),
  type: MsgTypeSchema,
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SendChatSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TEXT"),
    callSessionId: z.string(),
    content: z.string().min(1).max(2000),
  }),
  z.object({
    type: z.literal("IMAGE"),
    callSessionId: z.string(),
    imageKey: z.string(),
  }),
  z.object({
    type: z.literal("VITALS"),
    callSessionId: z.string(),
    vitals: VitalsSchema,
  }),
]);
export type SendChat = z.infer<typeof SendChatSchema>;

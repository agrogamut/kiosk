import { z } from "zod";

const nameField = z.string().min(1, "Enter your name").max(100, "Name is too long");
const phoneField = z.string().min(10, "Enter a valid phone number").max(15, "Enter a valid phone number");
const messageField = z.string().min(1, "Enter a message").max(2000, "Message is too long");

export const ContactMessageCreateSchema = z.object({
  name: nameField,
  phone: phoneField,
  message: messageField,
});
export type ContactMessageCreate = z.infer<typeof ContactMessageCreateSchema>;

export const ContactMessageSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  message: z.string(),
  createdAt: z.string(),
});
export type ContactMessage = z.infer<typeof ContactMessageSchema>;

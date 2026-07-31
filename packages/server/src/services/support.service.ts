import { prisma } from "../lib/prisma.js";

export async function createContactMessage(data: { name: string; phone: string; message: string }) {
  return prisma.contactMessage.create({ data });
}

export async function listContactMessages() {
  return prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" } });
}

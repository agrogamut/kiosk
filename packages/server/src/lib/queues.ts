import { Queue, type ConnectionOptions } from "bullmq";

export const bullMqConnection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
  maxRetriesPerRequest: null,
} satisfies ConnectionOptions;

export const assignDoctorQueue = new Queue("assign-doctor", { connection: bullMqConnection });
export const renderPdfQueue = new Queue("render-pdf", { connection: bullMqConnection });

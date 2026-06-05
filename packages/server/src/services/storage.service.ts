import "../config/env.js";
import * as Minio from "minio";

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
  port: Number(process.env.MINIO_PORT ?? "9000"),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

const BUCKET = process.env.MINIO_BUCKET ?? "madamgy";

export async function ensureBucket(): Promise<void> {
  const exists = await client.bucketExists(BUCKET);
  if (!exists) {
    await client.makeBucket(BUCKET, "ap-south-1");
  }
}

export async function uploadBuffer(
  objectKey: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await client.putObject(BUCKET, objectKey, buffer, buffer.length, {
    "Content-Type": contentType,
  });
}

export async function getPresignedUrl(objectKey: string, ttlSeconds = 3600): Promise<string> {
  return client.presignedGetObject(BUCKET, objectKey, ttlSeconds);
}

export async function deleteObject(objectKey: string): Promise<void> {
  await client.removeObject(BUCKET, objectKey);
}

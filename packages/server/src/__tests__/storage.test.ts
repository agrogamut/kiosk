import { randomUUID } from "node:crypto";
import { S3Client, DeleteBucketCommand } from "@aws-sdk/client-s3";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("creates a fresh bucket and keeps binary bytes and content type through storage", async () => {
  const bucket = "storage-contract-" + randomUUID();
  vi.stubEnv("MINIO_BUCKET", bucket);
  const storage = await import("../services/storage.service.js");
  const admin = new S3Client({
    endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
    region: "ap-south-1", forcePathStyle: true,
    credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY!, secretAccessKey: process.env.MINIO_SECRET_KEY! },
  });
  const key = "binary/percent%2F + ?.bin";
  try {
    expect(await storage.bucketExists()).toBe(false);
    await storage.ensureBucket();
    await storage.ensureBucket();
    expect(await storage.bucketExists()).toBe(true);
    const bytes = Buffer.from([0, 1, 127, 128, 255, 0, 13, 10]);
    await storage.uploadBuffer(key, bytes, "application/octet-stream");
    const object = await storage.getObjectStream(key);
    const received: Buffer[] = [];
    for await (const chunk of object.stream) received.push(Buffer.from(chunk));
    expect(Buffer.concat(received)).toEqual(bytes);
    expect(object.size).toBe(bytes.length);
    expect(object.contentType).toBe("application/octet-stream");
  } finally {
    await storage.deleteObject(key);
    await admin.send(new DeleteBucketCommand({ Bucket: bucket }));
    admin.destroy();
  }
});

it("does not treat rejected storage credentials as a missing bucket", async () => {
  vi.stubEnv("MINIO_ACCESS_KEY", "invalid-contract-access");
  const storage = await import("../services/storage.service.js");
  await expect(storage.bucketExists()).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
  await expect(storage.ensureBucket()).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
});

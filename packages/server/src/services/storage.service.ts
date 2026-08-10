import "../config/env.js";
import * as Minio from "minio";

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
  port: Number(process.env.MINIO_PORT ?? "9000"),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

const BUCKET = process.env.MINIO_BUCKET ?? "madamgy";

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, "ap-south-1");
  }
}

export async function uploadBuffer(
  objectKey: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await minioClient.putObject(BUCKET, objectKey, buffer, buffer.length, {
    "Content-Type": contentType,
  });
}

// There is deliberately no presigned-URL helper here. MinIO is only reachable from inside the
// deployment, so a URL signed against it is useless to a browser -- and because an S3 signature
// covers the Host header, you cannot sign against the internal host and swap the hostname
// afterwards. Hand out an API URL instead: see buildFileUrl in file-url.service.ts.

export interface StoredObject {
  stream: NodeJS.ReadableStream;
  contentType: string;
  size: number;
}

// Used by GET /api/files/:token to stream an object back to the browser, because the bucket
// itself is not reachable from one -- see file-url.service.ts.
export async function getObjectStream(objectKey: string): Promise<StoredObject> {
  const stat = await minioClient.statObject(BUCKET, objectKey);
  const stream = await minioClient.getObject(BUCKET, objectKey);
  return {
    stream,
    contentType: stat.metaData?.["content-type"] ?? "application/octet-stream",
    size: stat.size,
  };
}

export async function deleteObject(objectKey: string): Promise<void> {
  await minioClient.removeObject(BUCKET, objectKey);
}

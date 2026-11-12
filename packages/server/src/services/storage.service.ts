import "../config/env.js";
import { Readable } from "node:stream";
import {
  S3Client, CreateBucketCommand, HeadBucketCommand, PutObjectCommand,
  GetObjectCommand, DeleteObjectCommand, S3ServiceException,
} from "@aws-sdk/client-s3";

const region = "ap-south-1";
const bucket = process.env.MINIO_BUCKET ?? "madamgy";
const protocol = process.env.MINIO_USE_SSL === "true" ? "https" : "http";
const client = new S3Client({
  endpoint: `${protocol}://${process.env.MINIO_ENDPOINT ?? "localhost"}:${process.env.MINIO_PORT ?? "9000"}`,
  region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
});

export async function bucketExists(): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return false;
    throw error;
  }
}

export async function ensureBucket(): Promise<void> {
  if (!(await bucketExists())) {
    await client.send(new CreateBucketCommand({
      Bucket: bucket, CreateBucketConfiguration: { LocationConstraint: region },
    }));
  }
}

export async function uploadBuffer(
  objectKey: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: objectKey, Body: buffer, ContentType: contentType,
  }));
}

export interface StoredObject {
  stream: NodeJS.ReadableStream;
  contentType: string;
  size: number;
}

// Keep browser downloads on the signed API route; the storage endpoint can be private.
export async function getObjectStream(objectKey: string): Promise<StoredObject> {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  if (!(object.Body instanceof Readable) || object.ContentLength === undefined) {
    throw new Error("Object storage returned an incomplete response");
  }
  return {
    stream: object.Body,
    contentType: object.ContentType ?? "application/octet-stream",
    size: object.ContentLength,
  };
}

export async function deleteObject(objectKey: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

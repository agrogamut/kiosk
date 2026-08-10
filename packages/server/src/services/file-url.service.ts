import { createHmac } from "crypto";
import type { Request } from "express";
import jwt from "jsonwebtoken";

// Object storage is not reachable from a browser. On Railway it answers only on
// minio.railway.internal over plain http, so a presigned URL pointing straight at it fails twice
// over: the hostname is private DNS the client cannot resolve, and plain http inside an https page
// is blocked as mixed content. Rather than exposing the bucket publicly, the API hands out a URL
// to itself carrying a short-lived signed capability, and streams the object back.
//
// The capability is what lets this work in an <img src> or a plain link at all: those requests
// carry no Authorization header, so the route cannot re-check the session. Every caller therefore
// mints a URL only after its own ownership check has passed -- exactly the trade a presigned S3
// URL makes, with the signature under our own key instead of MinIO's.
//
// Signed with a key derived from JWT_ACCESS_SECRET rather than the secret itself, so a file token
// can never be replayed as an access token (or the reverse) even though no new env var is needed.
function fileTokenSecret(): string {
  return createHmac("sha256", process.env.JWT_ACCESS_SECRET!).update("file-url-v1").digest("hex");
}

export interface FileTokenClaims {
  /** Object key inside the bucket. */
  k: string;
  /** Filename to force a download with, when the file should not open inline. */
  d?: string;
}

export function signFileToken(claims: FileTokenClaims, ttlSeconds: number): string {
  return jwt.sign(claims, fileTokenSecret(), { expiresIn: ttlSeconds });
}

export function verifyFileToken(token: string): FileTokenClaims {
  const decoded = jwt.verify(token, fileTokenSecret());
  if (typeof decoded === "string" || typeof decoded.k !== "string") {
    throw new Error("malformed file token");
  }
  return { k: decoded.k, d: typeof decoded.d === "string" ? decoded.d : undefined };
}

// The web app and the Android WebView run on different origins to the API, so this has to be
// absolute. Derived from the request by default -- x-forwarded-proto read explicitly rather than
// via `trust proxy`, which would also change req.ip and with it the rate limiter's keys.
function publicApiBase(req: Request): string {
  const configured = process.env.API_PUBLIC_URL;
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const forwarded = req.get("x-forwarded-proto");
  const protocol = (forwarded ?? req.protocol).split(",")[0].trim();
  return `${protocol}://${req.get("host")}/api`;
}

export interface FileUrlOptions {
  ttlSeconds?: number;
  /** Set to force a download instead of rendering inline, using this filename. */
  downloadAs?: string;
}

export function buildFileUrl(req: Request, objectKey: string, options: FileUrlOptions = {}): string {
  const token = signFileToken(
    { k: objectKey, d: options.downloadAs },
    options.ttlSeconds ?? 3600,
  );
  return `${publicApiBase(req)}/files/${token}`;
}

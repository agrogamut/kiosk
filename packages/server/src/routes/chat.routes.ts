import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { uploadBuffer } from "../services/storage.service.js";
import { buildFileUrl } from "../services/file-url.service.js";

export const chatRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return cleaned || "file";
}

async function requireCallMembership(callSessionId: string, userId: string) {
  const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
  if (!call || call.status !== "ACTIVE") {
    throw new AppError(404, "Call not found or not active");
  }
  if (call.patientId !== userId && call.doctorId !== userId) {
    throw new AppError(403, "Forbidden");
  }
  return call;
}

chatRouter.post(
  "/upload",
  requireAuth("PATIENT", "DOCTOR"),
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError(400, "No file uploaded");
      }

      const callSessionId = req.body.callSessionId;
      if (typeof callSessionId !== "string" || callSessionId.length === 0) {
        throw new AppError(400, "callSessionId required");
      }

      await requireCallMembership(callSessionId, req.user!.sub);

      const objectKey = `chat/${callSessionId}/${Date.now()}-${safeFileName(req.file.originalname)}`;
      await uploadBuffer(objectKey, req.file.buffer, req.file.mimetype);

      res.status(201).json({ imageKey: objectKey });
    } catch (error) {
      next(error);
    }
  },
);

chatRouter.get(
  "/image-url",
  requireAuth("PATIENT", "DOCTOR"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = req.query.key;
      if (typeof key !== "string" || !key.startsWith("chat/")) {
        throw new AppError(400, "Invalid key");
      }

      const callSessionId = key.split("/")[1];
      await requireCallMembership(callSessionId, req.user!.sub);

      res.json({ url: buildFileUrl(req, key) });
    } catch (error) {
      next(error);
    }
  },
);

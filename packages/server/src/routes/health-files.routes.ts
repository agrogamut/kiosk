import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { io } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { ACTIVE_STATUSES } from "../services/call-completion.service.js";
import { deleteObject, uploadBuffer } from "../services/storage.service.js";
import { buildFileUrl } from "../services/file-url.service.js";

export const healthFilesRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return cleaned || "file";
}

healthFilesRouter.get("/", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = await prisma.healthFile.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: "desc" },
    });

    res.json(files.map((file) => ({ ...file, url: buildFileUrl(req, file.objectKey) })));
  } catch (error) {
    next(error);
  }
});

healthFilesRouter.get("/:id", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = await prisma.healthFile.findUnique({ where: { id: req.params.id } });
    if (!file) {
      throw new AppError(404, "File not found");
    }
    if (file.userId !== req.user!.sub && req.user!.role !== "SUPER_ADMIN") {
      throw new AppError(403, "Forbidden");
    }

    res.json({ ...file, url: buildFileUrl(req, file.objectKey) });
  } catch (error) {
    next(error);
  }
});

healthFilesRouter.post(
  "/",
  requireAuth("PATIENT"),
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError(400, "No file uploaded");
      }

      const userId = req.user!.sub;
      const objectKey = `health-files/${userId}/${Date.now()}-${safeFileName(req.file.originalname)}`;
      await uploadBuffer(objectKey, req.file.buffer, req.file.mimetype);

      const file = await prisma.healthFile.create({
        data: {
          userId,
          name: req.file.originalname,
          type: "LAB_REPORT",
          objectKey,
          sizeBytes: req.file.size,
        },
      });

      const fileWithUrl = { ...file, url: buildFileUrl(req, objectKey) };

      // A doctor mid-call has PatientHistoryPanel open already fetched -- without this push it
      // won't know a new file landed until something else happens to trigger a refetch (a window
      // refocus past its staleTime, or remounting the call screen). Only fires when this upload's
      // patient has a doctor actually assigned to their in-progress call (QUEUED calls haven't
      // matched one yet).
      const activeCall = await prisma.callSession.findFirst({
        where: { patientId: userId, status: { in: ACTIVE_STATUSES }, doctorId: { not: null } },
        select: { doctorId: true },
      });
      if (activeCall?.doctorId) {
        io.to(`user:${activeCall.doctorId}`).emit("health-file:uploaded", { healthFile: fileWithUrl });
      }

      res.status(201).json(fileWithUrl);
    } catch (error) {
      next(error);
    }
  },
);

healthFilesRouter.delete(
  "/:id",
  requireAuth("PATIENT"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = await prisma.healthFile.findUnique({ where: { id: req.params.id } });
      if (!file) {
        throw new AppError(404, "File not found");
      }
      if (file.userId !== req.user!.sub) {
        throw new AppError(403, "Forbidden");
      }
      if (file.type === "PRESCRIPTION") {
        throw new AppError(400, "Cannot delete prescriptions");
      }

      await deleteObject(file.objectKey);
      await prisma.healthFile.delete({ where: { id: req.params.id } });
      res.json({ message: "Deleted" });
    } catch (error) {
      next(error);
    }
  },
);

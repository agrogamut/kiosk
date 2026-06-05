import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { deleteObject, getPresignedUrl, uploadBuffer } from "../services/storage.service.js";

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

    const withUrls = await Promise.all(
      files.map(async (file) => ({ ...file, url: await getPresignedUrl(file.objectKey) })),
    );

    res.json(withUrls);
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
    if (file.userId !== req.user!.sub && req.user!.role !== "ADMIN") {
      throw new AppError(403, "Forbidden");
    }

    res.json({ ...file, url: await getPresignedUrl(file.objectKey) });
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

      res.status(201).json({ ...file, url: await getPresignedUrl(objectKey) });
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

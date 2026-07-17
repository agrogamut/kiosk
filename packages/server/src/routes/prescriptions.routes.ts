import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { SubmitPrescriptionSchema } from "@madamgy/api-client";
import type { Prisma } from "@prisma/client";
import { renderPdfQueue } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { getPresignedUrl } from "../services/storage.service.js";

export const prescriptionsRouter = Router();

prescriptionsRouter.post(
  "/",
  requireAuth("DOCTOR"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { callSessionId, content } = SubmitPrescriptionSchema.parse(req.body);
      const doctorId = req.user!.sub;

      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!call) {
        throw new AppError(404, "Call session not found");
      }
      if (call.doctorId !== doctorId) {
        throw new AppError(403, "Forbidden");
      }
      if (call.status !== "ACTIVE") {
        throw new AppError(400, "Call is not active");
      }

      const existing = await prisma.prescription.findUnique({ where: { callSessionId } });
      if (existing) {
        throw new AppError(409, "Prescription already submitted");
      }

      const prescription = await prisma.prescription.create({
        data: {
          callSessionId,
          patientId: call.patientId,
          doctorId,
          content: content as Prisma.InputJsonValue,
        },
      });

      await renderPdfQueue.add("render", { prescriptionId: prescription.id }, { attempts: 3 });
      res.status(202).json({ message: "Prescription received, PDF generating", id: prescription.id });
    } catch (error) {
      next(error);
    }
  },
);

prescriptionsRouter.get(
  "/:id",
  requireAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const prescription = await prisma.prescription.findUnique({
        where: { id: req.params.id },
        include: {
          patient: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true } },
          healthFile: true,
        },
      });
      if (!prescription) {
        throw new AppError(404, "Prescription not found");
      }

      const userId = req.user!.sub;
      const role = req.user!.role;
      if (prescription.patientId !== userId && prescription.doctorId !== userId && role !== "SUPER_ADMIN") {
        throw new AppError(403, "Forbidden");
      }

      const result: Record<string, unknown> = { ...prescription };
      if (prescription.objectKey && prescription.pdfReady) {
        result.pdfUrl = await getPresignedUrl(prescription.objectKey);
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

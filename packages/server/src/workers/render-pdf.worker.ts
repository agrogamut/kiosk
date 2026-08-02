import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { Worker } from "bullmq";
import { Prisma } from "@prisma/client";
import { bullMqConnection } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { deleteObject, uploadBuffer } from "../services/storage.service.js";
import { PrescriptionDoc } from "../components/PrescriptionDoc.js";
import { io } from "../index.js";
import { completeCall } from "../services/call-completion.service.js";

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function startRenderPdfWorker(): Worker<{ prescriptionId: string }> {
  return new Worker<{ prescriptionId: string }>(
    "render-pdf",
    async (job) => {
      const { prescriptionId } = job.data;
      const prescription = await prisma.prescription.findUnique({
        where: { id: prescriptionId },
        include: {
          patient: { select: { id: true, name: true, phone: true } },
          doctor: {
            select: {
              id: true,
              name: true,
              doctorProfile: {
                select: { degree: true, regNumber: true, specialization: true },
              },
            },
          },
          callSession: true,
          healthFile: true,
        },
      });
      if (!prescription) {
        // Gone before this job ever ran (or a retry after it was deleted) -- nothing to
        // render, and retrying won't change that.
        console.error("render-pdf job skipped, prescription no longer exists", prescriptionId);
        return;
      }

      let healthFileId: string;

      if (prescription.pdfReady && prescription.healthFile) {
        // A prior attempt already rendered and stored the PDF (pdfReady and the HealthFile row
        // are set together in one transaction below, so either both exist or neither does).
        // BullMQ retries the whole handler on failure -- e.g. a worker restart between that
        // transaction committing and the job finishing -- and HealthFile is unique on
        // prescriptionId, so re-running the create would crash with the same constraint
        // violation on every retry. Skip straight to completing the call instead.
        healthFileId = prescription.healthFile.id;
      } else {
        const document = React.createElement(PrescriptionDoc, {
          prescription,
        }) as unknown as Parameters<typeof renderToBuffer>[0];
        const buffer = await renderToBuffer(document);
        const objectKey = `prescriptions/${prescription.patientId}/${prescription.callSessionId}.pdf`;
        await uploadBuffer(objectKey, buffer, "application/pdf");

        try {
          const { healthFile } = await prisma.$transaction(async (tx) => {
            await tx.prescription.update({
              where: { id: prescriptionId },
              data: { objectKey, pdfReady: true },
            });
            const createdHealthFile = await tx.healthFile.create({
              data: {
                userId: prescription.patientId,
                prescriptionId,
                name: `Prescription - ${new Date(prescription.createdAt).toLocaleDateString("en-IN")}`,
                type: "PRESCRIPTION",
                objectKey,
                sizeBytes: buffer.length,
              },
            });

            return { healthFile: createdHealthFile };
          });

          healthFileId = healthFile.id;
        } catch (error) {
          if (isRecordNotFoundError(error)) {
            // The prescription (or its parent user/call) was deleted out from under this job
            // between the findUniqueOrThrow above and this transaction -- the PDF we just
            // uploaded is now orphaned since nothing references objectKey. Clean it up and
            // stop: BullMQ retrying this job can't succeed, the row is gone for good.
            await deleteObject(objectKey).catch((cleanupError: unknown) => {
              console.error("failed to clean up orphaned prescription PDF", objectKey, cleanupError);
            });
            return;
          }
          throw error;
        }
      }

      await completeCall(prescription.callSessionId);

      io.to(`user:${prescription.patientId}`).emit("prescription:ready", {
        callSessionId: prescription.callSessionId,
        healthFileId,
      });
    },
    { connection: bullMqConnection },
  );
}

export function handleRenderPdfFailed(worker: Worker<{ prescriptionId: string }>): void {
  worker.on("failed", (job, error) => {
    console.error("render-pdf job failed for prescription", job?.data.prescriptionId, error);
  });
}

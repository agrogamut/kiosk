import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { Worker } from "bullmq";
import { bullMqConnection } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { uploadBuffer } from "../services/storage.service.js";
import { PrescriptionDoc } from "../components/PrescriptionDoc.js";
import { io } from "../index.js";
import { completeCall } from "../services/call-completion.service.js";

export function startRenderPdfWorker(): Worker<{ prescriptionId: string }> {
  return new Worker<{ prescriptionId: string }>(
    "render-pdf",
    async (job) => {
      const { prescriptionId } = job.data;
      const prescription = await prisma.prescription.findUniqueOrThrow({
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

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
                select: { degree: true, regNumber: true, specialization: true, commissionRate: true },
              },
            },
          },
          callSession: true,
        },
      });

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

      await completeCall(prescription.callSessionId);

      io.to(`user:${prescription.patientId}`).emit("prescription:ready", {
        callSessionId: prescription.callSessionId,
        healthFileId: healthFile.id,
      });
    },
    { connection: bullMqConnection },
  );
}

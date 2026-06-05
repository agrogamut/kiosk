import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { Worker } from "bullmq";
import { bullMqConnection } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { uploadBuffer } from "../services/storage.service.js";
import { PrescriptionDoc } from "../components/PrescriptionDoc.js";
import { io } from "../index.js";

const CONSULTATION_FEE = Number(process.env.CONSULTATION_FEE ?? "200");

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

      const commissionRate = Number(prescription.doctor.doctorProfile?.commissionRate ?? 0.8);
      const earning = Number((CONSULTATION_FEE * commissionRate).toFixed(2));

      const transactionResult = await prisma.$transaction(async (tx) => {
        await tx.prescription.update({
          where: { id: prescriptionId },
          data: { objectKey, pdfReady: true },
        });
        const healthFile = await tx.healthFile.create({
          data: {
            userId: prescription.patientId,
            prescriptionId,
            name: `Prescription - ${new Date(prescription.createdAt).toLocaleDateString("en-IN")}`,
            type: "PRESCRIPTION",
            objectKey,
            sizeBytes: buffer.length,
          },
        });
        await tx.walletTransaction.create({
          data: {
            doctorId: prescription.doctorId,
            callSessionId: prescription.callSessionId,
            amount: earning,
            type: "CREDIT",
            status: "COMPLETED",
            description: `Consultation fee - ${prescription.callSession.id}`,
          },
        });
        await tx.doctorProfile.update({
          where: { userId: prescription.doctorId },
          data: { walletBalance: { increment: earning }, isAvailable: true },
        });
        await tx.callSession.update({
          where: { id: prescription.callSessionId },
          data: { status: "ENDED", endedAt: new Date() },
        });

        return { healthFile };
      });

      io.to(`user:${prescription.patientId}`).emit("prescription:ready", {
        callSessionId: prescription.callSessionId,
        healthFileId: transactionResult.healthFile.id,
      });
      io.to(`user:${prescription.patientId}`).emit("call:ended", {
        callSessionId: prescription.callSessionId,
      });
      io.to(`user:${prescription.doctorId}`).emit("call:ended", {
        callSessionId: prescription.callSessionId,
      });
    },
    { connection: bullMqConnection },
  );
}

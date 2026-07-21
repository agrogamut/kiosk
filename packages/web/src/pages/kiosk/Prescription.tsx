import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { HealthFile } from "@madamgy/api-client";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { KioskHeader } from "../../components/layout/KioskHeader";
import { PulseRing } from "../../components/brand/PulseRing";
import { PrescriptionViewer } from "../../components/prescription/PrescriptionViewer";
import { PrintButton } from "../../components/prescription/PrintButton";
import { api } from "../../lib/api";

interface PrescriptionDetail {
  id: string;
  createdAt: string;
  content: unknown;
  pdfUrl?: string;
  patient: { name: string; phone: string };
  doctor: {
    name: string;
    doctorProfile: { degree: string; regNumber: string; specialization: string | null } | null;
  };
}

export default function KioskPrescription() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const { data: file, isLoading: fileLoading } = useQuery({
    queryKey: ["health-file", id],
    queryFn: () => api.get<HealthFile>(`/health-files/${id}`).then((response) => response.data),
    enabled: Boolean(id),
  });
  const prescriptionId = file?.prescriptionId;
  const { data: prescription, isLoading: prescriptionLoading } = useQuery({
    queryKey: ["prescription", prescriptionId],
    queryFn: () => api.get<PrescriptionDetail>(`/prescriptions/${prescriptionId}`).then((response) => response.data),
    enabled: Boolean(prescriptionId),
  });

  if (fileLoading || prescriptionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PulseRing size="lg" />
      </div>
    );
  }
  if (!file || !prescription) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-lg text-destructive">We couldn't find that prescription.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <IdleGuard />
      <KioskHeader />
      <div className="mx-auto max-w-md sm:max-w-lg lg:max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <button type="button" onClick={() => navigate("/dashboard")} className="text-primary">
            &larr; Back
          </button>
          <div className="flex gap-3">
            {prescription.pdfUrl && (
              <a
                href={prescription.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 items-center rounded-full border border-input px-4 text-sm font-medium text-foreground hover:bg-muted"
              >
                Download PDF
              </a>
            )}
            <PrintButton targetRef={printRef} />
          </div>
        </div>
        <PrescriptionViewer
          ref={printRef}
          id={prescription.id}
          createdAt={prescription.createdAt}
          content={prescription.content}
          patient={prescription.patient}
          doctor={prescription.doctor}
        />
      </div>
    </div>
  );
}

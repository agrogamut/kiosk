import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { HealthFile } from "@madamgy/api-client";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { PulseRing } from "../../components/brand/PulseRing";
import { PrescriptionViewer } from "../../components/prescription/PrescriptionViewer";
import { PrintButton } from "../../components/prescription/PrintButton";
import { api } from "../../lib/api";

export default function KioskPrescription() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const { data: file, isLoading } = useQuery({
    queryKey: ["health-file", id],
    queryFn: () => api.get<HealthFile>(`/health-files/${id}`).then((response) => response.data),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PulseRing size="lg" />
      </div>
    );
  }
  if (!file) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-lg text-red-500">We couldn't find that file.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <IdleGuard />
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between gap-4">
          <button type="button" onClick={() => navigate("/dashboard")} className="text-primary">
            &larr; Back
          </button>
          <PrintButton targetRef={printRef} />
        </div>
        <PrescriptionViewer ref={printRef} pdfUrl={file.url} name={file.name} />
      </div>
    </div>
  );
}

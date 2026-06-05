import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { HealthFile } from "@madamgy/api-client";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
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
    return <div className="flex min-h-screen items-center justify-center"><p className="text-2xl">Loading...</p></div>;
  }
  if (!file) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-2xl text-red-500">File not found</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <IdleGuard />
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <button type="button" onClick={() => navigate("/dashboard")} className="text-xl text-blue-600">
            &larr; Back
          </button>
          <PrintButton targetRef={printRef} />
        </div>
        <PrescriptionViewer ref={printRef} pdfUrl={file.url} name={file.name} />
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { PrescriptionViewer } from "../../components/prescription/PrescriptionViewer";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface PrescriptionListItem {
  id: string;
  createdAt: string;
  patient: { id: string; name: string };
}

interface PrescriptionDetail {
  id: string;
  createdAt: string;
  content: unknown;
  patient: { name: string; phone: string };
  doctor: {
    name: string;
    doctorProfile: { degree: string; regNumber: string; specialization: string | null } | null;
  };
}

function PrescriptionRow({ prescription }: { prescription: PrescriptionListItem }) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail, isLoading } = useQuery({
    queryKey: ["prescription", prescription.id],
    queryFn: () => api.get<PrescriptionDetail>(`/prescriptions/${prescription.id}`).then((response) => response.data),
    enabled: expanded,
  });

  return (
    <div className="rounded-lg bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left"
      >
        <div>
          <p className="font-semibold text-foreground">{prescription.patient.name}</p>
          <p className="text-sm text-muted-foreground">{format(new Date(prescription.createdAt), "dd MMM yyyy HH:mm")}</p>
        </div>
        <span className="text-sm text-primary">{expanded ? "Hide" : "View"}</span>
      </button>
      {expanded && (
        <div className="border-t border-input p-4">
          {isLoading && <SkeletonRows />}
          {detail && (
            <PrescriptionViewer
              id={detail.id}
              createdAt={detail.createdAt}
              content={detail.content}
              patient={detail.patient}
              doctor={detail.doctor}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function DoctorPrescriptions() {
  const {
    data: prescriptions,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["doctor-prescriptions"],
    queryFn: () => api.get<PrescriptionListItem[]>("/doctor/prescriptions").then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-2xl sm:max-w-3xl lg:max-w-4xl">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Your prescriptions</h1>
      {isLoading && <SkeletonRows />}
      {isError && (
        <ErrorState message={getApiErrorMessage(error, "We couldn't load your prescriptions.")} onRetry={() => void refetch()} />
      )}
      {!isLoading && !isError && (
        <div className="flex flex-col gap-3">
          {prescriptions?.length === 0 && <p className="py-12 text-center text-muted-foreground">No prescriptions written yet.</p>}
          {prescriptions?.map((prescription) => (
            <PrescriptionRow key={prescription.id} prescription={prescription} />
          ))}
        </div>
      )}
    </div>
  );
}

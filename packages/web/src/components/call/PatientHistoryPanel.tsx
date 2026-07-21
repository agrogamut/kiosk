import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import axios from "axios";
import type { HealthFile, Prescription } from "@madamgy/api-client";
import { api } from "../../lib/api";

interface PatientRecords {
  healthFiles: HealthFile[];
  prescriptions: Prescription[];
}

interface PatientHistoryPanelProps {
  patientId: string;
}

function extractPlainText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const typed = node as { type?: string; text?: string; content?: unknown[] };
  if (typed.type === "text" && typeof typed.text === "string") {
    return typed.text;
  }
  if (Array.isArray(typed.content)) {
    return typed.content.map(extractPlainText).join(" ");
  }

  return "";
}

export function PatientHistoryPanel({ patientId }: PatientHistoryPanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["patient-records", patientId],
    queryFn: () => api.get<PatientRecords>(`/doctor/patients/${patientId}/records`).then((response) => response.data),
    retry: false,
  });

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading history...</p>;
  }

  if (axios.isAxiosError(error) && error.response?.status === 403) {
    return <p className="p-4 text-sm text-muted-foreground">No prior consultation history with this patient.</p>;
  }

  if (error || !data) {
    return <p className="p-4 text-sm text-destructive">We couldn't load patient history.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h4 className="mb-2 font-semibold text-foreground">Health files</h4>
        {data.healthFiles.length === 0 && <p className="text-sm text-muted-foreground">No health files.</p>}
        <div className="flex flex-col gap-2">
          {data.healthFiles.map((file) => (
            <a
              key={file.id}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-input p-3 text-sm hover:bg-muted"
            >
              <p className="font-medium text-foreground">{file.name}</p>
              <p className="text-muted-foreground">
                {file.type === "PRESCRIPTION" ? "Prescription" : file.type === "LAB_REPORT" ? "Lab report" : "Other"} -{" "}
                {format(new Date(file.createdAt), "dd MMM yyyy")}
              </p>
            </a>
          ))}
        </div>
      </div>
      <div>
        <h4 className="mb-2 font-semibold text-foreground">Past prescriptions</h4>
        {data.prescriptions.length === 0 && <p className="text-sm text-muted-foreground">No past prescriptions.</p>}
        <div className="flex flex-col gap-2">
          {data.prescriptions.map((prescription) => (
            <details key={prescription.id} className="rounded-lg border border-input p-3 text-sm">
              <summary className="cursor-pointer font-medium text-foreground">
                {format(new Date(prescription.createdAt), "dd MMM yyyy")}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{extractPlainText(prescription.content) || "No content"}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

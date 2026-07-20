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
    return <p className="p-4 text-sm text-gray-500">Loading history...</p>;
  }

  if (axios.isAxiosError(error) && error.response?.status === 403) {
    return <p className="p-4 text-sm text-gray-500">No prior consultation history with this patient.</p>;
  }

  if (error || !data) {
    return <p className="p-4 text-sm text-red-500">Could not load patient history.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h4 className="mb-2 font-bold text-gray-900">Health Files</h4>
        {data.healthFiles.length === 0 && <p className="text-sm text-gray-400">No health files.</p>}
        <div className="flex flex-col gap-2">
          {data.healthFiles.map((file) => (
            <a
              key={file.id}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-gray-200 p-3 text-sm hover:bg-gray-50"
            >
              <p className="font-semibold text-gray-900">{file.name}</p>
              <p className="text-gray-500">
                {file.type === "PRESCRIPTION" ? "Prescription" : file.type === "LAB_REPORT" ? "Lab Report" : "Other"} -{" "}
                {format(new Date(file.createdAt), "dd MMM yyyy")}
              </p>
            </a>
          ))}
        </div>
      </div>
      <div>
        <h4 className="mb-2 font-bold text-gray-900">Past Prescriptions</h4>
        {data.prescriptions.length === 0 && <p className="text-sm text-gray-400">No past prescriptions.</p>}
        <div className="flex flex-col gap-2">
          {data.prescriptions.map((prescription) => (
            <details key={prescription.id} className="rounded-xl border border-gray-200 p-3 text-sm">
              <summary className="cursor-pointer font-semibold text-gray-900">
                {format(new Date(prescription.createdAt), "dd MMM yyyy")}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-gray-700">{extractPlainText(prescription.content) || "No content"}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

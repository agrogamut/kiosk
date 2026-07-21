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

interface PrescriptionFields {
  complaint: string;
  diagnosis: string;
  medications: string;
  advice: string;
}

const PRESCRIPTION_SECTIONS: { key: keyof PrescriptionFields; label: string }[] = [
  { key: "complaint", label: "Complaint" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "medications", label: "Medications" },
  { key: "advice", label: "Advice" },
];

function readPrescriptionFields(content: unknown): PrescriptionFields {
  const record = (content && typeof content === "object" ? (content as Record<string, unknown>) : {}) as Record<string, unknown>;

  return {
    complaint: typeof record.complaint === "string" ? record.complaint : "",
    diagnosis: typeof record.diagnosis === "string" ? record.diagnosis : "",
    medications: typeof record.medications === "string" ? record.medications : "",
    advice: typeof record.advice === "string" ? record.advice : "",
  };
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
        <h4 className="font-display mb-2 font-semibold text-foreground">Health files</h4>
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
        <h4 className="font-display mb-2 font-semibold text-foreground">Past prescriptions</h4>
        {data.prescriptions.length === 0 && <p className="text-sm text-muted-foreground">No past prescriptions.</p>}
        <div className="flex flex-col gap-2">
          {data.prescriptions.map((prescription) => {
            const fields = readPrescriptionFields(prescription.content);
            const sections = PRESCRIPTION_SECTIONS.filter((section) => fields[section.key].trim().length > 0);

            return (
              <details key={prescription.id} className="rounded-lg border border-input p-3 text-sm">
                <summary className="cursor-pointer font-medium text-foreground">
                  {format(new Date(prescription.createdAt), "dd MMM yyyy")}
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  {sections.length === 0 && <p className="text-muted-foreground">No content</p>}
                  {sections.map((section) => (
                    <div key={section.key}>
                      <p className="text-xs font-semibold text-muted-foreground">{section.label}</p>
                      <p className="whitespace-pre-wrap text-foreground">{fields[section.key]}</p>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}

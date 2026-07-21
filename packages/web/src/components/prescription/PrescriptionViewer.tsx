import { forwardRef } from "react";
import { format } from "date-fns";
import { Logo } from "../brand/Logo";

interface PrescriptionFields {
  complaint: string;
  diagnosis: string;
  medications: string;
  advice: string;
}

const PRESCRIPTION_SECTIONS: { key: keyof PrescriptionFields; label: string }[] = [
  { key: "complaint", label: "Patient complaint" },
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

interface PrescriptionViewerProps {
  id: string;
  createdAt: string;
  content: unknown;
  patient: { name: string; phone: string };
  doctor: {
    name: string;
    doctorProfile: { degree: string; regNumber: string; specialization: string | null } | null;
  };
}

export const PrescriptionViewer = forwardRef<HTMLDivElement, PrescriptionViewerProps>(
  ({ id, createdAt, content, patient, doctor }, ref) => {
    const fields = readPrescriptionFields(content);
    const sections = PRESCRIPTION_SECTIONS.filter((section) => fields[section.key].trim().length > 0);
    const created = new Date(createdAt);

    return (
      <div ref={ref} className="rounded-xl bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-end justify-between gap-4 border-b-2 border-primary pb-4">
          <Logo className="h-7" />
          <div className="text-right">
            <p className="font-display text-lg font-bold text-primary">Prescription</p>
            <p className="text-xs text-muted-foreground">Telemedicine consultation record</p>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-[#EE908D14] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary">Patient</p>
            <p className="mt-1 text-sm font-medium text-foreground">{patient.name}</p>
            <p className="text-xs text-muted-foreground">{patient.phone}</p>
          </div>
          <div className="rounded-lg bg-[#EE908D14] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary">Doctor</p>
            <p className="mt-1 text-sm font-medium text-foreground">Dr. {doctor.name}</p>
            <p className="text-xs text-muted-foreground">
              {doctor.doctorProfile?.degree}
              {doctor.doctorProfile?.specialization ? ` - ${doctor.doctorProfile.specialization}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">Reg. no. {doctor.doctorProfile?.regNumber}</p>
          </div>
          <div className="rounded-lg bg-[#EE908D14] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary">Consultation</p>
            <p className="mt-1 text-sm font-medium text-foreground">{format(created, "dd MMMM yyyy")}</p>
            <p className="text-xs text-muted-foreground">{format(created, "hh:mm a")}</p>
            <p className="text-xs text-muted-foreground">ID: {id}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {sections.length === 0 && <p className="text-sm italic text-muted-foreground">No prescription notes entered.</p>}
          {sections.map((section) => (
            <div key={section.key} className="overflow-hidden rounded-lg border border-input">
              <p className="bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">
                {section.label}
              </p>
              <p className="whitespace-pre-wrap p-3 text-sm leading-6 text-foreground">{fields[section.key]}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-input pt-3 text-[10px] text-muted-foreground">
          <span>Prescription ID: {id} - MadamGy Telemedicine</span>
          <span>Digitally generated</span>
        </div>
      </div>
    );
  },
);

PrescriptionViewer.displayName = "PrescriptionViewer";

import { forwardRef } from "react";

interface PrescriptionViewerProps {
  pdfUrl: string;
  name: string;
}

export const PrescriptionViewer = forwardRef<HTMLDivElement, PrescriptionViewerProps>(
  ({ pdfUrl, name }, ref) => (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">{name}</h3>
      </div>
      <iframe src={pdfUrl} title={name} className="w-full" style={{ height: "60vh", border: "none" }} />
    </div>
  ),
);

PrescriptionViewer.displayName = "PrescriptionViewer";

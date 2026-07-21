import { forwardRef } from "react";

interface PrescriptionViewerProps {
  pdfUrl: string;
  name: string;
}

export const PrescriptionViewer = forwardRef<HTMLDivElement, PrescriptionViewerProps>(({ pdfUrl, name }, ref) => (
  <div ref={ref} className="overflow-hidden rounded-lg bg-card shadow-sm">
    <div className="border-b border-input bg-[#EE908D14] p-4">
      <h3 className="font-display font-semibold text-foreground">{name}</h3>
    </div>
    <iframe src={pdfUrl} title={name} className="w-full" style={{ height: "60vh", border: "none" }} />
  </div>
));

PrescriptionViewer.displayName = "PrescriptionViewer";

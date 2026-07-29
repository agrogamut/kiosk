import type { ReactNode } from "react";
import { PatientBottomNav } from "./PatientBottomNav";

export function PatientShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-28">
      {children}
      <PatientBottomNav />
    </div>
  );
}

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { PatientBottomNav } from "./PatientBottomNav";
import { IdleGuard } from "../kiosk/IdleGuard";
import { connectSocket } from "../../lib/socket";
import { useActiveCallRedirect } from "../../hooks/useActiveCallRedirect";

export function PatientShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useActiveCallRedirect();

  useEffect(() => {
    const socket = connectSocket();
    socket.on("prescription:ready", ({ healthFileId }: { healthFileId: string }) => {
      toast.success("Prescription ready!");
      void queryClient.invalidateQueries({ queryKey: ["health-files"] });
      navigate(`/prescription/${healthFileId}`);
    });

    return () => {
      socket.off("prescription:ready");
    };
  }, [navigate, queryClient]);

  return (
    <div className="min-h-full bg-background pb-28">
      <IdleGuard />
      {children}
      <PatientBottomNav />
    </div>
  );
}

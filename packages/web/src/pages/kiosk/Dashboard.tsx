import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { HealthFile } from "@madamgy/api-client";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { api } from "../../lib/api";
import { connectSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";

export default function KioskDashboard() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const { data: files, refetch } = useQuery({
    queryKey: ["health-files"],
    queryFn: () => api.get<HealthFile[]>("/health-files").then((response) => response.data),
  });

  useEffect(() => {
    const socket = connectSocket();
    socket.on("prescription:ready", ({ healthFileId }: { healthFileId: string }) => {
      toast.success("Prescription ready!");
      void refetch();
      navigate(`/prescription/${healthFileId}`);
    });

    return () => {
      socket.off("prescription:ready");
    };
  }, [navigate, refetch]);

  return (
    <div className="min-h-screen bg-gray-50">
      <IdleGuard />
      <div className="mx-auto max-w-2xl p-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold">Welcome, {user?.name}</h1>
            <p className="text-gray-500">Your health folder</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/consult")}
            className="rounded-2xl bg-blue-600 px-8 py-4 text-xl font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Consult Doctor
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {files?.length === 0 && <p className="py-12 text-center text-gray-500">No files yet. Start a consultation.</p>}
          {files?.map((file) => (
            <button
              key={file.id}
              type="button"
              onClick={() => navigate(`/prescription/${file.id}`)}
              className="rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition-colors hover:border-blue-300"
            >
              <p className="text-lg font-semibold">{file.name}</p>
              <p className="text-sm text-gray-500">
                {file.type === "PRESCRIPTION" ? "Prescription" : "Lab Report"} - {format(new Date(file.createdAt), "dd MMM yyyy")}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

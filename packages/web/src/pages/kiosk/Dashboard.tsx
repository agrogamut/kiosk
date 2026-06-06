import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { HealthFile } from "@madamgy/api-client";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";

export default function KioskDashboard() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
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

  async function uploadFile(file: File): Promise<void> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post("/health-files", formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Lab report uploaded");
      await refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(id: string): Promise<void> {
    try {
      await api.delete(`/health-files/${id}`);
      toast.success("Lab report deleted");
      await refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Delete failed"));
    }
  }

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

        <label className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-white p-6 text-center shadow-sm">
          <span className="text-lg font-semibold text-blue-700">{uploading ? "Uploading..." : "Upload Lab Report"}</span>
          <span className="mt-1 text-sm text-gray-500">PDF or image, up to 10MB</span>
          <input
            type="file"
            disabled={uploading}
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                void uploadFile(file);
              }
            }}
          />
        </label>

        <div className="flex flex-col gap-3">
          {files?.length === 0 && <p className="py-12 text-center text-gray-500">No files yet. Start a consultation.</p>}
          {files?.map((file) => (
            <div key={file.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <button type="button" onClick={() => navigate(`/prescription/${file.id}`)} className="text-left">
                  <p className="text-lg font-semibold">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {file.type === "PRESCRIPTION" ? "Prescription" : "Lab Report"} - {format(new Date(file.createdAt), "dd MMM yyyy")}
                  </p>
                </button>
                {file.type !== "PRESCRIPTION" && (
                  <button type="button" onClick={() => void deleteFile(file.id)} className="rounded-xl bg-red-50 px-4 py-2 font-semibold text-red-600">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

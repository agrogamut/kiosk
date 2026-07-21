import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { HealthFile } from "@madamgy/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { logout } from "../../lib/logout";
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
      toast.error(getApiErrorMessage(error, "We couldn't upload that file. Try again."));
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
      toast.error(getApiErrorMessage(error, "We couldn't delete that file. Try again."));
    }
  }

  async function deleteAccount(): Promise<void> {
    try {
      await api.delete("/account/me");
      await logout();
      navigate("/");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't delete your account. Try again."));
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <IdleGuard />
      <div className="mx-auto max-w-md px-6 py-10">
        <div className="mb-8 flex flex-col gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Welcome, {user?.name}</h1>
            <p className="text-muted-foreground">Your health folder</p>
          </div>
          <Button onClick={() => navigate("/consult")} className="w-full rounded-full text-lg">
            Consult doctor
          </Button>
        </div>

        <label className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input bg-card p-6 text-center">
          <span className="font-semibold text-primary">{uploading ? "Uploading..." : "Upload lab report"}</span>
          <span className="mt-1 text-sm text-muted-foreground">PDF or image, up to 10MB</span>
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
          {files?.length === 0 && <p className="py-12 text-center text-muted-foreground">No files yet. Start a consultation.</p>}
          {files?.map((file) => (
            <div key={file.id} className="rounded-lg bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <button type="button" onClick={() => navigate(`/prescription/${file.id}`)} className="text-left">
                  <p className="font-semibold text-foreground">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {file.type === "PRESCRIPTION" ? "Prescription" : "Lab report"} · {format(new Date(file.createdAt), "dd MMM yyyy")}
                  </p>
                </button>
                {file.type !== "PRESCRIPTION" && (
                  <button
                    type="button"
                    onClick={() => void deleteFile(file.id)}
                    className="rounded-full bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-input pt-6 text-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className="text-sm text-destructive underline">
                Delete my account
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>This permanently deletes your account. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void deleteAccount()} className="bg-destructive hover:bg-destructive/90">
                  Yes, delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

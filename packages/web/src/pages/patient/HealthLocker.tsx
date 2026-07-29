import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { HealthFile } from "@madamgy/api-client";
import { KioskHeader } from "../../components/layout/KioskHeader";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

export default function HealthLocker() {
  const [uploading, setUploading] = useState(false);
  const { data: files, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["health-files"],
    queryFn: () => api.get<HealthFile[]>("/health-files").then((response) => response.data),
  });

  const lockerFiles = (files ?? []).filter((file) => file.type !== "PRESCRIPTION");

  async function uploadFile(file: File): Promise<void> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post("/health-files", formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Health file uploaded");
      await refetch();
    } catch (uploadError) {
      toast.error(getApiErrorMessage(uploadError, "We couldn't upload that file. Try again."));
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(id: string): Promise<void> {
    try {
      await api.delete(`/health-files/${id}`);
      toast.success("Health file deleted");
      await refetch();
    } catch (deleteError) {
      toast.error(getApiErrorMessage(deleteError, "We couldn't delete that file. Try again."));
    }
  }

  return (
    <div>
      <KioskHeader />
      <div className="mx-auto max-w-md px-6 py-10 sm:max-w-lg lg:max-w-2xl">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-foreground">Health Locker</h1>
          <p className="text-muted-foreground">Files your doctors can see when you consult them</p>
        </div>

        <label className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input bg-card p-6 text-center">
          <span className="font-semibold text-primary">{uploading ? "Uploading..." : "Upload a health file"}</span>
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

        {isLoading && <SkeletonRows />}
        {isError && (
          <ErrorState message={getApiErrorMessage(error, "We couldn't load your health locker.")} onRetry={() => void refetch()} />
        )}
        {!isLoading && !isError && (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
            {lockerFiles.length === 0 && (
              <p className="py-12 text-center text-muted-foreground lg:col-span-2">No files yet. Upload one above.</p>
            )}
            {lockerFiles.map((file) => (
              <div key={file.id} className="rounded-lg bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{format(new Date(file.createdAt), "dd MMM yyyy")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteFile(file.id)}
                    className="flex h-11 items-center rounded-full bg-destructive/10 px-4 text-sm font-semibold text-destructive"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

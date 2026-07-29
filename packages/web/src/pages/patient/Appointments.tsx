import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { HealthFile } from "@madamgy/api-client";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";
import { KioskHeader } from "../../components/layout/KioskHeader";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth.store";

interface AvailableDoctor {
  id: string;
  name: string;
  specialization: string | null;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function Appointments() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const doctorsQuery = useQuery({
    queryKey: ["doctors-available"],
    queryFn: () => api.get<AvailableDoctor[]>("/doctors/available").then((response) => response.data),
  });

  const filesQuery = useQuery({
    queryKey: ["health-files"],
    queryFn: () => api.get<HealthFile[]>("/health-files").then((response) => response.data),
  });

  const pastConsultations = (filesQuery.data ?? []).filter((file) => file.type === "PRESCRIPTION");

  return (
    <div>
      <KioskHeader />
      <div className="mx-auto max-w-md px-6 py-10 sm:max-w-lg lg:max-w-2xl">
        <div className="mb-10 flex flex-col gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Welcome back, {user?.name}</h1>
            <p className="text-muted-foreground">How are you feeling today?</p>
          </div>
          <Button onClick={() => navigate("/consult")} className="w-full rounded-full text-lg">
            Consult a doctor
          </Button>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Available now</h2>
          {doctorsQuery.isLoading && <SkeletonRows />}
          {doctorsQuery.isError && (
            <ErrorState
              message={getApiErrorMessage(doctorsQuery.error, "We couldn't load available doctors.")}
              onRetry={() => void doctorsQuery.refetch()}
            />
          )}
          {!doctorsQuery.isLoading && !doctorsQuery.isError && (
            <>
              {doctorsQuery.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">No doctors available right now — check back soon.</p>
              )}
              {doctorsQuery.data && doctorsQuery.data.length > 0 && (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {doctorsQuery.data.map((doctor) => (
                    <div key={doctor.id} className="flex w-28 shrink-0 flex-col items-center gap-2 text-center">
                      <Avatar size="lg" className="bg-primary/10">
                        <AvatarFallback className="bg-primary/10 text-primary">{initials(doctor.name)}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium text-foreground">{doctor.name}</p>
                      <p className="text-xs text-muted-foreground">{doctor.specialization ?? "General"}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section>
          <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Past consultations</h2>
          {filesQuery.isLoading && <SkeletonRows />}
          {filesQuery.isError && (
            <ErrorState
              message={getApiErrorMessage(filesQuery.error, "We couldn't load your consultation history.")}
              onRetry={() => void filesQuery.refetch()}
            />
          )}
          {!filesQuery.isLoading && !filesQuery.isError && (
            <div className="flex flex-col gap-3">
              {pastConsultations.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">No files yet. Start a consultation.</p>
              )}
              {pastConsultations.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => navigate(`/prescription/${file.id}`)}
                  className="rounded-lg bg-card p-5 text-left shadow-sm"
                >
                  <p className="font-semibold text-foreground">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{format(new Date(file.createdAt), "dd MMM yyyy")}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

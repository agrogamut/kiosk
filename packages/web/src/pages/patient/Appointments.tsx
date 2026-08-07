import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { HealthFile } from "@madamgy/api-client";
import { FileText } from "lucide-react";
import { KioskHeader } from "../../components/layout/KioskHeader";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { HeroIllustration } from "../../components/patient/HeroIllustration";
import { DoctorAvatar } from "../../components/patient/DoctorAvatar";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth.store";

interface AvailableDoctor {
  id: string;
  name: string;
  specialization: string | null;
  photoUrl: string | null;
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
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
        <div className="mb-10">
          <HeroIllustration
            greeting={timeOfDayGreeting()}
            name={user?.name}
            availableCount={doctorsQuery.data?.length ?? 0}
            onConsult={() => navigate("/consult")}
          />
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {doctorsQuery.data.map((doctor) => (
                    <button
                      key={doctor.id}
                      type="button"
                      onClick={() => navigate("/consult")}
                      className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 text-center shadow-sm shadow-foreground/5 transition-shadow hover:shadow-md"
                    >
                      <DoctorAvatar
                        id={doctor.id}
                        name={doctor.name}
                        photoUrl={doctor.photoUrl}
                        showStatus
                        className="size-14"
                      />
                      <p className="line-clamp-1 text-sm font-medium text-foreground">{doctor.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{doctor.specialization ?? "General"}</p>
                    </button>
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
                  className="flex items-center gap-4 rounded-2xl bg-card p-5 text-left shadow-sm shadow-foreground/5 transition-shadow hover:shadow-md"
                >
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <FileText className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{format(new Date(file.createdAt), "dd MMM yyyy")}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

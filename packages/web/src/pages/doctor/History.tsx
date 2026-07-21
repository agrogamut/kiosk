import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CallSession } from "@madamgy/api-client";
import { Badge } from "../../components/ui/badge";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface HistoryResponse {
  calls: (CallSession & { patient: { name: string } })[];
  total: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ENDED: "default",
  NO_DOCTOR: "destructive",
};

export default function DoctorHistory() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["call-history"],
    queryFn: () => api.get<HistoryResponse>("/calls/history").then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-2xl sm:max-w-3xl lg:max-w-4xl">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Call history</h1>
      {isLoading && <SkeletonRows />}
      {isError && (
        <ErrorState message={getApiErrorMessage(error, "We couldn't load your call history.")} onRetry={() => void refetch()} />
      )}
      {!isLoading && !isError && (
        <div className="flex flex-col gap-3">
          {data?.calls.length === 0 && <p className="py-12 text-center text-muted-foreground">No calls yet.</p>}
          {data?.calls.map((call) => (
            <div key={call.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
              <div>
                <p className="font-semibold text-foreground">{call.patient?.name}</p>
                <p className="text-sm text-muted-foreground">{format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}</p>
              </div>
              <Badge variant={STATUS_VARIANT[call.status] ?? "secondary"}>{call.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

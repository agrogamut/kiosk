import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CallSession } from "@madamgy/api-client";
import { Badge } from "../../components/ui/badge";
import { api } from "../../lib/api";

interface AdminCall extends CallSession {
  patient: { id: string; name: string };
  doctor: { id: string; name: string } | null;
}

interface CallsResponse {
  calls: AdminCall[];
  total: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ENDED: "default",
  NO_DOCTOR: "destructive",
};

export default function AdminCalls() {
  const { data } = useQuery({
    queryKey: ["admin-calls"],
    queryFn: () => api.get<CallsResponse>("/admin/calls").then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Call history</h1>
      <div className="flex flex-col gap-3">
        {data?.calls.map((call) => (
          <div key={call.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
            <div>
              <p className="font-semibold text-foreground">
                {call.patient.name} {call.doctor ? `with Dr. ${call.doctor.name}` : ""}
              </p>
              <p className="text-sm text-muted-foreground">{format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}</p>
            </div>
            <Badge variant={STATUS_VARIANT[call.status] ?? "secondary"}>{call.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

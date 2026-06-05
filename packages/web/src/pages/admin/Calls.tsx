import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CallSession } from "@madamgy/api-client";
import { api } from "../../lib/api";

interface AdminCall extends CallSession {
  patient: { id: string; name: string };
  doctor: { id: string; name: string } | null;
}

interface CallsResponse {
  calls: AdminCall[];
  total: number;
}

export default function AdminCalls() {
  const { data } = useQuery({
    queryKey: ["admin-calls"],
    queryFn: () => api.get<CallsResponse>("/admin/calls").then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-8 text-3xl font-bold">Call History</h1>
      <div className="flex flex-col gap-3">
        {data?.calls.map((call) => (
          <div key={call.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">
                  {call.patient.name} {call.doctor ? `with Dr. ${call.doctor.name}` : ""}
                </p>
                <p className="text-sm text-gray-500">{format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">{call.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

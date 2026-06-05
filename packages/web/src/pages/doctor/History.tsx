import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CallSession } from "@madamgy/api-client";
import { api } from "../../lib/api";

interface HistoryResponse {
  calls: (CallSession & { patient: { name: string } })[];
  total: number;
}

export default function DoctorHistory() {
  const { data } = useQuery({
    queryKey: ["call-history"],
    queryFn: () => api.get<HistoryResponse>("/calls/history").then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-3xl font-bold">Call History</h1>
      <div className="flex flex-col gap-3">
        {data?.calls.map((call) => (
          <div key={call.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{call.patient?.name}</p>
                <p className="text-sm text-gray-500">{format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  call.status === "ENDED"
                    ? "bg-green-100 text-green-700"
                    : call.status === "NO_DOCTOR"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {call.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

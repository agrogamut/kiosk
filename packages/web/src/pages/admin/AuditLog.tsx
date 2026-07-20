import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { AuditLog } from "@madamgy/api-client";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/auth.store";

interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  pages: number;
}

export default function AdminAuditLog() {
  const [page, setPage] = useState(1);
  const role = useAuthStore((state) => state.user?.role);
  const { data } = useQuery({
    queryKey: ["admin-audit-log", page],
    queryFn: () => api.get<AuditLogResponse>("/admin/audit-log", { params: { page } }).then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-3xl font-bold">Audit Log</h1>
      {role === "ADMIN" && <p className="mb-8 text-sm text-gray-500">Showing your own actions only.</p>}
      {role !== "ADMIN" && <div className="mb-8" />}
      <div className="flex flex-col gap-2">
        {data?.logs.map((log) => (
          <div key={log.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {log.action}
                {role !== "ADMIN" && <span className="ml-2 text-sm text-gray-500">by {log.actor.name} ({log.actor.role})</span>}
              </p>
              <p className="text-sm text-gray-400">{format(new Date(log.createdAt), "dd MMM yyyy HH:mm")}</p>
            </div>
            {log.targetId && <p className="mt-1 text-sm text-gray-500">Target: {log.targetId}</p>}
          </div>
        ))}
        {data?.logs.length === 0 && <p className="text-gray-500">No audit log entries.</p>}
      </div>
      {data && data.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
            className="rounded-xl bg-gray-200 px-4 py-2 font-semibold disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {data.page} of {data.pages}
          </span>
          <button
            type="button"
            disabled={page >= data.pages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-xl bg-gray-200 px-4 py-2 font-semibold disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

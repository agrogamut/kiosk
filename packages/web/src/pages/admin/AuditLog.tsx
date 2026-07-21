import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { AuditLog } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
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
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display mb-2 text-2xl font-bold text-foreground">Audit log</h1>
      {role === "ADMIN" && <p className="mb-8 text-sm text-muted-foreground">Showing your own actions only.</p>}
      {role !== "ADMIN" && <div className="mb-8" />}
      <div className="flex flex-col gap-2">
        {data?.logs.map((log) => (
          <div key={log.id} className="rounded-lg bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium text-foreground">
                {log.action}
                {role !== "ADMIN" && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    by {log.actor.name} ({log.actor.role})
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">{format(new Date(log.createdAt), "dd MMM yyyy HH:mm")}</p>
            </div>
            {log.targetId && <p className="mt-1 text-sm text-muted-foreground">Target: {log.targetId}</p>}
          </div>
        ))}
        {data?.logs.length === 0 && <p className="text-muted-foreground">No audit log entries.</p>}
      </div>
      {data && data.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.pages}
          </span>
          <Button variant="outline" disabled={page >= data.pages} onClick={() => setPage((current) => current + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

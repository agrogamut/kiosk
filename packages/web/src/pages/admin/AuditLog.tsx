import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { AuditLog } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
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
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-audit-log", page],
    queryFn: () => api.get<AuditLogResponse>("/admin/audit-log", { params: { page } }).then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display mb-2 text-2xl font-bold text-foreground">Audit log</h1>
      {role === "ADMIN" && <p className="mb-8 text-sm text-muted-foreground">Showing your own actions only.</p>}
      {role !== "ADMIN" && <div className="mb-8" />}
      {isLoading && <SkeletonRows />}
      {isError && <ErrorState message={getApiErrorMessage(error, "We couldn't load the audit log.")} onRetry={() => void refetch()} />}
      {!isLoading && !isError && (
        <>
          <div className="flex flex-col gap-2 md:hidden">
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
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  {role !== "ADMIN" && <TableHead>Actor</TableHead>}
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium text-foreground">{log.action}</TableCell>
                    {role !== "ADMIN" && (
                      <TableCell className="text-muted-foreground">
                        {log.actor.name} ({log.actor.role})
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">{log.targetId ?? "-"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{format(new Date(log.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data?.logs.length === 0 && <p className="text-muted-foreground">No audit log entries.</p>}
          </div>
        </>
      )}
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

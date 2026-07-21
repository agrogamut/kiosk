import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CallSession } from "@madamgy/api-client";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

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
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-calls"],
    queryFn: () => api.get<CallsResponse>("/admin/calls").then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Call history</h1>
      {isLoading && <SkeletonRows />}
      {isError && <ErrorState message={getApiErrorMessage(error, "We couldn't load call history.")} onRetry={() => void refetch()} />}
      {!isLoading && !isError && (
        <>
          <div className="space-y-3 md:hidden">
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
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.calls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="font-semibold text-foreground">{call.patient.name}</TableCell>
                    <TableCell className="text-muted-foreground">{call.doctor ? call.doctor.name : "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={STATUS_VARIANT[call.status] ?? "secondary"}>{call.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

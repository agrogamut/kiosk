import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { ContactMessage } from "@madamgy/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

export default function AdminSupportMessages() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-support-messages"],
    queryFn: () => api.get<ContactMessage[]>("/admin/support-messages").then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display mb-2 text-2xl font-bold text-foreground">Contact requests</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Submitted from the login screen and patient profiles. Follow up by calling the number listed.
      </p>
      {isLoading && <SkeletonRows />}
      {isError && (
        <ErrorState message={getApiErrorMessage(error, "We couldn't load contact requests.")} onRetry={() => void refetch()} />
      )}
      {!isLoading && !isError && (
        <>
          <div className="flex flex-col gap-2 md:hidden">
            {data?.map((entry) => (
              <div key={entry.id} className="rounded-lg bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">{entry.name}</p>
                  <p className="text-sm text-muted-foreground">{format(new Date(entry.createdAt), "dd MMM yyyy HH:mm")}</p>
                </div>
                <p className="text-sm text-muted-foreground">{entry.phone}</p>
                <p className="mt-2 text-foreground">{entry.message}</p>
              </div>
            ))}
            {data?.length === 0 && <p className="text-muted-foreground">No contact requests yet.</p>}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium text-foreground">{entry.name}</TableCell>
                    <TableCell className="text-muted-foreground">{entry.phone}</TableCell>
                    <TableCell className="max-w-md text-muted-foreground">{entry.message}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {format(new Date(entry.createdAt), "dd MMM yyyy HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data?.length === 0 && <p className="text-muted-foreground">No contact requests yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { WalletTransaction } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface WithdrawalRequest extends WalletTransaction {
  user: { id: string; name: string; phone: string; role: "DOCTOR" | "ADMIN" | "PATIENT" | "SUPER_ADMIN" };
}

export default function AdminWithdrawals() {
  const queryClient = useQueryClient();
  const {
    data: withdrawals,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: () => api.get<WithdrawalRequest[]>("/admin/wallet/withdrawals").then((response) => response.data),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
  }

  const complete = useMutation({
    mutationFn: (id: string) => api.put(`/admin/wallet/withdrawals/${id}/complete`),
    onSuccess: () => {
      invalidate();
      toast.success("Withdrawal marked complete");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to complete withdrawal")),
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.put(`/admin/wallet/withdrawals/${id}/reject`),
    onSuccess: () => {
      invalidate();
      toast.success("Withdrawal rejected");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to reject withdrawal")),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Withdrawal requests</h1>
      {isLoading && <SkeletonRows />}
      {isError && (
        <ErrorState message={getApiErrorMessage(error, "We couldn't load withdrawal requests.")} onRetry={() => void refetch()} />
      )}
      {!isLoading && !isError && (
        <>
          {withdrawals?.length === 0 && <p className="text-muted-foreground">No pending withdrawal requests.</p>}
          <div className="space-y-3 md:hidden">
            {withdrawals?.map((withdrawal) => (
              <div key={withdrawal.id} className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-primary/30">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-foreground">
                      {withdrawal.user.name} <span className="text-sm font-normal text-muted-foreground">({withdrawal.user.role})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{withdrawal.user.phone}</p>
                    <p className="mt-2 text-2xl font-bold text-primary">Rs. {withdrawal.amount}</p>
                    <p className="mt-1 text-sm text-foreground">{withdrawal.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{format(new Date(withdrawal.createdAt), "dd MMM yyyy HH:mm")}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => complete.mutate(withdrawal.id)}>Mark paid</Button>
                    <Button variant="destructive" onClick={() => reject.mutate(withdrawal.id)}>
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals?.map((withdrawal) => (
                  <TableRow key={withdrawal.id}>
                    <TableCell>
                      <p className="font-bold text-foreground">{withdrawal.user.name}</p>
                      <p className="text-xs text-muted-foreground">{withdrawal.user.role}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{withdrawal.user.phone}</TableCell>
                    <TableCell className="font-bold text-primary">Rs. {withdrawal.amount}</TableCell>
                    <TableCell className="text-muted-foreground">{withdrawal.description}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(withdrawal.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => complete.mutate(withdrawal.id)}>Mark paid</Button>
                        <Button variant="destructive" onClick={() => reject.mutate(withdrawal.id)}>
                          Reject
                        </Button>
                      </div>
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

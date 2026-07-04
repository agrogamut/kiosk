import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { WalletTransaction } from "@madamgy/api-client";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface WithdrawalRequest extends WalletTransaction {
  doctor: { id: string; name: string; phone: string };
}

export default function AdminWithdrawals() {
  const queryClient = useQueryClient();
  const { data: withdrawals } = useQuery({
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
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-8 text-3xl font-bold">Withdrawal Requests</h1>
      {withdrawals?.length === 0 && <p className="text-gray-500">No pending withdrawal requests.</p>}
      <div className="flex flex-col gap-3">
        {withdrawals?.map((withdrawal) => (
          <div key={withdrawal.id} className="rounded-2xl border-2 border-amber-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold">{withdrawal.doctor.name}</p>
                <p className="text-sm text-gray-500">{withdrawal.doctor.phone}</p>
                <p className="mt-2 text-2xl font-bold text-blue-700">Rs. {withdrawal.amount}</p>
                <p className="mt-1 text-sm text-gray-600">{withdrawal.description}</p>
                <p className="mt-1 text-xs text-gray-400">{format(new Date(withdrawal.createdAt), "dd MMM yyyy HH:mm")}</p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => complete.mutate(withdrawal.id)}
                  className="rounded-xl bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700"
                >
                  Mark Paid
                </button>
                <button
                  type="button"
                  onClick={() => reject.mutate(withdrawal.id)}
                  className="rounded-xl bg-red-600 px-5 py-2 font-semibold text-white hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

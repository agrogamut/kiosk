import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { WithdrawRequestSchema, type WalletTransaction, type WithdrawRequest } from "@madamgy/api-client";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface WalletResponse {
  balance: string;
}

interface TransactionResponse {
  transactions: WalletTransaction[];
  total: number;
}

export default function DoctorWallet() {
  const queryClient = useQueryClient();
  const { data: wallet } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.get<WalletResponse>("/doctor/wallet").then((response) => response.data),
  });
  const { data: transactions } = useQuery({
    queryKey: ["wallet-transactions"],
    queryFn: () => api.get<TransactionResponse>("/doctor/wallet/transactions").then((response) => response.data),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WithdrawRequest>({ resolver: zodResolver(WithdrawRequestSchema) });
  const withdraw = useMutation({
    mutationFn: (data: WithdrawRequest) => api.post("/doctor/wallet/withdraw", data),
    onSuccess: () => {
      toast.success("Withdrawal request submitted");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed")),
  });

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-3xl font-bold">Wallet</h1>
      <div className="mb-8 rounded-2xl bg-blue-50 p-6">
        <p className="mb-1 text-gray-500">Available balance</p>
        <p className="text-5xl font-bold text-blue-700">Rs. {wallet?.balance ?? "-"}</p>
      </div>

      <form onSubmit={handleSubmit((data) => withdraw.mutate(data))} className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">Request Withdrawal</h2>
        {[
          { name: "amount" as const, label: "Amount (Rs.)", type: "number" },
          { name: "bankName" as const, label: "Bank Name" },
          { name: "accountNumber" as const, label: "Account Number" },
          { name: "ifsc" as const, label: "IFSC Code" },
          { name: "holderName" as const, label: "Account Holder Name" },
        ].map((field) => (
          <div key={field.name} className="mb-4">
            <label className="mb-1 block text-sm text-gray-600">{field.label}</label>
            <input
              {...register(field.name, { valueAsNumber: field.type === "number" })}
              type={field.type ?? "text"}
              className="w-full rounded-xl border-2 p-3"
            />
            {errors[field.name] && <p className="mt-1 text-sm text-red-500">{errors[field.name]?.message}</p>}
          </div>
        ))}
        <button type="submit" disabled={withdraw.isPending} className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50">
          {withdraw.isPending ? "Submitting..." : "Request Withdrawal"}
        </button>
      </form>

      <h2 className="mb-4 text-xl font-bold">Transactions</h2>
      <div className="flex flex-col gap-2">
        {transactions?.transactions.map((transaction) => (
          <div key={transaction.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div>
              <p className="font-medium">{transaction.description || transaction.type}</p>
              <p className="text-sm text-gray-500">{format(new Date(transaction.createdAt), "dd MMM yyyy HH:mm")}</p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${transaction.type === "CREDIT" ? "text-green-600" : "text-red-600"}`}>
                {transaction.type === "CREDIT" ? "+" : "-"}Rs. {transaction.amount}
              </p>
              <p className="text-xs text-gray-400">{transaction.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

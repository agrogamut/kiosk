import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { WithdrawRequestSchema, type WalletTransaction, type WithdrawRequest } from "@madamgy/api-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ErrorState } from "../common/ErrorState";
import { SkeletonRows } from "../common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface WalletResponse {
  balance: string;
}

interface TransactionResponse {
  transactions: WalletTransaction[];
  total: number;
}

interface WalletPanelProps {
  apiBasePath: string;
}

const FIELDS = [
  { name: "amount" as const, label: "Amount (Rs.)", type: "number" },
  { name: "bankName" as const, label: "Bank name", type: "text" },
  { name: "accountNumber" as const, label: "Account number", type: "text" },
  { name: "ifsc" as const, label: "IFSC code", type: "text" },
  { name: "holderName" as const, label: "Account holder name", type: "text" },
];

export default function WalletPanel({ apiBasePath }: WalletPanelProps) {
  const queryClient = useQueryClient();
  const { data: wallet } = useQuery({
    queryKey: ["wallet", apiBasePath],
    queryFn: () => api.get<WalletResponse>(`${apiBasePath}/wallet`).then((response) => response.data),
  });
  const {
    data: transactions,
    isLoading: transactionsLoading,
    isError: transactionsError,
    error: transactionsErrorDetail,
    refetch: refetchTransactions,
  } = useQuery({
    queryKey: ["wallet-transactions", apiBasePath],
    queryFn: () => api.get<TransactionResponse>(`${apiBasePath}/wallet/transactions`).then((response) => response.data),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WithdrawRequest>({ resolver: zodResolver(WithdrawRequestSchema) });
  const withdraw = useMutation({
    mutationFn: (data: WithdrawRequest) => api.post(`${apiBasePath}/wallet/withdraw`, data),
    onSuccess: () => {
      toast.success("Withdrawal request submitted");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["wallet-transactions", apiBasePath] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Withdrawal request failed")),
  });

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl lg:max-w-3xl">
        <h1 className="font-display text-2xl font-bold text-foreground">Wallet</h1>
        <div className="mb-8 mt-6 rounded-xl bg-card p-6 shadow-sm">
          <p className="mb-1 text-muted-foreground">Available balance</p>
          <p className="text-4xl font-bold text-primary">Rs. {wallet?.balance ?? "-"}</p>
        </div>

        <form onSubmit={handleSubmit((data) => withdraw.mutate(data))} className="mb-8 rounded-xl bg-card p-6 shadow-sm">
          <h2 className="font-display mb-4 text-xl font-bold text-foreground">Request withdrawal</h2>
          <div className="flex flex-col gap-4">
            {FIELDS.map((field) => (
              <div key={field.name}>
                <Label htmlFor={field.name} className="mb-1.5">
                  {field.label}
                </Label>
                <Input
                  id={field.name}
                  type={field.type}
                  {...register(field.name, { valueAsNumber: field.type === "number" })}
                />
                {errors[field.name] && <p className="mt-1 text-sm text-destructive">{errors[field.name]?.message}</p>}
              </div>
            ))}
          </div>
          <Button type="submit" disabled={withdraw.isPending} className="mt-6 w-full rounded-full text-lg">
            {withdraw.isPending ? "Submitting..." : "Request withdrawal"}
          </Button>
        </form>

        <h2 className="font-display mb-4 text-xl font-bold text-foreground">Transactions</h2>
        {transactionsLoading && <SkeletonRows />}
        {transactionsError && (
          <ErrorState
            message={getApiErrorMessage(transactionsErrorDetail, "We couldn't load your transactions.")}
            onRetry={() => void refetchTransactions()}
          />
        )}
        {!transactionsLoading && !transactionsError && (
          <div className="flex flex-col gap-2">
            {transactions?.transactions.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">No transactions yet.</p>
            )}
            {transactions?.transactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-4 shadow-sm">
                <div>
                  <p className="font-medium text-foreground">{transaction.description || transaction.type}</p>
                  <p className="text-sm text-muted-foreground">{format(new Date(transaction.createdAt), "dd MMM yyyy HH:mm")}</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${transaction.type === "CREDIT" ? "text-primary" : "text-destructive"}`}>
                    {transaction.type === "CREDIT" ? "+" : "-"}Rs. {transaction.amount}
                  </p>
                  <Badge variant="outline" className="mt-1">
                    {transaction.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
